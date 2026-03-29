import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { findHospitals } from '../utils/api';
import { useApp } from '../context/AppContext';
import { getT } from '../utils/translations';

function normalizePhone(phone) {
  const clean = (phone || '').replace(/[^\d+]/g, '');
  return clean.length >= 8 ? clean : '';
}

function buildBookingUrl(hospital, specialist, location) {
  const query = encodeURIComponent(`${hospital.name} ${specialist} appointment ${location || ''}`.trim());
  return `https://www.google.com/search?q=${query}`;
}

function buildMapsSearch(name, address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address || ''}`.trim())}`;
}

export default function HospitalsCard({ specialist }) {
  const { language, sessionId } = useApp();
  const t = getT(language);
  const [location, setLocation] = useState('');
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`,
          { headers: { 'User-Agent': 'ReportEase/1.0' } }
        );
        const d = await r.json();
        const city = d.address.city || d.address.town || d.address.village || '';
        const state = d.address.state || '';
        const loc = city + (state ? `, ${state}` : '');
        if (loc) {
          setLocation(loc);
          doSearch(loc);
        }
      } catch (_) {}
    }, () => {});
  }, []); // eslint-disable-line

  const doSearch = async (loc) => {
    const target = (loc || location).trim();
    if (!target) return;
    setLoading(true);
    setSearched(false);
    try {
      const res = await findHospitals({ location: target, specialist, language, session_id: sessionId });
      setHospitals(res.data.hospitals || []);
    } catch (_) {
      setHospitals([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  return (
    <div>
      <div style={{ display:'flex', gap:8, alignItems:'center', padding:'8px 12px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:28, marginBottom:14 }}>
        <span>📍</span>
        <input
          style={{ flex:1, background:'none', border:'none', color:'var(--text)', fontFamily:'var(--font-body)', fontSize:'0.85rem', outline:'none' }}
          placeholder={t.hospitalsEnterCity}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
        />
        <motion.button whileHover={{ scale:1.15 }}
          onClick={() => navigator.geolocation?.getCurrentPosition(async (pos) => {
            try {
              const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`, { headers:{ 'User-Agent':'ReportEase/1.0' } });
              const d = await r.json();
              const loc = (d.address.city || d.address.town || d.address.village || '') + (d.address.state ? `, ${d.address.state}` : '');
              setLocation(loc);
              doSearch(loc);
            } catch (_) {}
          })}
          style={{ background:'none', border:'none', color:'var(--primary)', cursor:'pointer', fontSize:'1rem' }}
        >🎯</motion.button>
        <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }} onClick={() => doSearch()}
          style={{ background:'var(--primary)', border:'none', color:'#fff', padding:'5px 14px', borderRadius:16, fontSize:'0.78rem', fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)' }}
        >🔍</motion.button>
      </div>

      {loading && (
        <div style={{ textAlign:'center', padding:20, color:'var(--text2)', fontSize:'0.85rem' }}>
          <div className="spinner" style={{ margin:'0 auto 12px' }} />
          {t.hospitalsSearching}
        </div>
      )}

      {!loading && hospitals.length > 0 && (
        <div style={{ display:'grid', gap:10 }}>
          {hospitals.map((hospital, i) => {
            const mapsUrl = hospital.mapsUrl || buildMapsSearch(hospital.name, hospital.address);
            const bookingUrl = buildBookingUrl(hospital, specialist, location);
            const phone = normalizePhone(hospital.phone);

            return (
              <motion.div key={`${hospital.name}-${i}`}
                initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                transition={{ delay: i * 0.07 }}
                style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:14, padding:14 }}
              >
                <div style={{ fontWeight:600, fontSize:'0.92rem', color:'var(--primary)', marginBottom:8 }}>
                  🏥 {hospital.name}
                </div>

                {hospital.address && (
                  <div style={{ display:'flex', gap:8, fontSize:'0.8rem', color:'var(--text2)', marginBottom:4, lineHeight:1.5 }}>
                    <span>📍</span>
                    <span>{hospital.address}</span>
                  </div>
                )}
                {hospital.distance && hospital.distance !== '—' && (
                  <div style={{ display:'flex', gap:8, fontSize:'0.8rem', color:'var(--text2)', marginBottom:4, lineHeight:1.5 }}>
                    <span>📏</span>
                    <span>{hospital.distance}</span>
                  </div>
                )}
                {hospital.hours && (
                  <div style={{ display:'flex', gap:8, fontSize:'0.8rem', color:'var(--text2)', marginBottom:4, lineHeight:1.5 }}>
                    <span>🕐</span>
                    <span>{hospital.hours}</span>
                  </div>
                )}
                {phone ? (
                  <div style={{ display:'flex', gap:8, fontSize:'0.8rem', color:'var(--text2)', marginBottom:6, lineHeight:1.5 }}>
                    <span>📞</span>
                    <span>{phone}</span>
                  </div>
                ) : (
                  <div style={{ fontSize:'0.76rem', color:'var(--text3)', marginBottom:6 }}>
                    📞 {t.phoneOnMaps}
                  </div>
                )}

                <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'6px 12px', background:'rgba(129,140,248,0.08)', border:'1px solid rgba(129,140,248,0.25)', color:'var(--primary)', borderRadius:16, fontSize:'0.75rem', textDecoration:'none' }}
                  >
                    {t.hospitalsOpenMaps}
                  </a>

                  <a href={bookingUrl} target="_blank" rel="noopener noreferrer"
                    style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'6px 12px', background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.25)', color:'var(--green)', borderRadius:16, fontSize:'0.75rem', textDecoration:'none' }}
                  >
                    📅 {t.bookAppt}
                  </a>

                  {phone && (
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(phone);
                        } catch (_) {}
                        window.location.href = `tel:${phone}`;
                      }}
                      style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'6px 12px', background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.25)', color:'var(--yellow)', borderRadius:16, fontSize:'0.75rem', cursor:'pointer' }}
                    >
                      📞 {t.callBtn}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {!loading && searched && hospitals.length === 0 && (
        <div style={{ textAlign:'center', padding:16 }}>
          <a href={buildMapsSearch(`${specialist} hospital`, location)} target="_blank" rel="noopener noreferrer"
            style={{ color:'var(--primary)', textDecoration:'none', fontSize:'0.85rem' }}
          >🔍 Search on Google Maps →</a>
        </div>
      )}

      {!loading && !searched && (
        <div style={{ color:'var(--text3)', fontSize:'0.82rem', textAlign:'center', padding:16 }}>
          {t.hospitalsEnterCity}
        </div>
      )}
    </div>
  );
}
