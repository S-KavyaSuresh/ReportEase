import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import AudioPlayer   from '../components/AudioPlayer';
import FindingsCard  from '../components/FindingsCard';
import ChecklistCard from '../components/ChecklistCard';
import HospitalsCard from '../components/HospitalsCard';
import { useApp }    from '../context/AppContext';
import { getT }      from '../utils/translations';
import { sendChat }  from '../utils/api';
import { useSpeech } from '../hooks/useSpeech';

function Section({ id, icon, title, openId, setOpenId, children, badge }) {
  const isOpen = openId === id;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, marginBottom: 10, overflow: 'hidden' }}>
      <button onClick={() => setOpenId(isOpen ? null : id)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.1rem' }}>{icon}</span>
          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: '0.97rem', color: 'var(--text)' }}>{title}</span>
          {badge && <span style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--red)', borderRadius: 10, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600 }}>{badge}</span>}
        </div>
        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.25 }} style={{ color: 'var(--text3)', fontSize: '0.85rem' }}>▼</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: 'easeInOut' }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0 20px 20px' }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Voice + text conversation panel
function ConversationPanel({ sessionId, language, languageCode, t }) {
  const { speak, stopSpeech, isSpeaking, isListening, startListening, stopListening } = useSpeech(languageCode, language);
  const [messages,  setMessages]  = useState(() => [{ role:'assistant', content:t.voicePrompt, id:0 }]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [readingId, setReadingId] = useState(null);
  const [showText,  setShowText]  = useState(false);
  const [micStatus, setMicStatus] = useState('idle'); // idle | listening | processing
  const bottomRef = useRef(null);
  const listRef = useRef(null);
  const msgId     = useRef(1);

  useEffect(() => {
    setMessages([{ role:'assistant', content:t.voicePrompt, id:0 }]);
    msgId.current = 1;
  }, [t]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  function stripMd(text) {
    if (!text) return '';
    return text.replace(/\*{1,3}([^*\n]+)\*{1,3}/g,'$1').replace(/^#{1,6}\s+/gm,'')
      .replace(/^\s*[-•*]\s+/gm,'').replace(/^\s*\d+\.\s+/gm,'')
      .replace(/`([^`]+)`/g,'$1').replace(/\n{3,}/g,'\n\n').trim();
  }

  const sendMsg = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput(''); setMicStatus('processing');
    setMessages(prev => [...prev, { role:'user', content:msg, id:msgId.current++ }]);
    setLoading(true);
    try {
      const res = await sendChat({ session_id: sessionId, message: msg, language });
      const clean = stripMd(res.data.reply);
      const aid = msgId.current++;
      setMessages(prev => [...prev, { role:'assistant', content:clean, id:aid }]);
      speak(clean, () => {
        setMicStatus('idle');
      });
    } catch (_) {
      setMessages(prev => [...prev, { role:'assistant', content:t.connectionIssue, id:msgId.current++ }]);
      setMicStatus('idle');
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionId, language, speak, t.connectionIssue]);

  const handleMic = () => {
    if (isListening) { stopListening(); setMicStatus('idle'); return; }
    setMicStatus('listening');
    startListening(
      (transcript) => setInput(transcript),
      () => setMicStatus('idle')
    );
  };

  const handleRead = (id, text) => {
    if (isSpeaking && readingId === id) { stopSpeech(); setReadingId(null); }
    else { stopSpeech(); setReadingId(id); speak(text); }
  };

  return (
    <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
      style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:20, overflow:'hidden', marginBottom:16 }}
    >
      {/* Header */}
      <div style={{ padding:'14px 18px', background:'linear-gradient(135deg, var(--surface2), #1a1f3a)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:32, height:32, background:'linear-gradient(135deg,var(--primary),var(--green))', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.9rem' }}>🩺</div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:600, fontSize:'0.9rem' }}>{t.askTitle}</div>
          <div style={{ fontSize:'0.7rem', color:'var(--green)' }}>{t.askSubtitle(language)}</div>
        </div>
        <button onClick={() => setShowText(s => !s)}
          style={{ background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:10, padding:'5px 10px', fontSize:'0.72rem', cursor:'pointer', fontFamily:'var(--font-body)' }}
        >💬 {showText ? t.hideText : t.showText}</button>
      </div>

      {/* Voice area */}
      <div style={{ padding:'20px 18px', textAlign:'center' }}>
        <p style={{ color:'var(--text2)', fontSize:'0.85rem', marginBottom:16, lineHeight:1.6 }}>
          {micStatus === 'listening' ? t.listening : t.voiceAskHint}
        </p>

        {/* Mic button */}
        <div style={{ position:'relative', display:'inline-block', marginBottom:14 }}>
          {isListening && (
            <motion.div animate={{ scale:[1,1.6,1], opacity:[0.5,0,0.5] }} transition={{ duration:1.4, repeat:Infinity }}
              style={{ position:'absolute', inset:-12, borderRadius:'50%', background:'rgba(248,113,113,0.3)', pointerEvents:'none' }}
            />
          )}
          <motion.button whileHover={{ scale:1.08 }} whileTap={{ scale:0.94 }} onClick={handleMic}
            style={{
              width:80, height:80, borderRadius:'50%', border:'none',
              background: isListening ? 'linear-gradient(135deg,var(--red),var(--red2))' : 'linear-gradient(135deg,var(--primary),var(--primary2))',
              color:'#fff', fontSize:'2rem', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow: isListening ? '0 6px 24px rgba(248,113,113,0.5)' : '0 8px 28px rgba(99,102,241,0.4)',
            }}
          >{isListening ? '⏹' : '🎤'}</motion.button>
        </div>

        {/* Transcript */}
        <AnimatePresence>
          {input && (
            <motion.div initial={{ opacity:0,y:4 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0 }}
              style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 14px', fontSize:'0.85rem', color:'var(--text2)', fontStyle:'italic', marginBottom:10 }}
            >"{input}"</motion.div>
          )}
        </AnimatePresence>

        {input && (
          <motion.button initial={{ opacity:0 }} animate={{ opacity:1 }}
            className="btn-primary" onClick={() => sendMsg()}
            style={{ margin:'0 auto', padding:'10px 28px', fontSize:'0.88rem' }}
          >➤ {t.sendBtn}</motion.button>
        )}
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <div ref={listRef} style={{ maxHeight:320, overflowY:'auto', padding:'0 14px 12px', display:'flex', flexDirection:'column', gap:8 }}>
          {messages.map(m => (
            <motion.div key={m.id} initial={{ opacity:0,y:6 }} animate={{ opacity:1,y:0 }}
              style={{ maxWidth:'85%', alignSelf:m.role==='user'?'flex-end':'flex-start' }}
            >
              <div style={{ padding:'9px 13px', borderRadius:14, borderBottomRightRadius:m.role==='user'?3:14, borderBottomLeftRadius:m.role==='user'?14:3, background:m.role==='user'?'linear-gradient(135deg,var(--primary),var(--primary2))':'var(--surface2)', color:m.role==='user'?'#fff':'var(--text)', fontSize:'0.85rem', lineHeight:1.65, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                {m.content}
              </div>
              {m.role==='assistant' && (
                <button onClick={() => handleRead(m.id, m.content)}
                  style={{ marginTop:4, marginLeft:4, background:'none', border:'none', cursor:'pointer', fontSize:'0.75rem', padding:'2px 4px', color:isSpeaking&&readingId===m.id?'var(--primary)':'var(--text3)', transition:'color 0.2s' }}
                >{isSpeaking&&readingId===m.id ? t.stopBtn : t.readBtn}</button>
              )}
            </motion.div>
          ))}
          <AnimatePresence>
            {loading && (
              <motion.div initial={{ opacity:0,y:6 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0 }}
                style={{ alignSelf:'flex-start', padding:'10px 14px', background:'var(--surface2)', borderRadius:14, borderBottomLeftRadius:3 }}
              ><div className="typing-dots"><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></div></motion.div>
            )}
          </AnimatePresence>
          <div ref={bottomRef}/>
        </div>
      )}

      {/* Text chat (hidden by default) */}
      <AnimatePresence>
        {showText && (
          <motion.div initial={{ height:0,opacity:0 }} animate={{ height:'auto',opacity:1 }} exit={{ height:0,opacity:0 }} style={{ overflow:'hidden' }}>
            {messages.length <= 1 && (
              <div style={{ padding:'4px 14px 8px', display:'flex', gap:5, flexWrap:'wrap' }}>
                {(t.chatSuggestions||[]).map(s => (
                  <motion.button key={s} whileHover={{ scale:1.04 }} onClick={() => sendMsg(s)}
                    style={{ padding:'4px 11px', background:'var(--surface2)', border:'1px solid var(--border)', color:'var(--text2)', fontSize:'0.74rem', borderRadius:12, cursor:'pointer', fontFamily:'var(--font-body)', transition:'all 0.2s' }}
                  >{s}</motion.button>
                ))}
              </div>
            )}
            <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', display:'flex', gap:7, alignItems:'flex-end', background:'var(--surface)' }}>
              <textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();} }}
                placeholder={t.typePlaceholder} rows={1}
                style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 12px', color:'var(--text)', fontFamily:'var(--font-body)', fontSize:'0.84rem', outline:'none', resize:'none', minHeight:36, maxHeight:80, transition:'border-color 0.2s' }}
                onFocus={e=>e.target.style.borderColor='var(--primary)'}
                onBlur={e=>e.target.style.borderColor='var(--border)'}
              />
              <motion.button whileHover={{ scale:1.1 }} whileTap={{ scale:0.93 }} onClick={() => sendMsg()} disabled={!input.trim()||loading}
                style={{ width:36, height:36, borderRadius:'50%', border:'none', background:'linear-gradient(135deg,var(--primary),var(--primary2))', color:'#fff', cursor:'pointer', fontSize:'0.9rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, opacity:(!input.trim()||loading)?0.4:1 }}
              >➤</motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const { analysisResult, resetAll, sessionId, language, languageCode } = useApp();
  const t = getT(language);
  const { speak } = useSpeech(languageCode, language);
  const [openSection, setOpenSection] = useState('summary');

  useEffect(() => {
    if (!analysisResult) navigate('/', { replace: true });
  }, [analysisResult, navigate]);

  const handleAudioFinished = useCallback(() => {
    setTimeout(() => speak(t.voicePrompt), 600);
  }, [speak, t]);

  if (!analysisResult) return null;
  const r = analysisResult;

  const criticalCount = (r.findings||[]).filter(f => f.status === 'critical').length;
  const downloadResults = () => {
    const lines = [
      `ReportEase`,
      ``,
      `${t.reportTypeLabel || 'Report Type'}: ${r.reportType || '-'}`,
      ``,
      `${t.sectionSummary}:`,
      `${r.summary || '-'}`,
      ``,
      r.emergencyAlert?.isEmergency ? `Emergency: ${r.emergencyAlert.message}` : '',
      r.importantTerms?.length ? `${t.importantTermsLabel || 'Important Terms'}:` : '',
      ...(r.importantTerms || []).map((item) => `- ${item.term}: ${item.meaning}`),
      ``,
      `${t.sectionFindings}:`,
      ...(r.findings || []).map((item) => `- ${item.name}: ${item.value} | ${item.normalRange} | ${item.layman}`),
      ``,
      `${t.sectionChecklist}:`,
      ...(r.checklist || []).map((item) => `- ${item}`),
      ``,
      `${t.sectionHospitals}: ${r.specialist || '-'}`,
    ].filter(Boolean).join('\n');

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reportease-analysis.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 20px 60px' }}>

      {r.audioScript && <AudioPlayer script={r.audioScript} onFinished={handleAudioFinished} />}

      <Section id="summary" icon="📋" title={t.sectionSummary} openId={openSection} setOpenId={setOpenSection}>
        {r.reportType && (
          <div style={{ padding:'10px 14px', background:'rgba(129,140,248,0.08)', border:'1px solid rgba(129,140,248,0.22)', borderRadius:12, fontSize:'0.84rem', color:'var(--primary)', marginBottom:12 }}>
            <strong>{t.reportTypeLabel || 'Report Type'}:</strong> {r.reportType}
          </div>
        )}
        <p style={{ fontFamily:'var(--font-head)', fontSize:'0.95rem', color:'var(--text)', lineHeight:1.85, marginBottom:14 }}>{r.summary}</p>

        {!!r.importantTerms?.length && (
          <div style={{ padding:'12px 14px', background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.22)', borderRadius:12, marginBottom:10 }}>
            <div style={{ fontSize:'0.83rem', color:'var(--red)', fontWeight:600, marginBottom:8 }}>
              {t.importantTermsLabel || 'Important Terms'}
            </div>
            <div style={{ display:'grid', gap:8 }}>
              {r.importantTerms.map((item, index) => (
                <div key={`${item.term}-${index}`} style={{ fontSize:'0.82rem', color:'var(--text)', lineHeight:1.6 }}>
                  <strong>{item.term}</strong>: {item.meaning}
                </div>
              ))}
            </div>
          </div>
        )}

        {r.emergencyAlert?.isEmergency && (
          <div style={{ padding:'12px 14px', background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.35)', borderRadius:12, fontSize:'0.87rem', color:'var(--red)', lineHeight:1.7, marginBottom:10 }}>
            <strong>Emergency:</strong> {r.emergencyAlert.message}
          </div>
        )}

        {/* Dietary suggestions */}
        {r.dietarySuggestions && (
          <div style={{ padding:'12px 14px', background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.2)', borderRadius:12, fontSize:'0.87rem', color:'var(--text)', lineHeight:1.7, marginBottom:10 }}>
            🥗 {r.dietarySuggestions}
          </div>
        )}

        {r.hiddenConcerns && r.hiddenConcerns !== 'null' && r.hiddenConcerns !== null && (
          <div style={{ padding:'10px 14px', background:'rgba(251,191,36,0.07)', border:'1px solid rgba(251,191,36,0.25)', borderRadius:10, fontSize:'0.84rem', color:'var(--yellow)', lineHeight:1.6 }}>
            👁️ <strong>{t.hiddenConcern}:</strong> {r.hiddenConcerns}
          </div>
        )}
      </Section>

      <Section id="findings" icon="🔬" title={t.sectionFindings}
        badge={criticalCount > 0 ? `⚠️ ${criticalCount}` : undefined}
        openId={openSection} setOpenId={setOpenSection}>
        <FindingsCard findings={r.findings||[]} hiddenConcerns={null} />
      </Section>

      <Section id="checklist" icon="✅" title={t.sectionChecklist} openId={openSection} setOpenId={setOpenSection}>
        <ChecklistCard items={r.checklist||[]} specialist={r.specialist} specialistReason={r.specialistReason} urgency={r.urgency} />
      </Section>

      <Section id="hospitals" icon="🏥" title={t.sectionHospitals} openId={openSection} setOpenId={setOpenSection}>
        <HospitalsCard specialist={r.specialist} />
      </Section>

      <ConversationPanel sessionId={sessionId} language={language} languageCode={languageCode} t={t} />

      <motion.button className="btn-primary" whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
        onClick={downloadResults}
        style={{ width:'100%', padding:14, fontSize:'0.9rem', marginTop:4, marginBottom:10 }}
      >
        {t.downloadResults || 'Download Full Results'}
      </motion.button>

      <motion.button className="btn-ghost" whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
        onClick={() => { window.speechSynthesis?.cancel(); resetAll(); navigate('/',{replace:true}); }}
        style={{ width:'100%', padding:14, fontSize:'0.9rem', marginTop:4 }}
      >{t.analyseAnother}</motion.button>

      <p style={{ textAlign:'center', fontSize:'0.7rem', color:'var(--text3)', marginTop:12, lineHeight:1.7 }}>
        {t.disclaimer}
      </p>
    </div>
  );
}
