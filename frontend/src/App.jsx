import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AppProvider, useApp } from './context/AppContext';
import LanguageModal from './components/LanguageModal';
import Header        from './components/Header';
import ChatBot       from './components/ChatBot';
import HomePage      from './pages/HomePage';
import ResultsPage   from './pages/ResultsPage';
import { translateUi } from './utils/api';
import { getSerializableEnglish, setRuntimeTranslations } from './utils/translations';
import './styles/global.css';

function AppInner() {
  const { language, chooseLanguage, isDark, setOnLangChange } = useApp();
  const [showLangModal, setShowLangModal] = useState(true);
  const [, setTranslationTick] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.toggle('light', !isDark);
  }, [isDark]);

  // Register navigate callback so language change redirects to home
  useEffect(() => {
    setOnLangChange(() => () => navigate('/', { replace: true }));
  }, [navigate, setOnLangChange]);

  useEffect(() => {
    if (!language || language === 'English') return;
    const cacheKey = `ui-translations:${language}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        setRuntimeTranslations(language, JSON.parse(cached));
        setTranslationTick((n) => n + 1);
      } catch (_) {}
    }

    translateUi(language, getSerializableEnglish())
      .then((res) => {
        const translated = res.data?.translations || {};
        setRuntimeTranslations(language, translated);
        localStorage.setItem(cacheKey, JSON.stringify(translated));
        setTranslationTick((n) => n + 1);
      })
      .catch(() => {});
  }, [language]);

  const handleConfirm = (name, code) => {
    chooseLanguage(name, code);
    setShowLangModal(false);
  };

  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      <div className="ambient-bg" />

      <AnimatePresence>
        {(!language || showLangModal) && (
          <LanguageModal key="lang-modal" onConfirm={handleConfirm} onClose={() => setShowLangModal(false)} />
        )}
      </AnimatePresence>

      {language && (
        <>
          <Header onChangeLang={() => setShowLangModal(true)} />
          <main style={{ position: 'relative', zIndex: 1 }}>
            <Routes>
              <Route path="/"        element={<HomePage />}    />
              <Route path="/results" element={<ResultsPage />} />
            </Routes>
          </main>
          <ChatBot />
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProvider>
        <AppInner />
      </AppProvider>
    </BrowserRouter>
  );
}
