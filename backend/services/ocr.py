"""
OCR Service — Groq free tier
Model: meta-llama/llama-4-scout-17b-16e-instruct
Supports vision (image reading). Free on Groq.
TPD: 500K | RPD: 1K
"""
import base64
import httpx
from config import VISION_MODEL, GROQ_BASE, get_headers

OCR_PROMPT = (
    "Extract ALL text from this medical report exactly as written. "
    "Include every parameter name, value, unit, reference range, "
    "patient name, date, doctor name, and remarks. "
    "Return only the raw extracted text."
)


async def extract_text(file_bytes: bytes, mime_type: str) -> str:
    """Extract all text from a medical report image or PDF."""

    # PDF — try local PyPDF2 first (free, instant, no API tokens used)
    if mime_type == "application/pdf":
        try:
            import io, PyPDF2
            reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
            text = "\n".join(p.extract_text() or "" for p in reader.pages).strip()
            if len(text) > 80:
                return text
        except Exception:
            pass
        content = [{"type": "text", "text": "Medical report (PDF). " + OCR_PROMPT}]
    else:
        # Image — base64 encode and send to vision model
        b64 = base64.b64encode(file_bytes).decode("utf-8")
        content = [
            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
            {"type": "text", "text": OCR_PROMPT},
        ]

    payload = {
        "model":       VISION_MODEL,
        "messages":    [{"role": "user", "content": content}],
        "max_tokens":  1500,
        "temperature": 0.1,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(GROQ_BASE, json=payload, headers=get_headers())

    if resp.status_code != 200:
        raise RuntimeError(f"Groq OCR error {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    choices = data.get("choices")
    if not choices:
        raise ValueError(f"No choices in response: {data}")
    result = choices[0].get("message", {}).get("content", "").strip()
    if not result:
        raise ValueError("Groq returned empty OCR content")
    return result
