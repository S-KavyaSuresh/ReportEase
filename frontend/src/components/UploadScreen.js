import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getCachedUITranslations, getUITranslations } from '../utils/api';
import { LANGUAGE_OPTIONS } from '../utils/languages';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/bmp', 'application/pdf'];
const MAX_SIZE_MB = 20;
const MAX_FILES = 5;

const BASE_COPY = {
  eyebrow: 'From Medical Data to Meaningful Insights',
  title: 'Know What Your Report Means',
  description: 'Understand what your report means, what needs attention, and where to go next-all explained in simple language.',
  features: ['Plain-language explanation', 'Hidden abnormal value detection', 'Multilingual output', 'Doctor direction'],
  stats: [
    { id: 'clear', value: 'Clear & Simple Explanation', label: '' },
    { id: 'voice', value: 'Voice-Guided Understanding', label: '' },
    { id: 'next', value: 'Know Your Next Step', label: '' },
  ],
  panelTitle: "Let's Decode Your Report",
  panelSubtitle: 'PDF, image, or multiple reports for correlation and trends.',
  secure: 'Secure session',
  dropTitle: 'Drop reports here or tap to browse',
  dropMeta: `Up to ${MAX_FILES} files, ${MAX_SIZE_MB} MB each`,
  explainIn: 'Explain in',
  voiceAssistTitle: 'Voice-first assistance',
  voiceAssistBody: 'The analysis will be prepared for spoken output and follow-up conversation.',
  analyze: 'Explain My Report',
  analyzing: 'Analyzing report...',
  footnote: 'Supportive guidance only. Final diagnosis and treatment decisions must be made by a qualified clinician.',
  remove: 'Remove',
  pleaseUpload: 'Please upload at least one report.',
  tooManyAtOnce: `You can upload up to ${MAX_FILES} files at once.`,
  unsupported: 'is not supported. Please use PDF or image files.',
  largerThan: `is larger than ${MAX_SIZE_MB} MB.`,
  keepOnly: `You can keep only ${MAX_FILES} files in one session.`,
};

const TAMIL_FALLBACK_COPY = {
  ...BASE_COPY,
  eyebrow: 'மருத்துவ தகவல்களில் இருந்து தெளிவான விளக்கம்',
  title: 'உங்கள் அறிக்கை என்ன என்பதை அறிந்து கொள்ளுங்கள்',
  description: 'உங்கள் அறிக்கை என்ன சொல்கிறது, எதில் கவனம் தேவை, அடுத்து என்ன செய்ய வேண்டும் என்பதைக் எளிய மொழியில் அறிந்து கொள்ளுங்கள்.',
  features: ['எளிய விளக்கம்', 'மறைந்துள்ள அசாதாரண மதிப்புகள் கண்டறிதல்', 'பல்மொழி வெளியீடு', 'மருத்துவர் வழிகாட்டல்'],
  panelTitle: 'உங்கள் அறிக்கையை புரிந்து கொள்வோம்',
  panelSubtitle: 'PDF, படம், அல்லது பல அறிக்கைகளை இணைத்து விளக்கலாம்.',
  secure: 'பாதுகாப்பான அமர்வு',
  dropTitle: 'அறிக்கைகளை இங்கே விடுங்கள் அல்லது தேட தட்டவும்',
  dropMeta: `அதிகபட்சம் ${MAX_FILES} கோப்புகள், ஒவ்வொன்றும் ${MAX_SIZE_MB} எம்பி`,
  explainIn: 'விளக்கம் வேண்டிய மொழி',
  voiceAssistTitle: 'குரல் உதவி',
  voiceAssistBody: 'இந்த பகுப்பாய்வு குரல் விளக்கம் மற்றும் தொடர்ச்சி உரையாடலுக்காக தயார் செய்யப்படும்.',
  analyze: 'என் அறிக்கையை விளக்கவும்',
  analyzing: 'அறிக்கை பகுப்பாய்வு செய்யப்படுகிறது...',
  footnote: 'இது ஆதரவு வழிகாட்டல் மட்டும். இறுதி நோயறிதல் மற்றும் சிகிச்சை முடிவுகளை தகுதியான மருத்துவர் மட்டுமே எடுக்க வேண்டும்.',
  remove: 'நீக்கு',
  pleaseUpload: 'குறைந்தது ஒரு அறிக்கையாவது பதிவேற்றவும்.',
  tooManyAtOnce: `ஒரே நேரத்தில் அதிகபட்சம் ${MAX_FILES} கோப்புகள் வரை மட்டுமே பதிவேற்றலாம்.`,
  unsupported: 'ஆதரிக்கப்படவில்லை. PDF அல்லது படம் கோப்புகளை பயன்படுத்தவும்.',
  largerThan: `${MAX_SIZE_MB} எம்பியை விட பெரியது.`,
  keepOnly: `ஒரே அமர்வில் ${MAX_FILES} கோப்புகள் வரை மட்டுமே வைத்திருக்கலாம்.`,
};

function getFallbackCopy(language) {
  if (language === 'Tamil') return TAMIL_FALLBACK_COPY;
  return BASE_COPY;
}

export default function UploadScreen({ onUpload, isLoading, language, onLanguageChange }) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [copy, setCopy] = useState(() => getCachedUITranslations(language, getFallbackCopy(language)));
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    getUITranslations(language, BASE_COPY)
      .then((data) => {
        if (!active) return;
        const nextCopy = { ...getFallbackCopy(language), ...(data.translations || {}) };
        if (language === 'Tamil') {
          nextCopy.dropTitle = TAMIL_FALLBACK_COPY.dropTitle;
          nextCopy.dropMeta = TAMIL_FALLBACK_COPY.dropMeta;
        }
        setCopy(nextCopy);
      })
      .catch(() => active && setCopy(getFallbackCopy(language)));
    return () => { active = false; };
  }, [language]);

  const validate = useCallback((fileList) => {
    const nextFiles = Array.from(fileList || []);
    if (!nextFiles.length) return null;
    if (nextFiles.length > MAX_FILES) {
      setError(copy.tooManyAtOnce);
      return null;
    }
    for (const file of nextFiles) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(`${file.name} ${copy.unsupported}`);
        return null;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`${file.name} ${copy.largerThan}`);
        return null;
      }
    }
    setError('');
    return nextFiles;
  }, [copy]);

  const addFiles = useCallback((fileList) => {
    const nextFiles = validate(fileList);
    if (!nextFiles) return;
    setFiles((current) => {
      const combined = [...current, ...nextFiles];
      if (combined.length > MAX_FILES) {
        setError(copy.keepOnly);
        return current;
      }
      return combined;
    });
  }, [copy, validate]);

  const handleSubmit = useCallback(() => {
    if (!files.length) {
      setError(copy.pleaseUpload);
      return;
    }
    onUpload(files, language);
  }, [copy, files, language, onUpload]);

  return (
    <div className="hero-shell">
      <div className="hero-grid">
        <section className="hero-copy animate-fadeUp">
          <div className="hero-eyebrow">{copy.eyebrow}</div>
          <h1 className="hero-title">{copy.title}</h1>
          <p className="hero-text">{copy.description}</p>

          <div className="feature-pill-grid">
            {(copy.features || []).map((item) => (
              <span key={item} className="feature-pill">{item}</span>
            ))}
          </div>

          <div className="hero-stats">
            {(copy.stats || []).map((item) => (
              <div key={item.id || item.value} className="hero-stat-card">
                <strong>{item.value}</strong>
                {item.label && <span>{item.label}</span>}
              </div>
            ))}
          </div>
        </section>

        <section className="upload-panel card animate-scaleIn">
          <div className="upload-panel-top">
            <div>
              <div className="panel-title">{copy.panelTitle}</div>
              <div className="panel-subtitle">{copy.panelSubtitle}</div>
            </div>
            <div className="secure-chip">{copy.secure}</div>
          </div>

          <div
            className={`dropzone ${dragging ? 'dropzone-active' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              addFiles(event.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              multiple
              style={{ display: 'none' }}
              onChange={(event) => addFiles(event.target.files)}
            />
            <div className="dropzone-icon">+</div>
            <div className="dropzone-title">{copy.dropTitle}</div>
            <div className="dropzone-meta">{copy.dropMeta}</div>
          </div>

          {!!files.length && (
            <div className="file-stack">
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="file-row">
                  <div className="file-row-icon">{file.type === 'application/pdf' ? 'PDF' : 'IMG'}</div>
                  <div className="file-row-copy">
                    <div className="file-row-name">{file.name}</div>
                    <div className="file-row-size">{(file.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <button
                    type="button"
                    className="file-remove"
                    onClick={(event) => {
                      event.stopPropagation();
                      setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
                    }}
                  >
                    {copy.remove}
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}

          <div className="form-grid">
            <div>
              <label className="input-label">{copy.explainIn}</label>
              <select className="input-base" value={language} onChange={(event) => onLanguageChange(event.target.value)}>
                {LANGUAGE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>

            <div className="callout-card">
              <strong>{copy.voiceAssistTitle}</strong>
              <span>{copy.voiceAssistBody}</span>
            </div>
          </div>

          <button className="btn-primary launch-button" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? copy.analyzing : copy.analyze}
          </button>

          <div className="upload-footnote">{copy.footnote}</div>
        </section>
      </div>
    </div>
  );
}
