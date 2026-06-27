import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCachedUITranslations, getUITranslations, sendChat, transcribeAudio } from '../utils/api';
import voiceEngine from '../utils/voice';

const CHAT_VOICE_ID = 'chat_panel_voice';

const BASE_COPY = {
  title: 'Voice Conversation',
  description: 'Ask anything about your report.',
  suggestions: [
    'What does this report mean in simple words?',
    'Which value needs the most attention?',
    'What should I ask the doctor next?',
    'Can you explain this in a calmer way?',
  ],
  errRateLimit: 'I need a moment to catch up. Please wait a few seconds and try again.',
  errTimeout: 'The response took too long. Please try again.',
  errSttFailed: 'I could not hear that clearly. Please try speaking again.',
  errMicBlocked: 'Microphone access is blocked. Please allow access in your browser settings.',
  errGeneral: 'Something went wrong. Please try again.',
  listen: 'Listen',
  stopAudio: 'Stop',
  placeholder: 'Ask...',
  recording: 'Tap to stop',
  tapToSpeak: 'Tap to speak',
  working: 'Thinking...',
  send: 'Send',
  enterFullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  pressEsc: 'Press Esc or tap close to exit',
  speed: 'Speed',
  playback: 'Playback',
  preparingAudio: 'Preparing audio...',
};

const LANGUAGE_COPY = {
  Tamil: {
    title: 'குரல் உரையாடல்',
    description: 'உங்கள் அறிக்கையைப் பற்றி எதையும் கேளுங்கள்.',
    suggestions: [
      'இந்த அறிக்கை எளிய வார்த்தைகளில் என்ன சொல்கிறது?',
      'எந்த மதிப்புக்கு அதிக கவனம் தேவை?',
      'அடுத்ததாக மருத்துவரிடம் நான் என்ன கேட்க வேண்டும்?',
      'இதைக் இன்னும் அமைதியாக விளக்க முடியுமா?',
    ],
    errRateLimit: 'சிறிது நேரம் காத்திருந்து மீண்டும் முயற்சிக்கவும்.',
    errTimeout: 'பதில் வர அதிக நேரம் எடுத்துக்கொண்டது. மீண்டும் முயற்சிக்கவும்.',
    errSttFailed: 'உங்கள் குரல் தெளிவாக கேட்கவில்லை. மீண்டும் பேசவும்.',
    errMicBlocked: 'மைக்ரோஃபோன் அணுகல் தடுக்கப்பட்டுள்ளது. உலாவி அமைப்புகளில் அனுமதி வழங்கவும்.',
    errGeneral: 'ஏதோ தவறு ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்.',
    listen: 'கேளுங்கள்',
    stopAudio: 'நிறுத்து',
    placeholder: 'கேளுங்கள்...',
    recording: 'நிறுத்த தட்டவும்',
    tapToSpeak: 'பேச தொடவும்',
    working: 'சிந்திக்கிறது...',
    send: 'அனுப்பு',
    enterFullscreen: 'முழுத்திரை',
    exitFullscreen: 'முழுத்திரையிலிருந்து வெளியேறு',
    pressEsc: 'வெளியேற Esc அழுத்தவும் அல்லது மூடு என்பதைத் தட்டவும்',
    speed: 'வேகம்',
    playback: 'ஒலி இயக்கம்',
    preparingAudio: 'ஒலியை தயார் செய்கிறது...',
  },
};

const SPEED_OPTIONS = [
  { label: '0.75x', value: 0.75 },
  { label: '1x', value: 1.0 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2.0 },
];

const chatStateStore = new Map();

function getBaseCopy(language) {
  return { ...BASE_COPY, ...(LANGUAGE_COPY[language] || {}) };
}

function getStoredChatState(sessionId) {
  return chatStateStore.get(sessionId) || {
    messages: [],
    msgSpeeds: {},
    globalSpeed: 1.0,
  };
}

function SpeedSelect({ value, onChange, compact = false }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        fontSize: compact ? 11 : 12,
        padding: compact ? '2px 4px' : '4px 8px',
        borderRadius: 6,
        background: 'var(--surface2)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        verticalAlign: 'middle',
      }}
    >
      {SPEED_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function ChatPanel({ sessionId, language, autoAskQuestion = '', onAutoAskHandled }) {
  const storedState = getStoredChatState(sessionId);
  const [messages, setMessages] = useState(storedState.messages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState(null);
  const [copy, setCopy] = useState(() => getCachedUITranslations(language, getBaseCopy(language)));
  const [fullscreen, setFullscreen] = useState(false);
  const [globalSpeed, setGlobalSpeed] = useState(storedState.globalSpeed || 1.0);
  const [msgSpeeds, setMsgSpeeds] = useState(storedState.msgSpeeds || {});
  const [playback, setPlayback] = useState({ currentTime: 0, duration: 0, seekable: false });
  const [audioState, setAudioState] = useState('idle');

  const bottomRef = useRef(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const inputRef = useRef(null);
  const lastAutoAskedRef = useRef('');

  useEffect(() => {
    const sessionState = getStoredChatState(sessionId);
    setMessages(sessionState.messages || []);
    setMsgSpeeds(sessionState.msgSpeeds || {});
    setGlobalSpeed(sessionState.globalSpeed || 1.0);
    setSpeakingMsgId(null);
    setPlayback({ currentTime: 0, duration: 0, seekable: false });
  }, [sessionId]);

  useEffect(() => {
    chatStateStore.set(sessionId, {
      messages,
      msgSpeeds,
      globalSpeed,
    });
  }, [globalSpeed, messages, msgSpeeds, sessionId]);

  useEffect(() => {
    const unsubState = voiceEngine.subscribe(CHAT_VOICE_ID, (state) => {
      setAudioState(state);
      if (state === 'idle' || state === 'done') {
        setSpeakingMsgId(null);
      }
    });
    const unsubProgress = voiceEngine.subscribeProgress(CHAT_VOICE_ID, setPlayback);
    return () => {
      unsubState();
      unsubProgress();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    let active = true;
    const fallbackCopy = getBaseCopy(language);
    setCopy(fallbackCopy);
    getUITranslations(language, BASE_COPY)
      .then((data) => {
        if (!active) return;
        const translations = data.translations || {};
        setCopy(language === 'Tamil' ? { ...translations, ...fallbackCopy } : { ...fallbackCopy, ...translations });
      })
      .catch(() => active && setCopy(fallbackCopy));
    return () => { active = false; };
  }, [language]);

  useEffect(() => {
    if (!fullscreen) {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overscrollBehavior = '';
      return undefined;
    }

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';

    const onKey = (event) => {
      if (event.key === 'Escape') {
        setFullscreen(false);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overscrollBehavior = '';
    };
  }, [fullscreen]);

  const exitFullscreen = useCallback(() => setFullscreen(false), []);

  const friendlyError = useCallback((err) => {
    const msg = String(err?.message || err || '');
    if (msg.includes('rate_limit') || msg.includes('429')) return copy.errRateLimit || BASE_COPY.errRateLimit;
    if (msg.includes('timeout') || msg.includes('504')) return copy.errTimeout || BASE_COPY.errTimeout;
    if (msg.includes('stt_failed')) return copy.errSttFailed || BASE_COPY.errSttFailed;
    return copy.errGeneral || BASE_COPY.errGeneral;
  }, [copy]);

  const addMessage = useCallback((role, text) => {
    setMessages((current) => [...current, { id: Date.now() + Math.random(), role, text }]);
  }, []);

  const ask = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    addMessage('user', trimmed);
    setInput('');
    setLoading(true);
    try {
      const data = await sendChat(sessionId, trimmed, language);
      addMessage('assistant', data.reply);
    } catch (err) {
      addMessage('assistant', friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [addMessage, friendlyError, language, loading, sessionId]);

  useEffect(() => {
    const nextQuestion = String(autoAskQuestion || '').trim();
    if (!nextQuestion) {
      lastAutoAskedRef.current = '';
      return;
    }
    if (nextQuestion === lastAutoAskedRef.current || loading) return;
    lastAutoAskedRef.current = nextQuestion;
    ask(nextQuestion);
    onAutoAskHandled?.();
  }, [ask, autoAskQuestion, loading, onAutoAskHandled]);

  const toggleRecording = useCallback(async () => {
    if (recording) {
      mediaRef.current?.stop();
      mediaRef.current = null;
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (!chunksRef.current.length) return;
        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setLoading(true);
        try {
          const { text } = await transcribeAudio(blob, language, `audio.${extension}`, mimeType);
          if (text?.trim()) {
            await ask(text.trim());
          } else {
            setLoading(false);
          }
        } catch (err) {
          addMessage('assistant', friendlyError(err));
          setLoading(false);
        }
      };
      recorder.start();
      mediaRef.current = recorder;
      setRecording(true);
    } catch {
      addMessage('assistant', copy.errMicBlocked || BASE_COPY.errMicBlocked);
    }
  }, [addMessage, ask, copy.errMicBlocked, friendlyError, language, recording]);

  const speakMessage = useCallback((message) => {
    if (speakingMsgId === message.id) {
      voiceEngine.stop();
      setSpeakingMsgId(null);
      return;
    }
    const speed = msgSpeeds[message.id] ?? globalSpeed;
    setSpeakingMsgId(message.id);
    voiceEngine.play(CHAT_VOICE_ID, message.text, language, speed);
  }, [globalSpeed, language, msgSpeeds, speakingMsgId]);

  const setMsgSpeed = useCallback((messageId, speed) => {
    setMsgSpeeds((current) => ({ ...current, [messageId]: speed }));
    if (speakingMsgId === messageId) {
      voiceEngine.setRate(speed);
    }
  }, [speakingMsgId]);

  const suggestions = useMemo(() => copy.suggestions || BASE_COPY.suggestions, [copy.suggestions]);
  const inputPlaceholder = language === 'Tamil'
    ? 'கேளுங்கள்...'
    : (copy.placeholder || BASE_COPY.placeholder);

  const panel = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: fullscreen ? '100%' : undefined,
        minHeight: fullscreen ? undefined : 520,
        padding: fullscreen ? 24 : 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
        <div className="section-title" style={{ margin: 0, flex: 1, minWidth: 0 }}>{copy.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <SpeedSelect
            value={globalSpeed}
            onChange={(speed) => {
              setGlobalSpeed(speed);
              voiceEngine.setRate(speed);
            }}
          />
          <button
            className="btn-ghost"
            style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
            onClick={() => setFullscreen((value) => !value)}
            title={fullscreen ? (copy.exitFullscreen || BASE_COPY.exitFullscreen) : (copy.enterFullscreen || BASE_COPY.enterFullscreen)}
          >
            {fullscreen ? (copy.exitFullscreen || BASE_COPY.exitFullscreen) : (copy.enterFullscreen || BASE_COPY.enterFullscreen)}
          </button>
        </div>
      </div>

      {fullscreen && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, textAlign: 'right' }}>
          {copy.pressEsc || BASE_COPY.pressEsc}
        </div>
      )}

      <div className="plain-note" style={{ marginBottom: 10 }}>{copy.description}</div>

      {!messages.length && (
        <div className="quick-actions" style={{ marginTop: 6 }}>
          {suggestions.map((suggestion) => (
            <button key={suggestion} className="quick-action btn-ghost" onClick={() => ask(suggestion)}>{suggestion}</button>
          ))}
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          marginTop: 14,
          paddingRight: 2,
          minHeight: 0,
        }}
      >
        {messages.map((message) => {
          const messageSpeed = msgSpeeds[message.id] ?? globalSpeed;
          const activePlayback = speakingMsgId === message.id;
          return (
            <div key={message.id} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '84%' }}>
              <div
                style={{
                  padding: '11px 15px',
                  borderRadius: 18,
                  lineHeight: 1.7,
                  fontSize: '0.9rem',
                  background: message.role === 'user'
                    ? 'linear-gradient(135deg, var(--primary), var(--primary2))'
                    : 'var(--surface2)',
                  color: message.role === 'user' ? '#fff' : 'var(--text)',
                  border: message.role === 'user' ? 'none' : '1px solid var(--border)',
                  wordBreak: 'normal',
                  overflowWrap: 'break-word',
                }}
              >
                {message.text}
              </div>
              {message.role === 'assistant' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => speakMessage(message)}>
                      {activePlayback
                        ? (audioState === 'loading' ? (copy.preparingAudio || BASE_COPY.preparingAudio) : (copy.stopAudio || BASE_COPY.stopAudio))
                        : (copy.listen || BASE_COPY.listen)}
                    </button>
                    <SpeedSelect compact value={messageSpeed} onChange={(speed) => setMsgSpeed(message.id, speed)} />
                  </div>
                  {activePlayback && playback.seekable && (
                    <div className="chat-audio-bar">
                      <div className="chat-audio-meta">
                        <span>{copy.playback || BASE_COPY.playback}</span>
                        <span>{formatTime(playback.currentTime)} / {formatTime(playback.duration)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={playback.duration || 0}
                        step="0.1"
                        value={Math.min(playback.currentTime, playback.duration || 0)}
                        onChange={(event) => voiceEngine.seek(Number(event.target.value))}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '70%' }}>
            <div style={{ padding: '12px 16px', borderRadius: 18, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="typing-dots">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'flex-end', flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          className="input-base"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (input.trim() && !loading) {
                ask(input);
              }
            }
          }}
          placeholder={inputPlaceholder}
          rows={2}
          style={{ resize: 'none', flex: 1, minWidth: 0, fontSize: '0.9rem' }}
        />
        <button
          className="btn-primary"
          style={{ flexShrink: 0, minWidth: 64, alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
          onClick={() => {
            if (input.trim() && !loading) {
              ask(input);
            }
          }}
          disabled={loading || !input.trim()}
        >
          {loading ? (copy.working || BASE_COPY.working) : (copy.send || BASE_COPY.send)}
        </button>
      </div>

      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        <button
          className={recording ? 'btn-primary' : 'btn-ghost'}
          style={{ minWidth: 150, background: recording ? '#c44242' : undefined, transition: 'background 0.2s' }}
          onClick={toggleRecording}
          disabled={loading}
        >
          {recording ? (copy.recording || BASE_COPY.recording) : (copy.tapToSpeak || BASE_COPY.tapToSpeak)}
        </button>
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <>
        <div
          onClick={exitFullscreen}
          style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
        />
        <div
          className="card"
          onClick={(event) => event.stopPropagation()}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            borderRadius: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {panel}
        </div>
      </>
    );
  }

  return <div className="card" style={{ overflow: 'hidden' }}>{panel}</div>;
}
