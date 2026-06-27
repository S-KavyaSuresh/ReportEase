import React, { useEffect, useState } from 'react';
import { getCachedUITranslations } from '../utils/api';
import { getLanguageDisplayName } from '../utils/languages';

const STEPS = [
  { icon: '🔍', key: 'stepRead',    en: 'Reading your report carefully' },
  { icon: '🧪', key: 'stepExtract', en: 'Extracting values and reference ranges' },
  { icon: '✅', key: 'stepCheck',   en: 'Checking hidden abnormalities and patterns' },
  { icon: '🎙️', key: 'stepVoice',  en: 'Preparing multilingual voice guidance' },
  { icon: '💊', key: 'stepDoctor',  en: 'Building doctor direction and next steps' },
  { icon: '📝', key: 'stepWrite',   en: 'Writing your plain-language explanation' },
];

// Build the BASE_COPY object from STEPS for translation
const BASE_COPY = Object.fromEntries(STEPS.map((s) => [s.key, s.en]));
BASE_COPY.preparingIn = 'Preparing your explanation in';

export default function LoadingScreen({ language }) {
  const [step, setStep] = useState(0);
  const [dots, setDots] = useState('');
  const [copy, setCopy] = useState(() => getCachedUITranslations(language, BASE_COPY));
  const languageLabel = getLanguageDisplayName(language);

  useEffect(() => {
    const t1 = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2200);
    const t2 = setInterval(() => setDots((d) => (d.length >= 3 ? '' : `${d}.`)), 480);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  useEffect(() => {
    setCopy(getCachedUITranslations(language, BASE_COPY));
    return undefined;
  }, [language]);

  const current = STEPS[step];

  return (
    <div className="card" style={{ maxWidth: 560, margin: '48px auto', padding: '36px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
      {/* Icon box — uses CSS var instead of hardcoded light cream */}
      <div style={{ fontSize: 26, lineHeight: 1, padding: '18px 28px', borderRadius: 999, background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--primary)', fontWeight: 700 }}>
        {current.icon}
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', minHeight: 34 }}>
          {copy[current.key] || current.en}{dots}
        </div>
        {language !== 'English' && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
            {copy.preparingIn} {languageLabel}…
          </div>
        )}
      </div>

      <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--primary2), var(--gold))', width: `${((step + 1) / STEPS.length) * 100}%`, transition: 'width 0.7s ease' }} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 999, transition: 'all 0.3s', background: i < step ? 'var(--green)' : i === step ? 'var(--accent)' : 'var(--border2)' }} />
        ))}
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[72, 110, 60, 150].map((h, i) => (
          <div key={i} className="shimmer" style={{ height: h, width: '100%', borderRadius: 16 }} />
        ))}
      </div>
    </div>
  );
}
