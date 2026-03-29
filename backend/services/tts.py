"""
TTS service with graceful fallback:
1. Kokoro when local model files are available
2. XTTS when the optional Coqui package is installed
3. gTTS as the default network fallback
"""
import io
import logging
import os
import re
from functools import lru_cache

logger = logging.getLogger(__name__)

KOKORO_LANGS = {
    "English", "Hindi", "Spanish", "French", "Portuguese",
    "Italian", "Japanese", "Chinese", "Korean",
}

XTTS_LANGS = {
    "Tamil", "Telugu", "Kannada", "Malayalam", "Arabic",
    "German", "Russian", "Turkish", "Vietnamese", "Thai",
    "Bengali", "Marathi", "Gujarati", "Punjabi", "Urdu",
    "Indonesian", "Polish", "Dutch", "Swedish", "Norwegian",
    "Finnish", "Danish", "Czech", "Romanian", "Hungarian",
}

GTTS_MAP = {
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
    "Chinese": "zh-CN",
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

SLOW_VOICES = {"slow", "whisper"}


def clean_text(text: str) -> str:
    text = re.sub(r"\*{1,3}([^*\n]+)\*{1,3}", r"\1", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[-•*]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\n+", ". ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


@lru_cache(maxsize=1)
def _get_kokoro():
    from kokoro_onnx import Kokoro

    base_dir = os.path.dirname(os.path.dirname(__file__))
    model_path = os.path.join(base_dir, "kokoro-v0_19.onnx")
    voices_path = os.path.join(base_dir, "voices.bin")
    if not (os.path.exists(model_path) and os.path.exists(voices_path)):
        raise FileNotFoundError("Kokoro model files not found in backend/")
    return Kokoro(model_path, voices_path)


@lru_cache(maxsize=1)
def _get_xtts():
    from TTS.api import TTS

    return TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=False)


def _kokoro_synth(text: str, language: str) -> bytes:
    import soundfile as sf

    kokoro = _get_kokoro()
    lang_map = {
        "English": "en-us",
        "Hindi": "hi",
        "Spanish": "es",
        "French": "fr-fr",
        "Portuguese": "pt-br",
        "Italian": "it",
        "Japanese": "ja",
        "Chinese": "zh",
        "Korean": "ko",
    }
    voice_map = {
        "English": "af_sarah",
        "Hindi": "hf_alpha",
        "Spanish": "ef_dora",
        "French": "ff_siwis",
    }
    lang = lang_map.get(language, "en-us")
    voice = voice_map.get(language, "af_sarah")
    samples, sample_rate = kokoro.create(text, voice=voice, speed=1.0, lang=lang)
    buffer = io.BytesIO()
    sf.write(buffer, samples, sample_rate, format="WAV")
    buffer.seek(0)
    return buffer.read()


def _xtts_synth(text: str, language: str) -> bytes:
    import tempfile

    tts = _get_xtts()
    lang_map = {
        "Tamil": "ta",
        "Telugu": "te",
        "Kannada": "kn",
        "Malayalam": "ml",
        "Arabic": "ar",
        "German": "de",
        "Russian": "ru",
        "Turkish": "tr",
        "Bengali": "bn",
        "Marathi": "mr",
        "Gujarati": "gu",
        "Vietnamese": "vi",
        "Thai": "th",
        "Indonesian": "id",
    }
    lang = lang_map.get(language, "en")

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
        temp_path = temp_file.name
    try:
        tts.tts_to_file(text=text, language=lang, file_path=temp_path)
        with open(temp_path, "rb") as audio_file:
            return audio_file.read()
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


def _gtts_synth(text: str, language: str, voice_type: str) -> bytes:
    from gtts import gTTS

    lang = GTTS_MAP.get(language, "en")
    tts = gTTS(text=text, lang=lang, slow=voice_type in SLOW_VOICES)
    buffer = io.BytesIO()
    tts.write_to_fp(buffer)
    buffer.seek(0)
    return buffer.read()


def synthesize(text: str, language: str, voice_type: str = "female") -> bytes:
    cleaned = clean_text(text)
    if not cleaned:
        raise ValueError("No text to synthesize")

    if language in KOKORO_LANGS:
        try:
            return _kokoro_synth(cleaned, language)
        except Exception as exc:
            logger.warning("Kokoro failed for %s: %s", language, exc)

    if language in XTTS_LANGS:
        try:
            return _xtts_synth(cleaned, language)
        except Exception as exc:
            logger.warning("XTTS failed for %s: %s", language, exc)

    return _gtts_synth(cleaned, language, voice_type)
