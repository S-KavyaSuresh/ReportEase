import logging
import os

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

if not GROQ_API_KEY:
    logging.warning("GROQ_API_KEY is not set. AI features will not work until it is configured.")

VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
ANALYSIS_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
CHAT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions"


def get_headers() -> dict:
    return {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
