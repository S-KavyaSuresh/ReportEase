import os
from dotenv import load_dotenv

load_dotenv()

# ═══════════════════════════════════════════════════════
#  GROQ API — Free tier
#  Get your key at: https://console.groq.com
#  Key format: gsk_xxxxxxxxxxxxxxxxxxxx
# ═══════════════════════════════════════════════════════

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# ── Model Selection (all from your free tier) ──────────
#
# Vision + Text — best TPM/TPD on your plan
# RPD: 1K | TPM: 30K | TPD: 500K
VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

# Analysis (same model — large context, handles JSON well)
ANALYSIS_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

# Chat — fast, 14.4K RPD (high request limit for frequent chat)
CHAT_MODEL = "llama-3.1-8b-instant"

# Groq base URL (OpenAI-compatible)
GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions"


def get_headers() -> dict:
    return {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
