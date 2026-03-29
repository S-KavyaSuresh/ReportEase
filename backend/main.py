import os
import uuid
import json

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel

from models import ChatRequest, HospitalRequest
from services import ocr, analysis, chat, hospitals, stt, ui_translate
from services.tts import synthesize

load_dotenv()

app = FastAPI(title="ReportEase API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_report_store: dict[str, str] = {}
ALLOWED_TYPES = {"image/jpeg","image/png","image/jpg","image/webp","image/bmp","application/pdf"}


class UiTranslationRequest(BaseModel):
    language: str
    payload: dict


@app.get("/")
async def root():
    return {"status": "ok", "app": "ReportEase API", "version": "2.0.0"}


@app.post("/api/ocr")
async def ocr_route(file: UploadFile = File(...), session_id: str = Form(default="")):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}")
    file_bytes = await file.read()
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(400, "File too large. Max 20MB.")
    if not session_id:
        session_id = str(uuid.uuid4())
    chat.clear(session_id)
    _report_store.pop(session_id, None)
    try:
        text = await ocr.extract_text(file_bytes, file.content_type)
    except Exception as e:
        raise HTTPException(502, f"OCR failed: {str(e)}")
    _report_store[session_id] = text
    return {"session_id": session_id, "extracted_text": text, "length": len(text)}


@app.post("/api/analyze")
async def analyze_route(
    session_id: str = Form(...),
    extracted_text: str = Form(...),
    language: str = Form(default="English"),
    question: str = Form(default="")
):
    try:
        result = await analysis.analyze(extracted_text, language, question)
    except json.JSONDecodeError:
        raise HTTPException(502, "AI returned invalid JSON. Please try again.")
    except Exception as e:
        raise HTTPException(502, f"Analysis failed: {str(e)}")
    chat.init_session(
        session_id=session_id,
        report_text=extracted_text,
        summary=result.get("summary", ""),
        findings=result.get("findings", []),
        specialist=result.get("specialist", "General Physician"),
        language=language
    )
    return {"session_id": session_id, "result": result}


@app.post("/api/chat")
async def chat_route(req: ChatRequest):
    report_text = _report_store.get(req.session_id, "")
    try:
        response = await chat.reply(
            session_id=req.session_id,
            user_message=req.message,
            language=req.language,
            report_text=report_text
        )
    except Exception as e:
        raise HTTPException(502, f"Chat error: {str(e)}")
    history = chat.get_visible_history(req.session_id)
    return {"reply": response, "message_count": len([m for m in history if m["role"] == "user"])}


@app.get("/api/chat/history/{session_id}")
async def chat_history_route(session_id: str):
    return {"session_id": session_id, "history": chat.get_visible_history(session_id)}


@app.post("/api/hospitals")
async def hospitals_route(req: HospitalRequest):
    try:
        result = await hospitals.find_hospitals(req.location, req.specialist, req.language)
    except Exception as e:
        raise HTTPException(502, f"Hospital search failed: {str(e)}")
    return {"hospitals": result}


# ── TTS endpoint — server-side text to speech using gTTS ──────────
@app.post("/api/tts")
async def tts_route(
    text:       str = Form(...),
    language:   str = Form(default="English"),
    voice_type: str = Form(default="female")
):
    """
    Converts text to speech server-side using gTTS (Google TTS).
    Returns MP3 audio that the browser plays directly.
    Works for Tamil, Hindi, Telugu, Kannada, Malayalam and all languages.
    No CORS issues. No API key. Free.
    """
    if not text or not text.strip():
        raise HTTPException(400, "No text provided")
    try:
        audio_bytes = synthesize(text.strip(), language, voice_type)
    except Exception as e:
        raise HTTPException(500, f"TTS failed: {str(e)}")
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=speech.mp3"}
    )


@app.post("/api/stt")
async def stt_route(
    audio: UploadFile = File(...),
    language: str = Form(default=""),
):
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(400, "No audio provided")
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(400, "Audio file too large. Max 25MB.")

    try:
        result = await stt.transcribe_audio(
            audio_bytes=audio_bytes,
            filename=audio.filename or "audio.webm",
            content_type=audio.content_type or "audio/webm",
            language=language,
        )
    except Exception as e:
        raise HTTPException(502, f"STT failed: {str(e)}")

    return result


@app.post("/api/ui-translations")
async def ui_translations_route(req: UiTranslationRequest):
    try:
        translated = await ui_translate.translate_ui(req.language, req.payload)
    except Exception as e:
        raise HTTPException(502, f"UI translation failed: {str(e)}")
    return {"translations": translated}


@app.delete("/api/session/{session_id}")
async def clear_session(session_id: str):
    chat.clear(session_id)
    _report_store.pop(session_id, None)
    return {"cleared": True, "session_id": session_id}
