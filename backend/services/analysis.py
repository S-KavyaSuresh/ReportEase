import hashlib
import json
import re
from typing import Any

import httpx

from config import ANALYSIS_MODEL, GROQ_BASE, get_headers
from services import ui_translate


_analysis_cache: dict[str, dict] = {}


NORMAL_RANGES_DB = {
    "HB": (13.0, 17.0, "g/dL", "male"),
    "Hemoglobin": (13.0, 17.0, "g/dL", "male"),
    "HCT": (40.0, 50.0, "%", "male"),
    "Hematocrit": (40.0, 50.0, "%", "male"),
    "PCV": (40.0, 50.0, "%", "male"),
    "RBC": (4.5, 5.5, "million/cmm", "male"),
    "Red Blood Cells": (4.5, 5.5, "million/cmm", "male"),
    "WBC": (4000, 11000, "cells/cumm", ""),
    "Total WBC Count": (4000, 11000, "cells/cumm", ""),
    "White Blood Cells": (4000, 11000, "cells/cumm", ""),
    "MCV": (83.0, 101.0, "fL", ""),
    "MCH": (27.0, 33.0, "pg", ""),
    "MCHC": (32.0, 38.0, "%", ""),
    "Platelet Count": (150000, 450000, "/cumm", ""),
    "Platelets": (150000, 450000, "/cumm", ""),
    "Neutrophils": (50.0, 70.0, "%", ""),
    "Lymphocytes": (20.0, 40.0, "%", ""),
    "Monocytes": (2.0, 10.0, "%", ""),
    "Eosinophils": (1.0, 6.0, "%", ""),
    "Basophils": (0.0, 2.0, "%", ""),
    "Absolute Neutrophils Count": (2000, 7000, "/cumm", ""),
    "Absolute Neutrophil Count": (2000, 7000, "/cumm", ""),
    "Absolute Lymphocytes Count": (1000, 3000, "/cumm", ""),
    "Absolute Lymphocyte Count": (1000, 3000, "/cumm", ""),
    "Absolute Monocytes Count": (200, 1000, "/cumm", ""),
    "Absolute Monocyte Count": (200, 1000, "/cumm", ""),
    "Absolute Eosinophils Count": (20, 500, "/cumm", ""),
    "Absolute Eosinophil Count": (20, 500, "/cumm", ""),
    "AEC": (20, 500, "/cumm", ""),
    "ESR": (0, 15, "mm/hr", "male"),
    "Fasting Blood Sugar": (70, 100, "mg/dL", ""),
    "Fasting Glucose": (70, 100, "mg/dL", ""),
    "Blood Sugar Fasting": (70, 100, "mg/dL", ""),
    "Postprandial Blood Sugar": (70, 140, "mg/dL", ""),
    "Blood Sugar PP": (70, 140, "mg/dL", ""),
    "Random Blood Sugar": (70, 140, "mg/dL", ""),
    "HbA1c": (4.0, 5.7, "%", ""),
    "TSH": (0.4, 4.0, "mIU/L", ""),
    "T3": (80, 200, "ng/dL", ""),
    "T4": (5.0, 12.0, "ug/dL", ""),
    "Free T3": (2.3, 4.2, "pg/mL", ""),
    "Free T4": (0.89, 1.76, "ng/dL", ""),
    "Creatinine": (0.7, 1.3, "mg/dL", "male"),
    "Urea": (7, 20, "mg/dL", ""),
    "Blood Urea Nitrogen": (7, 20, "mg/dL", ""),
    "BUN": (7, 20, "mg/dL", ""),
    "Uric Acid": (3.5, 7.2, "mg/dL", "male"),
    "SGPT": (7, 56, "U/L", ""),
    "ALT": (7, 56, "U/L", ""),
    "SGOT": (10, 40, "U/L", ""),
    "AST": (10, 40, "U/L", ""),
    "Bilirubin Total": (0.2, 1.2, "mg/dL", ""),
    "Total Bilirubin": (0.2, 1.2, "mg/dL", ""),
    "Direct Bilirubin": (0.0, 0.3, "mg/dL", ""),
    "Alkaline Phosphatase": (44, 147, "U/L", ""),
    "ALP": (44, 147, "U/L", ""),
    "Total Cholesterol": (0, 200, "mg/dL", ""),
    "LDL": (0, 100, "mg/dL", ""),
    "HDL": (40, 60, "mg/dL", "male"),
    "Triglycerides": (0, 150, "mg/dL", ""),
    "VLDL": (5, 40, "mg/dL", ""),
}

PATTERN_RULES = [
    {
        "id": "iron_deficiency_pattern",
        "title": "Possible iron deficiency pattern",
        "specialist": "General Physician / Hematologist",
        "checks": [("hb", "low"), ("mcv", "low"), ("mch", "low")],
        "urgency": "soon",
    },
    {
        "id": "prediabetes_pattern",
        "title": "Prediabetes or diabetes risk pattern",
        "specialist": "Diabetologist / Endocrinologist",
        "checks": [("glucose", "high"), ("hba1c", "high")],
        "urgency": "soon",
    },
    {
        "id": "heart_risk_pattern",
        "title": "Cholesterol-related heart risk pattern",
        "specialist": "Cardiologist",
        "checks": [("cholesterol", "high"), ("hdl", "low")],
        "urgency": "soon",
    },
    {
        "id": "infection_pattern",
        "title": "Possible infection or inflammation pattern",
        "specialist": "General Physician",
        "checks": [("wbc", "high"), ("neutrophil", "high")],
        "urgency": "routine",
    },
]

RISK_TERMS = {
    "lesion": "A lesion means an area that looks different from normal tissue and may need a doctor to review it.",
    "mass": "A mass means an abnormal lump or growth and should usually be checked by a specialist.",
    "infarct": "Infarct usually means tissue damage due to reduced blood supply and can be serious.",
    "blockage": "Blockage suggests something may be obstructing normal flow and may need medical attention.",
    "inflammation": "Inflammation means irritation or swelling in tissue and should be interpreted with the rest of the report.",
    "stroke": "Stroke-related wording can indicate a brain blood flow problem and should not be ignored.",
    "cva": "CVA is another term used for stroke and may need urgent medical review.",
    "nodule": "A nodule is a small abnormal growth that may need follow-up depending on size and location.",
    "calcification": "Calcification means calcium deposits were seen and the significance depends on where it is found.",
}

LOCAL_DIET_LIBRARY = {
    "iron_deficiency_pattern": "Supportive foods may include spinach, dates, jaggery, beans, lentils, and leafy greens.",
    "prediabetes_pattern": "Prefer high-fiber meals such as dal, oats, millets, vegetables, and reduce sugary drinks and sweets.",
    "heart_risk_pattern": "Supportive choices include oats, nuts, seeds, vegetables, and less fried or processed food.",
    "tsh": "Balanced meals with protein, pulses, vegetables, and enough iodine in the diet may help overall thyroid care.",
    "cholesterol": "Choose more oats, nuts, vegetables, and reduce fried snacks and heavy processed foods.",
    "hb": "Iron-rich foods such as spinach, dates, jaggery, beans, ragi, and lentils may be helpful support.",
    "creatinine": "Avoid self-starting supplements and discuss protein intake with a doctor if kidney values stay abnormal.",
}

# ── Language contamination detection ─────────────────────────────────────────
# Unicode ranges for scripts that must NOT appear in other languages' text output
SCRIPT_RANGES: dict[str, list[tuple[int, int]]] = {
    "Tamil":      [(0x0B80, 0x0BFF)],
    "Telugu":     [(0x0C00, 0x0C7F)],
    "Kannada":    [(0x0C80, 0x0CFF)],
    "Malayalam":  [(0x0D00, 0x0D7F)],
    "Devanagari": [(0x0900, 0x097F)],
    "Bengali":    [(0x0980, 0x09FF)],
    "Gujarati":   [(0x0A80, 0x0AFF)],
    "Punjabi":    [(0x0A00, 0x0A7F)],
    "Arabic":     [(0x0600, 0x06FF)],
    "Korean":     [(0xAC00, 0xD7A3), (0x1100, 0x11FF)],
    "Japanese":   [(0x3040, 0x30FF)],
    "Chinese":    [(0x4E00, 0x9FFF), (0x3400, 0x4DBF)],
    "Thai":       [(0x0E00, 0x0E7F)],
}

LANG_TO_SCRIPT: dict[str, str] = {
    "Tamil": "Tamil", "Telugu": "Telugu", "Kannada": "Kannada",
    "Malayalam": "Malayalam", "Hindi": "Devanagari", "Marathi": "Devanagari",
    "Bengali": "Bengali", "Gujarati": "Gujarati", "Punjabi": "Punjabi",
    "Urdu": "Arabic", "Arabic": "Arabic", "Korean": "Korean",
    "Japanese": "Japanese", "Chinese": "Chinese", "Thai": "Thai",
}

# Scripts that can co-exist (Japanese uses Chinese characters, etc.)
COMPATIBLE_SCRIPTS: dict[str, set[str]] = {
    "Japanese": {"Chinese"},
    "Chinese":  {"Japanese"},
}


def _detect_language_contamination(text: str, expected_language: str) -> bool:
    """Return True if text contains characters from a foreign script."""
    if not text or expected_language in (
        "", "English", "Spanish", "French", "German", "Italian",
        "Dutch", "Portuguese", "Polish", "Turkish", "Russian",
        "Vietnamese", "Indonesian",
    ):
        return False
    expected_script = LANG_TO_SCRIPT.get(expected_language)
    if not expected_script:
        return False
    compatible = COMPATIBLE_SCRIPTS.get(expected_script, set())
    for script, ranges in SCRIPT_RANGES.items():
        if script == expected_script or script in compatible:
            continue
        for lo, hi in ranges:
            if any(lo <= ord(ch) <= hi for ch in text[:2000]):
                return True
    return False

# ── Medical report detection ─────────────────────────────────────────────────
MEDICAL_KEYWORDS = [
    "hemoglobin", "hb", "wbc", "rbc", "platelet", "glucose", "hba1c",
    "creatinine", "cholesterol", "tsh", "sgpt", "sgot", "bilirubin",
    "urea", "uric acid", "triglycerides", "lymphocytes", "neutrophils",
    "eosinophils", "monocytes", "mcv", "mch", "mchc", "hct", "pcv",
    "blood", "serum", "plasma", "test", "report", "lab", "pathology",
    "reference range", "normal range", "result", "patient", "specimen",
    "mri", "ct scan", "x-ray", "ecg", "ultrasound", "biopsy", "culture",
    "sodium", "potassium", "calcium", "albumin", "protein", "iron",
]


def _is_medical_report(text: str) -> bool:
    """Return True only if the uploaded text looks like a genuine medical report."""
    lowered = text.lower()
    hits = sum(1 for kw in MEDICAL_KEYWORDS if kw in lowered)
    return hits >= 3


def _cache_key(text: str, language: str) -> str:
    return hashlib.md5(f"{language}::{text[:2000]}".encode()).hexdigest()


def _parse_json(raw: str) -> dict:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise


def _clean(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean(item) for item in obj]
    if isinstance(obj, str):
        return obj.strip()
    return obj


def _extract_number(value: Any) -> float | None:
    if value is None:
        return None
    match = re.search(r'[\d.]+', str(value))
    if match:
        try:
            return float(match.group())
        except ValueError:
            return None
    return None


def _extract_range(range_str: str) -> tuple[float | None, float | None]:
    if not range_str:
        return None, None
    match = re.search(r'([\d.]+)\s*[-–]\s*([\d.]+)', str(range_str))
    if match:
        try:
            return float(match.group(1)), float(match.group(2))
        except ValueError:
            pass
    return None, None


def _normalize_findings(result: dict) -> dict:
    findings = result.get("findings") or []
    for finding in findings:
        name = finding.get("name", "").strip()
        value = finding.get("value")
        normal_range = finding.get("normalRange", "")

        # Try to auto-detect range from DB if not provided
        if not normal_range:
            for db_key, (lo, hi, unit, _) in NORMAL_RANGES_DB.items():
                if db_key.lower() in name.lower() or name.lower() in db_key.lower():
                    finding["normalRange"] = f"{lo}-{hi} {unit}".strip()
                    normal_range = finding["normalRange"]
                    break

        # Auto-detect status if not set or is "normal" but value is out of range
        val = _extract_number(value)
        lo, hi = _extract_range(normal_range)
        if val is not None and lo is not None and hi is not None:
            if val < lo:
                finding["status"] = "warning"
                finding["severity"] = finding.get("severity", "mild")
            elif val > hi:
                finding["status"] = "warning"
                finding["severity"] = finding.get("severity", "mild")
            else:
                if finding.get("status") not in ("warning", "critical"):
                    finding["status"] = "normal"
                    finding["severity"] = "normal"

    result["findings"] = findings
    return result


def _overall_status(findings: list) -> str:
    statuses = [f.get("status", "normal") for f in findings]
    if "critical" in statuses:
        return "attention"
    if "warning" in statuses:
        return "borderline"
    return "normal"


def _confidence_score(result: dict, extracted_text: str) -> dict:
    """
    Estimate analysis confidence based on extraction quality.
    Genuinely variable — reflects what was actually found in the report.
    """
    findings = result.get("findings") or []
    has_summary = bool(result.get("summary", "").strip())
    has_report_type = result.get("reportType", "") not in ("Medical Report", "Not a Medical Report", "")
    text_len = len(extracted_text)

    # Count findings with complete data
    values_with_range = sum(1 for f in findings if f.get("normalRange") and "-" in str(f.get("normalRange", "")))
    values_with_value = sum(1 for f in findings if _extract_number(f.get("value")) is not None)
    values_with_status = sum(1 for f in findings if f.get("status") in ("normal", "warning", "critical"))
    values_complete = sum(
        1 for f in findings
        if f.get("normalRange") and f.get("value") and f.get("status") and f.get("layman")
    )
    total_findings = len(findings)

    # Base: starts at 30
    score = 30

    # Text quality
    if text_len > 300:  score += 5
    if text_len > 800:  score += 5
    if text_len > 2000: score += 5

    # Structure
    if has_summary:         score += 8
    if has_report_type:     score += 7

    # Findings quality — proportional, not flat
    if total_findings >= 1:
        completeness = values_complete / total_findings if total_findings else 0
        score += int(completeness * 20)  # up to 20 pts based on completeness

    if values_with_range >= 3:   score += 7
    if values_with_value >= 4:   score += 5
    if values_with_status >= 4:  score += 3

    # Penalty for sparse extraction
    if total_findings == 0: score -= 15
    if values_with_range < 2 and total_findings > 0: score -= 5

    score = max(20, min(score, 92))  # range: 20–92, never 100%

    if score >= 80:
        label = "High"
        explanation = "Clear structured values with reference ranges were extracted successfully."
    elif score >= 58:
        label = "Moderate"
        explanation = "Most values were extracted. Some fields may have limited detail."
    else:
        label = "Low"
        explanation = "Limited structured data was found. Please verify with the original report."

    return {"score": score, "label": label, "explanation": explanation}


def _build_patterns(findings: list) -> list:
    finding_map: dict[str, str] = {}
    for f in findings:
        name_lower = f.get("name", "").lower()
        status = f.get("status", "normal")
        val = _extract_number(f.get("value"))
        lo, hi = _extract_range(f.get("normalRange", ""))
        direction = ""
        if val is not None and lo is not None and hi is not None:
            if val > hi:
                direction = "high"
            elif val < lo:
                direction = "low"
        for key in ["hb", "hemoglobin", "mcv", "mch", "mchc", "glucose", "hba1c",
                    "cholesterol", "hdl", "ldl", "wbc", "neutrophil", "tsh"]:
            if key in name_lower:
                finding_map[key] = direction or status

    matched_patterns = []
    for rule in PATTERN_RULES:
        match_count = 0
        matched_params = []
        for key, expected in rule["checks"]:
            actual = finding_map.get(key, "")
            if actual == expected or (expected in ("high", "low") and actual == expected):
                match_count += 1
                matched_params.append(key)
        if match_count >= 2:
            matched_patterns.append({
                "id": rule["id"],
                "title": rule["title"],
                "specialist": rule["specialist"],
                "urgency": rule["urgency"],
                "matchedParameters": matched_params,
            })
    return matched_patterns


def _important_terms(text: str) -> list:
    text_lower = text.lower()
    return [
        {"term": term, "meaning": meaning}
        for term, meaning in RISK_TERMS.items()
        if term in text_lower
    ]


def _emergency_alert(text: str, findings: list) -> dict | None:
    text_lower = text.lower()
    emergency_terms = ["stroke", "infarct", "heart attack", "myocardial", "emergency", "critical"]
    reasons = []

    for f in findings:
        if f.get("status") == "critical":
            reasons.append(f.get("name", ""))

    for term in emergency_terms:
        if term in text_lower:
            reasons.append(term)

    if reasons:
        return {
            "isEmergency": True,
            "message": "One or more values in this report may need urgent medical review. Please consult a doctor as soon as possible.",
            "reasons": list(set(reasons))[:5],
        }
    return None


def _specialist_from_content(patterns: list, findings: list, text: str) -> tuple[str, str]:
    if patterns:
        return patterns[0].get("specialist", "General Physician"), patterns[0].get("title", "")

    text_lower = text.lower()
    if any(t in text_lower for t in ["heart", "cardiac", "ecg", "cholesterol"]):
        return "Cardiologist", "The report contains findings related to heart health."
    if any(t in text_lower for t in ["thyroid", "tsh", "t3", "t4"]):
        return "Endocrinologist", "The report contains thyroid-related findings."
    if any(t in text_lower for t in ["kidney", "creatinine", "urea", "gfr"]):
        return "Nephrologist", "The report contains kidney-related findings."
    if any(t in text_lower for t in ["liver", "sgpt", "sgot", "bilirubin", "alt", "ast"]):
        return "Gastroenterologist / Hepatologist", "The report contains liver-related findings."
    if any(f.get("status") in ("warning", "critical") for f in findings):
        return "General Physician", "Some values in the report need review by a doctor."

    return "General Physician", "A general checkup is recommended based on the report."


def _context_questions(patterns: list, findings: list, text: str) -> list:
    questions = []
    abnormal = [f for f in findings if f.get("status") != "normal"]
    if abnormal:
        questions.append("Have you had similar results in previous tests?")
        questions.append("Are you currently on any medications?")
    if patterns:
        questions.append("Have you experienced fatigue, dizziness, or unusual tiredness recently?")
    if len(questions) < 2:
        questions.append("When was your last full health checkup?")
    return questions[:3]


def _checklist(findings: list, patterns: list, specialist: str, emergency: dict | None) -> list:
    items = []
    if emergency and emergency.get("isEmergency"):
        items.append("Seek medical attention promptly — one or more values may need urgent review.")
    abnormal = [f for f in findings if f.get("status") != "normal"]
    if abnormal:
        items.append(f"Discuss these {len(abnormal)} flagged values with your doctor.")
    if specialist:
        items.append(f"Consider booking an appointment with a {specialist}.")
    if patterns:
        items.append("Ask your doctor about the combined pattern detected in your results.")
    items.append("Carry this report when you visit the doctor.")
    items.append("Do not change medications or diet based on this report alone.")
    return items[:6]


def _localized_dietary_suggestions(patterns: list, findings: list, language: str) -> str:
    for pattern in patterns:
        pid = pattern.get("id", "")
        if pid in LOCAL_DIET_LIBRARY:
            return LOCAL_DIET_LIBRARY[pid] + " These are supportive suggestions, not treatment."

    names_lower = " ".join(f.get("name", "").lower() for f in findings)
    for key, advice in LOCAL_DIET_LIBRARY.items():
        if key in names_lower:
            return advice + " These are supportive suggestions, not treatment."

    return "A balanced diet with vegetables, whole grains, pulses, and limited processed food supports general health. These are supportive suggestions, not treatment."


def _report_type(text: str) -> str:
    text_lower = text.lower()
    if any(t in text_lower for t in ["cbc", "complete blood count", "hemoglobin", "platelet"]):
        return "Complete Blood Count (CBC)"
    if any(t in text_lower for t in ["lipid", "cholesterol", "triglyceride", "hdl", "ldl"]):
        return "Lipid Profile"
    if any(t in text_lower for t in ["thyroid", "tsh", "t3", "t4"]):
        return "Thyroid Function Test"
    if any(t in text_lower for t in ["glucose", "sugar", "hba1c", "diabetes"]):
        return "Blood Glucose / Diabetes Panel"
    if any(t in text_lower for t in ["liver", "sgpt", "sgot", "bilirubin", "alt", "ast"]):
        return "Liver Function Test (LFT)"
    if any(t in text_lower for t in ["kidney", "creatinine", "urea", "gfr", "uric acid"]):
        return "Kidney Function Test (KFT)"
    if any(t in text_lower for t in ["mri", "magnetic resonance"]):
        return "MRI Report"
    if any(t in text_lower for t in ["ct scan", "computed tomography"]):
        return "CT Scan Report"
    if any(t in text_lower for t in ["x-ray", "xray", "radiograph"]):
        return "X-Ray Report"
    if any(t in text_lower for t in ["ecg", "electrocardiogram"]):
        return "ECG Report"
    if any(t in text_lower for t in ["ultrasound", "sonography", "usg"]):
        return "Ultrasound Report"
    return "Medical Report"


def _report_signals(findings: list, patterns: list, important_terms: list) -> list:
    signals = []
    for f in findings:
        if f.get("status") in ("warning", "critical"):
            signals.append({
                "type": "abnormal_value",
                "label": f.get("name", ""),
                "value": f.get("value", ""),
            })
    for p in patterns:
        signals.append({"type": "pattern", "label": p.get("title", "")})
    for t in important_terms:
        signals.append({"type": "term", "label": t.get("term", "")})
    return signals[:10]


def _multi_report_insight(text: str, findings: list) -> str:
    if "===" in text and "Document" in text:
        return "Multiple documents were uploaded. Compare these reports with earlier doctor advice for trends and consistency."
    return ""


# ── Audio script builder — uses translated content + translated phrases ───────
# Phrases are translated separately so voice output is 100% in target language

AUDIO_SCRIPT_PHRASES = {
    "English": {
        "high_values": "These values appear higher than the expected range",
        "low_values": "These values appear lower than the expected range",
        "needs_review": "These values also need review",
        "all_normal": "All checked values appear within normal range",
        "pattern_noticed": "A combined pattern was also noticed",
        "disclaimer": "This is supportive guidance. Please share this report and these findings with a qualified doctor for your final care plan.",
    },
    "Tamil": {
        "high_values": "இந்த மதிப்புகள் எதிர்பார்க்கப்படும் வரம்பை விட அதிகமாக உள்ளன",
        "low_values": "இந்த மதிப்புகள் எதிர்பார்க்கப்படும் வரம்பை விட குறைவாக உள்ளன",
        "needs_review": "இந்த மதிப்புகளும் மதிப்பாய்வு தேவை",
        "all_normal": "சரிபார்க்கப்பட்ட அனைத்து மதிப்புகளும் இயல்பான வரம்பில் உள்ளன",
        "pattern_noticed": "ஒரு கூட்டு முறை கவனிக்கப்பட்டது",
        "disclaimer": "இது ஆதரவு வழிகாட்டுதல். இந்த அறிக்கையையும் கண்டுபிடிப்புகளையும் உங்கள் இறுதி சிகிச்சைத் திட்டத்திற்காக ஒரு தகுதிவாய்ந்த மருத்துவரிடம் பகிர்ந்து கொள்ளுங்கள்.",
    },
    "Telugu": {
        "high_values": "ఈ విలువలు ఆశించిన పరిధి కంటే ఎక్కువగా కనిపిస్తున్నాయి",
        "low_values": "ఈ విలువలు ఆశించిన పరిధి కంటే తక్కువగా కనిపిస్తున్నాయి",
        "needs_review": "ఈ విలువలు కూడా సమీక్ష అవసరం",
        "all_normal": "తనిఖీ చేసిన అన్ని విలువలు సాధారణ పరిధిలో ఉన్నాయి",
        "pattern_noticed": "ఒక సంయుక్త నమూనా కూడా గమనించబడింది",
        "disclaimer": "ఇది సహాయక మార్గదర్శకత్వం. మీ తుది సంరక్షణ ప్రణాళిక కోసం ఈ నివేదికను మరియు ఈ అన్వేషణలను అర్హులైన వైద్యుడితో పంచుకోండి.",
    },
    "Malayalam": {
        "high_values": "ഈ മൂല്യങ്ങൾ പ്രതീക്ഷിക്കുന്ന പരിധിയേക്കാൾ കൂടുതലാണ്",
        "low_values": "ഈ മൂല്യങ്ങൾ പ്രതീക്ഷിക്കുന്ന പരിധിയേക്കാൾ കുറവാണ്",
        "needs_review": "ഈ മൂല്യങ്ങൾക്കും അവലോകനം ആവശ്യമാണ്",
        "all_normal": "പരിശോധിച്ച എല്ലാ മൂല്യങ്ങളും സാധാരണ പരിധിയിലാണ്",
        "pattern_noticed": "ഒരു സംയോജിത പ്രവണതയും ശ്രദ്ധിക്കപ്പെട്ടു",
        "disclaimer": "ഇത് സഹായകരമായ മാർഗനിർദ്ദേശമാണ്. നിങ്ങളുടെ അന്തിമ പരിചരണ പദ്ധതിക്കായി ഈ റിപ്പോർട്ടും കണ്ടുപിടിത്തങ്ങളും ഒരു യോഗ്യതയുള്ള ഡോക്ടറുമായി പങ്കിടുക.",
    },
    "Kannada": {
        "high_values": "ಈ ಮೌಲ್ಯಗಳು ನಿರೀಕ್ಷಿತ ವ್ಯಾಪ್ತಿಗಿಂತ ಹೆಚ್ಚಾಗಿ ಕಂಡುಬರುತ್ತವೆ",
        "low_values": "ಈ ಮೌಲ್ಯಗಳು ನಿರೀಕ್ಷಿತ ವ್ಯಾಪ್ತಿಗಿಂತ ಕಡಿಮೆಯಾಗಿ ಕಂಡುಬರುತ್ತವೆ",
        "needs_review": "ಈ ಮೌಲ್ಯಗಳಿಗೂ ಪರಿಶೀಲನೆ ಅಗತ್ಯ",
        "all_normal": "ಪರಿಶೀಲಿಸಿದ ಎಲ್ಲಾ ಮೌಲ್ಯಗಳು ಸಾಮಾನ್ಯ ವ್ಯಾಪ್ತಿಯಲ್ಲಿವೆ",
        "pattern_noticed": "ಒಂದು ಸಂಯೋಜಿತ ಮಾದರಿ ಕೂಡ ಗಮನಿಸಲಾಯಿತು",
        "disclaimer": "ಇದು ಸಹಾಯಕ ಮಾರ್ಗದರ್ಶನ. ನಿಮ್ಮ ಅಂತಿಮ ಆರೈಕೆ ಯೋಜನೆಗಾಗಿ ಈ ವರದಿ ಮತ್ತು ಈ ಸಂಶೋಧನೆಗಳನ್ನು ಒಬ್ಬ ಅರ್ಹ ವೈದ್ಯರೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಿ.",
    },
    "Gujarati": {
        "high_values": "આ મૂલ્યો અપેક્ષિત શ્રેણી કરતાં વધારે દેખાય છે",
        "low_values": "આ મૂલ્યો અપેક્ષિત શ્રેણી કરતાં ઓછા દેખાય છે",
        "needs_review": "આ મૂલ્યોની પણ સમીક્ષા જરૂરી છે",
        "all_normal": "તપાસવામાં આવેલ તમામ મૂલ્યો સામાન્ય શ્રેણીમાં છે",
        "pattern_noticed": "એક સંયુક્ત પેટર્ન પણ ધ્યાનમાં આવ્યો",
        "disclaimer": "આ સહાયક માર્ગદર્શન છે. તમારી અંતિમ સારવાર યોજના માટે આ અહેવાલ અને તારણો એક લાયક ડૉક્ટર સાથે શેર કરો.",
    },
    "Punjabi": {
        "high_values": "ਇਹ ਮੁੱਲ ਉਮੀਦ ਕੀਤੀ ਸੀਮਾ ਨਾਲੋਂ ਵੱਧ ਜਾਪਦੇ ਹਨ",
        "low_values": "ਇਹ ਮੁੱਲ ਉਮੀਦ ਕੀਤੀ ਸੀਮਾ ਨਾਲੋਂ ਘੱਟ ਜਾਪਦੇ ਹਨ",
        "needs_review": "ਇਹ ਮੁੱਲਾਂ ਦੀ ਵੀ ਸਮੀਖਿਆ ਜ਼ਰੂਰੀ ਹੈ",
        "all_normal": "ਜਾਂਚੇ ਗਏ ਸਾਰੇ ਮੁੱਲ ਆਮ ਸੀਮਾ ਵਿੱਚ ਹਨ",
        "pattern_noticed": "ਇੱਕ ਸੰਯੁਕਤ ਪੈਟਰਨ ਵੀ ਦੇਖਿਆ ਗਿਆ",
        "disclaimer": "ਇਹ ਸਹਾਇਕ ਮਾਰਗਦਰਸ਼ਨ ਹੈ। ਆਪਣੀ ਅੰਤਿਮ ਦੇਖਭਾਲ ਯੋਜਨਾ ਲਈ ਇਸ ਰਿਪੋਰਟ ਅਤੇ ਖੋਜਾਂ ਨੂੰ ਇੱਕ ਯੋਗ ਡਾਕਟਰ ਨਾਲ ਸਾਂਝਾ ਕਰੋ।",
    },
    "Bengali": {
        "high_values": "এই মানগুলি প্রত্যাশিত পরিসরের চেয়ে বেশি বলে মনে হচ্ছে",
        "low_values": "এই মানগুলি প্রত্যাশিত পরিসরের চেয়ে কম বলে মনে হচ্ছে",
        "needs_review": "এই মানগুলিরও পর্যালোচনা প্রয়োজন",
        "all_normal": "পরীক্ষিত সমস্ত মান স্বাভাবিক পরিসরে আছে",
        "pattern_noticed": "একটি সম্মিলিত প্যাটার্নও লক্ষ করা গেছে",
        "disclaimer": "এটি সহায়ক নির্দেশনা। আপনার চূড়ান্ত যত্ন পরিকল্পনার জন্য এই রিপোর্ট এবং ফলাফলগুলি একজন যোগ্য ডাক্তারের সাথে শেয়ার করুন।",
    },
    "Marathi": {
        "high_values": "हे मूल्ये अपेक्षित श्रेणीपेक्षा जास्त दिसतात",
        "low_values": "हे मूल्ये अपेक्षित श्रेणीपेक्षा कमी दिसतात",
        "needs_review": "या मूल्यांची देखील तपासणी आवश्यक आहे",
        "all_normal": "तपासलेली सर्व मूल्ये सामान्य श्रेणीत आहेत",
        "pattern_noticed": "एक एकत्रित नमुना देखील आढळला",
        "disclaimer": "हे सहाय्यक मार्गदर्शन आहे. तुमच्या अंतिम काळजी योजनेसाठी हा अहवाल आणि हे निष्कर्ष एका पात्र डॉक्टरांसोबत शेअर करा.",
    },
    "Urdu": {
        "high_values": "یہ اقدار متوقع حد سے زیادہ معلوم ہوتی ہیں",
        "low_values": "یہ اقدار متوقع حد سے کم معلوم ہوتی ہیں",
        "needs_review": "ان اقدار کا بھی جائزہ لینا ضروری ہے",
        "all_normal": "تمام جانچی گئی اقدار معمول کی حد میں ہیں",
        "pattern_noticed": "ایک مشترکہ نمونہ بھی نوٹ کیا گیا",
        "disclaimer": "یہ معاون رہنمائی ہے۔ اپنے حتمی علاج کے منصوبے کے لیے یہ رپورٹ اور نتائج ایک اہل ڈاکٹر کے ساتھ شیئر کریں۔",
    },
    "Arabic": {
        "high_values": "تبدو هذه القيم أعلى من النطاق المتوقع",
        "low_values": "تبدو هذه القيم أقل من النطاق المتوقع",
        "needs_review": "هذه القيم تحتاج أيضاً إلى مراجعة",
        "all_normal": "جميع القيم التي تم فحصها ضمن النطاق الطبيعي",
        "pattern_noticed": "لوحظ أيضاً نمط مشترك",
        "disclaimer": "هذا إرشاد داعم. يرجى مشاركة هذا التقرير والنتائج مع طبيب مؤهل لوضع خطة رعايتك النهائية.",
    },
    "Hindi": {
        "high_values": "ये मान अपेक्षित सीमा से अधिक प्रतीत होते हैं",
        "low_values": "ये मान अपेक्षित सीमा से कम प्रतीत होते हैं",
        "needs_review": "इन मानों की भी समीक्षा आवश्यक है",
        "all_normal": "जाँचे गए सभी मान सामान्य सीमा में हैं",
        "pattern_noticed": "एक संयुक्त पैटर्न भी देखा गया",
        "disclaimer": "यह सहायक मार्गदर्शन है। अपनी अंतिम देखभाल योजना के लिए यह रिपोर्ट और निष्कर्ष एक योग्य डॉक्टर के साथ साझा करें।",
    },
    "Spanish": {
        "high_values": "Estos valores parecen superiores al rango esperado",
        "low_values": "Estos valores parecen inferiores al rango esperado",
        "needs_review": "Estos valores también necesitan revisión",
        "all_normal": "Todos los valores analizados están dentro del rango normal",
        "pattern_noticed": "También se detectó un patrón combinado",
        "disclaimer": "Esta es una orientación de apoyo. Comparta este informe y estos hallazgos con un médico calificado para su plan de atención final.",
    },
    "German": {
        "high_values": "Diese Werte scheinen höher als der erwartete Bereich zu sein",
        "low_values": "Diese Werte scheinen niedriger als der erwartete Bereich zu sein",
        "needs_review": "Diese Werte müssen ebenfalls überprüft werden",
        "all_normal": "Alle geprüften Werte liegen im Normalbereich",
        "pattern_noticed": "Es wurde auch ein kombiniertes Muster festgestellt",
        "disclaimer": "Dies ist eine unterstützende Anleitung. Bitte teilen Sie diesen Bericht und diese Erkenntnisse mit einem qualifizierten Arzt für Ihren endgültigen Behandlungsplan.",
    },
    "French": {
        "high_values": "Ces valeurs semblent supérieures à la plage attendue",
        "low_values": "Ces valeurs semblent inférieures à la plage attendue",
        "needs_review": "Ces valeurs nécessitent également un examen",
        "all_normal": "Toutes les valeurs vérifiées sont dans la plage normale",
        "pattern_noticed": "Un schéma combiné a également été remarqué",
        "disclaimer": "Il s'agit d'une orientation de soutien. Veuillez partager ce rapport et ces résultats avec un médecin qualifié pour votre plan de soins final.",
    },
    "Italian": {
        "high_values": "Questi valori sembrano superiori all'intervallo atteso",
        "low_values": "Questi valori sembrano inferiori all'intervallo atteso",
        "needs_review": "Anche questi valori richiedono revisione",
        "all_normal": "Tutti i valori controllati rientrano nell'intervallo normale",
        "pattern_noticed": "È stato notato anche un pattern combinato",
        "disclaimer": "Questa è una guida di supporto. Si prega di condividere questo referto e questi risultati con un medico qualificato per il piano di cura finale.",
    },
    "Dutch": {
        "high_values": "Deze waarden lijken hoger dan het verwachte bereik",
        "low_values": "Deze waarden lijken lager dan het verwachte bereik",
        "needs_review": "Deze waarden hebben ook controle nodig",
        "all_normal": "Alle gecontroleerde waarden vallen binnen het normale bereik",
        "pattern_noticed": "Er werd ook een gecombineerd patroon opgemerkt",
        "disclaimer": "Dit is ondersteunende begeleiding. Deel dit rapport en deze bevindingen met een gekwalificeerde arts voor uw definitieve zorgplan.",
    },
    "Portuguese": {
        "high_values": "Estes valores parecem superiores ao intervalo esperado",
        "low_values": "Estes valores parecem inferiores ao intervalo esperado",
        "needs_review": "Estes valores também precisam de revisão",
        "all_normal": "Todos os valores verificados estão dentro do intervalo normal",
        "pattern_noticed": "Também foi notado um padrão combinado",
        "disclaimer": "Esta é uma orientação de apoio. Por favor, compartilhe este relatório e estas descobertas com um médico qualificado para o seu plano de cuidados final.",
    },
    "Polish": {
        "high_values": "Te wartości wydają się wyższe niż oczekiwany zakres",
        "low_values": "Te wartości wydają się niższe niż oczekiwany zakres",
        "needs_review": "Te wartości również wymagają przeglądu",
        "all_normal": "Wszystkie sprawdzone wartości mieszczą się w normalnym zakresie",
        "pattern_noticed": "Zauważono również połączony wzorzec",
        "disclaimer": "To są wskazówki pomocnicze. Prosimy podzielić się tym raportem i tymi ustaleniami z wykwalifikowanym lekarzem w celu opracowania ostatecznego planu opieki.",
    },
    "Turkish": {
        "high_values": "Bu değerler beklenen aralığın üzerinde görünüyor",
        "low_values": "Bu değerler beklenen aralığın altında görünüyor",
        "needs_review": "Bu değerler de inceleme gerektiriyor",
        "all_normal": "Kontrol edilen tüm değerler normal aralıkta",
        "pattern_noticed": "Kombinasyonlu bir örüntü de fark edildi",
        "disclaimer": "Bu destekleyici bir rehberliktir. Nihai bakım planınız için bu raporu ve bulguları nitelikli bir doktorla paylaşın.",
    },
    "Russian": {
        "high_values": "Эти значения превышают ожидаемый диапазон",
        "low_values": "Эти значения ниже ожидаемого диапазона",
        "needs_review": "Эти значения также требуют проверки",
        "all_normal": "Все проверенные значения находятся в пределах нормы",
        "pattern_noticed": "Также обнаружена комбинированная закономерность",
        "disclaimer": "Это вспомогательное руководство. Пожалуйста, поделитесь этим отчётом и результатами с квалифицированным врачом для составления окончательного плана лечения.",
    },
    "Chinese": {
        "high_values": "这些数值高于预期范围",
        "low_values": "这些数值低于预期范围",
        "needs_review": "这些数值也需要复查",
        "all_normal": "所有检查数值均在正常范围内",
        "pattern_noticed": "还发现了一个综合模式",
        "disclaimer": "这是辅助性指导。请将此报告和检查结果与有资质的医生分享，以制定最终的护理计划。",
    },
    "Japanese": {
        "high_values": "これらの値は予想範囲より高いようです",
        "low_values": "これらの値は予想範囲より低いようです",
        "needs_review": "これらの値も確認が必要です",
        "all_normal": "確認されたすべての値は正常範囲内です",
        "pattern_noticed": "複合的なパターンも見られました",
        "disclaimer": "これはサポートのためのガイダンスです。最終的なケアプランのために、このレポートと所見を資格のある医師と共有してください。",
    },
    "Korean": {
        "high_values": "이 수치들은 예상 범위보다 높게 나타납니다",
        "low_values": "이 수치들은 예상 범위보다 낮게 나타납니다",
        "needs_review": "이 수치들도 검토가 필요합니다",
        "all_normal": "확인된 모든 수치가 정상 범위 내에 있습니다",
        "pattern_noticed": "복합적인 패턴도 발견되었습니다",
        "disclaimer": "이것은 보조적인 안내입니다. 최종 진료 계획을 위해 이 보고서와 소견을 자격을 갖춘 의사와 공유하십시오.",
    },
    "Vietnamese": {
        "high_values": "Các giá trị này có vẻ cao hơn phạm vi dự kiến",
        "low_values": "Các giá trị này có vẻ thấp hơn phạm vi dự kiến",
        "needs_review": "Các giá trị này cũng cần được xem xét",
        "all_normal": "Tất cả các giá trị được kiểm tra đều trong phạm vi bình thường",
        "pattern_noticed": "Một mô hình kết hợp cũng được chú ý",
        "disclaimer": "Đây là hướng dẫn hỗ trợ. Vui lòng chia sẻ báo cáo và các phát hiện này với bác sĩ có chuyên môn để lập kế hoạch chăm sóc cuối cùng của bạn.",
    },
    "Indonesian": {
        "high_values": "Nilai-nilai ini tampak lebih tinggi dari rentang yang diharapkan",
        "low_values": "Nilai-nilai ini tampak lebih rendah dari rentang yang diharapkan",
        "needs_review": "Nilai-nilai ini juga perlu ditinjau",
        "all_normal": "Semua nilai yang diperiksa berada dalam rentang normal",
        "pattern_noticed": "Pola gabungan juga ditemukan",
        "disclaimer": "Ini adalah panduan pendukung. Silakan bagikan laporan dan temuan ini dengan dokter yang berkualifikasi untuk rencana perawatan akhir Anda.",
    },
    "Thai": {
        "high_values": "ค่าเหล่านี้ดูเหมือนจะสูงกว่าช่วงที่คาดไว้",
        "low_values": "ค่าเหล่านี้ดูเหมือนจะต่ำกว่าช่วงที่คาดไว้",
        "needs_review": "ค่าเหล่านี้ก็ต้องการการตรวจสอบเช่นกัน",
        "all_normal": "ค่าที่ตรวจสอบทั้งหมดอยู่ในช่วงปกติ",
        "pattern_noticed": "ยังพบรูปแบบผสมผสานด้วย",
        "disclaimer": "นี่คือคำแนะนำสนับสนุน กรุณาแบ่งปันรายงานและผลการค้นพบนี้กับแพทย์ที่มีคุณสมบัติเพื่อวางแผนการดูแลขั้นสุดท้ายของคุณ",
    },
}

def _get_phrases(language: str) -> dict:
    """Get audio script phrases for the given language, falling back to English."""
    return AUDIO_SCRIPT_PHRASES.get(language, AUDIO_SCRIPT_PHRASES["English"])


def _audio_script(result: dict, language: str = "English") -> str:
    """
    Build a complete spoken script from the result, fully in the target language.
    Uses pre-translated content from result + hardcoded native phrases for connectors.
    """
    phrases = _get_phrases(language)
    parts = []
    findings = result.get("findings") or []

    # Opening: summary (already translated)
    if result.get("summary"):
        parts.append(result["summary"])

    # Abnormal values — use translated finding names from result
    high_items = [item.get("name", "") for item in findings if item.get("status") != "normal" and _is_high(item)]
    low_items = [item.get("name", "") for item in findings if item.get("status") != "normal" and _is_low(item)]
    other_abnormal = [
        item.get("name", "")
        for item in findings
        if item.get("status") != "normal" and item.get("name", "") not in set(high_items + low_items)
    ]

    if high_items:
        parts.append(f"{phrases['high_values']}: {', '.join(high_items[:5])}.")
    if low_items:
        parts.append(f"{phrases['low_values']}: {', '.join(low_items[:5])}.")
    if other_abnormal:
        parts.append(f"{phrases['needs_review']}: {', '.join(other_abnormal[:5])}.")

    # All-normal case
    if not high_items and not low_items and not other_abnormal:
        parts.append(phrases["all_normal"] + ".")

    # Pattern summary (title already translated)
    patterns = result.get("patterns") or []
    if patterns:
        parts.append(f"{phrases['pattern_noticed']}: {patterns[0]['title']}.")

    # Specialist recommendation (already translated)
    if result.get("specialistReason"):
        parts.append(result["specialistReason"])

    # Dietary advice (already translated)
    if result.get("dietarySuggestions"):
        parts.append(result["dietarySuggestions"])

    # Closing disclaimer — fully in target language
    parts.append(phrases["disclaimer"])

    return " ".join(part.strip() for part in parts if part and part.strip())


def _is_high(finding: dict) -> bool:
    value = _extract_number(finding.get("value"))
    _, high = _extract_range(finding.get("normalRange", ""))
    return value is not None and high is not None and value > high


def _is_low(finding: dict) -> bool:
    value = _extract_number(finding.get("value"))
    low, _ = _extract_range(finding.get("normalRange", ""))
    return value is not None and low is not None and value < low


def _ensure_shape(result: dict, extracted_text: str) -> dict:
    result.setdefault("reportType", _report_type(extracted_text))
    # Preserve the English report type for bilingual display
    result["reportTypeEn"] = result.get("reportType", "")
    result.setdefault("summary", "The report has been read and the important findings are listed below.")
    result.setdefault("findings", [])
    result.setdefault("checklist", [])
    result.setdefault("dietarySuggestions", "")
    result.setdefault("specialist", "")
    result.setdefault("specialistReason", "")
    result.setdefault("urgency", "routine")
    result.setdefault("reportSignals", [])
    result.setdefault("multiReportInsight", "")
    return result


def _not_medical_result(language: str) -> dict:
    """Return a safe, clear result for non-medical uploads."""
    return {
        "reportType": "Not a Medical Report",
        "summary": (
            "The uploaded file does not appear to be a medical report. "
            "Please upload a blood test, imaging report, or other clinical document. "
            "No medical analysis has been performed."
        ),
        "findings": [],
        "patterns": [],
        "importantTerms": [],
        "emergencyAlert": None,
        "checklist": [
            "Please upload a genuine medical report such as a blood test, urine report, MRI, or CT scan.",
            "If you have a medical report, make sure the image is clear and readable.",
        ],
        "dietarySuggestions": "",
        "specialist": "",
        "specialistReason": "",
        "urgency": "",
        "overallStatus": "normal",
        "contextQuestions": [],
        "reportSignals": [],
        "multiReportInsight": "",
        "audioScript": (
            "The file you uploaded does not appear to be a medical report. "
            "Please try again with a blood test result, imaging report, or other clinical document."
        ),
    }


async def analyze(extracted_text: str, language: str, question: str = "") -> dict:
    cache_key = _cache_key(extracted_text, language)
    if cache_key in _analysis_cache and not question.strip():
        return _analysis_cache[cache_key]

    # ── Non-medical file guard ────────────────────────────────────────────────
    if not question.strip() and not _is_medical_report(extracted_text):
        result = _not_medical_result(language)
        if language not in ("", "English"):
            result = await ui_translate.translate_result(language, result)
        return result

    system_prompt = f"""You are a careful, conservative medical report interpreter.

STRICT RULES:
1. Write ALL explanation fields (summary, layman, tip, dietarySuggestions) in {language}.
2. NEVER invent or guess values not clearly present in the report text.
3. Extract EVERY SINGLE test parameter you can identify — do NOT stop early, do NOT skip any row.
   A CBC report with 20+ rows must produce 20+ findings. Missing even one value is a failure.
4. Keep medical meaning accurate. Do not present a final diagnosis.
5. Return ONLY valid JSON — no markdown, no extra text.
6. The "summary" field must be a complete, human-friendly explanation of the WHOLE report in {language} — at least 3-4 sentences. Use ONLY {language} words — no English phrases unless they are measurement units (g/dL, mg/dL) or the abbreviation is universally used in {language} medical writing.
7. For each finding, the "layman" field must explain what that value means for the patient in simple words in {language}.
8. Do NOT suggest specialist or urgency — those are handled separately.
9. IMPORTANT: The summary must read naturally when spoken aloud in {language}. Avoid mixing English sentences into {language} text.
10. Medical parameter NAMES in findings[].name must stay in English exactly as written in the report (e.g. "Hemoglobin", "Platelet Count") — never translate them.

JSON schema (return this exact structure):
{{
  "reportType": "short label for the type of report",
  "summary": "Complete plain-language summary of the entire report in {language}. Minimum 3 sentences. Explain what is normal, what needs attention, and what the overall picture means. Write entirely in {language}.",
  "findings": [
    {{
      "name": "exact parameter name from the report — in English, as written",
      "value": "exact value as written in the report",
      "normalRange": "reference range if shown in report",
      "status": "normal or warning or critical",
      "severity": "normal or mild or moderate or needs_attention",
      "layman": "simple explanation of what this value means for the patient, in {language}",
      "tip": "one short practical note for the patient, in {language}"
    }}
  ],
  "dietarySuggestions": "supportive food advice based on findings, written entirely in {language}. Add the phrase meaning 'These are supportive suggestions, not treatment' in {language}.",
  "urgency": "routine or soon or urgent"
}}"""

    user_msg = f"Medical report text:\n\n{extracted_text}"
    if question.strip():
        user_msg += f"\n\nUser question:\n{question.strip()}"

    payload = {
        "model": ANALYSIS_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
        "max_tokens": 6000,
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }

    # ── Retry loop — regenerate on language contamination ────────────────────
    MAX_RETRIES = 2
    for attempt in range(MAX_RETRIES + 1):
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(GROQ_BASE, json=payload, headers=get_headers())
        if response.status_code != 200:
            raise RuntimeError(f"Groq error {response.status_code}: {response.text[:300]}")

        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            raise ValueError("No model choices returned")
        raw = choices[0].get("message", {}).get("content", "").strip()
        result = _clean(_parse_json(raw))

        # Check for language contamination in key text fields
        contaminated = False
        for field in ("summary", "dietarySuggestions"):
            text_val = result.get(field, "")
            if text_val and _detect_language_contamination(text_val, language):
                contaminated = True
                break
        if not contaminated:
            for f in result.get("findings", []):
                for fk in ("layman", "tip"):
                    if _detect_language_contamination(f.get(fk, ""), language):
                        contaminated = True
                        break
                if contaminated:
                    break

        if not contaminated or attempt == MAX_RETRIES:
            break
        # Contamination detected — add explicit instruction and retry
        payload["messages"] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
            {"role": "assistant", "content": raw},
            {"role": "user", "content": (
                f"CORRECTION REQUIRED: Your previous response contained mixed-language text. "
                f"ALL explanation text (summary, layman, tip, dietarySuggestions) must be written "
                f"EXCLUSIVELY in {language}. No words from any other language are permitted. "
                f"Please regenerate the full JSON response with ONLY {language} text in those fields."
            )},
        ]
    result = _ensure_shape(result, extracted_text)
    result = _normalize_findings(result)
    result["overallStatus"] = _overall_status(result.get("findings", []))
    result["confidenceScore"] = _confidence_score(result, extracted_text)
    result["patterns"] = _build_patterns(result.get("findings", []))
    result["importantTerms"] = _important_terms(extracted_text)
    result["emergencyAlert"] = _emergency_alert(extracted_text, result.get("findings", []))
    specialist, reason = _specialist_from_content(result["patterns"], result["findings"], extracted_text)
    result["specialist"] = specialist
    result["specialistReason"] = reason
    result["contextQuestions"] = _context_questions(result["patterns"], result["findings"], extracted_text)
    result["checklist"] = _checklist(result["findings"], result["patterns"], specialist, result["emergencyAlert"])

    # Only use the English fallback dietary suggestion if the AI didn't provide one.
    # The AI is asked to write dietarySuggestions in the target language already.
    # The fallback (English) will be translated by translate_result when language != English.
    if not result.get("dietarySuggestions", "").strip():
        result["dietarySuggestions"] = _localized_dietary_suggestions(result["patterns"], result["findings"], language)

    result["reportSignals"] = _report_signals(result["findings"], result["patterns"], result["importantTerms"])
    result["multiReportInsight"] = _multi_report_insight(extracted_text, result["findings"])

    if result["emergencyAlert"]:
        result["urgency"] = "urgent"
    elif result["patterns"]:
        result["urgency"] = result["patterns"][0].get("urgency", result.get("urgency", "routine"))

    # Translate all fields to target language
    if language not in ("", "English"):
        result = await ui_translate.translate_result(language, result)

    # Build audio script AFTER translation — uses translated content + native phrases
    result["audioScript"] = _audio_script(result, language)

    if not question.strip():
        _analysis_cache[cache_key] = result
    return result
