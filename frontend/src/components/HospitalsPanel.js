import React, { useState, useCallback, useEffect } from 'react';
import { findHospitals, getCachedUITranslations, getUITranslations } from '../utils/api';

const BASE_COPY = {
  enterCity: 'Please enter your city or area.',
  loadFail: 'Could not load hospitals.',
  geoUnsupported: 'Location access is not supported by your browser.',
  geoBlocked: 'Location access was blocked. Please type your city or area.',
  title: 'Find nearby care',
  description: 'Search for a suitable doctor or hospital near the patient.',
  detect: 'Detecting location...',
  useLocation: 'Use current location',
  placeholder: 'City, area, or pincode',
  searching: 'Searching',
  search: 'Search',
  noListings: 'No hospital listings were found for that area. Try a nearby city name.',
  phone: 'Phone',
  hours: 'Hours',
  openMaps: 'Open in Maps',
};

const LANGUAGE_COPY = {
  Tamil: {
    enterCity: 'உங்கள் நகரம் அல்லது பகுதியை உள்ளிடவும்.',
    loadFail: 'மருத்துவமனைகளை ஏற்ற முடியவில்லை.',
    geoUnsupported: 'உங்கள் உலாவி இடம் கண்டறிதலை ஆதரிக்கவில்லை.',
    geoBlocked: 'இடம் அணுகல் தடுக்கப்பட்டது. உங்கள் நகரம் அல்லது பகுதியை உள்ளிடவும்.',
    title: 'அருகிலுள்ள சிகிச்சையைத் தேடுங்கள்',
    description: 'நோயாளிக்கு ஏற்ற மருத்துவர் அல்லது மருத்துவமனையை அருகிலுள்ள பகுதியில் தேடுங்கள்.',
    detect: 'இடத்தை கண்டறிகிறது...',
    useLocation: 'தற்போதைய இடத்தை பயன்படுத்தவும்',
    placeholder: 'நகரம், பகுதி அல்லது அஞ்சல் குறியீடு',
    searching: 'தேடல்',
    search: 'தேடவும்',
    noListings: 'அந்த பகுதியில் மருத்துவமனை தகவல்கள் கிடைக்கவில்லை. அருகிலுள்ள நகரத்தின் பெயரை முயற்சிக்கவும்.',
    phone: 'தொலைபேசி',
    hours: 'நேரம்',
    openMaps: 'வரைபடத்தில் திறக்கவும்',
  },
};

function getBaseCopy(language) {
  return { ...BASE_COPY, ...(LANGUAGE_COPY[language] || {}) };
}

function formatHospitalName(name, pronunciation) {
  return {
    primary: name,
    secondary: pronunciation && pronunciation !== name ? `(${pronunciation})` : '',
  };
}

function getHospitalHelperText(hospital, copy, language) {
  const phoneLabel = hospital.phoneLabel || copy.phone;
  const hoursLabel = hospital.hoursLabel || copy.hours;
  const appointment = language === 'Tamil'
    ? 'முன்கூட்டியே அழைத்து முன்பதிவு விவரங்களை சரிபார்க்கவும்'
    : hospital.appointment;

  return {
    phoneLabel,
    hoursLabel,
    appointment,
    phoneValue: hospital.phone,
    hoursValue: hospital.hours,
  };
}

export default function HospitalsPanel({ sessionId, specialist, language }) {
  const [hospitals, setHospitals] = useState([]);
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [copy, setCopy] = useState(() => getCachedUITranslations(language, getBaseCopy(language)));
  const [loadingDots, setLoadingDots] = useState('.');

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

  useEffect(() => {
    if (!loading) {
      setLoadingDots('.');
      return undefined;
    }
    const interval = window.setInterval(() => {
      setLoadingDots((current) => (current === '...' ? '.' : `${current}.`));
    }, 360);
    return () => window.clearInterval(interval);
  }, [loading]);

  const doSearch = useCallback(async (loc) => {
    if (!loc?.trim()) {
      setError(copy.enterCity);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await findHospitals(loc.trim(), specialist || 'General Physician', language, sessionId);
      setHospitals(data.hospitals || []);
      setSearched(true);
    } catch (e) {
      setError(`${copy.loadFail} ${e.message || ''}`.trim());
    } finally {
      setLoading(false);
    }
  }, [copy.enterCity, copy.loadFail, language, sessionId, specialist]);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError(copy.geoUnsupported);
      return;
    }
    setGeoLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const locStr = `${pos.coords.latitude.toFixed(4)},${pos.coords.longitude.toFixed(4)}`;
        setLocation(locStr);
        setGeoLoading(false);
        doSearch(locStr);
      },
      () => {
        setGeoLoading(false);
        setError(copy.geoBlocked);
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  }, [copy.geoBlocked, copy.geoUnsupported, doSearch]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card" style={{ padding: 18 }}>
        <div className="section-title">{copy.title}</div>
        <div className="plain-note" style={{ marginBottom: 14 }}>
          {copy.description}
        </div>

        <div className="quick-actions" style={{ marginBottom: 14 }}>
          <button className="btn-ghost" onClick={useMyLocation} disabled={geoLoading || loading}>
            {geoLoading ? copy.detect : copy.useLocation}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
          <input
            className="input-base"
            style={{ flex: 1, minWidth: 0 }}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch(location)}
            placeholder={copy.placeholder}
          />
          <button
            className="btn-primary"
            style={{ flexShrink: 0, minWidth: 72, whiteSpace: 'normal', lineHeight: 1.2 }}
            onClick={() => doSearch(location)}
            disabled={loading || !location.trim()}
          >
            {loading ? `${copy.searching}${loadingDots}` : copy.search}
          </button>
        </div>

        {error && <div className="error-banner" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      {searched && !loading && hospitals.length === 0 && (
        <div className="card" style={{ padding: 18 }}>
          <div className="plain-note">{copy.noListings}</div>
        </div>
      )}

      {!!hospitals.length && (
        <div className="hospital-list">
          {hospitals.map((hospital, index) => {
            const helper = getHospitalHelperText(hospital, copy, language);
            const hospitalName = formatHospitalName(hospital.name, hospital.namePronunciation);
            return (
              <div key={`${hospital.name}-${index}`} className="hospital-card animate-fadeUp">
                <div className="hospital-head">
                  <div>
                    <strong>{hospitalName.primary}</strong>
                    {hospitalName.secondary && (
                      <div className="hospital-meta hospital-pronunciation" style={{ marginTop: 3 }}>
                        {hospitalName.secondary}
                      </div>
                    )}
                  </div>
                  {hospital.distance && <span className="mini-pill" style={{ flexShrink: 0 }}>{hospital.distance}</span>}
                </div>
                <div className="hospital-meta" style={{ marginTop: 10 }}>{hospital.address}</div>
                <div className="mini-stats" style={{ marginTop: 12 }}>
                  {helper.phoneValue && <span className="signal-pill">{helper.phoneLabel}: {helper.phoneValue}</span>}
                  {helper.hoursValue && <span className="signal-pill">{helper.hoursLabel}: {helper.hoursValue}</span>}
                  {helper.appointment && <span className="signal-pill">{helper.appointment}</span>}
                </div>
                {hospital.mapsUrl && (
                  <a
                    href={hospital.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost"
                    style={{ display: 'inline-flex', marginTop: 14, textDecoration: 'none' }}
                  >
                    {hospital.openMapsLabel || copy.openMaps}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
