import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpeech } from '../hooks/useSpeech';
import { useApp } from '../context/AppContext';
import { getT } from '../utils/translations';

export default function VoiceInput({ value, onChange }) {
  const { languageCode, language } = useApp();
  const t = getT(language);
  const { isListening, startListening, stopListening } = useSpeech(languageCode, language);
  const [noSupport, setNoSupport] = useState(false);

  const toggleMic = () => {
    if (isListening) { stopListening(); return; }
    const started = startListening(
      (transcript) => onChange(transcript),
      () => {}
    );
    if (!started) setNoSupport(true);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
      {/* Mic button with ripple */}
      <div style={{ position:'relative' }}>
        {isListening && (
          <>
            <motion.div animate={{ scale:[1,1.8,1], opacity:[0.5,0,0.5] }}
              transition={{ duration:1.4, repeat:Infinity }}
              style={{ position:'absolute', inset:-12, borderRadius:'50%', background:'rgba(248,113,113,0.2)', pointerEvents:'none' }}
            />
            <motion.div animate={{ scale:[1,2.4,1], opacity:[0.3,0,0.3] }}
              transition={{ duration:1.4, repeat:Infinity, delay:0.2 }}
              style={{ position:'absolute', inset:-12, borderRadius:'50%', background:'rgba(248,113,113,0.12)', pointerEvents:'none' }}
            />
          </>
        )}
        <motion.button
          whileHover={{ scale:1.08 }}
          whileTap={{ scale:0.94 }}
          onClick={toggleMic}
          style={{
            width:72, height:72, borderRadius:'50%', border:'none',
            background: isListening
              ? 'linear-gradient(135deg, var(--red), var(--red2))'
              : 'linear-gradient(135deg, var(--primary), var(--primary2))',
            color:'#fff', fontSize:'1.8rem', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow: isListening ? '0 6px 24px rgba(248,113,113,0.5)' : '0 6px 24px rgba(99,102,241,0.4)',
            transition:'background 0.3s, box-shadow 0.3s',
          }}
        >
          {isListening ? '⏹' : '🎤'}
        </motion.button>
      </div>

      {/* Status text */}
      <motion.div
        key={isListening ? 'on' : 'off'}
        initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }}
        style={{ fontSize:'0.82rem', color: isListening ? 'var(--red)' : 'var(--text2)', textAlign:'center' }}
      >
        {noSupport ? t.micNoSupport : isListening ? t.micListening : t.micIdle}
      </motion.div>

      {!noSupport && (
        <div style={{ fontSize:'0.74rem', color:'var(--text3)', textAlign:'center' }}>
          {t.micAutoStop}
        </div>
      )}

      {/* Transcript display */}
      <AnimatePresence>
        {value && (
          <motion.div
            initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
            style={{
              width:'100%', background:'var(--surface2)',
              border:'1px solid var(--border)', borderRadius:10,
              padding:'10px 14px', fontSize:'0.85rem',
              color:'var(--text2)', fontStyle:'italic',
            }}
          >
            "{value}"
          </motion.div>
        )}
      </AnimatePresence>

      {/* Text input */}
      <textarea
        className="input-base"
        placeholder={t.typePlaceholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={2}
        style={{ resize:'vertical', minHeight:56 }}
      />
    </div>
  );
}
