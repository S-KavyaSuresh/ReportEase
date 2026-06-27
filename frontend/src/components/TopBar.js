import React, { useEffect, useState, useCallback } from 'react';
import { getCachedUITranslations, getUITranslations } from '../utils/api';
import { getBrandPronunciation } from '../utils/brand';

const BASE_TEXT = {
  subtitle: 'Medical Reports Made Simple',
  home: 'Home',
  installApp: 'Install App',
  light: 'Light',
  dark: 'Dark',
  switchTheme: 'Switch theme',
};

const LANGUAGE_COPY = {
  Tamil: {
    subtitle: 'மருத்துவ அறிக்கைகள் எளிதாக்கப்பட்டது',
    home: 'முகப்பு',
    installApp: 'செயலியை நிறுவவும்',
    light: 'ஒளி',
    dark: 'இருள்',
    switchTheme: 'தீமை மாற்றவும்',
  },
};

function getBaseText(language) {
  return { ...BASE_TEXT, ...(LANGUAGE_COPY[language] || {}) };
}

const NAV_ITEMS = [
  { key: 'home', path: '/' },
  { key: 'installApp', path: '/install-app' },
];

export default function TopBar({
  theme,
  onToggleTheme,
  onReset,
  showReset,
  hasResults = false,
  language = 'English',
  route = '/',
  onNavigate,
}) {
  const [copy, setCopy] = useState(() => getCachedUITranslations(language, getBaseText(language)));
  const brandPronunciation = getBrandPronunciation(language);

  useEffect(() => {
    let active = true;
    const fallbackCopy = getBaseText(language);
    setCopy(fallbackCopy);
    getUITranslations(language, BASE_TEXT)
      .then((d) => {
        if (!active) return;
        const translations = d.translations || {};
        setCopy(language === 'Tamil' ? { ...translations, ...fallbackCopy } : { ...fallbackCopy, ...translations });
      })
      .catch(() => active && setCopy(fallbackCopy));
    return () => { active = false; };
  }, [language]);

  const navigateTo = useCallback((path) => {
    if (path === '/') {
      onReset?.();
      return;
    }
    onNavigate?.(path);
  }, [onNavigate, onReset]);

  const themeLabel = theme === 'dark' ? copy.light : copy.dark;

  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div className="page-shell" style={{ paddingTop: 12, paddingBottom: 12 }}>
        <div className="header-inner" style={{ alignItems: 'center', gap: 12 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
            onClick={() => navigateTo('/')}
          >
            <img
              src="/icon-192.png"
              alt="ReportEase"
              style={{ width: 42, height: 42, borderRadius: 14, flexShrink: 0 }}
            />
            <div style={{ minWidth: 0 }}>
              <div className="header-brand-line">
                <span className="header-brand-name">ReportEase</span>
                {brandPronunciation ? <span className="header-brand-pronunciation"> - {brandPronunciation}</span> : null}
              </div>
              <span className="header-brand-subtitle">
                {copy.subtitle}
              </span>
            </div>
          </div>

          <nav className="topbar-nav">
            {NAV_ITEMS.map((item) => {
              const disabled = !hasResults && item.path !== '/' && item.path !== '/install-app';
              const active = route === item.path;
              return (
                <button
                  key={item.path}
                  className={`topbar-nav-btn${active ? ' active' : ''}`}
                  onClick={() => navigateTo(item.path)}
                  disabled={disabled}
                  title={copy[item.key] || BASE_TEXT[item.key]}
                >
                  {copy[item.key] || BASE_TEXT[item.key]}
                </button>
              );
            })}
          </nav>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <button
              className="btn-ghost"
              style={{ height: 36, padding: '0 14px', borderRadius: 999, fontSize: 12, whiteSpace: 'nowrap' }}
              onClick={onToggleTheme}
              title={copy.switchTheme}
            >
              {themeLabel}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
