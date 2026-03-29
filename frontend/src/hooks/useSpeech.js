import { useState, useRef, useCallback, useEffect } from 'react';
import { transcribeAudio } from '../utils/api';

const playback = {
  audio: null,
  objectUrl: null,
  currentText: '',
  currentLanguage: 'English',
  chunks: [],
  chunkIndex: 0,
  onEnd: null,
  listeners: new Set(),
};

function chunkText(text) {
  const clean = (text || '').trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?।])/).map((part) => part.trim()).filter(Boolean);
  if (!sentences.length) return [clean];
  const chunks = [];
  let current = '';
  sentences.forEach((sentence) => {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length <= 220) current = next;
    else {
      if (current) chunks.push(current);
      current = sentence;
    }
  });
  if (current) chunks.push(current);
  return chunks;
}

function emit(state) {
  playback.listeners.forEach((listener) => listener(state));
}

function clearPlayback() {
  if (playback.audio) {
    playback.audio.pause();
    playback.audio.src = '';
    playback.audio = null;
  }
  if (playback.objectUrl) {
    URL.revokeObjectURL(playback.objectUrl);
    playback.objectUrl = null;
  }
  playback.currentText = '';
  playback.chunks = [];
  playback.chunkIndex = 0;
  playback.onEnd = null;
  emit({ isSpeaking: false, isPaused: false });
}

export function useSpeech(languageCode = 'en-US', language = 'English') {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const stopTimerRef = useRef(null);

  useEffect(() => {
    const listener = (state) => {
      setIsSpeaking(Boolean(state?.isSpeaking));
      setIsPaused(Boolean(state?.isPaused));
    };
    playback.listeners.add(listener);
    return () => playback.listeners.delete(listener);
  }, []);

  const cleanupListening = useCallback(() => {
    if (silenceTimerRef.current) {
      clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    recognitionRef.current = null;
  }, []);

  const stopSpeech = useCallback(() => {
    clearPlayback();
  }, []);

  const pauseSpeech = useCallback(() => {
    if (playback.audio && !playback.audio.paused) {
      playback.audio.pause();
      emit({ isSpeaking: true, isPaused: true });
    }
  }, []);

  const resumeSpeech = useCallback(async () => {
    if (playback.audio && playback.audio.paused) {
      await playback.audio.play();
      emit({ isSpeaking: true, isPaused: false });
    }
  }, []);

  const speak = useCallback(async (text, onEnd) => {
    const clean = (text || '').trim();
    if (!clean) return;

    clearPlayback();
    playback.currentText = clean;
    playback.currentLanguage = language;
    playback.chunks = chunkText(clean);
    playback.chunkIndex = 0;
    playback.onEnd = onEnd;
    emit({ isSpeaking: true, isPaused: false });

    const playChunk = async () => {
      const chunk = playback.chunks[playback.chunkIndex];
      if (!chunk) {
        const done = playback.onEnd;
        clearPlayback();
        done && done();
        return;
      }

      try {
        const form = new FormData();
        form.append('text', chunk);
        form.append('language', language);
        form.append('voice_type', 'default');

        const resp = await fetch('/api/tts', { method: 'POST', body: form });
        if (!resp.ok) throw new Error(`TTS API error: ${resp.status}`);

        const blob = await resp.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        playback.audio = audio;
        playback.objectUrl = audioUrl;

        audio.onended = () => {
          if (playback.objectUrl) {
            URL.revokeObjectURL(playback.objectUrl);
            playback.objectUrl = null;
          }
          playback.audio = null;
          playback.chunkIndex += 1;
          playChunk();
        };
        audio.onerror = () => {
          clearPlayback();
        };

        await audio.play();
        emit({ isSpeaking: true, isPaused: false });
      } catch (err) {
        console.error('[useSpeech] TTS error:', err);
        clearPlayback();
      }
    };

    playChunk();
  }, [language]);

  const replaySpeech = useCallback(() => {
    if (playback.currentText) {
      const text = playback.currentText;
      const done = playback.onEnd;
      speak(text, done);
    }
  }, [speak]);

  const toggleSpeech = useCallback((text) => {
    if (playback.audio && playback.audio.paused) {
      resumeSpeech();
    } else if (playback.audio && !playback.audio.paused) {
      pauseSpeech();
    } else {
      speak(text);
    }
  }, [pauseSpeech, resumeSpeech, speak]);

  const startListening = useCallback((onResult, onEnd) => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onEnd && onEnd();
      return false;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      let finished = false;

      recognitionRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };

      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        cleanupListening();
        setIsListening(false);
        onEnd && onEnd();
      };

      recorder.onstop = async () => {
        if (finished) return;
        finished = true;
        stream.getTracks().forEach((track) => track.stop());
        cleanupListening();
        setIsListening(false);

        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          if (blob.size > 0) {
            const res = await transcribeAudio(blob, language);
            const transcript = res?.data?.transcript?.trim();
            if (transcript) onResult && onResult(transcript);
          }
        } catch (err) {
          console.error('[useSpeech] STT error:', err);
        } finally {
          onEnd && onEnd();
        }
      };

      recorder.start();
      setIsListening(true);

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const audioContext = new AudioContextClass();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        const data = new Uint8Array(analyser.frequencyBinCount);
        let silenceMs = 0;

        analyser.fftSize = 512;
        source.connect(analyser);
        audioContextRef.current = audioContext;

        silenceTimerRef.current = window.setInterval(() => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((sum, value) => sum + value, 0) / data.length;
          silenceMs = avg < 5 ? silenceMs + 200 : 0;
          if (silenceMs >= 2500 && recorder.state === 'recording') {
            recorder.stop();
          }
        }, 200);
      }

      stopTimerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 15000);
    }).catch(() => {
      cleanupListening();
      setIsListening(false);
      onEnd && onEnd();
    });

    return true;
  }, [cleanupListening, language, languageCode]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current?.state === 'recording') {
      recognitionRef.current.stop();
    }
    cleanupListening();
    setIsListening(false);
  }, [cleanupListening]);

  return {
    isSpeaking,
    isPaused,
    isListening,
    speak,
    toggleSpeech,
    stopSpeech,
    pauseSpeech,
    resumeSpeech,
    replaySpeech,
    startListening,
    stopListening,
  };
}
