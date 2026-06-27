"""
OCR Service — Groq free tier
Model: meta-llama/llama-4-scout-17b-16e-instruct
Supports vision (image reading). Free on Groq.
TPD: 500K | RPD: 1K
"""
import base64
import io
import httpx
from config import VISION_MODEL, GROQ_BASE, get_headers

try:
    from PIL import Image, ImageOps
except Exception:  # pragma: no cover - optional fallback
    Image = None
    ImageOps = None

OCR_PROMPT = (
    "Extract all visible text from this medical report exactly as written. "
    "Include test names, values, units, ranges, patient details, and remarks. "
    "Return only raw extracted text."
)

MAX_IMAGE_SIDE = 1024
JPEG_QUALITY = 72


def _prepare_image_for_vision(file_bytes: bytes, mime_type: str) -> tuple[bytes, str]:
    """
    Downscale large images before sending them to Groq vision.
    This keeps OCR reliable while sharply reducing vision token usage.
    """
    if Image is None:
        return file_bytes, mime_type

    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            img = ImageOps.exif_transpose(img) if ImageOps else img
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")

            width, height = img.size
            largest_side = max(width, height)
            if largest_side > MAX_IMAGE_SIDE:
                scale = MAX_IMAGE_SIDE / float(largest_side)
                resized = (
                    max(1, int(width * scale)),
                    max(1, int(height * scale)),
                )
                img = img.resize(resized, Image.Resampling.LANCZOS)

            out = io.BytesIO()
            if mime_type in ("image/png", "image/webp", "image/bmp"):
                img.save(out, format="PNG", optimize=True)
                return out.getvalue(), "image/png"

            img = img.convert("RGB")
            img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            return out.getvalue(), "image/jpeg"
    except Exception:
        return file_bytes, mime_type


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
        prepared_bytes, prepared_mime_type = _prepare_image_for_vision(file_bytes, mime_type)
        b64 = base64.b64encode(prepared_bytes).decode("utf-8")
        content = [
            {"type": "image_url", "image_url": {"url": f"data:{prepared_mime_type};base64,{b64}"}},
            {"type": "text", "text": OCR_PROMPT},
        ]

    payload = {
        "model":       VISION_MODEL,
        "messages":    [{"role": "user", "content": content}],
        "max_tokens":  1200,
        "temperature": 0,
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
