"""
TTS service — priority chain:
1. edge-tts  (Microsoft neural voices, FREE, no API key, no limits, best pronunciation)
2. gTTS      (Google Translate TTS, free fallback)

edge-tts uses Microsoft Edge's Read Aloud neural voices.
No account, no key, no billing. Install with: pip install edge-tts

Indian language neural voices:
  Hindi (hi-IN-SwaraNeural), Tamil (ta-IN-PallaviNeural),
  Telugu (te-IN-ShrutiNeural), Kannada (kn-IN-SapnaNeural),
  Malayalam (ml-IN-SobhanaNeural), Bengali (bn-IN-TanishaaNeural),
  Marathi (mr-IN-AarohiNeural), Gujarati (gu-IN-DhwaniNeural),
  Punjabi (pa-IN-Ojaswineural), Urdu (ur-PK-UzmaNeural)
"""
import asyncio
import io
import logging
import re

logger = logging.getLogger(__name__)

# ── Edge TTS voice map ────────────────────────────────────────────────────────
EDGE_VOICE_MAP = {
    # Indian languages — neural voices
    "Hindi":     "hi-IN-SwaraNeural",
    "Tamil":     "ta-IN-PallaviNeural",
    "Telugu":    "te-IN-ShrutiNeural",
    "Kannada":   "kn-IN-SapnaNeural",
    "Malayalam": "ml-IN-SobhanaNeural",
    "Bengali":   "bn-IN-TanishaaNeural",
    "Marathi":   "mr-IN-AarohiNeural",
    "Gujarati":  "gu-IN-DhwaniNeural",
    "Punjabi":   "pa-IN-OjaswiNeural",
    "Urdu":      "ur-PK-UzmaNeural",
    "Odia":      "or-IN-SubhasiniNeural",
    "Nepali":    "ne-NP-HemkalaNeural",
    # World languages — neural voices
    "English":    "en-US-JennyNeural",
    "Spanish":    "es-ES-ElviraNeural",
    "French":     "fr-FR-DeniseNeural",
    "German":     "de-DE-KatjaNeural",
    "Italian":    "it-IT-ElsaNeural",
    "Portuguese": "pt-BR-FranciscaNeural",
    "Arabic":     "ar-SA-ZariyahNeural",
    "Chinese":    "zh-CN-XiaoxiaoNeural",
    "Japanese":   "ja-JP-NanamiNeural",
    "Korean":     "ko-KR-SunHiNeural",
    "Russian":    "ru-RU-SvetlanaNeural",
    "Turkish":    "tr-TR-EmelNeural",
    "Dutch":      "nl-NL-ColetteNeural",
    "Polish":     "pl-PL-ZofiaNeural",
    "Vietnamese": "vi-VN-HoaiMyNeural",
    "Thai":       "th-TH-PremwadeeNeural",
    "Indonesian": "id-ID-GadisNeural",
    "Malay":      "ms-MY-YasminNeural",
    "Filipino":   "fil-PH-BlessicaNeural",
    "Swahili":    "sw-KE-ZuriNeural",
}

# ── gTTS fallback map ─────────────────────────────────────────────────────────
GTTS_MAP = {
    "Tamil": "ta", "Hindi": "hi", "Telugu": "te", "Kannada": "kn",
    "Malayalam": "ml", "Bengali": "bn", "Marathi": "mr", "Gujarati": "gu",
    "Punjabi": "pa", "Urdu": "ur", "Odia": "or", "Nepali": "ne",
    "Sinhala": "si", "English": "en", "Spanish": "es", "French": "fr",
    "German": "de", "Arabic": "ar", "Chinese": "zh-CN", "Japanese": "ja",
    "Korean": "ko", "Russian": "ru", "Portuguese": "pt", "Indonesian": "id",
    "Malay": "ms", "Filipino": "tl", "Swahili": "sw", "Hausa": "ha",
    "Amharic": "am", "Burmese": "my", "Khmer": "km", "Turkish": "tr",
    "Vietnamese": "vi", "Thai": "th", "Italian": "it", "Dutch": "nl",
    "Polish": "pl",
}

SLOW_VOICES = {"slow", "whisper"}

ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
        "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
        "seventeen", "eighteen", "nineteen"]
TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def _integer_words(n: int) -> str:
    if n < 20:
        return ONES[n] if n < len(ONES) else str(n)
    if n < 100:
        return TENS[n // 10] + (" " + ONES[n % 10] if n % 10 else "")
    if n < 1000:
        rest = _integer_words(n % 100) if n % 100 else ""
        return ONES[n // 100] + " hundred" + (" " + rest if rest else "")
    if n < 100000:
        rest = _integer_words(n % 1000) if n % 1000 else ""
        return _integer_words(n // 1000) + " thousand" + (" " + rest if rest else "")
    return str(n)

# Languages where we should NOT expand numbers to English words.
# Edge-tts neural voices for these handle digits natively.
_NO_EXPAND_LANGS = {
    "Tamil", "Telugu", "Malayalam", "Kannada", "Hindi", "Bengali",
    "Marathi", "Gujarati", "Punjabi", "Urdu", "Arabic",
    "Chinese", "Japanese", "Korean", "Thai", "Vietnamese",
}


def _num_to_words(n: str) -> str:
    try:
        if '.' in n:
            integer_part, decimal_part = n.split('.', 1)
            int_words = _integer_words(int(integer_part))
            dec_words = ' '.join(
                ONES[int(d)] if int(d) < len(ONES) else d for d in decimal_part
            )
            return f"{int_words} point {dec_words}".strip()
        return _integer_words(int(n))
    except Exception:
        return n


def _expand_ranges(text: str) -> str:
    def replace_range(m):
        lo, hi = m.group(1), m.group(2)
        return f"{_num_to_words(lo)} to {_num_to_words(hi)}"
    return re.sub(r'(\d+(?:\.\d+)?)\s*[-\u2013]\s*(\d+(?:\.\d+)?)', replace_range, text)


def _expand_standalone_decimals(text: str) -> str:
    return re.sub(r'\b(\d+\.\d+)\b', lambda m: _num_to_words(m.group(0)), text)


def clean_text(text: str, language: str = "English") -> str:
    """Clean markdown. For English, expand numbers to spoken form.
    For Indian/Asian languages, keep numbers as digits so the neural
    voice handles them natively in the correct language."""
    text = re.sub(r'\*{1,3}([^*\n]+)\*{1,3}', r'\1', text)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*[-\u2022*]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'\n+', '. ', text)
    text = re.sub(r'\.(\s*\.)+', '.', text)
    text = re.sub(r'\s+', ' ', text)
    # Only expand numbers to English words for English TTS
    if language not in _NO_EXPAND_LANGS:
        text = _expand_ranges(text)
        text = _expand_standalone_decimals(text)
    return text.strip()


def split_sentences(text: str, max_chars: int = 200) -> list:
    """Split text into sentence-sized chunks. Required by main.py."""
    raw = re.split(r'(?<=[.!?\u0964\u0965])\s+', text)
    chunks = []
    current = ""
    for sentence in raw:
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(current) + len(sentence) < max_chars:
            current = (current + " " + sentence).strip()
        else:
            if current:
                chunks.append(current)
            current = sentence
    if current:
        chunks.append(current)
    return chunks or [text]


# ── Rate helpers ──────────────────────────────────────────────────────────────

def _rate_to_ssml_rate(rate: float) -> str:
    pct = round((rate - 1.0) * 100)
    if pct == 0:
        return "+0%"
    return f"{pct:+d}%"


# ── Tier 1: edge-tts ──────────────────────────────────────────────────────────

async def _edge_tts_async(text: str, voice: str, rate: float = 1.0) -> bytes:
    import edge_tts
    buf = io.BytesIO()
    ssml_rate = _rate_to_ssml_rate(rate)
    communicate = edge_tts.Communicate(text, voice, rate=ssml_rate)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    buf.seek(0)
    data = buf.read()
    if len(data) < 100:
        raise RuntimeError("edge-tts returned empty audio")
    return data


def _edge_tts_synth(text: str, language: str, rate: float = 1.0) -> bytes:
    voice = EDGE_VOICE_MAP.get(language, "en-US-JennyNeural")
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, _edge_tts_async(text, voice, rate))
                return future.result(timeout=30)
        else:
            return loop.run_until_complete(_edge_tts_async(text, voice, rate))
    except RuntimeError:
        return asyncio.run(_edge_tts_async(text, voice, rate))


# ── Tier 2: gTTS ──────────────────────────────────────────────────────────────

def _gtts_synth(text: str, language: str, voice_type: str) -> bytes:
    from gtts import gTTS
    lang = GTTS_MAP.get(language, "en")
    tts = gTTS(text=text, lang=lang, slow=voice_type in SLOW_VOICES)
    buffer = io.BytesIO()
    tts.write_to_fp(buffer)
    buffer.seek(0)
    return buffer.read()


# ── Public API ────────────────────────────────────────────────────────────────

def synthesize(text: str, language: str, voice_type: str = "female", rate: float = 1.0) -> bytes:
    """
    Returns MP3 audio bytes.
    Tries edge-tts (neural, free, no key) → gTTS (fallback).
    rate: speed multiplier (0.75=slow, 1.0=normal, 1.5=fast)
    """
    cleaned = clean_text(text, language)
    if not cleaned:
        raise ValueError("No text to synthesize")

    # Tier 1 — edge-tts (Microsoft neural, no key needed, supports speed via SSML)
    try:
        return _edge_tts_synth(cleaned, language, rate)
    except Exception as exc:
        logger.warning("edge-tts failed for %s: %s", language, exc)

    # Tier 2 — gTTS fallback
    try:
        return _gtts_synth(cleaned, language, voice_type)
    except Exception as exc:
        logger.warning("gTTS failed for %s: %s", language, exc)

    raise RuntimeError(f"All TTS engines failed for language: {language}")
