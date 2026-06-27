import json
import re
import asyncio
import httpx
from config import ANALYSIS_MODEL, GROQ_BASE, get_headers

_CACHE: dict[str, dict] = {}

# Global semaphore: max 3 concurrent Groq calls to prevent TPM burst on Tamil/Indic
# This is the primary guard against 502s on high-token language translation requests
_GROQ_SEM: asyncio.Semaphore | None = None

def _get_sem() -> asyncio.Semaphore:
    global _GROQ_SEM
    if _GROQ_SEM is None:
        _GROQ_SEM = asyncio.Semaphore(3)
    return _GROQ_SEM

# ── Script contamination detection ───────────────────────────────────────────
_SCRIPT_RANGES: dict[str, list[tuple[int, int]]] = {
    "Tamil":      [(0x0B80, 0x0BFF)],
    "Telugu":     [(0x0C00, 0x0C7F)],
    "Kannada":    [(0x0C80, 0x0CFF)],
    "Malayalam":  [(0x0D00, 0x0D7F)],
    "Devanagari": [(0x0900, 0x097F)],
    "Bengali":    [(0x0980, 0x09FF)],
    "Gujarati":   [(0x0A80, 0x0AFF)],
    "Punjabi":    [(0x0A00, 0x0A7F)],
    "Arabic":     [(0x0600, 0x06FF)],
    "Korean":     [(0xAC00, 0xD7A3), (0x1100, 0x11FF)],
    "Japanese":   [(0x3040, 0x30FF)],
    "Chinese":    [(0x4E00, 0x9FFF), (0x3400, 0x4DBF)],
    "Thai":       [(0x0E00, 0x0E7F)],
}
_LANG_TO_SCRIPT: dict[str, str] = {
    "Tamil": "Tamil", "Telugu": "Telugu", "Kannada": "Kannada",
    "Malayalam": "Malayalam", "Hindi": "Devanagari", "Marathi": "Devanagari",
    "Bengali": "Bengali", "Gujarati": "Gujarati", "Punjabi": "Punjabi",
    "Urdu": "Arabic", "Arabic": "Arabic", "Korean": "Korean",
    "Japanese": "Japanese", "Chinese": "Chinese", "Thai": "Thai",
}
_COMPATIBLE: dict[str, set[str]] = {"Japanese": {"Chinese"}, "Chinese": {"Japanese"}}

# These scripts produce more bytes per character → more tokens → hit TPM limits faster
_HIGH_TOKEN_LANGS = {
    "Tamil", "Telugu", "Kannada", "Malayalam", "Bengali",
    "Gujarati", "Punjabi", "Marathi", "Thai", "Korean",
    "Japanese", "Chinese", "Arabic", "Urdu",
}


def _is_contaminated(text: str, language: str) -> bool:
    if not text or language in ("", "English", "Spanish", "French", "German",
                                 "Italian", "Dutch", "Portuguese", "Polish",
                                 "Turkish", "Russian", "Vietnamese", "Indonesian"):
        return False
    expected_script = _LANG_TO_SCRIPT.get(language)
    if not expected_script:
        return False
    compatible = _COMPATIBLE.get(expected_script, set())
    for script, ranges in _SCRIPT_RANGES.items():
        if script == expected_script or script in compatible:
            continue
        for lo, hi in ranges:
            if any(lo <= ord(ch) <= hi for ch in text[:2000]):
                return True
    return False


def _check_val(v: object, language: str) -> bool:
    if isinstance(v, str):
        return _is_contaminated(v, language)
    if isinstance(v, list):
        return any(_check_val(item, language) for item in v)
    if isinstance(v, dict):
        return any(_check_val(vv, language) for vv in v.values())
    return False


async def _call_groq_with_backoff(payload: dict, max_retries: int = 4) -> dict:
    """Call Groq with exponential backoff on 429/502/503 errors."""
    delay = 2.0
    last_err = "unknown"
    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(GROQ_BASE, json=payload, headers=get_headers())
        except (httpx.ReadTimeout, httpx.ConnectTimeout) as exc:
            last_err = str(exc)
            if attempt < max_retries:
                await asyncio.sleep(delay)
                delay = min(delay * 2, 15)
                continue
            raise RuntimeError(f"Groq timed out after {max_retries} retries") from exc

        if response.status_code == 200:
            return response.json()

        if response.status_code in (429, 502, 503) and attempt < max_retries:
            retry_after = response.headers.get("retry-after")
            wait = float(retry_after) if retry_after else delay
            wait = min(wait, 20.0)
            await asyncio.sleep(wait)
            delay = min(delay * 2, 20)
            last_err = f"HTTP {response.status_code}"
            continue

        raise RuntimeError(
            f"Translation API error ({response.status_code}): {response.text[:200]}"
        )

    raise RuntimeError(f"Groq gave up after {max_retries} retries. Last: {last_err}")


def _build_system_prompt(language: str) -> str:
    return (
        f"You translate app interface and medical report text into {language}. "
        f"Rules:\n"
        f"1. Translate EVERY visible text value into {language}.\n"
        f"   Leave UN-translated ONLY: the app name 'ReportEase', medical parameter "
        f"   abbreviations (HB, WBC, MCH, MCHC, TSH, RBC, MCV, HCT, PCV, ALT, AST etc.), "
        f"   measurement units (g/dL, mg/dL, cells/cumm, fL, pg, %, mm/hr, etc.), "
        f"   phone numbers, GPS coordinates, distances (km, miles), and hospital or lab names.\n"
        f"   IMPORTANT: UI action words like 'Play', 'Pause', 'Resume', 'Stop', 'Search', "
        f"   'Done', 'Finished', 'Speed', 'Start over', 'Jump to part' MUST be translated "
        f"   as action verbs in {language} — do NOT transliterate them phonetically. "
        f"   Example (Tamil): Play → இயக்கு, Pause → இடைநிறுத்து, Resume → தொடரவும், "
        f"   Stop → நிறுத்து, Search → தேடு (but use the full word, never break it), "
        f"   Done → முடிந்தது, Speed → வேகம்.\n"
        f"2. For 'medical_term_pronunciation' fields: write the PHONETIC PRONUNCIATION of the English "
        f"   medical term in {language} script — how it sounds when spoken aloud. "
        f"   Example: 'Hemoglobin' in Tamil → 'ஹீமோகுளோபின்', in Hindi → 'हीमोग्लोबिन'. "
        f"   This is NOT a translation of the meaning.\n"
        f"3. For 'status_label' fields (values like 'normal', 'warning', 'critical'): translate "
        f"   as a STATUS WORD in {language} (e.g. Tamil: normal → 'சாதாரண', warning → 'எச்சரிக்கை'). "
        f"   These are NOT medical terms — do NOT give pronunciations for them.\n"
        f"4. Urgency 'soon': use a short {language} phrase meaning 'see a doctor soon'. "
        f"   Keep it under 8 words.\n"
        f"5. Preserve JSON keys exactly — only translate string values.\n"
        f"6. Preserve placeholders {{n}}, {{r}}, {{lang}}, {{abnormal}}, {{normal}} exactly.\n"
        f"7. Preserve array structure — translate each array item.\n"
        f"8. Return ONLY valid JSON — no markdown fences, no extra text.\n"
        f"9. CRITICAL: Output text EXCLUSIVELY in {language}. "
        f"   Zero tolerance for characters from Tamil, Telugu, Korean, Hindi, "
        f"   or any other foreign script in your output."
    )


async def _translate_chunk(language: str, chunk: dict) -> dict:
    """Translate a single chunk dict. Returns translated dict."""
    if not chunk:
        return {}

    cache_key = f"{language}::{json.dumps(chunk, sort_keys=True, ensure_ascii=False)}"
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    is_high_token = language in _HIGH_TOKEN_LANGS
    max_tokens = 2000 if is_high_token else 3500

    system_prompt = _build_system_prompt(language)
    user_content = json.dumps(chunk, ensure_ascii=False)

    payload = {
        "model": ANALYSIS_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_content},
        ],
        "temperature": 0,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }

    MAX_CONTAMINATION_RETRIES = 2
    raw_content = ""
    translated: dict = {}

    for attempt in range(MAX_CONTAMINATION_RETRIES + 1):
        async with _get_sem():
            data = await _call_groq_with_backoff(payload)
        raw_content = data["choices"][0]["message"]["content"]
        try:
            translated = json.loads(raw_content)
        except json.JSONDecodeError:
            cleaned = re.sub(r"```(?:json)?|```", "", raw_content).strip()
            translated = json.loads(cleaned)

        if not _check_val(translated, language) or attempt == MAX_CONTAMINATION_RETRIES:
            break

        payload["messages"] = [
            {"role": "system",    "content": system_prompt},
            {"role": "user",      "content": user_content},
            {"role": "assistant", "content": raw_content},
            {"role": "user",      "content": (
                f"CORRECTION: Your response contains foreign-script characters. "
                f"ALL values must be written EXCLUSIVELY in {language} script. "
                f"Regenerate the complete JSON with only {language} text in every value."
            )},
        ]
        await asyncio.sleep(0.8)

    _CACHE[cache_key] = translated
    return translated


async def translate_ui(language: str, payload: dict) -> dict:
    """Translate a UI strings dict (flat or shallow nested)."""
    if language in ("", "English"):
        return payload

    # Detach stats array — translate separately to preserve id fields
    stats_original = payload.get("stats")
    payload_no_stats = {k: v for k, v in payload.items() if k != "stats"}

    if language in _HIGH_TOKEN_LANGS:
        scalar_items = {k: v for k, v in payload_no_stats.items() if isinstance(v, str)}
        other_items  = {k: v for k, v in payload_no_stats.items() if not isinstance(v, str)}

        result: dict = {}

        BATCH = 12
        keys = list(scalar_items.keys())
        for i in range(0, len(keys), BATCH):
            batch = {k: scalar_items[k] for k in keys[i: i + BATCH]}
            if i > 0:
                await asyncio.sleep(0.4)
            translated_batch = await _translate_chunk(language, batch)
            result.update(translated_batch)

        for k, v in other_items.items():
            translated_item = await _translate_chunk(language, {k: v})
            result.update(translated_item)
    else:
        result = await _translate_chunk(language, payload_no_stats)

    # Translate stats values separately, preserving id/label structure
    if stats_original:
        stats_text = {f"stat_{i}": item.get("value", "") for i, item in enumerate(stats_original)}
        translated_stats = await _translate_chunk(language, stats_text)
        result["stats"] = [
            {
                "id":    item.get("id", f"stat_{i}"),
                "value": translated_stats.get(f"stat_{i}", item.get("value", "")),
                "label": item.get("label", ""),
            }
            for i, item in enumerate(stats_original)
        ]

    return result


async def translate_result(language: str, result: dict) -> dict:
    """
    Translate a full analysis result dict.
    Also translates: confidence explanation/label, finding status labels,
    finding name pronunciations, hospital static strings, urgency tooltips.
    """
    if language in ("", "English"):
        return result

    # ── Chunk 1: top-level text fields ───────────────────────────────────────
    chunk1 = {}
    # NOTE: "urgency" is intentionally excluded — we keep the English key value
    # ("routine"/"soon"/"urgent") in result.urgency so the frontend can match it
    # to the correct translated tooltip string from _urgencyStrings.
    # Translating urgency creates a duplicate: value = translated phrase AND
    # tooltip = same translated phrase shown together.
    TEXT_FIELDS = [
        "reportType", "summary", "dietarySuggestions",
        "specialistReason", "multiReportInsight",
    ]
    for field in TEXT_FIELDS:
        if result.get(field):
            chunk1[field] = result[field]

    if result.get("patterns"):
        chunk1["patterns"] = [
            {
                "id": p.get("id"),
                "title": p.get("title", ""),       # Must be translated
                "specialist": p.get("specialist", ""),  # Must be translated
                # urgency key is kept as English — _urgencyStrings handles display
            }
            for p in result["patterns"]
        ]

    if result.get("checklist"):
        chunk1["checklist"] = result["checklist"]
    if result.get("contextQuestions"):
        chunk1["contextQuestions"] = result["contextQuestions"]
    if result.get("importantTerms"):
        chunk1["importantTerms"] = result["importantTerms"]
    if result.get("emergencyAlert") and result["emergencyAlert"].get("isEmergency"):
        chunk1["emergencyAlert"] = {
            "isEmergency": True,
            "message": result["emergencyAlert"].get("message", ""),
            "reasons": result["emergencyAlert"].get("reasons", []),
        }

    # Confidence label + explanation
    if result.get("confidenceScore"):
        chunk1["_confidence"] = {
            "label": result["confidenceScore"].get("label", ""),
            "explanation": result["confidenceScore"].get("explanation", ""),
        }

    # Urgency tooltip strings — short phrases for all languages
    chunk1["_urgency"] = {
        "routine": "Routine — no action needed now",
        "soon":    "See a doctor within 1–2 weeks",
        "urgent":  "Urgent — see a doctor promptly",
    }

    # ── Chunk 2: findings ─────────────────────────────────────────────────────
    chunk2 = {}
    if result.get("findings"):
        chunk2["findings"] = [
            {
                "_idx": i,
                "layman": f.get("layman", ""),
                "tip": f.get("tip", ""),
                "status_label": f.get("status", "normal"),   # translate as a STATUS WORD, not pronunciation
                "medical_term_pronunciation": f.get("name", ""),  # phonetic pronunciation of medical term
            }
            for i, f in enumerate(result["findings"])
        ]

    # ── Chunk 3: hospital static strings ─────────────────────────────────────
    chunk3 = {
        "call_for_number": "Call hospital for current number",
        "call_to_confirm": "Please call to confirm timings",
        "call_ahead": "Call ahead or use the maps link to check booking options",
        "open_maps": "Open in Maps",
    }

    # ── Translate all chunks (stagger for high-token languages) ──────────────
    if language in _HIGH_TOKEN_LANGS:
        translated1 = await _translate_chunk(language, chunk1) if chunk1 else {}
        await asyncio.sleep(0.5)
        translated2 = await _translate_chunk(language, chunk2) if chunk2 else {}
        await asyncio.sleep(0.3)
        translated3 = await _translate_chunk(language, chunk3)
    else:
        translated1, translated2, translated3 = await asyncio.gather(
            _translate_chunk(language, chunk1) if chunk1 else asyncio.sleep(0, result={}),
            _translate_chunk(language, chunk2) if chunk2 else asyncio.sleep(0, result={}),
            _translate_chunk(language, chunk3),
        )

    # ── Merge back ────────────────────────────────────────────────────────────
    merged = dict(result)

    for field in TEXT_FIELDS:
        if field in translated1:
            merged[field] = translated1[field]

    if "patterns" in translated1:
        orig_patterns = result.get("patterns", [])
        trans_patterns = translated1["patterns"]
        merged_patterns = []
        for i, orig in enumerate(orig_patterns):
            if i < len(trans_patterns):
                tp = trans_patterns[i]
                merged_patterns.append(
                    {**orig, **{k: tp[k] for k in ["title", "specialist", "urgency"] if k in tp}}
                )
            else:
                merged_patterns.append(orig)
        merged["patterns"] = merged_patterns

    if "checklist" in translated1:
        merged["checklist"] = translated1["checklist"]
    if "contextQuestions" in translated1:
        merged["contextQuestions"] = translated1["contextQuestions"]
    if "importantTerms" in translated1:
        merged["importantTerms"] = translated1["importantTerms"]
    if "emergencyAlert" in translated1:
        merged["emergencyAlert"] = {**result.get("emergencyAlert", {}), **translated1["emergencyAlert"]}

    # Confidence
    if "_confidence" in translated1 and result.get("confidenceScore"):
        tc = translated1["_confidence"]
        merged["confidenceScore"] = {
            **result["confidenceScore"],
            "label":       tc.get("label",       result["confidenceScore"]["label"]),
            "explanation": tc.get("explanation", result["confidenceScore"]["explanation"]),
        }

    # Urgency tooltips
    merged["_urgencyStrings"] = translated1.get("_urgency", {
        "routine": "No immediate action needed",
        "soon":    "See a doctor within 1–2 weeks",
        "urgent":  "See a doctor promptly",
    })

    # Hospital static strings
    merged["_hospitalStrings"] = translated3

    # Findings
    if "findings" in translated2 and result.get("findings"):
        trans_findings = {
            item["_idx"]: item
            for item in translated2["findings"]
            if "_idx" in item
        }
        merged_findings = []
        for i, orig_finding in enumerate(result["findings"]):
            tf = trans_findings.get(i, {})
            mf = dict(orig_finding)
            if tf.get("layman"):
                mf["layman"] = tf["layman"]
            if tf.get("tip"):
                mf["tip"] = tf["tip"]
            # Translated status label (a status WORD, not pronunciation)
            orig_status = orig_finding.get("status", "normal")
            sl = tf.get("status_label", "")
            mf["statusLabel"] = sl if sl and sl != orig_status else orig_status
            # Medical term pronunciation in target language
            name_p = tf.get("medical_term_pronunciation", "")
            if name_p and name_p != orig_finding.get("name", ""):
                mf["namePronunciation"] = name_p
            merged_findings.append(mf)
        merged["findings"] = merged_findings

    return merged
