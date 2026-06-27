"""
ReportEase Backend — FastAPI
All secrets are loaded from environment variables.
No secrets are hardcoded. No stack traces are exposed to users.
"""
import logging
import os
import uuid
import json

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger("reportease")

from models import ChatRequest, HospitalRequest
from services import ocr, analysis, chat, hospitals, stt, ui_translate
from services.tts import synthesize, clean_text, split_sentences

app = FastAPI(title="ReportEase API", version="2.1.0", docs_url=None, redoc_url=None)

# ── CORS ────────────────────────────────────────────────────────────────────
# Development: set ALLOWED_ORIGINS= (empty) → localhost only
# Production:  ALLOWED_ORIGINS=https://your-app.vercel.app
_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = (
    [o.strip() for o in _raw_origins.split(",") if o.strip()]
    if _raw_origins
    else ["http://localhost:3000", "http://localhost:5173"]
)
logger.info(f"CORS allowed origins: {ALLOWED_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

# ── In-memory stores (resets on restart — by design) ─────────────────────────
_report_store: dict[str, str] = {}

ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/jpg",
    "image/webp", "image/bmp", "application/pdf",
}

# ── Request models ────────────────────────────────────────────────────────────
class UiTranslationRequest(BaseModel):
    language: str
    payload: dict

class TTSRequest(BaseModel):
    text: str
    language: str = "English"
    voice_type: str = "female"
    rate: float = 1.0


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "ok", "app": "ReportEase API", "version": "2.1.0"}


@app.get("/health")
async def health():
    """Health check used by Render to confirm the service is running."""
    return {
        "status": "ok",
        "version": "2.1.0",
        "groq_configured": bool(os.getenv("GROQ_API_KEY")),
    }


@app.post("/api/ocr")
async def ocr_route(file: UploadFile = File(...), session_id: str = Form(default="")):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}. Please upload a PDF or image.")
    file_bytes = await file.read()
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(400, "File too large. Maximum size is 20 MB.")
    if not file_bytes:
        raise HTTPException(400, "Empty file received.")
    if not session_id:
        session_id = str(uuid.uuid4())
    chat.clear(session_id)
    _report_store.pop(session_id, None)
    try:
        text = await ocr.extract_text(file_bytes, file.content_type)
    except Exception as e:
        logger.error(f"OCR failed for session {session_id}: {e}")
        raise HTTPException(502, "Could not read the uploaded file. Please try a clearer image or PDF.")
    if not text or not text.strip():
        raise HTTPException(422, "No text could be extracted from the file. Please upload a clearer image.")
    _report_store[session_id] = text
    logger.info(f"OCR success session={session_id} chars={len(text)}")
    return {"session_id": session_id, "extracted_text": text, "length": len(text)}


@app.post("/api/analyze")
async def analyze_route(
    session_id:     str = Form(...),
    extracted_text: str = Form(...),
    language:       str = Form(default="English"),
    question:       str = Form(default=""),
):
    if not extracted_text or not extracted_text.strip():
        raise HTTPException(400, "No report text provided.")
    try:
        result = await analysis.analyze(extracted_text, language, question)
    except json.JSONDecodeError:
        logger.error(f"Analysis returned invalid JSON for session {session_id}")
        raise HTTPException(502, "Analysis failed. Please try again.")
    except Exception as e:
        logger.error(f"Analysis error session={session_id}: {e}")
        raise HTTPException(502, "Analysis failed. Please try again.")
    chat.init_session(
        session_id=session_id,
        report_text=extracted_text,
        summary=result.get("summary", ""),
        findings=result.get("findings", []),
        specialist=result.get("specialist", "General Physician"),
        language=language,
    )
    logger.info(f"Analysis success session={session_id} language={language}")
    return {"session_id": session_id, "result": result}


@app.post("/api/chat")
async def chat_route(req: ChatRequest):
    if not req.message or not req.message.strip():
        raise HTTPException(400, "Message cannot be empty.")
    report_text = _report_store.get(req.session_id, "")
    try:
        response = await chat.reply(
            session_id=req.session_id,
            user_message=req.message.strip(),
            language=req.language,
            report_text=report_text,
        )
    except Exception as e:
        err = str(e)
        logger.warning(f"Chat error session={req.session_id}: {err}")
        if "rate_limit" in err or "429" in err:
            raise HTTPException(429, detail={"error_type": "rate_limit"})
        if "timeout" in err:
            raise HTTPException(504, detail={"error_type": "timeout"})
        raise HTTPException(502, detail={"error_type": "api_error"})
    history = chat.get_visible_history(req.session_id)
    return {
        "reply": response,
        "message_count": len([m for m in history if m["role"] == "user"]),
    }


@app.get("/api/chat/history/{session_id}")
async def chat_history_route(session_id: str):
    return {"session_id": session_id, "history": chat.get_visible_history(session_id)}


@app.post("/api/hospitals")
async def hospitals_route(req: HospitalRequest):
    try:
        result = await hospitals.find_hospitals(req.location, req.specialist, req.language)
    except Exception as e:
        logger.error(f"Hospital search failed: {e}")
        raise HTTPException(502, "Hospital search failed. Please try again.")
    return {"hospitals": result}


@app.post("/api/tts")
async def tts_route(req: TTSRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(400, "No text provided.")
    rate = max(0.5, min(2.0, req.rate))
    try:
        audio_bytes = synthesize(req.text.strip(), req.language, req.voice_type, rate)
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(500, "Speech generation failed.")
    media_type = "audio/wav" if audio_bytes[:4] == b"RIFF" else "audio/mpeg"
    return Response(
        content=audio_bytes,
        media_type=media_type,
        headers={"Content-Disposition": "inline; filename=speech.mp3"},
    )


@app.post("/api/tts/stream")
async def tts_stream_route(
    text:       str = Form(...),
    language:   str = Form(default="English"),
    voice_type: str = Form(default="female"),
):
    if not text or not text.strip():
        raise HTTPException(400, "No text provided.")
    cleaned   = clean_text(text.strip(), language)
    sentences = split_sentences(cleaned, max_chars=180)

    async def audio_generator():
        boundary = b"--audiochunk\r\n"
        for sentence in sentences:
            if not sentence.strip():
                continue
            try:
                chunk_bytes = synthesize(sentence, language, voice_type)
                media_type  = "audio/wav" if chunk_bytes[:4] == b"RIFF" else "audio/mpeg"
                yield boundary
                yield f"Content-Type: {media_type}\r\nContent-Length: {len(chunk_bytes)}\r\n\r\n".encode()
                yield chunk_bytes
                yield b"\r\n"
            except Exception:
                continue
        yield b"--audiochunk--\r\n"

    return StreamingResponse(
        audio_generator(),
        media_type="multipart/mixed; boundary=audiochunk",
        headers={"X-Sentence-Count": str(len(sentences))},
    )


@app.post("/api/tts/sentences")
async def tts_sentences_route(
    text:     str = Form(...),
    language: str = Form(default="English"),
):
    if not text or not text.strip():
        raise HTTPException(400, "No text provided.")
    cleaned   = clean_text(text.strip(), language)
    sentences = split_sentences(cleaned, max_chars=200)
    return {"cleaned_text": cleaned, "sentences": sentences, "count": len(sentences)}


@app.post("/api/stt")
async def stt_route(
    audio:    UploadFile = File(...),
    language: str        = Form(default=""),
):
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(400, "No audio provided.")
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(400, "Audio file too large. Maximum 25 MB.")
    try:
        result = await stt.transcribe_audio(
            audio_bytes=audio_bytes,
            filename=audio.filename or "audio.webm",
            content_type=audio.content_type or "audio/webm",
            language=language,
        )
    except Exception as e:
        logger.error(f"STT error: {e}")
        raise HTTPException(502, detail={"error_type": "stt_failed"})
    return result


@app.post("/api/ui-translations")
async def ui_translations_route(req: UiTranslationRequest):
    try:
        translated = await ui_translate.translate_ui(req.language, req.payload)
    except Exception as e:
        logger.warning(f"UI translation failed lang={req.language}: {e}")
        # Return original payload on failure — UI falls back to English
        return {"translations": req.payload}
    return {"translations": translated}


@app.delete("/api/session/{session_id}")
async def clear_session(session_id: str):
    chat.clear(session_id)
    _report_store.pop(session_id, None)
    return {"cleared": True, "session_id": session_id}
