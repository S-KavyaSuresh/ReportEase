export const BRAND_PRONUNCIATION = {
  Tamil: 'ரிப்போர்ட்டீஸ்',
  Malayalam: 'റിപ്പോർട്ടീസ്',
  Hindi: 'रिपोर्टईज़',
  Telugu: 'రిపోర్టీజ్',
  Kannada: 'ರಿಪೋರ್ಟೀಸ್',
};

export function getBrandPronunciation(language = 'English') {
  return BRAND_PRONUNCIATION[language] || '';
}
