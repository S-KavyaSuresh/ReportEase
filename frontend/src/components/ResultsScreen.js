import React, { useEffect, useMemo, useState } from 'react';
import ChatPanel from './ChatPanel';
import FindingCard from './FindingCard';
import HospitalsPanel from './HospitalsPanel';
import VoicePlayer from './VoicePlayer';
import { getCachedUITranslations, getUITranslations } from '../utils/api';
import { formatSpecialistWithPronunciation } from '../utils/specialistPronunciation';

const STATUS_META = {
  normal: { key: 'mostlyNormal', tone: 'good' },
  borderline: { key: 'someMildConcerns', tone: 'warn' },
  attention: { key: 'needsAttention', tone: 'critical' },
};

const TAB_KEYS = [
  { key: 'overview', copyKey: 'overview', route: '/analyze-report' },
  { key: 'findings', copyKey: 'findings', route: '/findings' },
  { key: 'conversation', copyKey: 'conversation', route: '/voice-chat' },
  { key: 'care', copyKey: 'carePath', route: '/care-path' },
];

const BASE_COPY = {
  mostlyNormal: 'Mostly Normal',
  someMildConcerns: 'Some Mild Concerns',
  needsAttention: 'Needs Attention',
  overview: 'Overview',
  findings: 'Findings',
  conversation: 'Conversation',
  carePath: 'Care Path',
  downloadSummary: 'Download Report',
  urgency: 'Urgency',
  specialist: 'Specialist',
  patterns: 'Patterns',
  reportType: 'Report Type',
  overallStatus: 'Overall Status',
  audioExplanation: 'Audio Explanation',
  audioDescription: 'The main output is designed for listening first, with a simpler spoken explanation of what needs attention.',
  listenToExplanation: 'Listen to Explanation',
  hiddenRiskScan: 'Hidden Risk Scan',
  valuesFlagged: 'values flagged for review',
  patternsFound: 'combined patterns found',
  riskyTerms: 'risky terms detected',
  urgentAttention: 'Urgent attention suggested',
  simpleExplanation: 'Simple Explanation',
  whatStandsOut: 'What Stands Out',
  noAbnormalHighlighted: 'No abnormal extracted values were highlighted.',
  combinedPatterns: 'Combined Patterns',
  smartQuestions: 'Smart Follow-Up Questions',
  riskyWords: 'Risky words found',
  foodGuidance: 'Supportive Food Guidance',
  needsReview: 'Needs Review',
  withinRange: 'Within Range',
  noAbnormalFindings: 'No abnormal extracted findings.',
  noNormalFindings: 'No normal findings were extracted separately.',
  conversationDesign: 'Voice Conversation',
  conversationBody: 'The assistant is calm, reassuring, and context-aware. Ask anything about your report.',
  nextSteps: 'Next Steps',
  doctorDirection: 'Doctor Direction',
  extractedValuesReview: '{abnormal} extracted values need review, while {normal} look within range.',
  noMajorAbnormal: 'No major abnormal extracted values were detected from the uploaded report.',
  notMedical: 'The uploaded file does not appear to be a medical report. Please upload a blood test, scan, or clinical document.',
  confidenceScore: 'Analysis Confidence',
  urgencyRoutine: 'Routine - no action needed now',
  urgencySoon: 'See a doctor within 1-2 weeks',
  urgencyUrgent: 'Urgent - see a doctor promptly',
  medicalReportFallback: 'Medical report analysis',
  summaryPart: 'Summary',
  keyFindingsPart: 'Key Findings',
  valuesNeedAttentionPart: 'Values That Need Attention',
  concernAreasPart: 'Possible Concern Areas',
  specialistGuidancePart: 'Specialist Guidance',
  nextStepsPart: 'Next Steps',
  disclaimerPart: 'Important Disclaimer',
  patientSummary: 'Patient and Report Summary',
  valuesNeedAttention: 'Values Needing Attention',
  specialistGuidance: 'Specialist Guidance',
  importantDisclaimer: 'Important Disclaimer',
  reportPreparedBy: 'Prepared by ReportEase',
  reportVersion: 'Version',
  valueLabel: 'Value',
  rangeLabel: 'Range',
  statusLabel: 'Status',
  summaryHeading: 'Summary',
  summaryDisclaimer: 'This summary is supportive guidance and does not replace medical advice.',
};

export default function ResultsScreen({
  result,
  sessionId,
  language,
  activeTab = 'overview',
  onNavigate,
  onAskFollowUp,
  pendingChatQuestion = '',
  onPendingChatHandled,
}) {
  const [tab, setTab] = useState(activeTab);
  const [copy, setCopy] = useState(() => getCachedUITranslations(language, BASE_COPY));

  const abnormalFindings = useMemo(
    () => (result.findings || []).filter((item) => item.status !== 'normal'),
    [result.findings]
  );
  const normalFindings = useMemo(
    () => (result.findings || []).filter((item) => item.status === 'normal'),
    [result.findings]
  );

  const meta = STATUS_META[result.overallStatus] || STATUS_META.normal;
  const isNotMedical = result.reportType === 'Not a Medical Report';
  const specialistDisplay = formatSpecialistWithPronunciation(result.specialist || '', language);

  useEffect(() => {
    let active = true;
    getUITranslations(language, BASE_COPY)
      .then((data) => active && setCopy(data.translations || BASE_COPY))
      .catch(() => active && setCopy(BASE_COPY));
    return () => { active = false; };
  }, [language]);

  useEffect(() => {
    setTab(activeTab);
  }, [activeTab]);

  const audioPartTitles = useMemo(() => {
    const candidates = [
      copy.summaryPart,
      abnormalFindings.length ? copy.keyFindingsPart : copy.summaryPart,
      abnormalFindings.length ? copy.valuesNeedAttentionPart : copy.nextStepsPart,
      (result.patterns || []).length ? copy.concernAreasPart : copy.specialistGuidancePart,
      result.specialist ? copy.specialistGuidancePart : copy.nextStepsPart,
      copy.nextStepsPart,
      copy.disclaimerPart,
    ].filter(Boolean);
    return candidates;
  }, [abnormalFindings.length, copy, result.patterns, result.specialist]);

  const downloadSummary = () => {
    const text = buildDownloadText({ result, copy, metaKey: meta.key, abnormalFindings, normalFindings });
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reportease-summary.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isNotMedical) {
    return (
      <div className="results-shell">
        <section className="card animate-fadeUp" style={{ padding: '36px 28px', textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>Document</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', margin: '0 0 12px' }}>
            {copy.notMedical || BASE_COPY.notMedical}
          </h2>
          <p style={{ color: 'var(--text2)', lineHeight: 1.7 }}>{result.summary}</p>
          {(result.checklist || []).map((item, i) => (
            <div key={i} className="check-row" style={{ textAlign: 'left', marginTop: 12 }}>
              <span>{i + 1}</span>
              <p style={{ margin: 0 }}>{item}</p>
            </div>
          ))}
        </section>
      </div>
    );
  }

  return (
    <div className="results-shell">
      <section className={`results-hero status-${meta.tone} card animate-fadeUp`}>
        <div className="results-hero-main">
          <div className="results-eyebrow">
            {result.reportTypeEn && result.reportType && result.reportTypeEn !== result.reportType
              ? `${result.reportTypeEn} - ${result.reportType}`
              : (result.reportType || copy.medicalReportFallback)}
          </div>
          <h2 className="results-title">{copy[meta.key] || BASE_COPY[meta.key]}</h2>
          <p className="results-subtitle">
            {abnormalFindings.length
              ? (copy.extractedValuesReview || BASE_COPY.extractedValuesReview)
                  .replace('{abnormal}', abnormalFindings.length)
                  .replace('{normal}', normalFindings.length)
              : copy.noMajorAbnormal}
          </p>
          <div className="quick-actions">
            <button className="btn-primary" onClick={downloadSummary}>{copy.downloadSummary}</button>
          </div>
        </div>

        <div className="results-kpis">
          <Metric label={copy.urgency} value={getUrgencyTooltip(result.urgency, copy, result._urgencyStrings) || result.urgency || '-'} />
          <Metric label={copy.specialist} value={specialistDisplay} />
          <Metric label={copy.patterns} value={String((result.patterns || []).length)} />
        </div>
      </section>

      {result.confidenceScore && (
        <ConfidenceBadge score={result.confidenceScore} label={copy.confidenceScore} />
      )}

      <div className="summary-grid">
        <section className="summary-card card">
          <div className="section-title">{copy.audioExplanation}</div>
          <p className="summary-text">{copy.audioDescription}</p>
          {result.audioScript && (
            <VoicePlayer
              text={result.audioScript}
              language={language}
              label={copy.listenToExplanation}
              partTitles={audioPartTitles}
            />
          )}
        </section>

        <section className="summary-card card">
          <div className="section-title">{copy.hiddenRiskScan}</div>
          <div className="signal-grid">
            <div className="signal-card">
              <strong>{abnormalFindings.length}</strong>
              <div className="hospital-meta">{copy.valuesFlagged}</div>
            </div>
            <div className="signal-card">
              <strong>{(result.patterns || []).length}</strong>
              <div className="hospital-meta">{copy.patternsFound}</div>
            </div>
            <div className="signal-card">
              <strong>{(result.importantTerms || []).length}</strong>
              <div className="hospital-meta">{copy.riskyTerms}</div>
            </div>
          </div>
        </section>
      </div>

      {result.emergencyAlert?.isEmergency && (
        <section className="emergency-card card animate-pop">
          <strong>{copy.urgentAttention}</strong>
          <p>{result.emergencyAlert.message}</p>
          <div className="tag-list">
            {(result.emergencyAlert.reasons || []).map((reason) => (
              <span key={reason} className="alert-tag">{reason}</span>
            ))}
          </div>
        </section>
      )}

      <div className="tab-strip">
        {TAB_KEYS.map((item) => (
          <button
            key={item.key}
            className={`tab-chip ${tab === item.key ? 'tab-chip-active' : ''}`}
            onClick={() => {
              setTab(item.key);
              onNavigate?.(item.route);
            }}
          >
            {copy[item.copyKey] || BASE_COPY[item.copyKey]}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="results-grid">
          <section className="summary-card card">
            <div className="section-title">{copy.simpleExplanation}</div>
            <p className="summary-text">{result.summary}</p>
          </section>

          <section className="summary-card card">
            <div className="section-title">{copy.whatStandsOut}</div>
            <div className="tag-list">
              {abnormalFindings.length
                ? abnormalFindings.map((item) => (
                    <span key={`${item.name}-${item.value}`} className={`severity-tag severity-${item.severity || 'mild'}`}>
                      {formatMedicalName(item)}: {item.value}
                    </span>
                  ))
                : <span className="plain-note">{copy.noAbnormalHighlighted}</span>}
            </div>
          </section>

          {!!(result.patterns || []).length && (
            <section className="summary-card card">
              <div className="section-title">{copy.combinedPatterns}</div>
              <div className="stack-list">
                {result.patterns.map((pattern) => (
                  <div key={pattern.id} className="pattern-row">
                    <div>
                      <strong>{pattern.title}</strong>
                      <div className="hospital-meta">{formatSpecialistWithPronunciation(pattern.specialist || '', language)}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span className="mini-pill">{getUrgencyTooltip(pattern.urgency, copy, result._urgencyStrings) || pattern.urgency}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!!(result.contextQuestions || []).length && (
            <section className="summary-card card">
              <div className="section-title">{copy.smartQuestions}</div>
              <div className="stack-list">
                {result.contextQuestions.map((question) => (
                  <button
                    key={question}
                    className="question-row question-row-action"
                    onClick={() => onAskFollowUp?.(question)}
                  >
                    {question}
                  </button>
                ))}
              </div>
            </section>
          )}

          {!!(result.importantTerms || []).length && (
            <section className="summary-card card">
              <div className="section-title">{copy.riskyWords}</div>
              <div className="stack-list">
                {result.importantTerms.map((term) => (
                  <div key={term.term} className="term-row">
                    <strong>{term.term}</strong>
                    <span>{term.meaning}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!!result.dietarySuggestions && (
            <section className="summary-card card">
              <div className="section-title">{copy.foodGuidance}</div>
              <p className="summary-text">{result.dietarySuggestions}</p>
            </section>
          )}
        </div>
      )}

      {tab === 'findings' && (
        <div className="findings-layout">
          <section className="card findings-column">
            <div className="section-title">{copy.needsReview} ({abnormalFindings.length})</div>
            {abnormalFindings.length
              ? abnormalFindings.map((item, index) => (
                  <FindingCard key={`abnormal-${index}`} finding={item} language={language} />
                ))
              : <p className="plain-note">{copy.noAbnormalFindings}</p>}
          </section>
          <section className="card findings-column">
            <div className="section-title">{copy.withinRange} ({normalFindings.length})</div>
            {normalFindings.length
              ? normalFindings.map((item, index) => (
                  <FindingCard key={`normal-${index}`} finding={item} language={language} />
                ))
              : <p className="plain-note">{copy.noNormalFindings}</p>}
          </section>
        </div>
      )}

      {tab === 'conversation' && (
        <div className="conversation-grid">
          <ChatPanel
            sessionId={sessionId}
            language={language}
            autoAskQuestion={pendingChatQuestion}
            onAutoAskHandled={onPendingChatHandled}
          />
        </div>
      )}

      {tab === 'care' && (
        <div className="care-grid">
          <section className="card care-card">
            <div className="section-title">{copy.nextSteps}</div>
            <div className="stack-list">
              {(result.checklist || []).map((item, index) => (
                <div key={item} className="check-row" dir="ltr">
                  <span>{index + 1}</span>
                  <p style={{ margin: 0, textAlign: 'left' }}>{item}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="card care-card">
            <div className="section-title">{copy.doctorDirection}</div>
            {result.specialist ? (
              <div className="doctor-callout" style={{ flexDirection: 'column' }}>
                <strong>{specialistDisplay}</strong>
                <p style={{ margin: 0 }}>{result.specialistReason}</p>
              </div>
            ) : null}
            {result.specialist && <div className="soft-divider" />}
            <HospitalsPanel sessionId={sessionId} specialist={result.specialist} language={language} />
          </section>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tooltip }) {
  return (
    <div className="metric-card" title={tooltip || ''}>
      <span>{label}</span>
      <strong>{value}</strong>
      {tooltip && <div className="metric-tooltip">{tooltip}</div>}
    </div>
  );
}

function getUrgencyTooltip(urgency, copy, urgencyStrings) {
  if (!urgency) return '';
  const u = String(urgency).toLowerCase().trim();
  if (urgencyStrings) {
    if (u === 'routine') return urgencyStrings.routine || '';
    if (u === 'soon') return urgencyStrings.soon || '';
    if (u === 'urgent') return urgencyStrings.urgent || '';
    const match = Object.values(urgencyStrings).find((v) => v && String(v).toLowerCase().trim() === u);
    if (match) return match;
  }
  if (u === 'routine') return copy.urgencyRoutine || BASE_COPY.urgencyRoutine;
  if (u === 'soon') return copy.urgencySoon || BASE_COPY.urgencySoon;
  if (u === 'urgent') return copy.urgencyUrgent || BASE_COPY.urgencyUrgent;
  return urgency;
}

function ConfidenceBadge({ score, label }) {
  const color = score.score >= 80 ? 'var(--green)' : score.score >= 58 ? 'var(--yellow)' : 'var(--red)';
  return (
    <div className="confidence-badge">
      <span className="confidence-label">{label}:</span>
      <div className="confidence-bar-wrap">
        <div className="confidence-bar">
          <div className="confidence-fill" style={{ width: `${score.score}%`, background: color }} />
        </div>
        <span className="confidence-score" style={{ color }}>{score.score}% - {score.label}</span>
      </div>
      <span className="confidence-note">{score.explanation}</span>
    </div>
  );
}

function buildDownloadText({ result, copy, metaKey, abnormalFindings, normalFindings }) {
  const reportType = result.reportTypeEn && result.reportType && result.reportTypeEn !== result.reportType
    ? `${result.reportTypeEn} - ${result.reportType}`
    : (result.reportType || '');
  const status = copy[metaKey] || metaKey;
  const renderFindings = (items) => items.map((item) => (
    `- ${formatMedicalName(item)} | ${item.value || ''} | ${item.normalRange || ''} | ${item.statusLabel || item.status || ''}`
  )).join('\n');
  const checklist = (result.checklist || []).map((item) => `- ${item}`).join('\n');
  const patterns = (result.patterns || []).map((item) => `- ${item.title} | ${item.specialist || ''}`).join('\n');
  const disclaimer = result.disclaimer || copy.summaryDisclaimer || BASE_COPY.summaryDisclaimer;
  const urgencyValue = getUrgencyTooltip(result.urgency, copy, result._urgencyStrings) || result.urgency || '';

  return [
    `ReportEase - ${copy.summaryHeading || copy.summaryPart || BASE_COPY.summaryPart}`,
    '',
    `${copy.reportType}: ${reportType}`,
    `${copy.overallStatus}: ${status}`,
    `${copy.urgency}: ${urgencyValue}`,
    `${copy.specialist}: ${result.specialist || ''}`,
    `${copy.patterns}: ${(result.patterns || []).length}`,
    '',
    `${copy.patientSummary}`,
    result.summary || '',
    '',
    `${copy.valuesNeedAttention}`,
    renderFindings(abnormalFindings),
    '',
    `${copy.withinRange}`,
    renderFindings(normalFindings),
    '',
    `${copy.specialistGuidance}`,
    result.specialist || '',
    result.specialistReason || '',
    patterns,
    '',
    `${copy.nextSteps}`,
    checklist,
    '',
    `${copy.foodGuidance}`,
    result.dietarySuggestions || '',
    '',
    `${copy.importantDisclaimer}`,
    disclaimer,
  ].join('\n');
}

function formatMedicalName(item) {
  if (!item?.name) return '';
  return item.namePronunciation ? `${item.name} (${item.namePronunciation})` : item.name;
}
