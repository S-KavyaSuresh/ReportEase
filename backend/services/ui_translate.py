import json

import httpx

from config import ANALYSIS_MODEL, GROQ_BASE, get_headers

_CACHE = {}


async def translate_ui(language: str, payload: dict) -> dict:
    if language in ("", "English"):
        return payload
    cache_key = json.dumps({"language": language, "payload": payload}, sort_keys=True, ensure_ascii=False)
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    system_prompt = (
        f"You translate app interface text into {language}. "
        f"Translate every visible word except the product name ReportEase. "
        f"Do not leave English words behind unless they are the app name ReportEase. "
        f"Preserve placeholders like {{n}}, {{r}}, {{lang}}, punctuation, emoji, array shape, and JSON keys. "
        f"Return only valid JSON with the same structure."
    )

    payload_body = {
        "model": ANALYSIS_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        "temperature": 0.2,
        "max_tokens": 2500,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(GROQ_BASE, json=payload_body, headers=get_headers())

    if response.status_code != 200:
        raise RuntimeError(f"UI translation failed: {response.text[:200]}")

    data = response.json()
    translated = json.loads(data["choices"][0]["message"]["content"])
    _CACHE[cache_key] = translated
    return translated
