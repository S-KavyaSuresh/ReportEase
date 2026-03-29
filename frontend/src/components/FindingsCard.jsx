import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { getT } from '../utils/translations';

export default function FindingsCard({ findings = [] }) {
  const { language } = useApp();
  const t = getT(language);
  const [filter, setFilter] = useState('all');

  const counts = {
    critical: findings.filter(f => f.status === 'critical').length,
    warning:  findings.filter(f => f.status === 'warning').length,
    normal:   findings.filter(f => f.status === 'normal').length,
  };

  const filtered = filter === 'all' ? findings : findings.filter(f => f.status === filter);

  const FILTERS = [
    { id: 'all',      label: `${t.allLabel} (${findings.length})` },
    { id: 'critical', label: `⚠️ ${t.needsAttention} (${counts.critical})` },
    { id: 'warning',  label: `🟡 ${t.borderline} (${counts.warning})` },
    { id: 'normal',   label: `✅ ${t.normal} (${counts.normal})` },
  ];

  const borderCol = { normal: 'var(--green)', warning: 'var(--yellow)', critical: 'var(--red)' };

  const getBadge = (status) => {
    if (status === 'critical') return { cls: 'badge-critical', label: t.attentionLabel };
    if (status === 'warning')  return { cls: 'badge-warning',  label: t.borderlineLabel };
    return { cls: 'badge-normal', label: t.normalBadge };
  };

  // Summary line above filters
  const summaryParts = [];
  if (counts.critical > 0) summaryParts.push(`${counts.critical} ${t.needsAttention}`);
  if (counts.warning  > 0) summaryParts.push(`${counts.warning} ${t.borderline}`);
  if (counts.normal   > 0) summaryParts.push(`${counts.normal} ${t.normal}`);

  return (
    <div>
      {/* Summary */}
      {summaryParts.length > 0 && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginBottom: 12 }}>
          {summaryParts.join(' · ')}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <motion.button key={f.id} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '5px 14px', borderRadius: 16,
              border: `1px solid ${filter === f.id ? 'var(--primary)' : 'var(--border)'}`,
              background: filter === f.id ? 'var(--primary)' : 'none',
              color: filter === f.id ? '#fff' : 'var(--text2)',
              fontSize: '0.75rem', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: filter === f.id ? 600 : 400,
              transition: 'all 0.2s',
            }}
          >{f.label}</motion.button>
        ))}
      </div>

      {/* Findings list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AnimatePresence>
          {filtered.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ color: 'var(--text3)', fontSize: '0.85rem', textAlign: 'center', padding: 16 }}
            >{t.noFindings}</motion.div>
          ) : filtered.map((f, i) => {
            const badge = getBadge(f.status);
            return (
              <motion.div key={f.name + i}
                initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  padding: '12px 14px', background: 'var(--surface2)',
                  borderRadius: 12,
                  borderLeft: `3px solid ${borderCol[f.status] || 'var(--border)'}`,
                }}
              >
                <span className={`badge ${badge.cls}`} style={{ flexShrink: 0, marginTop: 2 }}>
                  {badge.label}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: 3 }}>{f.name}</div>
                  {(f.value || f.normalRange) && (
                    <div style={{ fontSize: '0.76rem', color: 'var(--text3)', marginBottom: 4 }}>
                      {f.value     && `${t.valueLabel}: ${f.value}`}
                      {f.value && f.normalRange && ' · '}
                      {f.normalRange && `${t.normalLabel}: ${f.normalRange}`}
                    </div>
                  )}
                  <div style={{ fontSize: '0.84rem', color: 'var(--text2)', lineHeight: 1.6 }}>{f.layman}</div>
                  {f.tip && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginTop: 4 }}>💡 {f.tip}</div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
