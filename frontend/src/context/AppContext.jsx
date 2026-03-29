import React, { createContext, useContext, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [sessionId,      setSessionId]      = useState(() => uuidv4());
  const [language,       setLanguage]       = useState(null);
  const [languageCode,   setLanguageCode]   = useState('en-US');
  const [extractedText,  setExtractedText]  = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [step,           setStep]           = useState('upload');
  const [isDark,         setIsDark]         = useState(true);
  // callback to navigate to home when language changes
  const [onLangChange,   setOnLangChange]   = useState(null);

  const resetAll = useCallback(() => {
    setSessionId(uuidv4());
    setExtractedText('');
    setAnalysisResult(null);
    setStep('upload');
  }, []);

  const chooseLanguage = useCallback((lang, code) => {
    const isChange = language !== null && language !== lang;
    setLanguage(lang);
    setLanguageCode(code);
    // If language changed while on results/mid-flow, reset and go home
    if (isChange) {
      setAnalysisResult(null);
      setExtractedText('');
      setStep('upload');
      setSessionId(uuidv4());
      if (onLangChange) onLangChange();
    }
  }, [language, onLangChange]);

  const toggleTheme = useCallback(() => setIsDark(d => !d), []);

  return (
    <AppContext.Provider value={{
      sessionId,
      language, languageCode, chooseLanguage,
      extractedText, setExtractedText,
      analysisResult, setAnalysisResult,
      step, setStep,
      isDark, toggleTheme,
      resetAll,
      setOnLangChange,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
