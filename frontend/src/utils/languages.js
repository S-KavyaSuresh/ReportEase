export const LANGUAGE_OPTIONS = [
  { value: 'English', label: 'English' },
  { value: 'Tamil', label: 'தமிழ் / Tamil' },
  { value: 'Hindi', label: 'हिन्दी / Hindi' },
  { value: 'Malayalam', label: 'മലയാളം / Malayalam' },
  { value: 'Telugu', label: 'తెలుగు / Telugu' },
  { value: 'Kannada', label: 'ಕನ್ನಡ / Kannada' },
  { value: 'Bengali', label: 'বাংলা / Bengali' },
  { value: 'Marathi', label: 'मराठी / Marathi' },
  { value: 'Gujarati', label: 'ગુજરાતી / Gujarati' },
  { value: 'Punjabi', label: 'ਪੰਜਾਬੀ / Punjabi' },
  { value: 'Urdu', label: 'اردو / Urdu' },
  { value: 'Spanish', label: 'Español / Spanish' },
  { value: 'French', label: 'Français / French' },
  { value: 'German', label: 'Deutsch / German' },
  { value: 'Italian', label: 'Italiano / Italian' },
  { value: 'Dutch', label: 'Nederlands / Dutch' },
  { value: 'Portuguese', label: 'Português / Portuguese' },
  { value: 'Polish', label: 'Polski / Polish' },
  { value: 'Turkish', label: 'Türkçe / Turkish' },
  { value: 'Russian', label: 'Русский / Russian' },
  { value: 'Arabic', label: 'العربية / Arabic' },
  { value: 'Chinese', label: '中文 / Chinese' },
  { value: 'Japanese', label: '日本語 / Japanese' },
  { value: 'Korean', label: '한국어 / Korean' },
];

export function getLanguageDisplayName(language = 'English') {
  return LANGUAGE_OPTIONS.find((item) => item.value === language)?.label || language;
}
