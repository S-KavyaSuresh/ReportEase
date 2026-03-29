"""
Chat Service — Groq
CRITICAL: All responses MUST be in the user's chosen language only.
No language mixing allowed.
"""
import re
import httpx
from typing import Dict, List
from config import ANALYSIS_MODEL, GROQ_BASE, get_headers

_sessions: Dict[str, List[dict]] = {}


def _strip_md(text: str) -> str:
    if not isinstance(text, str): return text
    text = re.sub(r'\*{1,3}([^*\n]+)\*{1,3}', r'\1', text)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*[-•*]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def init_session(session_id: str, report_text: str, summary: str,
                 findings: list, specialist: str, language: str):
    findings_brief = "\n".join(
        f"- {f.get('name','')}: {f.get('value','')} [{f.get('status','normal').upper()}]"
        for f in findings[:10]
    )
    system_msg = {
        "role": "system",
        "content": (
            f"You are a warm medical assistant helping a patient understand their medical report.\n\n"
            f"CRITICAL LANGUAGE RULE: You MUST respond ONLY in {language}. "
            f"Write every word in {language}. Do NOT use English words unless they are medical terms. "
            f"Do NOT mix languages under any circumstances.\n\n"
            f"FORMATTING RULE: Write in plain conversational sentences. "
            f"No markdown, no ** stars, no # headers, no bullet points.\n\n"
            f"Be warm, simple, reassuring. Always recommend seeing a real doctor for serious concerns.\n\n"
            f"REPORT SUMMARY:\n{summary}\n\n"
            f"KEY FINDINGS:\n{findings_brief}\n\n"
            f"SPECIALIST: {specialist}"
        )
    }
    _sessions[session_id] = [system_msg]


async def reply(session_id: str, user_message: str, language: str, report_text: str = "") -> str:
    if session_id not in _sessions:
        _sessions[session_id] = [{
            "role": "system",
            "content": (
                f"You are a warm medical assistant. "
                f"CRITICAL: Respond ONLY in {language}. Every single word must be in {language}. "
                f"No markdown formatting. Plain sentences only."
                + (f"\n\nReport context:\n{report_text[:800]}" if report_text else "")
            )
        }]

    _sessions[session_id].append({"role": "user", "content": user_message})

    payload = {
        "model":       ANALYSIS_MODEL,
        "messages":    _sessions[session_id],
        "max_tokens":  500,
        "temperature": 0.4,
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post(GROQ_BASE, json=payload, headers=get_headers())

    if resp.status_code != 200:
        raise RuntimeError(f"Groq error {resp.status_code}: {resp.text[:200]}")

    data    = resp.json()
    choices = data.get("choices")
    if not choices:
        raise ValueError(f"No choices: {data}")
    raw = choices[0].get("message", {}).get("content", "").strip()
    if not raw:
        raise ValueError("Empty chat response")

    clean = _strip_md(raw)
    _sessions[session_id].append({"role": "assistant", "content": clean})
    return clean


def get_visible_history(session_id: str) -> List[dict]:
    return [m for m in _sessions.get(session_id, []) if m["role"] != "system"]


def clear(session_id: str):
    _sessions.pop(session_id, None)
