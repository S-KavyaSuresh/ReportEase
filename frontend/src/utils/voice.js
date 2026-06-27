export const LANG_BCP47 = {
  English: 'en-US', Tamil: 'ta-IN', Hindi: 'hi-IN', Telugu: 'te-IN',
  Kannada: 'kn-IN', Malayalam: 'ml-IN', Bengali: 'bn-IN', Marathi: 'mr-IN',
  Gujarati: 'gu-IN', Punjabi: 'pa-IN', Urdu: 'ur-PK',
  Spanish: 'es-ES', French: 'fr-FR', German: 'de-DE', Italian: 'it-IT',
  Portuguese: 'pt-BR', Arabic: 'ar-SA', Chinese: 'zh-CN', Japanese: 'ja-JP',
  Korean: 'ko-KR', Russian: 'ru-RU', Turkish: 'tr-TR', Dutch: 'nl-NL',
  Polish: 'pl-PL', Vietnamese: 'vi-VN', Thai: 'th-TH', Indonesian: 'id-ID',
};

const API_BASE = process.env.REACT_APP_API_URL || '';
const AUDIO_READY_STATE = 3;
const SILENT_LEAD_IN_SECONDS = 0.28;
let decodeAudioContext = null;

function buildTtsText(text) {
  return text ? String(text).trim() : text;
}

function getAudioContext() {
  if (decodeAudioContext) return decodeAudioContext;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  decodeAudioContext = new AudioContextCtor();
  return decodeAudioContext;
}

function encodeAudioBufferAsWav(audioBuffer) {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const frameCount = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numberOfChannels * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[frame] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

async function prependSilenceToBlob(blob, leadInSeconds = SILENT_LEAD_IN_SECONDS) {
  const audioContext = getAudioContext();
  if (!audioContext) return blob;

  try {
    const sourceBytes = await blob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(sourceBytes.slice(0));
    const leadFrames = Math.max(1, Math.round(decoded.sampleRate * leadInSeconds));
    const padded = audioContext.createBuffer(
      decoded.numberOfChannels,
      decoded.length + leadFrames,
      decoded.sampleRate
    );

    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      padded.getChannelData(channel).set(decoded.getChannelData(channel), leadFrames);
    }

    return encodeAudioBufferAsWav(padded);
  } catch {
    return blob;
  }
}

function splitSentences(text, maxLen = 450) {
  const raw = text.split(/(?<=[.!?।॥\u0964\u0965\u06D4])\s+/);
  const chunks = [];
  let current = '';
  for (const part of raw) {
    const sentence = part.trim();
    if (!sentence) continue;
    if (current.length + sentence.length < maxLen) {
      current = `${current} ${sentence}`.trim();
    } else {
      if (current) chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

let currentOwnerId = null;
const listeners = new Map();
const progressListeners = new Map();

const engine = {
  synth: window.speechSynthesis || null,
  _state: 'idle',
  _sentences: [],
  _index: 0,
  _language: 'English',
  _rate: 1.0,
  _audio: null,
  _playToken: 0,

  isSupported() { return true; },

  subscribe(ownerId, fn) {
    listeners.set(ownerId, fn);
    return () => listeners.delete(ownerId);
  },

  subscribeProgress(ownerId, fn) {
    progressListeners.set(ownerId, fn);
    return () => progressListeners.delete(ownerId);
  },

  _notify(state, index) {
    this._state = state;
    const fn = listeners.get(currentOwnerId);
    if (fn) fn(state, index, this._sentences.length);
  },

  _notifyOwner(ownerId, state) {
    const fn = listeners.get(ownerId);
    if (fn) fn(state, 0, 0);
    const progressFn = progressListeners.get(ownerId);
    if (progressFn) progressFn({ currentTime: 0, duration: 0, seekable: false });
  },

  _notifyProgress() {
    const fn = progressListeners.get(currentOwnerId);
    if (!fn) return;
    if (!this._audio) {
      fn({ currentTime: 0, duration: 0, seekable: false });
      return;
    }
    fn({
      currentTime: this._audio.currentTime || 0,
      duration: Number.isFinite(this._audio.duration) ? this._audio.duration : 0,
      seekable: Number.isFinite(this._audio.duration) && this._audio.duration > 0,
    });
  },

  setRate(rate) {
    this._rate = Math.max(0.5, Math.min(2.0, parseFloat(rate) || 1.0));
    if (this._audio) this._audio.playbackRate = this._rate;
  },

  seek(timeInSeconds) {
    if (!this._audio || !Number.isFinite(this._audio.duration)) return;
    const nextTime = Math.max(0, Math.min(timeInSeconds, this._audio.duration));
    this._audio.currentTime = nextTime;
    this._notifyProgress();
  },

  _cleanupAudio() {
    if (!this._audio) return;
    this._audio.onended = null;
    this._audio.onerror = null;
    this._audio.ontimeupdate = null;
    this._audio.onloadedmetadata = null;
    this._audio.oncanplay = null;
    this._audio.oncanplaythrough = null;
    this._audio.pause();
    if (this._audio._objectUrl) URL.revokeObjectURL(this._audio._objectUrl);
    this._audio.src = '';
    this._audio = null;
  },

  _hardStop() {
    this._playToken += 1;
    this._cleanupAudio();
    if (this.synth) this.synth.cancel();
    this._state = 'idle';
    this._notifyProgress();
  },

  stop() {
    this._hardStop();
    this._sentences = [];
    this._index = 0;
    const prev = currentOwnerId;
    currentOwnerId = null;
    if (prev) this._notifyOwner(prev, 'idle');
  },

  pause() {
    if (this._audio) this._audio.pause();
    else if (this.synth) this.synth.pause();
    this._notify('paused', this._index);
  },

  resume() {
    if (this._audio) this._audio.play().catch(() => {});
    else if (this.synth) this.synth.resume();
    this._notify('playing', this._index);
  },

  getSentences() { return [...this._sentences]; },

  jumpTo(ownerId, text, language, targetIndex) {
    if (currentOwnerId && currentOwnerId !== ownerId) {
      this._notifyOwner(currentOwnerId, 'idle');
    }
    this._hardStop();
    currentOwnerId = ownerId;
    if (!this._sentences.length) this._sentences = splitSentences(text);
    this._language = language || 'English';
    this._index = Math.max(0, Math.min(targetIndex, this._sentences.length - 1));
    this._notify('loading', this._index);
    this._next();
  },

  restart(ownerId, text, language) {
    this.stop();
    setTimeout(() => this.play(ownerId, text, language), 80);
  },

  play(ownerId, text, language, rate) {
    if (currentOwnerId && currentOwnerId !== ownerId) {
      this._notifyOwner(currentOwnerId, 'idle');
    }
    this._hardStop();
    currentOwnerId = ownerId;
    this._sentences = splitSentences(text);
    this._index = 0;
    this._language = language || 'English';
    if (rate !== undefined) {
      this._rate = Math.max(0.5, Math.min(2.0, parseFloat(rate) || 1.0));
    }
    this._notify('loading', 0);
    this._next();
  },

  async _next() {
    if (this._state === 'idle' || this._state === 'paused') return;
    if (this._index >= this._sentences.length) {
      this._notify('done', this._sentences.length);
      return;
    }

    const token = this._playToken;
    this._notify('loading', this._index);
    const sentence = this._sentences[this._index];
    const audio = await this._speakWithBackend(sentence).catch(() => null);

    if (token !== this._playToken || this._state === 'idle') {
      if (audio) {
        if (audio._objectUrl) URL.revokeObjectURL(audio._objectUrl);
        audio.src = '';
      }
      return;
    }

    if (audio) {
      this._audio = audio;
      this._audio.playbackRate = this._rate;
      this._audio.onloadedmetadata = () => this._notifyProgress();
      this._audio.ontimeupdate = () => this._notifyProgress();
      this._audio.onended = () => {
        this._cleanupAudio();
        this._index += 1;
        this._next();
      };
      this._audio.onerror = () => {
        this._cleanupAudio();
        this._index += 1;
        this._next();
      };
      this._notifyProgress();
      const ready = await this._waitForAudioReady(this._audio, token);
      if (!ready || token !== this._playToken || this._state === 'idle') {
        return;
      }
      this._audio.currentTime = 0;
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (token !== this._playToken || this._state === 'idle') return;
      this._notify('playing', this._index);
      this._audio.play().then(() => this._notifyProgress()).catch(() => {
        this._cleanupAudio();
        this._fallbackSpeak(sentence);
      });
      return;
    }

    this._fallbackSpeak(sentence);
  },

  async _speakWithBackend(text) {
    let res;
    try {
      res = await fetch(`${API_BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: buildTtsText(text),
          language: this._language,
          voice_type: 'female',
          rate: 1.0,
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      return null;
    }
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size < 100) return null;
    const preparedBlob = await prependSilenceToBlob(blob);
    const url = URL.createObjectURL(preparedBlob);
    const audio = new Audio(url);
    audio._objectUrl = url;
    audio.preload = 'auto';
    audio.load();
    return audio;
  },

  _waitForAudioReady(audio, token) {
    if (!audio) return Promise.resolve(false);
    if (audio.readyState >= AUDIO_READY_STATE) return Promise.resolve(true);

    return new Promise((resolve) => {
      let settled = false;
      const cleanup = () => {
        audio.oncanplay = null;
        audio.oncanplaythrough = null;
        audio.onerror = priorOnError;
      };
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(ok && token === this._playToken);
      };
      const priorOnError = audio.onerror;
      audio.oncanplay = () => finish(true);
      audio.oncanplaythrough = () => finish(true);
      audio.onerror = () => {
        if (typeof priorOnError === 'function') priorOnError();
        finish(false);
      };
      setTimeout(() => finish(audio.readyState >= AUDIO_READY_STATE), 2000);
    });
  },

  _fallbackSpeak(text) {
    this._notifyProgress();
    if (!this.synth) {
      this._index += 1;
      this._next();
      return;
    }
    const utter = new SpeechSynthesisUtterance(buildTtsText(text));
    utter.lang = LANG_BCP47[this._language] || 'en-US';
    utter.rate = this._rate;
    utter.onstart = () => this._notify('playing', this._index);
    utter.onend = () => { this._index += 1; this._next(); };
    utter.onerror = () => { this._index += 1; this._next(); };
    this.synth.speak(utter);
  },
};

export default engine;
