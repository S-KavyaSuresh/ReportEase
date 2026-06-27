import React, { useEffect, useState } from 'react';
import { getCachedUITranslations, getUITranslations } from '../utils/api';
import { getInstallContext, subscribeToInstallPrompt } from '../utils/install';
import { getBrandPronunciation } from '../utils/brand';

const BASE_COPY = {
  title: 'Install App',
  body: 'Choose PC, Mobile, or Web App setup.',
  action: 'Install App',
  dismiss: 'Dismiss',
};

const LANGUAGE_COPY = {
  Tamil: {
    title: 'செயலியை நிறுவவும்',
    body: 'PC, மொபைல் அல்லது Web App நிறுவலை தேர்வு செய்யவும்.',
    action: 'செயலியை நிறுவவும்',
    dismiss: 'மூடு',
  },
  Hindi: {
    body: 'PC, मोबाइल या Web App इंस्टॉल विकल्प चुनें।',
  },
};

function getBaseCopy(language) {
  return { ...BASE_COPY, ...(LANGUAGE_COPY[language] || {}) };
}

export default function InstallPrompt({ onNavigate, language = 'English' }) {
  const [installState, setInstallState] = useState(getInstallContext);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('pwa-install-dismissed') === '1'
  );
  const [copy, setCopy] = useState(() => getCachedUITranslations(language, getBaseCopy(language)));
  const brandPronunciation = getBrandPronunciation(language);

  useEffect(() => subscribeToInstallPrompt(setInstallState), []);

  useEffect(() => {
    let active = true;
    const fallbackCopy = getBaseCopy(language);
    setCopy(fallbackCopy);
    getUITranslations(language, BASE_COPY)
      .then((data) => {
        if (!active) return;
        const translations = data.translations || {};
        setCopy(language === 'Tamil' ? { ...translations, ...fallbackCopy } : { ...fallbackCopy, ...translations });
      })
      .catch(() => active && setCopy(fallbackCopy));
    return () => { active = false; };
  }, [language]);

  const dismiss = () => {
    sessionStorage.setItem('pwa-install-dismissed', '1');
    setDismissed(true);
  };

  if (installState.isStandalone || dismissed) return null;
  if (!installState.installPrompt && !installState.isIOS) return null;

  return (
    <div className="install-banner">
      <img src="/icon-192.png" alt="ReportEase" className="install-banner-icon" />
      <div className="install-banner-copy">
        <div className="install-banner-title">
          <span className="brand-lockup">
            <span className="brand-lockup-main">ReportEase</span>
            {brandPronunciation ? <span className="brand-lockup-sub"> - {brandPronunciation}</span> : null}
          </span>
        </div>
        <div className="install-banner-body">{copy.body}</div>
      </div>
      <div className="install-banner-actions">
        <button
          className="btn-primary install-banner-btn"
          onClick={() => onNavigate?.('/install-app')}
        >
          {copy.action}
        </button>
        <button
          className="install-banner-close"
          onClick={dismiss}
          aria-label={copy.dismiss}
          title={copy.dismiss}
        >
          x
        </button>
      </div>
    </div>
  );
}
