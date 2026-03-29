import os
from typing import Optional

import httpx


LANGUAGE_TO_ISO = {
    "Tamil": "ta",
    "Hindi": "hi",
    "Telugu": "te",
    "Kannada": "kn",
    "Malayalam": "ml",
    "Bengali": "bn",
    "Marathi": "mr",
    "Gujarati": "gu",
    "Punjabi": "pa",
    "Urdu": "ur",
    "Odia": "or",
    "Nepali": "ne",
    "Sinhala": "si",
    "English": "en",
    "Spanish": "es",
    "French": "fr",
    "German": "de",
    "Arabic": "ar",
    "Chinese": "zh",
    "Japanese": "ja",
    "Korean": "ko",
    "Russian": "ru",
    "Portuguese": "pt",
    "Indonesian": "id",
    "Malay": "ms",
    "Filipino": "tl",
    "Swahili": "sw",
    "Hausa": "ha",
    "Amharic": "am",
    "Burmese": "my",
    "Khmer": "km",
    "Turkish": "tr",
    "Vietnamese": "vi",
    "Thai": "th",
}


async def transcribe_audio(
    audio_bytes: bytes,
    filename: str = "audio.webm",
    content_type: str = "audio/webm",
    language: str = "",
) -> dict:
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        raise RuntimeError("GROQ_API_KEY is not configured")

    form_data = {
        "model": "whisper-large-v3",
        "response_format": "json",
    }
    iso_language: Optional[str] = LANGUAGE_TO_ISO.get(language or "")
    if iso_language:
        form_data["language"] = iso_language

    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {groq_key}"},
            data=form_data,
            files={
                "file": (
                    filename,
                    audio_bytes,
                    content_type or "application/octet-stream",
                )
            },
        )

    if response.status_code != 200:
        raise RuntimeError(f"Whisper STT failed: {response.text[:200]}")

    payload = response.json()
    transcript = (payload.get("text") or "").strip()
    detected_language = payload.get("language") or iso_language or ""
    return {
        "transcript": transcript,
        "detected_language": detected_language,
    }
