import React from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { getT } from '../utils/translations';

const ICONS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣'];

export default function ChecklistCard({ items = [], specialist, specialistReason, urgency }) {
  const { language } = useApp();
  const t = getT(language);

  const urgencyConfig = {
    urgent:  { label: t.urgencyUrgent,  color: 'var(--red)',    bg: 'rgba(248,113,113,0.1)' },
    soon:    { label: t.urgencySoon,    color: 'var(--yellow)', bg: 'rgba(251,191,36,0.1)' },
    routine: { label: t.urgencyRoutine, color: 'var(--green)',  bg: 'rgba(52,211,153,0.1)' },
  };
  const urg = urgencyConfig[urgency] || urgencyConfig.routine;

  return (
    <div>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ marginBottom: 10 }}>
        <span style={{ display: 'inline-block', padding: '7px 18px', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', borderRadius: 20, fontSize: '0.88rem', fontWeight: 600, color: 'var(--primary)' }}>
          👨‍⚕️ {specialist}
        </span>
      </motion.div>

      {specialistReason && (
        <p style={{ fontSize: '0.84rem', color: 'var(--text2)', marginBottom: 10, lineHeight: 1.6 }}>{specialistReason}</p>
      )}

      <div style={{ display: 'inline-block', padding: '5px 14px', background: urg.bg, borderRadius: 14, fontSize: '0.78rem', fontWeight: 600, color: urg.color, marginBottom: 16 }}>
        {urg.label}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i }}
            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, fontSize: '0.86rem', color: 'var(--text)', lineHeight: 1.6 }}
          >
            <span style={{ flexShrink: 0, fontSize: '1rem' }}>{ICONS[i] || '✅'}</span>
            <span>{item}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
