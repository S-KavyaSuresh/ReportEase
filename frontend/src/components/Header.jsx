import React from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { getT } from '../utils/translations';

export default function Header({ onChangeLang }) {
  const { language, isDark, toggleTheme } = useApp();
  const t = getT(language);

  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: isDark ? 'rgba(7,8,15,0.88)' : 'rgba(240,244,255,0.94)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border)',
        padding: '13px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}
    >
      {/* Brand */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <motion.div
          animate={{ rotate:[0,-8,8,-4,4,0] }}
          transition={{ duration:2.5, repeat:Infinity, repeatDelay:5 }}
          style={{
            width:40, height:40,
            background:'linear-gradient(135deg, var(--primary), var(--green))',
            borderRadius:12,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'1.2rem',
            boxShadow:'0 4px 20px rgba(99,102,241,0.35)',
          }}
        >🩺</motion.div>
        <div>
          <div style={{
            fontFamily:'var(--font-head)', fontSize:'1.32rem', fontWeight:600,
            background:'linear-gradient(135deg, var(--primary), var(--green))',
            WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
          }}>ReportEase</div>
          <div style={{ fontSize:'0.66rem', color:'var(--text3)', marginTop:-2 }}>
            {t.appTagline || 'AI Medical Report Companion'}
          </div>
        </div>
      </div>

      {/* Right controls */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {/* Theme toggle */}
        <motion.button
          whileHover={{ scale:1.08 }} whileTap={{ scale:0.94 }}
          onClick={toggleTheme}
          title={isDark ? t.lightMode : t.darkMode}
          style={{
            display:'flex', alignItems:'center', gap:5,
            padding:'6px 12px',
            background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:20, color:'var(--text2)',
            fontSize:'0.78rem', cursor:'pointer',
            fontFamily:'var(--font-body)',
          }}
        >
          {isDark ? '☀️' : '🌙'} {isDark ? (t.lightMode || 'Light') : (t.darkMode || 'Dark')}
        </motion.button>

        {/* Language pill */}
        <motion.button
          whileHover={{ scale:1.04 }} whileTap={{ scale:0.96 }}
          onClick={onChangeLang}
          style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'7px 14px',
            background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:20, color:'var(--text2)',
            fontSize:'0.8rem', cursor:'pointer',
            fontFamily:'var(--font-body)',
          }}
        >
          🌐 {language || t.languageLabel || 'Language'} ✎
        </motion.button>
      </div>
    </motion.header>
  );
}
