import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useSpeech } from '../hooks/useSpeech';
import { useApp } from '../context/AppContext';
import { getT } from '../utils/translations';

export default function AudioPlayer({ script, onFinished }) {
  const { languageCode, language } = useApp();
  const t = getT(language);
  const { isSpeaking, isPaused, speak, pauseSpeech, resumeSpeech, replaySpeech } = useSpeech(languageCode, language);
  const hasAutoPlayed = useRef(false);

  useEffect(() => {
    if (script && !hasAutoPlayed.current) {
      hasAutoPlayed.current = true;
      const timer = setTimeout(() => speak(script, onFinished), 350);
      return () => clearTimeout(timer);
    }
  }, [script, speak, onFinished]);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'linear-gradient(135deg, var(--surface2), #1a1f3a)',
        border: '1px solid rgba(129,140,248,0.25)',
        borderRadius: 20, padding: 20, marginBottom: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      }}
    >
      <div style={{ fontFamily: 'var(--font-head)', fontSize: '0.92rem', color: 'var(--primary)' }}>
        {t.listenTitle}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <motion.button type="button" whileHover={{ scale: 1.05 }} onClick={() => speak(script, onFinished)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', padding: '6px 12px', borderRadius: 16, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
        >
          ▶ {t.readBtn}
        </motion.button>

        <motion.button type="button" whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.92 }}
          onClick={() => {
            if (isSpeaking && !isPaused) pauseSpeech();
            else if (isPaused) resumeSpeech();
            else speak(script, onFinished);
          }}
          style={{
            width: 56, height: 56, borderRadius: '50%', border: 'none',
            background: 'linear-gradient(135deg, var(--primary), var(--primary2))',
            color: '#fff', fontSize: '1.4rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isSpeaking ? '0 0 0 6px rgba(99,102,241,0.25)' : '0 6px 20px rgba(99,102,241,0.4)',
          }}
        >
          {isSpeaking && !isPaused ? '⏸' : '▶'}
        </motion.button>

        <motion.button type="button" whileHover={{ scale: 1.05 }} onClick={() => replaySpeech()}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', padding: '6px 12px', borderRadius: 16, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
        >
          ↻ {t.repeatBtn || 'Repeat'}
        </motion.button>
      </div>

      <div className={`waveform ${isSpeaking ? 'speaking' : ''}`}>
        {[...Array(8)].map((_, i) => <div key={i} className="wave-bar" />)}
      </div>
    </motion.div>
  );
}
