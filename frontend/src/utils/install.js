import { getWebInstallState, isIOSDevice } from '../config/appMeta';

const INSTALL_HINT_KEY = 're_install_hint';

function getInstalledHint() {
  try {
    return window.localStorage.getItem(INSTALL_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function setInstalledHint(value) {
  try {
    if (value) {
      window.localStorage.setItem(INSTALL_HINT_KEY, '1');
    } else {
      window.localStorage.removeItem(INSTALL_HINT_KEY);
    }
  } catch {
    // Ignore storage access failures.
  }
}

export function getInstallContext() {
  return {
    isStandalone: getWebInstallState(),
    isIOS: isIOSDevice(),
    installPrompt: window._pwaInstallPrompt || null,
    isInstalled: getWebInstallState() || getInstalledHint(),
  };
}

export async function triggerWebInstall(installPrompt) {
  if (!installPrompt) return { outcome: 'unavailable' };
  installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  if (choice?.outcome === 'accepted') {
    window._pwaInstallPrompt = null;
    setInstalledHint(true);
  }
  return choice || { outcome: 'dismissed' };
}

export function subscribeToInstallPrompt(callback) {
  const emit = () => callback(getInstallContext());
  const handleReady = () => {
    if (window._pwaInstallPrompt) {
      setInstalledHint(false);
    }
    emit();
  };
  const handleInstalled = () => {
    setInstalledHint(true);
    emit();
  };
  window.addEventListener('pwaInstallReady', handleReady);
  window.addEventListener('appinstalled', handleInstalled);
  return () => {
    window.removeEventListener('pwaInstallReady', handleReady);
    window.removeEventListener('appinstalled', handleInstalled);
  };
}
