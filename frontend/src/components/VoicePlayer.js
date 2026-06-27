import React, { useState, useEffect, useCallback, useRef } from 'react';
import voiceEngine from '../utils/voice';
import { getCachedUITranslations, getUITranslations } from '../utils/api';

let playerCount = 0;

const BASE_COPY = {
  done: 'Done',
  paused: 'Paused',
  play: 'Play',
  pause: 'Pause',
  resume: 'Resume',
  stop: 'Stop',
  restart: 'Start over',
  finished: 'Finished',
  speed: 'Speed',
  jumpTo: 'Jump to part',
  preparingAudio: 'Preparing audio...',
};

const LANGUAGE_COPY = {
  Tamil: {
    done: 'முடிந்தது',
    paused: 'இடைநிறுத்தப்பட்டது',
    play: 'இயக்கு',
    pause: 'இடைநிறுத்து',
    resume: 'தொடரவும்',
    stop: 'நிறுத்து',
    restart: 'மீண்டும் தொடங்கு',
    finished: 'முழுமைபெற்றது',
    speed: 'வேகம்',
    jumpTo: 'இந்த பகுதிக்கு செல்லவும்',
    preparingAudio: 'ஒலியை தயார் செய்கிறது...',
  },
};

function getBaseCopy(language) {
  return { ...BASE_COPY, ...(LANGUAGE_COPY[language] || {}) };
}

const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 0.9, label: '0.9x' },
  { value: 1.0, label: '1x' },
  { value: 1.2, label: '1.2x' },
  { value: 1.5, label: '1.5x' },
  { value: 2.0, label: '2x' },
];

export default function VoicePlayer({ text, language, label = 'Listen', partTitles = [] }) {
  const ownerId = useRef(`vp_${++playerCount}`).current;
  const [state, setState] = useState('idle');
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [rate, setRate] = useState(1.0);
  const [copy, setCopy] = useState(() => getCachedUITranslations(language, getBaseCopy(language)));
  const [showNav, setShowNav] = useState(true);
  const prevTextRef = useRef(text);

  useEffect(() => {
    const unsub = voiceEngine.subscribe(ownerId, (s, i, t) => {
      setState(s);
      setIndex(i);
      setTotal(t);
    });
    return unsub;
  }, [ownerId]);

  useEffect(() => {
    if (prevTextRef.current !== text) {
      voiceEngine.stop();
      setState('idle');
      setIndex(0);
      setTotal(0);
      setRate(1.0);
      setShowNav(true);
      voiceEngine.setRate(1.0);
      prevTextRef.current = text;
    }
  }, [text]);

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

  const handlePlay = useCallback(() => voiceEngine.play(ownerId, text, language), [ownerId, text, language]);
  const handlePause = useCallback(() => voiceEngine.pause(), []);
  const handleResume = useCallback(() => voiceEngine.resume(), []);
  const handleStop = useCallback(() => { voiceEngine.stop(); setShowNav(false); }, []);
  const handleRestart = useCallback(() => { voiceEngine.restart(ownerId, text, language); setShowNav(false); }, [ownerId, text, language]);
  const handleJumpTo = useCallback((partIndex) => {
    voiceEngine.jumpTo(ownerId, text, language, partIndex);
  }, [ownerId, text, language]);

  const displayIndex = Math.min(index + 1, total);
  const pct = total > 0 ? Math.round((index / total) * 100) : 0;
  const isSpeaking = state === 'playing';
  const isPreparing = state === 'loading';
  const isPaused = state === 'paused';
  const isDone = state === 'done';
  const isIdle = state === 'idle';
  const stateLabel = isPreparing ? copy.preparingAudio : isSpeaking ? label : isDone ? copy.done : isPaused ? copy.paused : label;
  const sentences = voiceEngine.getSentences();

  return (
    <div className={`voice-player${(isSpeaking || isPreparing) ? ' speaking' : ''}`}>
      <div className="vp-top-row">
        <span className={`vp-label${(isSpeaking || isPreparing) ? ' vp-speaking-label' : ''}`}>{stateLabel}</span>

        <div className="vp-controls">
          {(isIdle || isDone) && (
            <button className="vp-btn play" onClick={handlePlay} title={copy.play}>
              {copy.play}
            </button>
          )}
          {isPreparing && (
            <button className="vp-btn pause" disabled title={copy.preparingAudio}>
              {copy.preparingAudio}
            </button>
          )}
          {isSpeaking && (
            <button className="vp-btn pause" onClick={handlePause} title={copy.pause}>
              {copy.pause}
            </button>
          )}
          {isPaused && (
            <button className="vp-btn play" onClick={handleResume} title={copy.resume}>
              {copy.resume}
            </button>
          )}
          <button className="vp-btn stop" onClick={handleStop} disabled={isIdle} title={copy.stop}>{copy.stop}</button>
          <button className="vp-btn replay" onClick={handleRestart} disabled={isIdle && index === 0} title={copy.restart}>{copy.restart}</button>
          {total > 1 && (
            <button
              className={`vp-btn nav-toggle${showNav ? ' active' : ''}`}
              onClick={() => setShowNav((v) => !v)}
              title={copy.jumpTo}
            >
              {copy.jumpTo}
            </button>
          )}
        </div>
      </div>

      {total > 0 && (
        <div className="vp-progress">
          <div
            className="vp-bar"
            onClick={(e) => {
              if (total < 2) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const fraction = (e.clientX - rect.left) / rect.width;
              const targetIndex = Math.floor(fraction * total);
              handleJumpTo(Math.max(0, Math.min(targetIndex, total - 1)));
            }}
            style={{ cursor: total > 1 ? 'pointer' : 'default' }}
          >
            <div className="vp-fill" style={{ width: isDone ? '100%' : `${pct}%` }} />
          </div>
          <div className="vp-info">{isDone ? copy.finished : `${displayIndex} / ${total}`}</div>
        </div>
      )}

      {showNav && total > 0 && (
        <div className="vp-nav-panel">
          {sentences.map((sentence, i) => {
            const title = partTitles[i];
            return (
              <button
                key={i}
                className={`vp-nav-item${i === index ? ' current' : ''}`}
                onClick={() => handleJumpTo(i)}
                title={title || sentence.substring(0, 80)}
              >
                <span className="vp-nav-num">{i + 1}</span>
                <span className="vp-nav-preview">
                  {title || (sentence.length > 60 ? `${sentence.substring(0, 57)}...` : sentence)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="vp-speed-row">
        <span className="vp-speed-label">{copy.speed}</span>
        <div className="vp-speed-chips">
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`vp-speed-chip${rate === opt.value ? ' active' : ''}`}
              onClick={() => { setRate(opt.value); voiceEngine.setRate(opt.value); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
