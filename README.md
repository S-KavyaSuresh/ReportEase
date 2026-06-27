# ReportEase

ReportEase is a multilingual medical report companion with:

- React frontend
- FastAPI backend
- PWA support
- Electron desktop packaging
- Capacitor-ready frontend configuration
- Voice playback, chat, report download, and hospital search

## Project Structure

```text
reportease_github_ready/
  backend/
  frontend/
  electron/
  render.yaml
```

## Local Setup

### Backend

```bash
cd backend
pip install -r requirements.txt
copy .env.example .env
python -m uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
copy .env.example .env
npm start
```

## Environment Files

### backend/.env

Required:

```env
GROQ_API_KEY=your_groq_api_key
```

Optional:

```env
ALLOWED_ORIGINS=https://your-frontend.vercel.app
```

### frontend/.env

Optional for local development:

```env
REACT_APP_API_URL=http://localhost:8000
REACT_APP_WINDOWS_INSTALLER_URL=
REACT_APP_ANDROID_APK_URL=
```

If `REACT_APP_API_URL` is left empty, the CRA proxy in `frontend/package.json` is used locally.

## Deploy

### Frontend

- Vercel config: `frontend/vercel.json`
- Build command: `npm run build`
- Output directory: `build`

### Backend

- Render config: `render.yaml`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

## Desktop Build

```bash
cd electron
npm install
npm run build:win
```

Before building desktop installers, replace the placeholder Render URL in `electron/package.json`.

## GitHub Push Notes

This copy is prepared for GitHub:

- real `.env` files are excluded
- `node_modules`, build output, caches, and editor folders are excluded
- default CRA README clutter was removed
- local-only cache folders were removed from the copied project
