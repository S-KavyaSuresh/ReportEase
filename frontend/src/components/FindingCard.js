import React, { useEffect, useState } from 'react';
import { getCachedUITranslations, getUITranslations } from '../utils/api';

const BASE_COPY = {
  normal:          'Normal',
  warning:         'Needs review',
  critical:        'Needs attention',
  review:          'Review',
  referenceRange:  'Reference range',
  hideExplanation: 'Hide explanation',
  explainValue:    'Explain this value',
};

// Parameter name → pronunciation hint for Indian languages
// Shows as: "Hemoglobin (ஹீமோகுளோபின்)" in Tamil etc.
// For non-Indian languages it's omitted — not needed.
const PRONUNCIATION_MAP = {
  Tamil: {
    Hemoglobin:                     'ஹீமோகுளோபின்',
    HB:                             'ஹீமோகுளோபின்',
    'Mean Cell Hemoglobin':         'ஸ்ரீ ஆக்கிய வட்டக் கலப்பு',
    MCH:                            'MCH',
    'Mean Cell Hb Conc':            'MCHC',
    MCHC:                           'MCHC',
    'Platelet Count':               'தட்டாணு எண்ணிக்கை',
    'Total WBC Count':              'வெள்ளை அணுக்கள்',
    'R.B.C. Count':                 'சிவப்பணு எண்ணிக்கை',
    'Packed Cell Volume':           'பேக்ட் செல் அளவு',
    Neutrophils:                    'நியூட்ரோஃபில்ஸ்',
    Lymphocytes:                    'லிம்போசைட்டுகள்',
    Eosinophils:                    'இயோசினோஃபில்ஸ்',
    Monocytes:                      'மோனோசைட்டுகள்',
    'Absolute Eosinophils Count':   'முழுமையான இயோசினோஃபில்ஸ் எண்ணிக்கை',
    TSH:                            'TSH',
    Creatinine:                     'க்ரியேட்டினின்',
    Glucose:                        'சர்க்கரை அளவு',
    HbA1c:                          'HbA1c',
    Cholesterol:                    'கொழுப்பு அளவு',
  },
  Hindi: {
    Hemoglobin:       'हीमोग्लोबिन',
    'Platelet Count': 'प्लेटलेट गिनती',
    'Total WBC Count':'श्वेत रक्त कोशिकाएं',
    TSH:              'TSH',
    Creatinine:       'क्रिएटिनिन',
    Glucose:          'रक्त शर्करा',
    Cholesterol:      'कोलेस्ट्रॉल',
  },
  Telugu: {
    Hemoglobin:       'హిమోగ్లోబిన్',
    'Platelet Count': 'ప్లేట్‌లెట్ లెక్కింపు',
    'Total WBC Count':'తెల్ల రక్తకణాల లెక్కింపు',
    Creatinine:       'క్రియాటినిన్',
    Glucose:          'రక్తంలో చక్కెర',
    Cholesterol:      'కొలెస్ట్రాల్',
  },
  Kannada: {
    Hemoglobin:       'ಹಿಮೋಗ್ಲೋಬಿನ್',
    'Platelet Count': 'ಪ್ಲೇಟ್‌ಲೆಟ್ ಎಣಿಕೆ',
    Creatinine:       'ಕ್ರಿಯೇಟಿನಿನ್',
    Glucose:          'ರಕ್ತದ ಸಕ್ಕರೆ',
  },
  Malayalam: {
    Hemoglobin:       'ഹീമോഗ്ലോബിൻ',
    'Platelet Count': 'പ്ലേറ്റ്‌ലെറ്റ് എണ്ണം',
    Creatinine:       'ക്രിയേറ്റിനിൻ',
    Glucose:          'രക്തത്തിലെ പഞ്ചസാര',
    Cholesterol:      'കൊളസ്‌ട്രോൾ',
  },
  Bengali: {
    Hemoglobin:       'হিমোগ্লোবিন',
    'Platelet Count': 'প্লেটলেট গণনা',
    Creatinine:       'ক্রিয়েটিনিন',
    Glucose:          'রক্তে শর্করা',
  },
  Marathi: {
    Hemoglobin:       'हिमोग्लोबिन',
    'Platelet Count': 'प्लेटलेट संख्या',
    Glucose:          'रक्तातील साखर',
    Cholesterol:      'कोलेस्टेरॉल',
  },
  Gujarati: {
    Hemoglobin:       'હિમોગ્લોબિન',
    'Platelet Count': 'પ્લેટલેટ ગણતરી',
    Glucose:          'રક્ત શર્કરા',
  },
};

const INDIAN_LANGS = new Set(Object.keys(PRONUNCIATION_MAP));

function getPronunciation(name, language) {
  if (!INDIAN_LANGS.has(language)) return null;
  const map = PRONUNCIATION_MAP[language] || {};
  // Try exact match, then partial match
  if (map[name]) return map[name];
  for (const key of Object.keys(map)) {
    if (name && name.toLowerCase().includes(key.toLowerCase())) return map[key];
  }
  return null;
}

export default function FindingCard({ finding, language = 'English' }) {
  const [open, setOpen]   = useState(false);
  const [copy, setCopy]   = useState(() => getCachedUITranslations(language, BASE_COPY));
  const { name, value, normalRange, status = 'normal', severity, layman, tip,
          statusLabel, namePronunciation } = finding;

  useEffect(() => {
    let active = true;
    getUITranslations(language, BASE_COPY)
      .then((data) => active && setCopy(data.translations || BASE_COPY))
      .catch(() => active && setCopy(BASE_COPY));
    return () => { active = false; };
  }, [language]);

  // STATUS WORDS must never show a pronunciation hint — they're labels, not medical terms
  const STATUS_WORDS = new Set([
    'normal', 'warning', 'critical', 'review', 'mild', 'moderate', 'needs_attention',
    'Normal', 'Warning', 'Critical', 'Review', 'Mild', 'Moderate',
  ]);
  // Use backend-provided pronunciation first, fall back to static map
  // Never show pronunciation for status labels
  const isStatusWord = STATUS_WORDS.has(name);
  const pronunciation = isStatusWord ? null : (namePronunciation || getPronunciation(name, language));
  // Use backend-provided translated status label, or fall back to copy
  const displayStatus = statusLabel || copy[status] || copy.review;
  // Severity: use statusLabel for translated version if available; otherwise format the raw value
  const displaySeverity = severity && severity !== 'normal'
    ? severity.replace(/_/g, ' ')
    : null;

  return (
    <div
      className={`finding-card status-${status} animate-fadeUp`}
      onClick={() => setOpen((v) => !v)}
      role="button"
      tabIndex={0}
    >
      <div className="finding-head">
        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
          {/* Parameter name always in English */}
          <div style={{ fontWeight: 700, overflowWrap: 'anywhere', wordBreak: 'normal' }}>{name}</div>
          {/* Pronunciation hint in brackets */}
          {pronunciation && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, overflowWrap: 'anywhere' }}>
              ({pronunciation})
            </div>
          )}
          <div className={`badge badge-${status}`}>{displayStatus}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
          <div className="finding-value">{value}</div>
          {displaySeverity && (
            <div className="hospital-meta">{displaySeverity}</div>
          )}
        </div>
      </div>

      {normalRange && (
        <div className="hospital-meta" style={{ marginTop: 10 }}>
          {copy.referenceRange}: {normalRange}
        </div>
      )}

      {(layman || tip) && (
        <div style={{ marginTop: 12 }}>
          <button className="btn-ghost" type="button" style={{ fontSize: 12, padding: '8px 12px' }}>
            {open ? copy.hideExplanation : copy.explainValue}
          </button>
          {open && (
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {layman && <div className="plain-note">{layman}</div>}
              {tip    && <div className="hospital-meta">{tip}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
