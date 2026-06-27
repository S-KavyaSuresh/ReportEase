// In development: relative /api (proxied by React dev server to localhost:8000)
// In production:  set REACT_APP_API_URL=https://your-backend.onrender.com
const BASE = process.env.REACT_APP_API_URL
  ? `${process.env.REACT_APP_API_URL}/api`
  : '/api';

const translationCache = new Map();
const translationRequests = new Map();
const TRANSLATION_STORAGE_PREFIX = 're_ui_translation:';
const UI_TRANSLATION_COOLDOWN_MS = 10 * 60 * 1000;
let uiTranslationCooldownUntil = 0;

function getTranslationCacheKey(language, payload) {
  return JSON.stringify({ language, payload });
}

function readStoredTranslation(cacheKey) {
  try {
    const raw = window.localStorage.getItem(`${TRANSLATION_STORAGE_PREFIX}${cacheKey}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeTranslation(cacheKey, data) {
  try {
    window.localStorage.setItem(`${TRANSLATION_STORAGE_PREFIX}${cacheKey}`, JSON.stringify(data));
  } catch {
    // Ignore storage failures.
  }
}

export function getCachedUITranslations(language, payload) {
  if (!language || String(language).toLowerCase() === 'english') {
    return payload;
  }

  const cacheKey = getTranslationCacheKey(language, payload);
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey).translations || payload;
  }

  const stored = readStoredTranslation(cacheKey);
  if (stored) {
    translationCache.set(cacheKey, stored);
    return stored.translations || payload;
  }

  return payload;
}

async function post(path, formData) {
  const res = await fetch(BASE + path, { method: 'POST', body: formData });
  if (!res.ok) {
    try {
      const json = await res.json();
      const errType = json?.detail?.error_type || json?.detail || `HTTP ${res.status}`;
      throw new Error(String(errType));
    } catch (parseErr) {
      if (parseErr.message && !parseErr.message.startsWith('HTTP')) throw parseErr;
      const text = await res.text().catch(() => res.statusText);
      throw new Error(text || `HTTP ${res.status}`);
    }
  }
  return res.json();
}

export async function uploadAndOCR(file, sessionId = '') {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('session_id', sessionId);
  return post('/ocr', fd);
}

export async function analyzeReport(sessionId, extractedText, language, question = '') {
  const fd = new FormData();
  fd.append('session_id', sessionId);
  fd.append('extracted_text', extractedText);
  fd.append('language', language);
  fd.append('question', question);
  return post('/analyze', fd);
}

export async function sendChat(sessionId, message, language) {
  const res = await fetch(BASE + '/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message, language }),
  });
  if (!res.ok) {
    try {
      const json = await res.json();
      const errType = json?.detail?.error_type || json?.detail || `HTTP ${res.status}`;
      throw new Error(String(errType));
    } catch (parseErr) {
      if (parseErr.message && !parseErr.message.startsWith('HTTP')) throw parseErr;
      throw new Error(`HTTP ${res.status}`);
    }
  }
  return res.json();
}

export async function transcribeAudio(audioBlob, language = '', filename = 'audio.webm', mimeType = 'audio/webm') {
  const fd = new FormData();
  fd.append('audio', audioBlob, filename);
  fd.append('language', language);
  return post('/stt', fd);
}

export async function getTTSSentences(text, language) {
  const fd = new FormData();
  fd.append('text', text);
  fd.append('language', language);
  return post('/tts/sentences', fd);
}

export async function getUITranslations(language, payload) {
  if (!language || String(language).toLowerCase() === 'english') {
    return { translations: payload };
  }

  if (Date.now() < uiTranslationCooldownUntil) {
    return { translations: payload };
  }

  const cacheKey = getTranslationCacheKey(language, payload);
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }
  if (translationRequests.has(cacheKey)) {
    return translationRequests.get(cacheKey);
  }

  const request = fetch(BASE + '/ui-translations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, payload }),
  })
    .then((res) => {
      if (!res.ok) {
        uiTranslationCooldownUntil = Date.now() + UI_TRANSLATION_COOLDOWN_MS;
        return { translations: payload };
      }
      return res.json();
    })
    .then((data) => {
      translationCache.set(cacheKey, data);
      storeTranslation(cacheKey, data);
      translationRequests.delete(cacheKey);
      return data;
    })
    .catch(() => {
      uiTranslationCooldownUntil = Date.now() + UI_TRANSLATION_COOLDOWN_MS;
      const fallback = { translations: payload };
      translationCache.set(cacheKey, fallback);
      storeTranslation(cacheKey, fallback);
      translationRequests.delete(cacheKey);
      return fallback;
    });

  translationRequests.set(cacheKey, request);
  return request;
}

export async function findHospitals(location, specialist, language, sessionId) {
  const res = await fetch(BASE + '/hospitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location, specialist, language, session_id: sessionId }),
  });
  if (!res.ok) return { hospitals: [] };
  return res.json();
}

export async function clearSession(sessionId) {
  return fetch(`${BASE.replace('/api', '')}/api/session/${sessionId}`, { method: 'DELETE' })
    .catch(() => {});
}
