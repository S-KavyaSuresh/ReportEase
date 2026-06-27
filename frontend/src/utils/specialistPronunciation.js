const SPECIALIST_PRONUNCIATIONS = {
  'Gastroenterologist': {
    Tamil: 'காஸ்ட்ரோஎன்டராலஜிஸ்ட்',
    Malayalam: 'ഗാസ്ട്രോഎൻററോളജിസ്റ്റ്',
    Hindi: 'गैस्ट्रोएंटरोलॉजिस्ट',
  },
  'Hepatologist': {
    Tamil: 'ஹெபடாலஜிஸ்ட்',
    Malayalam: 'ഹെപറ്റോളജിസ്റ്റ്',
    Hindi: 'हेपेटोलॉजिस्ट',
  },
  'General Physician': {
    Tamil: 'ஜெனரல் பிஸிஷியன்',
    Malayalam: 'ജനറൽ ഫിസിഷ്യൻ',
    Hindi: 'जनरल फिज़िशियन',
  },
  'Hematologist': {
    Tamil: 'ஹீமாட்டாலஜிஸ்ட்',
    Malayalam: 'ഹീമറ്റോളജിസ്റ്റ്',
    Hindi: 'हीमैटोलॉजिस्ट',
  },
  'Cardiologist': {
    Tamil: 'கார்டியாலஜிஸ்ட்',
    Malayalam: 'കാർഡിയോളജിസ്റ്റ്',
    Hindi: 'कार्डियोलॉजिस्ट',
  },
  'Diabetologist': {
    Tamil: 'டயபடாலஜிஸ்ட்',
    Malayalam: 'ഡയബറ്റോളജിസ്റ്റ്',
    Hindi: 'डायबेटोलॉजिस्ट',
  },
  'Endocrinologist': {
    Tamil: 'எண்டோகிரினாலஜிஸ்ட்',
    Malayalam: 'എൻഡോക്രിനോളജിസ്റ്റ്',
    Hindi: 'एंडोक्रिनोलॉजिस्ट',
  },
};

function formatSingleSpecialist(name, language) {
  const specialist = String(name || '').trim();
  if (!specialist) return '';
  const pronunciation = SPECIALIST_PRONUNCIATIONS[specialist]?.[language];
  return pronunciation ? `${specialist} (${pronunciation})` : specialist;
}

export function formatSpecialistWithPronunciation(specialist, language = 'English') {
  if (!specialist) return '-';
  return String(specialist)
    .split('/')
    .map((part) => formatSingleSpecialist(part, language))
    .filter(Boolean)
    .join(' / ');
}
