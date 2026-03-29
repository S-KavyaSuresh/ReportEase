import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import UploadZone     from '../components/UploadZone';
import LoaderPipeline from '../components/LoaderPipeline';
import { useApp }     from '../context/AppContext';
import { getT }       from '../utils/translations';
import { ocrReport, analyzeReport } from '../utils/api';

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 18 } },
};

export default function HomePage() {
  const navigate = useNavigate();
  const { sessionId, language, setExtractedText, setAnalysisResult, setStep } = useApp();
  const t = getT(language);

  const [files,    setFiles]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [pipeStep, setPipeStep] = useState('ocr');
  const [error,    setError]    = useState('');

  const handleAnalyze = async () => {
    if (!files.length || !language) return;
    setError('');
    setLoading(true);
    setStep('loading');
    try {
      setPipeStep('ocr');
      const ocrOutputs = [];
      let activeSessionId = sessionId;

      for (const file of files) {
        const ocrRes = await ocrReport(file, activeSessionId);
        activeSessionId = ocrRes.data.session_id;
        ocrOutputs.push(`Document: ${file.name}\n${ocrRes.data.extracted_text}`);
      }
      const text = ocrOutputs.join('\n\n-----\n\n');
      setExtractedText(text);

      setPipeStep('analysis');
      const anaRes = await analyzeReport({
        session_id: activeSessionId,
        extracted_text: text,
        language,
        question: '',
      });
      setAnalysisResult(anaRes.data.result);

      setPipeStep('doctors');
      await new Promise(r => setTimeout(r, 400));
      setPipeStep('audio');
      await new Promise(r => setTimeout(r, 300));

      setStep('results');
      navigate('/results');
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || t.genericError;
      setError(`${t.errorPrefix || 'Error'}: ${msg}. ${t.tryAgain || 'Please try again.'}`);
      setLoading(false);
      setStep('upload');
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px' }}>
        <LoaderPipeline currentStep={pipeStep} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 120px' }}>

      {/* Hero */}
      <motion.div variants={containerVariants} initial="hidden" animate="show"
        style={{ textAlign: 'center', marginBottom: 32 }}
      >
        <motion.div
          variants={itemVariants}
          animate={{ y: [0, -12, 0], rotate: [0, -5, 5, 0] }}
          transition={{ y: { duration: 3, repeat: Infinity, ease: 'easeInOut' }, rotate: { duration: 4, repeat: Infinity, delay: 0.5 } }}
          style={{ fontSize: '4rem', marginBottom: 14, display: 'inline-block' }}
        >
          🩺
        </motion.div>

        <motion.h1 variants={itemVariants} style={{
          fontFamily: 'var(--font-head)',
          fontSize: 'clamp(1.5rem, 4vw, 2.1rem)',
          fontWeight: 600, marginBottom: 12, lineHeight: 1.3,
          background: 'linear-gradient(135deg, var(--primary), var(--green))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          {t.title}
        </motion.h1>

        <motion.p variants={itemVariants} style={{
          color: 'var(--text2)', fontSize: '0.93rem', lineHeight: 1.75,
          maxWidth: 480, margin: '0 auto',
        }}>
          {t.subtitle}
        </motion.p>

        <motion.div variants={containerVariants}
          style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}
        >
          {t.features.map((f, i) => (
            <motion.span key={f} variants={itemVariants}
              whileHover={{ scale: 1.08, y: -3 }}
              style={{
                padding: '5px 13px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 20, fontSize: '0.76rem', color: 'var(--text2)',
              }}
            >{f}</motion.span>
          ))}
        </motion.div>
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{
            padding: '12px 16px', marginBottom: 16,
            background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 12, color: 'var(--red)', fontSize: '0.86rem',
          }}
        >{error}</motion.div>
      )}

      
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }} className="card card-glow" style={{ marginBottom: 20 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'rgba(129,140,248,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
          }}>📋</div>
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 600 }}>{t.uploadTitle}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{t.uploadSub}</div>
          </div>
        </div>
        <UploadZone
          files={files}
          onFiles={(incoming) => setFiles((prev) => [...prev, ...incoming])}
          onRemove={(index) => setFiles((prev) => prev.filter((_, i) => i !== index))}
        />
      </motion.div>

      {/* Hint about chat */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        style={{
          textAlign: 'center', fontSize: '0.8rem', color: 'var(--text3)',
          marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <span>💬</span>
        <span>{t.chatHint}</span>
      </motion.div>

      {/* Analyze button */}
      <motion.button
        className="btn-primary"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
        whileHover={files.length && language ? { scale: 1.02, boxShadow: '0 14px 40px rgba(99,102,241,0.5)' } : {}}
        whileTap={files.length && language ? { scale: 0.98 } : {}}
        disabled={!files.length || !language}
        onClick={handleAnalyze}
        style={{ width: '100%', fontSize: '1rem', padding: 16 }}
      >
        {t.analyzeBtn}
      </motion.button>

      {!language && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text3)', marginTop: 8 }}
        >
          {t.selectLangHint}
        </motion.p>
      )}
    </div>
  );
}
