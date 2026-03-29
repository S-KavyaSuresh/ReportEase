<div align="center">

# 🩺 ReportEase

### AI-Powered Medical Report Voice Assistant

**Understand any medical report instantly — in your language, by voice.**

Upload any blood test, scan, or lab report. ReportEase reads it, explains every finding in simple words, flags hidden concerns, and guides you to the right specialist — all spoken aloud in your language.

*Built for everyone. Especially for those who cannot read medical jargon.*

---

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React_18-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Groq](https://img.shields.io/badge/AI-Groq_Free_Tier-F55036?style=flat-square)](https://console.groq.com)
[![Whisper](https://img.shields.io/badge/STT-Whisper_Large--V3-412991?style=flat-square)](https://github.com/openai/whisper)
[![Languages](https://img.shields.io/badge/Languages-35%2B-brightgreen?style=flat-square)](#-language-support)

</div>

---

## 📖 What Is ReportEase?

Most people receive medical reports they cannot understand. The numbers, abbreviations, and reference ranges mean nothing without a medical background — and — especially for non-medical users and people unfamiliar with clinical terminology.

ReportEase solves this by:

- Reading your uploaded report using AI vision (OCR)
- Explaining every finding in plain, simple language
- Detecting hidden concerns even when the report summary says "normal"
- Asking follow-up questions about your symptoms
- Suggesting the right specialist to visit
- Finding nearby hospitals and clinics
- Speaking everything aloud in your own language

> ⚠️ ReportEase is an informational tool, not a diagnostic service. Always consult a qualified doctor.

---

## 💡 Why This Matters

Millions of people receive medical reports they cannot understand. Misinterpretation leads to anxiety, delayed treatment, or ignoring serious conditions.

ReportEase bridges this gap by making medical information:
- Understandable
- Accessible
- Actionable
- Voice-driven for inclusivity

---

## ✨ Features

### 🔬 Report Analysis
- Supports **blood tests, CBC, thyroid, diabetes, kidney, liver, lipid panels**, radiology reports, discharge summaries, and more
- Accepts **PDF and image uploads** (JPG, PNG, WebP, BMP) up to 20 MB
- AI reads the report using **Groq's vision model** (Llama 4 Scout)
- Extracts every parameter — name, value, unit, and reference range

### 📊 Parameter Findings
Each parameter is shown with:
- Current value vs normal range
- Status badge: ✅ Normal · 🟡 Borderline · ⚠️ Needs Attention
- Plain-language explanation of what the value means
- Possible related symptoms
- Filter by All / Needs Attention / Borderline / Normal

### 🔍 Hidden Concern Detection
ReportEase does **not** just read the report summary. It scans every individual value and surfaces borderline or mildly abnormal parameters that the report itself may have labelled "normal overall." Nothing is missed.

### 📋 What To Do Next
After analysis, ReportEase generates a personalised checklist:
- Urgency level: 🟢 Routine · 🟡 See a doctor soon · 🔴 Urgent
- Recommended specialist (neurologist, endocrinologist, cardiologist, etc.)
- Why that specialist was recommended
- Step-by-step next actions in plain language
- Safe home care suggestions for mild findings (foods, hydration, rest)

### 🏥 Nearby Hospitals
- Helps users take immediate real-world action after understanding reports
- Enter your city or allow location access
- ReportEase searches for the relevant specialist near you
- Shows hospital name, address, phone, opening hours
- Direct **Google Maps link** for directions
- **Practo appointment booking** link for Indian cities

### 🔊 Voice Audio Output
This is the core of ReportEase. **Every result is read aloud.**

| Feature | Detail |
|---|---|
| Engine | Three-tier: Kokoro 82M → XTTS-v2 → gTTS |
| Languages | 35+ languages including all major Indian languages |
| Auto-play | Report summary plays automatically after analysis |
| Controls | Play · Pause · Speed up · Slow down |
| Chat replies | Every AI response is spoken aloud |

### 🎤 Voice Input (Speech to Text)
Users can **speak their questions** instead of typing.

| Feature | Detail |
|---|---|
| Engine | Whisper Large-V3 via Groq API |
| Coverage | 99 languages |
| How it works | Records audio in browser → sends to backend → Whisper transcribes |
| Auto-stop | Microphone stops automatically after 2.5 seconds of silence |
| Fallback | Works on Chrome, Firefox, Safari, Android, iOS |
| Advantage over browser STT | Works on all browsers, handles Indian language accents |

### 💬 Interactive AI Chat
After the report is analysed, the conversation continues:
- Ask follow-up questions by **voice or text**
- AI remembers your report findings throughout the conversation
- Asks about your symptoms ("Do you feel tired? Have you noticed weight gain?")
- Responds **only in your selected language** — no English mixing
- Conversation does not end after one answer — you can keep asking

### 🌐 Language Support
Full multilingual support across the entire app:

| Region | Languages |
|---|---|
| **Indian languages** | Tamil · Telugu · Kannada · Malayalam · Hindi · Bengali · Marathi · Gujarati · Punjabi · Urdu · Odia · Nepali · Sinhala |
| **East Asia** | Japanese · Chinese · Korean |
| **Southeast Asia** | Vietnamese · Thai · Indonesian · Malay · Filipino · Burmese · Khmer |
| **Europe** | Spanish · French · German · Italian · Portuguese · Russian · Polish · Dutch · Swedish · Norwegian · Danish · Finnish · Czech · Romanian · Hungarian |
| **Middle East & Africa** | Arabic · Swahili · Hausa · Amharic |

- The **entire UI** (buttons, labels, placeholders, messages) is translated into your language
- Report analysis is generated **directly in your language**
- Chat replies are **only in your language** — no language mixing
- Voice output speaks in your language
- Voice input recognises your language accent

---

## 🏗️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18 + Framer Motion | Interactive UI with animations |
| **Routing** | React Router v6 | Page navigation |
| **File Upload** | React Dropzone | Drag-and-drop report upload |
| **HTTP** | Axios | API communication |
| **Backend** | FastAPI + Uvicorn | REST API server |
| **AI — Vision/OCR** | Groq (Llama 4 Scout) | Read report images and PDFs |
| **AI — Analysis** | Groq (Llama 4 Scout) | Extract and explain findings |
| **AI — Chat** | Groq (Llama 3.1 8B Instant) | Conversational follow-up |
| **STT** | Whisper Large-V3 via Groq | Voice input, 99 languages |
| **TTS Tier 1** | Kokoro 82M (local) | High-quality voice for EN/HI/ES/FR etc. |
| **TTS Tier 2** | XTTS-v2 (local, optional) | Natural voice for Indian/Middle Eastern langs |
| **TTS Tier 3** | gTTS (Google, always active) | Fallback for all 100+ languages |
| **PDF Parsing** | PyPDF2 (local) | Extract text from digital PDFs |
| **Geocoding** | OpenStreetMap Nominatim | Convert city name to coordinates |
| **Hospital Search** | Overpass API (OpenStreetMap) | Find nearby hospitals and clinics |

---
## 🤖 AI Models (Powered by Groq - Free Tier)

| Model | Purpose |
|------|--------|
| `meta-llama/llama-4-scout-17b-16e-instruct` | OCR – Extracts text from medical report images |
| `meta-llama/llama-4-scout-17b-16e-instruct` | Report analysis and structured JSON extraction |
| `llama-3.1-8b-instant` | Chat-based follow-up conversations |
| `whisper-large-v3` | Speech-to-text for voice input |

All models are integrated using **Groq's free tier**, enabling fast and efficient AI processing without requiring any payment setup.
---

## 📁 Project Structure

```
reportease/
│
├── backend/                          # FastAPI Python server
│   ├── main.py                       # All API routes
│   ├── config.py                     # API keys, model names
│   ├── models.py                     # Pydantic request schemas
│   ├── requirements.txt              # Python dependencies
│   ├── .env.example                  # Copy to .env and add your key
│   └── services/
│       ├── ocr.py                    # Report image/PDF reading via Groq vision
│       ├── analysis.py               # Medical analysis + JSON extraction
│       ├── chat.py                   # Conversational AI with session memory
│       ├── hospitals.py              # Nearby hospital search (OpenStreetMap)
│       ├── tts.py                    # Text-to-speech (Kokoro → XTTS-v2 → gTTS)
│       ├── stt.py                    # Speech-to-text (Whisper via Groq)
│       └── ui_translate.py           # Dynamic UI translation for 35+ languages
│
└── frontend/                         # React 18 application
    └── src/
        ├── App.jsx                   # Root component + routing
        ├── pages/
        │   ├── HomePage.jsx          # Upload page
        │   └── ResultsPage.jsx       # Analysis results + chat
        ├── components/
        │   ├── AudioPlayer.jsx       # Voice playback controls
        │   ├── ChatBot.jsx           # Floating AI chat assistant
        │   ├── ChecklistCard.jsx     # "What to do next" section
        │   ├── FindingsCard.jsx      # Parameter findings with filters
        │   ├── HospitalsCard.jsx     # Nearby specialist search
        │   ├── LanguageModal.jsx     # Language selection screen
        │   ├── LoaderPipeline.jsx    # Analysis progress indicator
        │   ├── UploadZone.jsx        # Drag-and-drop file upload
        │   ├── Header.jsx            # App header with controls
        │   └── VoiceInput.jsx        # Mic button with silence detection
        ├── hooks/
        │   └── useSpeech.js          # Voice I/O hook (TTS + STT)
        ├── context/
        │   └── AppContext.jsx        # Global state (language, session, results)
        └── utils/
            ├── api.js                # All API call functions
            ├── languages.js          # 35+ language list with codes
            └── translations.js       # UI strings in 6 languages
```

---

## 🚀 Setup & Installation

### Prerequisites
- Python 3.10 or higher
- Node.js 18 or higher
- A free Groq API key

### Step 1 — Get a free Groq API key

1. Go to **[https://console.groq.com](https://console.groq.com)**
2. Sign up — no credit card needed
3. Click **API Keys → Create API Key**
4. Copy the key (starts with `gsk_...`)

### Step 2 — Clone and configure

```bash
git clone https://github.com/your-username/reportease.git
cd reportease

# Create your environment file
cp backend/.env.example backend/.env

# Open backend/.env and replace the placeholder with your real key:
# GROQ_API_KEY=gsk_your_actual_key_here
```

### Step 3 — Run the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API will be live at `http://localhost:8000`

### Step 4 — Run the frontend

```bash
cd frontend
npm install
npm start
```

The app will open at `http://localhost:3000`

---

## 🔊 Enabling Better TTS Quality (Optional)

By default, gTTS is active — it works for all languages but sounds robotic. For natural-sounding voice, especially in Indian languages, install the higher-tier engines:

### Tier 1 — Kokoro 82M
Best for English, Hindi, Spanish, French, Portuguese, Italian, Japanese, Chinese, Korean.
Fast, runs on CPU, no GPU needed.

```bash
pip install kokoro-onnx soundfile
```

Then download the model files from [kokoro-onnx releases](https://github.com/thewh1teagle/kokoro-onnx/releases) and place `kokoro-v0_19.onnx` and `voices.bin` inside the `backend/` folder.

### Tier 2 — XTTS-v2
Best for Tamil, Telugu, Kannada, Malayalam, Arabic, German, Russian, Turkish, and 15 more languages. Sounds very natural. Requires ~4 GB RAM. Downloads a 1.8 GB model on first run.

```bash
pip install TTS
```

Uncomment `# TTS>=0.22.0` in `backend/requirements.txt`.

The engine automatically falls back — if Kokoro models are not found, it tries XTTS-v2, then gTTS. No configuration needed beyond installing the package.

---

## 🔁 How It Works — End to End

```
User uploads report (PDF or image)
        ↓
Backend extracts text (PyPDF2 for PDF, Groq vision for images)
        ↓
AI analyses every parameter against normal ranges
        ↓
Detects all abnormal + borderline values (even if report says "normal")
        ↓
Generates structured JSON: summary, findings, checklist, specialist
        ↓
Frontend displays: Summary → Parameter Findings → What To Do → Hospitals
        ↓
Audio player auto-plays the summary in your language
        ↓
User can ask follow-up questions by voice or text
        ↓
AI continues the conversation, remembering the report context
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/ocr` | Upload and extract text from report |
| `POST` | `/api/analyze` | Analyse extracted report text |
| `POST` | `/api/chat` | Send a chat message |
| `GET` | `/api/chat/history/{id}` | Get conversation history |
| `POST` | `/api/hospitals` | Find nearby specialists |
| `POST` | `/api/tts` | Convert text to speech (returns MP3) |
| `POST` | `/api/stt` | Convert audio to text (Whisper) |
| `DELETE` | `/api/session/{id}` | Clear session data |

---

## 🔐 Security Notes

- **Never commit your `.env` file.** It is listed in `.gitignore`.
- The `.env.example` file is safe to commit — it contains no real keys.
- The Groq API key in `.env` is the only secret this project requires.
- No user data is stored permanently. Sessions are in-memory only.

---

## ⚠️ Disclaimer

ReportEase is for **informational and educational purposes only**.

- It does not provide medical diagnosis
- It does not replace a qualified doctor
- All results should be confirmed with a licensed medical professional
- For emergencies (chest pain, difficulty breathing, severe symptoms), call emergency services immediately

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

<div align="center">
  Built with ❤️ to make healthcare information accessible to everyone.
</div>
