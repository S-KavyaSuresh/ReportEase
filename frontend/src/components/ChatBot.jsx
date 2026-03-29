import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sendChat } from '../utils/api';
import { useApp } from '../context/AppContext';
import { useSpeech } from '../hooks/useSpeech';
import { getT } from '../utils/translations';

function stripMd(text) {
  if (!text) return '';
  return text.replace(/\*{1,3}([^*\n]+)\*{1,3}/g,'$1').replace(/^#{1,6}\s+/gm,'')
    .replace(/^\s*[-•*]\s+/gm,'').replace(/^\s*\d+\.\s+/gm,'')
    .replace(/`([^`]+)`/g,'$1').replace(/\n{3,}/g,'\n\n').trim();
}

export default function ChatBot() {
  const { sessionId, language, languageCode } = useApp();
  const t = getT(language);
  const { isListening, startListening, stopListening, speak, isSpeaking, stopSpeech } = useSpeech(languageCode, language);

  const [open,       setOpen]       = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const msgId     = useRef(0);

  // Update welcome when language changes
  useEffect(() => {
    setMessages([{ role: 'assistant', content: t.chatWelcome, id: msgId.current++ }]);
  }, [language]); // eslint-disable-line

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const send = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg, id: msgId.current++ }]);
    setLoading(true);
    try {
      const res = await sendChat({ session_id: sessionId, message: msg, language });
      const clean = stripMd(res.data.reply);
      setMessages(prev => [...prev, { role: 'assistant', content: clean, id: msgId.current++ }]);
    } catch (_) {
      setMessages(prev => [...prev, { role: 'assistant', content: t.connectionIssue, id: msgId.current++ }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionId, language, t.connectionIssue]);

  const toggleMic = () => {
    if (isListening) { stopListening(); return; }
    startListening(tx => setInput(tx), () => {});
  };

  const handleRead = (id, text) => {
    if (isSpeaking && speakingId === id) { stopSpeech(); setSpeakingId(null); }
    else { stopSpeech(); setSpeakingId(id); speak(text); }
  };

  const clearChat = () => {
    stopSpeech(); setSpeakingId(null);
    setMessages([{ role: 'assistant', content: t.chatWelcome, id: msgId.current++ }]);
  };

  const panelStyle = fullscreen
    ? { position: 'fixed', inset: 0, zIndex: 300, borderRadius: 0 }
    : { position: 'fixed', bottom: 94, right: 24, zIndex: 200, width: 'min(390px, calc(100vw - 32px))', height: 'min(540px, calc(100vh - 120px))', borderRadius: 20 };

  return (
    <>
      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.93 }}
        onClick={() => setOpen(o => !o)}
        style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 200, width: 58, height: 58, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg, var(--primary), var(--primary2))', color: '#fff', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px rgba(99,102,241,0.55)' }}
      >
        {open ? '✕' : '💬'}
        {!open && (
          <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
            style={{ position: 'absolute', top: -3, right: -3, width: 16, height: 16, borderRadius: '50%', background: 'var(--green)', border: '2px solid var(--bg)', fontSize: '0.55rem', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >AI</motion.div>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div key="chat"
            initial={{ opacity: 0, scale: 0.88, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            style={{ ...panelStyle, background: 'var(--surface)', border: '1px solid var(--border2)', boxShadow: '0 24px 80px rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', overflow: 'hidden', transformOrigin: 'bottom right' }}
          >
            {/* Header */}
            <div style={{ padding: '13px 16px', background: 'linear-gradient(135deg, var(--surface2), #1a1f3a)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, var(--primary), var(--green))', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem' }}>🩺</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{t.chatBotTitle}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--green)' }}>● {t.onlineStatus}</div>
              </div>
              <div style={{ display: 'flex', gap: 2 }}>
                <motion.button whileHover={{ scale: 1.1 }} onClick={clearChat} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '1rem', padding: '4px 6px' }}>🗑️</motion.button>
                <motion.button whileHover={{ scale: 1.1 }} onClick={() => setFullscreen(f => !f)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '1rem', padding: '4px 6px' }}>{fullscreen ? '⊡' : '⤢'}</motion.button>
                <motion.button whileHover={{ scale: 1.1 }} onClick={() => { setOpen(false); setFullscreen(false); }} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '1rem', padding: '4px 6px' }}>✕</motion.button>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {messages.map(m => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  style={{ maxWidth: fullscreen ? '60%' : '85%', alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start' }}
                >
                  <div style={{ padding: '9px 13px', borderRadius: 14, borderBottomRightRadius: m.role === 'user' ? 3 : 14, borderBottomLeftRadius: m.role === 'user' ? 14 : 3, background: m.role === 'user' ? 'linear-gradient(135deg, var(--primary), var(--primary2))' : 'var(--surface2)', color: m.role === 'user' ? '#fff' : 'var(--text)', fontSize: '0.84rem', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div>
                  {m.role === 'assistant' && (
                    <button onClick={() => handleRead(m.id, m.content)} style={{ marginTop: 4, marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 4px', color: isSpeaking && speakingId === m.id ? 'var(--primary)' : 'var(--text3)', transition: 'color 0.2s' }}>
                      {isSpeaking && speakingId === m.id ? t.stopBtn : t.readBtn}
                    </button>
                  )}
                </motion.div>
              ))}
              <AnimatePresence>
                {loading && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ alignSelf: 'flex-start', padding: '10px 14px', background: 'var(--surface2)', borderRadius: 14, borderBottomLeftRadius: 3 }}
                  ><div className="typing-dots"><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></div></motion.div>
                )}
              </AnimatePresence>
              <div ref={bottomRef}/>
            </div>

            {/* Suggestions */}
            {messages.length <= 1 && !loading && (
              <div style={{ padding: '4px 10px 6px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {(t.chatSuggestions || []).map(s => (
                  <motion.button key={s} whileHover={{ scale: 1.04 }} onClick={() => send(s)}
                    style={{ padding: '4px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: '0.72rem', borderRadius: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.2s' }}
                  >{s}</motion.button>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 7, alignItems: 'flex-end', background: 'var(--surface)', flexShrink: 0 }}>
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={t.typePlaceholder} rows={1}
                style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: '0.82rem', outline: 'none', resize: 'none', minHeight: 36, maxHeight: 90, transition: 'border-color 0.2s' }}
                onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.93 }} onClick={toggleMic}
                style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--border)', background: isListening ? 'var(--red)' : 'var(--surface2)', color: isListening ? '#fff' : 'var(--text2)', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >{isListening ? '⏹' : '🎤'}</motion.button>
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.93 }} onClick={() => send()} disabled={!input.trim() || loading}
                style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg, var(--primary), var(--primary2))', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: (!input.trim() || loading) ? 0.4 : 1 }}
              >➤</motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
