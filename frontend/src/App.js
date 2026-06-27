import React, { useState, useEffect, useCallback } from 'react';
import TopBar from './components/TopBar';
import UploadScreen from './components/UploadScreen';
import LoadingScreen from './components/LoadingScreen';
import ResultsScreen from './components/ResultsScreen';
import InstallPrompt from './components/InstallPrompt';
import InstallPage from './components/InstallPage';
import { uploadAndOCR, analyzeReport } from './utils/api';
import voiceEngine from './utils/voice';

const ROUTE_TAB_MAP = {
  '/analyze-report': 'overview',
  '/findings': 'findings',
  '/voice-chat': 'conversation',
  '/care-path': 'care',
};

export default function App() {
  const [route, setRoute] = useState(() => window.location.pathname || '/');
  const [screen, setScreen] = useState('upload');
  const [theme, setTheme] = useState(() => localStorage.getItem('re_theme') || 'dark');
  const [sessionId, setSessionId] = useState('');
  const [language, setLanguage] = useState(() => localStorage.getItem('re_language') || 'English');
  const [results, setResults] = useState([]);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [error, setError] = useState('');
  const [pendingChatQuestion, setPendingChatQuestion] = useState('');

  useEffect(() => {
    document.body.classList.toggle('light', theme === 'light');
    localStorage.setItem('re_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.body.setAttribute('data-lang', language);
    document.body.classList.remove('lang-ta', 'lang-ml');
    if (language === 'Tamil') document.body.classList.add('lang-ta');
    if (language === 'Malayalam') document.body.classList.add('lang-ml');
    document.documentElement.style.setProperty(
      '--app-font-scale',
      language === 'Tamil' || language === 'Malayalam' ? '15.2px' : '16px'
    );
    localStorage.setItem('re_language', language);
    return () => {
      document.body.classList.remove('lang-ta', 'lang-ml');
      document.documentElement.style.setProperty('--app-font-scale', '16px');
    };
  }, [language]);

  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname || '/');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((path) => {
    const normalized = path || '/';
    if ((window.location.pathname || '/') === normalized) {
      setRoute(normalized);
      return;
    }
    window.history.pushState({}, '', normalized);
    setRoute(normalized);
  }, []);

  const handleUpload = useCallback(async (files, lang) => {
    const fileArray = Array.isArray(files) ? files : [files];
    setLanguage(lang);
    setError('');
    setScreen('loading');
    voiceEngine.stop();
    setPendingChatQuestion('');

    try {
      let sid = sessionId;
      const allResults = [];

      for (let i = 0; i < fileArray.length; i += 1) {
        const ocrData = await uploadAndOCR(fileArray[i], sid);
        if (i === 0) {
          sid = ocrData.session_id;
          setSessionId(sid);
        }
        const extracted = (ocrData.extracted_text || '').trim();
        if (extracted.length >= 30) {
          const analysisData = await analyzeReport(sid, extracted, lang);
          allResults.push({
            result: analysisData.result,
            language: lang,
            fileName: fileArray[i].name,
          });
        }
      }

      if (!allResults.length) {
        throw new Error('Could not extract text from the uploaded file(s). Please use a clearer image or a text-based PDF.');
      }

      setResults(allResults);
      setActiveResultIndex(0);
      setScreen('results');
      navigate('/analyze-report');
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
      setScreen('upload');
      navigate('/');
    }
  }, [navigate, sessionId]);

  const handleReset = useCallback(() => {
    voiceEngine.stop();
    setScreen('upload');
    setResults([]);
    setActiveResultIndex(0);
    setError('');
    setPendingChatQuestion('');
    navigate('/');
  }, [navigate]);

  const currentResult = results[activeResultIndex] || null;
  const isInstallRoute = route === '/install-app';
  const activeResultsTab = ROUTE_TAB_MAP[route] || 'overview';
  const hasResults = screen === 'results' && Boolean(currentResult);

  const handleFollowUpQuestion = useCallback((question) => {
    if (!question) return;
    setPendingChatQuestion(question);
    navigate('/voice-chat');
  }, [navigate]);

  return (
    <>
      <div className="ambient-bg" />
      <InstallPrompt onNavigate={navigate} language={language} />
      <TopBar
        theme={theme}
        language={language}
        route={route}
        hasResults={hasResults}
        onNavigate={navigate}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onReset={handleReset}
        showReset={screen === 'results'}
      />
      <main className="page-shell" style={{ minHeight: 'calc(100vh - 57px)' }}>
        {isInstallRoute ? (
          <InstallPage language={language} />
        ) : screen === 'upload' ? (
          <>
            {error && (
              <div style={{ maxWidth: 720, margin: '0 auto 18px' }}>
                <div className="error-banner">{error}</div>
              </div>
            )}
            <UploadScreen onUpload={handleUpload} isLoading={false} language={language} onLanguageChange={setLanguage} />
          </>
        ) : screen === 'loading' ? (
          <LoadingScreen language={language} />
        ) : screen === 'results' && currentResult ? (
          <>
            {results.length > 1 && (
              <div className="multi-report-tabs">
                {results.map((r, i) => (
                  <button
                    key={i}
                    className={`multi-report-tab ${i === activeResultIndex ? 'active' : ''}`}
                    onClick={() => {
                      if (i !== activeResultIndex) {
                        voiceEngine.stop();
                      }
                      setActiveResultIndex(i);
                    }}
                  >
                    <span className="multi-report-tab-icon">Doc</span>
                    <span className="multi-report-tab-name">{r.fileName || `Report ${i + 1}`}</span>
                  </button>
                ))}
              </div>
            )}
            <ResultsScreen
              key={activeResultIndex}
              result={currentResult.result}
              sessionId={sessionId}
              language={currentResult.language}
              activeTab={activeResultsTab}
              onNavigate={navigate}
              onAskFollowUp={handleFollowUpQuestion}
              pendingChatQuestion={pendingChatQuestion}
              onPendingChatHandled={() => setPendingChatQuestion('')}
            />
          </>
        ) : null}
      </main>
    </>
  );
}
