import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LANGUAGES } from '../utils/languages';
import { getT } from '../utils/translations';
import { useApp } from '../context/AppContext';

export default function LanguageModal({ onConfirm, onClose }) {
  const { language } = useApp();
  const t = getT(language);
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState(() => LANGUAGES.find(l => l.name === language) || null);

  useEffect(() => {
    setSelected(LANGUAGES.find(l => l.name === language) || null);
  }, [language]);

  const filtered = useMemo(() =>
    LANGUAGES.filter(l =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.native.toLowerCase().includes(search.toLowerCase())
    ), [search]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
        style={{
          position:'fixed', inset:0, zIndex:9999,
          background:'rgba(7,8,15,0.97)',
          backdropFilter:'blur(12px)',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:20,
        }}
      >
        <motion.div
          initial={{ scale:0.86, opacity:0, y:32 }}
          animate={{ scale:1, opacity:1, y:0 }}
          transition={{ type:'spring', stiffness:280, damping:22 }}
          style={{
            background:'var(--surface)',
            border:'1px solid var(--border2)',
            borderRadius:24, padding:'36px 28px',
            width:'min(520px,94vw)', textAlign:'center',
            boxShadow:'0 40px 100px rgba(0,0,0,0.7)',
          }}
        >
          {language && onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                position:'absolute', top:14, right:14, width:34, height:34,
                borderRadius:'50%', border:'1px solid var(--border)',
                background:'var(--surface2)', color:'var(--text2)', cursor:'pointer'
              }}
            >
              ✕
            </button>
          )}
          {/* Animated globe */}
          <motion.div
            animate={{ rotate:[0,12,-12,8,-8,0] }}
            transition={{ duration:3, repeat:Infinity, repeatDelay:2 }}
            style={{ fontSize:'3rem', marginBottom:14 }}
          >🌐</motion.div>

          <h2 style={{
            fontFamily:'var(--font-head)', fontSize:'1.55rem', fontWeight:600, marginBottom:8,
            background:'linear-gradient(135deg, var(--primary), var(--green))',
            WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
          }}>
            {t.welcomeModal}
          </h2>
          <p style={{ color:'var(--text2)', fontSize:'0.84rem', marginBottom:22 }}>
            {t.welcomeSub}
          </p>

          {/* Search */}
          <input
            className="input-base"
            placeholder={t.searchLang}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginBottom:14, textAlign:'left' }}
            autoFocus
          />

          {/* Language grid */}
          <div style={{
            display:'grid', gridTemplateColumns:'repeat(3,1fr)',
            gap:8, maxHeight:280, overflowY:'auto',
            marginBottom:20, paddingRight:4,
          }}>
            {filtered.map(l => (
              <motion.button
                key={l.name}
                whileHover={{ scale:1.05, y:-2 }}
                whileTap={{ scale:0.97 }}
                onClick={() => setSelected(l)}
                style={{
                  padding:'9px 6px',
                  background: selected?.name === l.name ? 'rgba(129,140,248,0.18)' : 'var(--surface2)',
                  border:`1px solid ${selected?.name === l.name ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius:10, cursor:'pointer', textAlign:'center',
                  transition:'all 0.18s', fontFamily:'var(--font-body)',
                }}
              >
                <div style={{ fontWeight:600, fontSize:'0.82rem', color: selected?.name === l.name ? 'var(--primary)' : 'var(--text)' }}>
                  {l.native}
                </div>
                <div style={{ fontSize:'0.66rem', color:'var(--text3)', marginTop:2 }}>{l.name}</div>
                {language === l.name && (
                  <div style={{ fontSize:'0.64rem', color:'var(--green)', marginTop:4 }}>
                    {t.currentLanguageLabel || 'Current'}
                  </div>
                )}
              </motion.button>
            ))}
            {filtered.length === 0 && (
              <div style={{ gridColumn:'1/-1', color:'var(--text3)', fontSize:'0.85rem', padding:20 }}>
                {t.noLanguagesFound || 'No languages found'}
              </div>
            )}
          </div>

          {/* Confirm */}
          <motion.button
            className="btn-primary"
            whileHover={selected ? { scale:1.02 } : {}}
            whileTap={selected ? { scale:0.98 } : {}}
            disabled={!selected}
            onClick={() => selected && onConfirm(selected.name, selected.code)}
            style={{ width:'100%', fontSize:'1rem' }}
          >
            {selected ? t.continueBtn(selected.native) : t.selectFirst}
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
