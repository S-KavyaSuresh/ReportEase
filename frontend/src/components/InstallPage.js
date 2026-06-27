import React, { useEffect, useMemo, useState } from 'react';
import { getCachedUITranslations, getUITranslations } from '../utils/api';
import { APP_VERSION, DISTRIBUTION_URLS } from '../config/appMeta';
import { getInstallContext, subscribeToInstallPrompt, triggerWebInstall } from '../utils/install';
import { getBrandPronunciation } from '../utils/brand';

const WINDOWS_INSTALLER_URL =
  'https://github.com/S-KavyaSuresh/ReportEase/releases/download/v2.1.0/ReportEase.Setup.2.1.0.exe';

const ANDROID_APK_URL =
  'https://github.com/S-KavyaSuresh/ReportEase/releases/download/v2.1.0/ReportEase-Android.apk';

const WEB_APP_URL = 'https://report-ease-flame.vercel.app';

function getSafeDistributionUrl(value, fallback) {
  if (!value || typeof value !== 'string') return fallback;
  if (value.includes('REPLACE_WITH')) return fallback;
  return value;
}

const FINAL_DISTRIBUTION_URLS = {
  windowsInstaller: getSafeDistributionUrl(DISTRIBUTION_URLS?.windowsInstaller, WINDOWS_INSTALLER_URL),
  androidApk: getSafeDistributionUrl(DISTRIBUTION_URLS?.androidApk, ANDROID_APK_URL),
  webApp: getSafeDistributionUrl(DISTRIBUTION_URLS?.webApp, WEB_APP_URL),
};

const PLATFORM_OPTIONS = [
  { key: 'windows', labelKey: 'pcTab' },
  { key: 'android', labelKey: 'mobileTab' },
  { key: 'web', labelKey: 'webTab' },
];

const BASE_COPY = {
  title: 'Install App',
  description: 'Install ReportEase on the device that works best for you.',
  currentVersion: 'Current version',
  pcTab: 'Install for PC',
  mobileTab: 'Install for Mobile',
  webTab: 'Install Web App',
  windowsTitle: 'Install for PC',
  windowsDesc: 'Download the Windows installer for the full desktop app experience.',
  androidTitle: 'Install for Mobile',
  androidDesc: 'Download the Android app file and install it on your phone or tablet.',
  webTitle: 'Install Web App',
  webDesc: 'Add ReportEase to your device for quick app-like access from your browser.',
  installed: 'Installed',
  comingSoon: 'Coming Soon',
  useShareMenu: 'Use Share menu',
  installUnavailable: 'Install not available in this browser right now.',
  downloadPc: 'Download for PC',
  downloadMobile: 'Download for Mobile',
  installWeb: 'Install Web App',
  openWeb: 'Open Web App',
  iosHint: 'On iPhone or iPad, open Share and choose Add to Home Screen.',
  windowsSteps: [
    'Click Download for PC',
    'Open the downloaded installer file',
    'Follow the setup steps',
    'Open ReportEase from your desktop or Start Menu',
  ],
  androidSteps: [
    'Click Download for Mobile',
    'Open the downloaded APK file',
    'Allow installation if Android asks for permission',
    'Tap Install and open ReportEase from your app list',
  ],
  webSteps: [
    'Click Install Web App if the button is available',
    'Confirm installation when your browser asks',
    'Open ReportEase from your home screen or desktop',
  ],
};

const LANGUAGE_COPY = {
  Tamil: {
    title: 'செயலியை நிறுவவும்',
    description: 'உங்கள் சாதனத்திற்கு ஏற்ப ReportEase செயலியை நிறுவுங்கள்.',
    currentVersion: 'தற்போதைய பதிப்பு',
    pcTab: 'கணினியில் நிறுவவும்',
    mobileTab: 'மொபைலில் நிறுவவும்',
    webTab: 'Web App நிறுவவும்',
    windowsTitle: 'கணினியில் நிறுவவும்',
    windowsDesc: 'முழு டெஸ்க்டாப் அனுபவத்திற்காக Windows நிறுவல் கோப்பை பதிவிறக்கவும்.',
    androidTitle: 'மொபைலில் நிறுவவும்',
    androidDesc: 'Android செயலியை பதிவிறக்கி உங்கள் மொபைல் அல்லது டேப்லெட்டில் நிறுவுங்கள்.',
    webTitle: 'Web App நிறுவவும்',
    webDesc: 'உங்கள் உலாவியில் இருந்து விரைவாக திறக்க ReportEase-ஐ உங்கள் சாதனத்தில் சேர்க்கவும்.',
    installed: 'நிறுவப்பட்டுள்ளது',
    comingSoon: 'விரைவில் கிடைக்கும்',
    useShareMenu: 'Share பட்டியை பயன்படுத்தவும்',
    installUnavailable: 'இந்த உலாவியில் இப்போது நிறுவல் கிடைக்கவில்லை.',
    downloadPc: 'கணினிக்காக பதிவிறக்கவும்',
    downloadMobile: 'மொபைலுக்காக பதிவிறக்கவும்',
    installWeb: 'Web App நிறுவவும்',
    openWeb: 'Web App திறக்கவும்',
    iosHint: 'iPhone அல்லது iPad-ல் Share-ஐ திறந்து Add to Home Screen என்பதை தேர்வு செய்யவும்.',
    windowsSteps: [
      'கணினிக்காக பதிவிறக்கவும் என்பதை அழுத்தவும்',
      'பதிவிறக்கப்பட்ட நிறுவல் கோப்பை திறக்கவும்',
      'நிறுவல் படிகளை பின்பற்றவும்',
      'Desktop அல்லது Start Menu-இல் இருந்து ReportEase-ஐ திறக்கவும்',
    ],
    androidSteps: [
      'மொபைலுக்காக பதிவிறக்கவும் என்பதை அழுத்தவும்',
      'பதிவிறக்கப்பட்ட APK கோப்பை திறக்கவும்',
      'Android அனுமதி கேட்டால் அனுமதிக்கவும்',
      'Install என்பதைத் தட்டி ReportEase-ஐ திறக்கவும்',
    ],
    webSteps: [
      'Web App நிறுவவும் என்பதை அழுத்தவும்',
      'உலாவி கேட்கும் போது நிறுவலை உறுதிப்படுத்தவும்',
      'Home screen அல்லது desktop-இல் இருந்து ReportEase-ஐ திறக்கவும்',
    ],
  },
};

function getBaseCopy(language) {
  return { ...BASE_COPY, ...(LANGUAGE_COPY[language] || {}) };
}

function PlatformCard({ title, description, version, action, stateLabel, steps }) {
  return (
    <section className="install-card">
      <div className="install-card-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="install-version-badge">{version}</div>
      </div>

      <div className="install-card-actions">
        {action ? <div>{action}</div> : null}
        {stateLabel ? <span className="install-state-badge">{stateLabel}</span> : null}
      </div>

      <ol className="install-steps">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}

export default function InstallPage({ language = 'English' }) {
  const [selectedPlatform, setSelectedPlatform] = useState('windows');
  const [installState, setInstallState] = useState(getInstallContext);
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

        if (language === 'Tamil') {
          setCopy({ ...translations, ...fallbackCopy });
        } else {
          setCopy({ ...fallbackCopy, ...translations });
        }
      })
      .catch(() => {
        if (active) setCopy(fallbackCopy);
      });

    return () => {
      active = false;
    };
  }, [language]);

  const canInstallWeb = Boolean(installState.installPrompt);

  const platformMeta = useMemo(
    () => ({
      windows: {
        title: copy.windowsTitle,
        description: copy.windowsDesc,
        version: `v${APP_VERSION}`,
        action: FINAL_DISTRIBUTION_URLS.windowsInstaller ? (
          <a
            className="btn-primary install-action-btn"
            href={FINAL_DISTRIBUTION_URLS.windowsInstaller}
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy.downloadPc}
          </a>
        ) : (
          <button className="btn-ghost install-action-btn" disabled>
            {copy.comingSoon}
          </button>
        ),
        stateLabel: '',
        steps: copy.windowsSteps,
      },

      android: {
        title: copy.androidTitle,
        description: copy.androidDesc,
        version: `v${APP_VERSION}`,
        action: FINAL_DISTRIBUTION_URLS.androidApk ? (
          <a
            className="btn-primary install-action-btn"
            href={FINAL_DISTRIBUTION_URLS.androidApk}
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy.downloadMobile}
          </a>
        ) : (
          <button className="btn-ghost install-action-btn" disabled>
            {copy.comingSoon}
          </button>
        ),
        stateLabel: '',
        steps: copy.androidSteps,
      },

      web: {
        title: copy.webTitle,
        description: installState.isIOS ? `${copy.webDesc} ${copy.iosHint}` : copy.webDesc,
        version: `v${APP_VERSION}`,
        action: installState.isInstalled ? (
          <a
            className="btn-primary install-action-btn"
            href={FINAL_DISTRIBUTION_URLS.webApp}
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy.openWeb}
          </a>
        ) : installState.isIOS ? null : canInstallWeb ? (
          <button
            className="btn-primary install-action-btn"
            onClick={async () => {
              await triggerWebInstall(installState.installPrompt);
              setInstallState(getInstallContext());
            }}
          >
            {copy.installWeb}
          </button>
        ) : (
          <a
            className="btn-primary install-action-btn"
            href={FINAL_DISTRIBUTION_URLS.webApp}
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy.openWeb}
          </a>
        ),
        stateLabel: installState.isInstalled ? copy.installed : installState.isIOS ? copy.useShareMenu : '',
        steps: copy.webSteps,
      },
    }),
    [canInstallWeb, copy, installState]
  );

  const selected = platformMeta[selectedPlatform];

  return (
    <div className="install-page">
      <section className="install-hero card">
        <div>
          <img
            src="/icon-192.png"
            alt="ReportEase"
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              marginBottom: 12,
            }}
          />

          <div className="install-eyebrow">
            <span className="brand-lockup">
              <span className="brand-lockup-main">ReportEase</span>
              {brandPronunciation ? <span className="brand-lockup-sub"> - {brandPronunciation}</span> : null}
            </span>
            <span className="install-version-inline">v{APP_VERSION}</span>
          </div>

          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>

        <div className="install-hero-side">
          <span>{copy.currentVersion}</span>
          <strong>v{APP_VERSION}</strong>
        </div>
      </section>

      <section className="install-platforms card">
        <div className="install-platform-tabs">
          {PLATFORM_OPTIONS.map((platform) => (
            <button
              key={platform.key}
              className={`install-platform-tab${selectedPlatform === platform.key ? ' active' : ''}`}
              onClick={() => setSelectedPlatform(platform.key)}
              type="button"
            >
              {copy[platform.labelKey] || BASE_COPY[platform.labelKey]}
            </button>
          ))}
        </div>

        <PlatformCard {...selected} />
      </section>
    </div>
  );
}