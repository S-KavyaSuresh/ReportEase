import React from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { getT } from '../utils/translations';

export default function LoaderPipeline({ currentStep }) {
  const { language } = useApp();
  const t = getT(language);

  const STEPS = [
    { id: 'ocr',      icon: '📷', label: t.loaderReading    },
    { id: 'analysis', icon: '🧠', label: t.loaderAnalysing  },
    { id: 'doctors',  icon: '🏥', label: t.loaderDoctors    },
    { id: 'audio',    icon: '🔊', label: t.loaderAudio      },
  ];
  const MESSAGES = [
    t.loaderMsgOcr,
    t.loaderMsgAnalysis,
    t.loaderMsgDoctors,
    t.loaderMsgAudio,
  ];

  const stepIndex = STEPS.findIndex(s => s.id === currentStep);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="card" style={{ textAlign: 'center', padding: '48px 28px' }}
    >
      <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 24px' }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          style={{ position: 'absolute', inset: 0, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%' }}
        />
        <motion.div animate={{ rotate: -360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          style={{ position: 'absolute', inset: 8, border: '2px solid var(--border)', borderBottomColor: 'var(--green)', borderRadius: '50%' }}
        />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
          {STEPS[stepIndex]?.icon || '⏳'}
        </div>
      </div>

      <motion.p key={stepIndex} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        style={{ color: 'var(--text2)', fontSize: '0.92rem', marginBottom: 28 }}
      >
        {MESSAGES[stepIndex] || '…'}
      </motion.p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap', rowGap: 8 }}>
        {STEPS.map((s, i) => {
          const isDone = i < stepIndex, isActive = i === stepIndex;
          return (
            <React.Fragment key={s.id}>
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.1 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 20,
                  border: `1px solid ${isDone ? 'rgba(52,211,153,0.35)' : isActive ? 'var(--primary)' : 'var(--border)'}`,
                  background: isDone ? 'rgba(52,211,153,0.08)' : isActive ? 'rgba(129,140,248,0.12)' : 'rgba(0,0,0,0)',
                  fontSize: '0.75rem',
                  color: isDone ? 'var(--green)' : isActive ? 'var(--primary)' : 'var(--text3)',
                  fontWeight: isActive ? 600 : 400, transition: 'all 0.4s',
                }}
              >
                <span>{isDone ? '✓' : s.icon}</span>
                <span>{s.label}</span>
                {isActive && (
                  <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }}>…</motion.span>
                )}
              </motion.div>
              {i < STEPS.length - 1 && <span style={{ color: 'var(--text3)', fontSize: '0.7rem' }}>→</span>}
            </React.Fragment>
          );
        })}
      </div>
    </motion.div>
  );
}
