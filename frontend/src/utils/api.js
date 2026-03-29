import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const ocrReport = (file, sessionId) => {
  const form = new FormData();
  form.append('file', file);
  form.append('session_id', sessionId || '');
  return api.post('/ocr', form);
};

export const analyzeReport = ({ session_id, extracted_text, language, question }) => {
  const form = new FormData();
  form.append('session_id', session_id);
  form.append('extracted_text', extracted_text);
  form.append('language', language);
  form.append('question', question || '');
  return api.post('/analyze', form);
};

export const sendChat = ({ session_id, message, language }) =>
  api.post('/chat', { session_id, message, language });

export const transcribeAudio = (audioBlob, language) => {
  const form = new FormData();
  form.append('audio', audioBlob, 'voice.webm');
  form.append('language', language || '');
  return api.post('/stt', form);
};

export const translateUi = (language, payload) =>
  api.post('/ui-translations', { language, payload });

export const findHospitals = ({ location, specialist, language, session_id }) =>
  api.post('/hospitals', { location, specialist, language, session_id });

export const clearSession = (sessionId) =>
  api.delete(`/session/${sessionId}`);

export default api;
