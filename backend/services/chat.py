"""
Chat Service — Groq
CRITICAL: All responses MUST be in the user's chosen language only.
No language mixing allowed.

FIXES:
- Switched to llama-4-scout (30K TPM vs llama-3.1-8b's 6K) to avoid 429 errors
- Added repetition detection — strips looping sentences before returning
- Added conversation history trimming — keeps last 10 turns to control token usage
- Tighter max_tokens (350) so each response stays concise and within limits
- Raw error messages are caught and replaced with friendly user-facing text
"""
import re
from typing import Dict, List

import httpx

from config import CHAT_MODEL, GROQ_BASE, get_headers

_sessions: Dict[str, List[dict]] = {}
MAX_HISTORY_TURNS = 10   # keep last N user+assistant pairs (not counting system)
MAX_TOKENS = 350          # concise responses to stay well under 30K TPM


def _strip_md(text: str) -> str:
    if not isinstance(text, str):
        return text
    text = re.sub(r'\*{1,3}([^*\n]+)\*{1,3}', r'\1', text)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*[-•*]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _remove_repetition(text: str) -> str:
    """Remove repeated sentences caused by model looping."""
    if not text:
        return text
    # Split into sentences (handle Tamil/Hindi punctuation too)
    sentences = re.split(r'(?<=[.!?।\n])\s+', text.strip())
    seen: list[str] = []
    for sentence in sentences:
        s = sentence.strip()
        if not s:
            continue
        # Normalise for comparison (lowercase, strip punctuation)
        key = re.sub(r'[^\w\s]', '', s.lower()).strip()
        # Check if this sentence is already in seen (exact or very similar)
        if not any(
            key == re.sub(r'[^\w\s]', '', existing.lower()).strip()
            for existing in seen
        ):
            seen.append(s)
    return ' '.join(seen)


def _trim_history(session_id: str):
    """Keep only the system message + last MAX_HISTORY_TURNS pairs."""
    messages = _sessions.get(session_id, [])
    system_msgs = [m for m in messages if m['role'] == 'system']
    non_system = [m for m in messages if m['role'] != 'system']
    # Each turn = 1 user + 1 assistant = 2 messages
    max_msgs = MAX_HISTORY_TURNS * 2
    if len(non_system) > max_msgs:
        non_system = non_system[-max_msgs:]
    _sessions[session_id] = system_msgs + non_system


def init_session(session_id: str, report_text: str, summary: str,
                 findings: list, specialist: str, language: str):
    findings_brief = "\n".join(
        f"- {f.get('name','')}: {f.get('value','')} [{f.get('status','normal').upper()}]"
        for f in findings[:12]
    )
    system_msg = {
        "role": "system",
        "content": (
            f"You are a warm, caring friend who is also a knowledgeable doctor. "
            f"You are having a friendly one-on-one conversation about a patient's medical report.\n\n"

            f"CRITICAL LANGUAGE RULE: You MUST respond ONLY in {language}. "
            f"Write every single word in {language}. "
            f"Do NOT use English unless it is a universally recognised medical abbreviation. "
            f"Even 'normal', 'high', 'low', 'yes', 'no' must be in {language}. "
            f"LANGUAGE MIXING IS STRICTLY FORBIDDEN.\n\n"

            f"TONE: Be warm, friendly, reassuring. Talk like a caring friend. "
            f"Use simple words. Show empathy. Do not be repetitive.\n\n"

            f"RESPONSE RULES:\n"
            f"1. Give ONE clear, focused answer per turn. Maximum 3-4 sentences.\n"
            f"2. Answer their specific question first.\n"
            f"3. Mention the exact report value you are referring to when relevant.\n"
            f"4. Give ONE practical tip (diet/lifestyle) if relevant.\n"
            f"5. Suggest a doctor visit only if values are critical.\n"
            f"6. NEVER repeat the same sentence twice in one response.\n"
            f"7. NEVER start your response with the patient's name repeatedly.\n\n"

            f"FORMATTING: Plain conversational sentences only. "
            f"No markdown, no stars, no headers, no bullet points.\n\n"

            f"SAFETY: Do not give a final diagnosis.\n\n"

            f"REPORT SUMMARY:\n{summary}\n\n"
            f"KEY FINDINGS:\n{findings_brief}\n\n"
            f"SPECIALIST IF NEEDED: {specialist}"
        )
    }
    _sessions[session_id] = [system_msg]


async def reply(session_id: str, user_message: str, language: str, report_text: str = "") -> str:
    if session_id not in _sessions:
        _sessions[session_id] = [{
            "role": "system",
            "content": (
                f"You are a warm, caring friend who is also a knowledgeable doctor. "
                f"CRITICAL: Respond ONLY in {language}. Every word must be in {language}. "
                f"Give clear, concise answers — maximum 3-4 sentences per reply. "
                f"Never repeat the same sentence twice. "
                f"Give practical advice. Suggest doctors only for serious issues. "
                f"No markdown. Plain friendly sentences only."
                + (f"\n\nReport context:\n{report_text[:600]}" if report_text else "")
            )
        }]

    _sessions[session_id].append({"role": "user", "content": user_message})
    _trim_history(session_id)

    payload = {
        "model":       CHAT_MODEL,
        "messages":    _sessions[session_id],
        "max_tokens":  MAX_TOKENS,
        "temperature": 0.4,
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(GROQ_BASE, json=payload, headers=get_headers())
    except httpx.TimeoutException:
        raise RuntimeError("timeout")

    if resp.status_code == 429:
        raise RuntimeError("rate_limit")
    if resp.status_code != 200:
        raise RuntimeError("api_error")

    data    = resp.json()
    choices = data.get("choices")
    if not choices:
        raise RuntimeError("no_response")

    raw   = choices[0].get("message", {}).get("content", "").strip()
    if not raw:
        raise RuntimeError("empty_response")

    clean = _strip_md(raw)
    clean = _remove_repetition(clean)

    _sessions[session_id].append({"role": "assistant", "content": clean})
    return clean


def get_visible_history(session_id: str) -> List[dict]:
    return [m for m in _sessions.get(session_id, []) if m["role"] != "system"]


def clear(session_id: str):
    _sessions.pop(session_id, None)
