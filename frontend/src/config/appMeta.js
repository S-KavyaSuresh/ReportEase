export const APP_VERSION = '2.1.0';

export const DISTRIBUTION_URLS = {
  windowsInstaller: process.env.REACT_APP_WINDOWS_INSTALLER_URL || '',
  androidApk: process.env.REACT_APP_ANDROID_APK_URL || '',
};

export function getWebInstallState() {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  const navigatorStandalone = window.navigator?.standalone === true;
  return Boolean(standalone || navigatorStandalone);
}

export function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}
