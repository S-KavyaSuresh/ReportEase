"""
Analysis Service — Groq
Model: meta-llama/llama-4-scout-17b-16e-instruct

Parameter name format: ABBR (English full name) (local language name)
Example Tamil:   HB (Hemoglobin) (ஹீமோகுளோபின்)
Example Hindi:   WBC (White Blood Cells) (श्वेत रक्त कोशिकाएं)
Example English: HB (Hemoglobin)
"""
import json
import re
import httpx
from config import ANALYSIS_MODEL, GROQ_BASE, get_headers


def _strip_md(text):
    if not isinstance(text, str): return text
    text = re.sub(r'\*{1,3}([^*\n]+)\*{1,3}', r'\1', text)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*[-•*]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    return text.strip()


def _clean(obj):
    if isinstance(obj, dict):  return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, list):  return [_clean(i) for i in obj]
    if isinstance(obj, str):   return _strip_md(obj)
    return obj


def _parse_json(raw: str) -> dict:
    if not raw or not raw.strip():
        raise ValueError("Empty response")
    raw = raw.strip()
    raw = re.sub(r'```json\s*', '', raw)
    raw = re.sub(r'```\s*', '', raw)
    raw = raw.strip()
    start = raw.find('{')
    end   = raw.rfind('}')
    if start == -1 or end == -1:
        raise ValueError(f"No JSON. Got: {raw[:200]}")
    candidate = raw[start:end + 1]
    candidate = re.sub(r',(\s*[}\]])', r'\1', candidate)
    return json.loads(candidate)


# Dictionary: abbr -> (English full name, {language: local name})
PARAM_DICT = {
    'HB':            ('Hemoglobin',                       {'Tamil':'ஹீமோகுளோபின்',      'Hindi':'हीमोग्लोबिन',          'Telugu':'హిమోగ్లోబిన్',    'Kannada':'ಹಿಮೋಗ್ಲೋಬಿನ್',   'Malayalam':'ഹീമോഗ്ലോബിൻ'}),
    'Hemoglobin':    ('Hemoglobin',                       {'Tamil':'ஹீமோகுளோபின்',      'Hindi':'हीमोग्लोबिन',          'Telugu':'హిమోగ్లోబిన్',    'Kannada':'ಹಿಮೋಗ್ಲೋಬಿನ್',   'Malayalam':'ഹീമോഗ്ലോബിൻ'}),
    'WBC':           ('White Blood Cells',                {'Tamil':'வெள்ளை ரத்த அணுக்கள்','Hindi':'श्वेत रक्त कोशिकाएं','Telugu':'తెల్ల రక్త కణాలు', 'Kannada':'ಬಿಳಿ ರಕ್ತ ಕಣಗಳು', 'Malayalam':'വെളുത്ത രക്താണുക്കൾ'}),
    'RBC':           ('Red Blood Cells',                  {'Tamil':'சிவப்பு ரத்த அணுக்கள்','Hindi':'लाल रक्त कोशिकाएं', 'Telugu':'ఎర్ర రక్త కణాలు',  'Kannada':'ಕೆಂಪು ರಕ್ತ ಕಣಗಳು','Malayalam':'ചുവന്ന രക്താണുക്കൾ'}),
    'MCV':           ('Mean Cell Volume',                 {'Tamil':'சராசரி செல் வால்யூம்','Hindi':'औसत कोशिका आयतन',    'Telugu':'సగటు కణ పరిమాణం',  'Kannada':'ಸರಾಸರಿ ಕಣ ಗಾತ್ರ', 'Malayalam':'ശരാശരി കോശ അളവ്'}),
    'MCH':           ('Mean Cell Hemoglobin',             {'Tamil':'சராசரி செல் ஹீமோகுளோபின்','Hindi':'औसत कोशिका हीमोग्लोबिन','Telugu':'సగటు కణ హిమోగ్లోబిన్','Kannada':'ಸರಾಸರಿ ಕಣ ಹಿಮೋಗ್ಲೋಬಿನ್','Malayalam':'ശരാശരി കോശ ഹീമോഗ്ലോബിൻ'}),
    'MCHC':          ('Mean Cell Hemoglobin Concentration',{'Tamil':'சராசரி செல் ஹீமோகுளோபின் செறிவு','Hindi':'औसत कोशिका हीमोग्लोबिन सांद्रता','Telugu':'సగటు కణ హిమోగ్లోబిన్ సాంద్రత','Kannada':'ಸರಾಸರಿ ಕಣ ಹಿಮೋಗ್ಲೋಬಿನ್ ಸಾಂದ್ರತೆ','Malayalam':'ശരാശരി കോശ ഹീമോഗ്ലോബിൻ സാന്ദ്രത'}),
    'HCT':           ('Hematocrit',                       {'Tamil':'ஹீமடோகிரிட்',       'Hindi':'हेमेटोक्रिट',          'Telugu':'హెమటోక్రిట్',      'Kannada':'ಹೆಮಟೋಕ್ರಿಟ್',    'Malayalam':'ഹെമറ്റോക്രിറ്റ്'}),
    'PCV':           ('Packed Cell Volume',               {'Tamil':'பேக்ட் செல் வால்யூம்','Hindi':'पैक्ड सेल वॉल्यूम', 'Telugu':'ప్యాక్డ్ సెల్ వాల్యూమ్','Kannada':'ಪ್ಯಾಕ್ಡ್ ಸೆಲ್ ವಾಲ್ಯೂಮ್','Malayalam':'പാക്ക്ഡ് സെൽ വോളിയം'}),
    'ESR':           ('Erythrocyte Sedimentation Rate',   {'Tamil':'இரத்த வீழ்வு வேகம்','Hindi':'रक्त अवसादन दर',       'Telugu':'రక్తం అవక్షేపణ రేటు','Kannada':'ರಕ್ತ ಅವಕ್ಷೇಪ ದರ', 'Malayalam':'ഏരിത്രോസൈറ്റ് അവസാദന നിരക്ക്'}),
    'Platelet Count':('Platelet Count',                   {'Tamil':'பிளேட்லெட் எண்ணிக்கை','Hindi':'प्लेटलेट गिनती',    'Telugu':'ప్లేట్‌లెట్ గణన',  'Kannada':'ಪ್ಲೇಟ್‌ಲೆಟ್ ಎಣಿಕೆ', 'Malayalam':'പ്ലേറ്റ്‌ലെറ്റ് എണ്ണം'}),
    'Platelets':     ('Platelets',                        {'Tamil':'பிளேட்லெட்ஸ்',       'Hindi':'प्लेटलेट्स',          'Telugu':'ప్లేట్‌లెట్లు',    'Kannada':'ಪ್ಲೇಟ್‌ಲೆಟ್‌ಗಳು', 'Malayalam':'പ്ലേറ്റ്‌ലെറ്റുകൾ'}),
    'Neutrophils':   ('Neutrophils',                      {'Tamil':'நியூட்ரோபில்ஸ்',    'Hindi':'न्यूट्रोफिल',          'Telugu':'న్యూట్రోఫిల్స్',   'Kannada':'ನ್ಯೂಟ್ರೋಫಿಲ್ಸ್',  'Malayalam':'ന്യൂട്രോഫിൽസ്'}),
    'Lymphocytes':   ('Lymphocytes',                      {'Tamil':'லிம்போசைட்ஸ்',      'Hindi':'लिम्फोसाइट',           'Telugu':'లింఫోసైట్లు',     'Kannada':'ಲಿಂಫೋಸೈಟ್ಸ್',   'Malayalam':'ലിംഫോസൈറ്റുകൾ'}),
    'Monocytes':     ('Monocytes',                        {'Tamil':'மோனோசைட்ஸ்',        'Hindi':'मोनोसाइट',             'Telugu':'మోనోసైట్లు',       'Kannada':'ಮೋನೋಸೈಟ್ಸ್',    'Malayalam':'മോണോസൈറ്റുകൾ'}),
    'Eosinophils':   ('Eosinophils',                      {'Tamil':'ஈசினோபில்ஸ்',       'Hindi':'ईओसिनोफिल',           'Telugu':'ఈసినోఫిల్స్',     'Kannada':'ಈಸಿನೋಫಿಲ್ಸ್',   'Malayalam':'ഇയോസിനോഫിൽസ്'}),
    'Basophils':     ('Basophils',                        {'Tamil':'பேசோபில்ஸ்',         'Hindi':'बेसोफिल',              'Telugu':'బేసోఫిల్స్',      'Kannada':'ಬೇಸೋಫಿಲ್ಸ್',    'Malayalam':'ബേസോഫിൽസ്'}),
    'TSH':           ('Thyroid Stimulating Hormone',      {'Tamil':'தைராய்டு ஹார்மோன்', 'Hindi':'थायराइड हार्मोन',     'Telugu':'థైరాయిడ్ హార్మోన్','Kannada':'ಥೈರಾಯ್ಡ್ ಹಾರ್ಮೋನ್','Malayalam':'തൈറോയ്ഡ് ഹോർമോൺ'}),
    'Blood Sugar':   ('Blood Sugar',                      {'Tamil':'இரத்த சர்க்கரை',    'Hindi':'रक्त शर्करा',          'Telugu':'రక్తంలో చక్కెర',   'Kannada':'ರಕ್ತದ ಸಕ್ಕರೆ',   'Malayalam':'രക്തത്തിലെ പഞ്ചസാര'}),
    'Glucose':       ('Glucose',                          {'Tamil':'குளுக்கோஸ்',         'Hindi':'ग्लूकोज',              'Telugu':'గ్లూకోజ్',          'Kannada':'ಗ್ಲೂಕೋಸ್',       'Malayalam':'ഗ്ലൂക്കോസ്'}),
    'Creatinine':    ('Creatinine',                       {'Tamil':'கிரியேட்டினின்',    'Hindi':'क्रिएटिनिन',           'Telugu':'క్రియాటినిన్',     'Kannada':'ಕ್ರಿಯೇಟಿನಿನ್',   'Malayalam':'ക്രിയേറ്റിനിൻ'}),
    'Urea':          ('Urea',                             {'Tamil':'யூரியா',             'Hindi':'यूरिया',               'Telugu':'యూరియా',            'Kannada':'ಯೂರಿಯಾ',         'Malayalam':'യൂറിയ'}),
    'Total WBC Count':('Total White Blood Cell Count',   {'Tamil':'மொத்த வெள்ளை ரத்த அணுக்கள்','Hindi':'कुल श्वेत रक्त कोशिकाएं','Telugu':'మొత్తం తెల్ల రక్త కణాలు','Kannada':'ಒಟ್ಟು ಬಿಳಿ ರಕ್ತ ಕಣಗಳು','Malayalam':'ആകെ വെളുത്ത രക്താണുക്കൾ'}),
    'Total RBC Count':('Total Red Blood Cell Count',     {'Tamil':'மொத்த சிவப்பு ரத்த அணுக்கள்','Hindi':'कुल लाल रक्त कोशिकाएं','Telugu':'మొత్తం ఎర్ర రక్త కణాలు','Kannada':'ಒಟ್ಟು ಕೆಂಪು ರಕ್ತ ಕಣಗಳು','Malayalam':'ആകെ ചുവന്ന രക്താണുക്കൾ'}),
}


def format_name(abbr: str, language: str) -> str:
    """Format: ABBR (English Full Name) (Local Language Name)"""
    entry = PARAM_DICT.get(abbr)
    if not entry:
        return abbr
    eng_full, local_map = entry
    local = local_map.get(language, '')
    if abbr.strip().lower() == eng_full.strip().lower():
        if language == 'English' or not local:
            return eng_full
        return f"{eng_full} ({local})"
    if language == 'English' or not local:
        return f"{abbr} ({eng_full})"
    return f"{abbr} ({eng_full}) ({local})"

def _fix_all_names(result: dict, language: str) -> dict:
    """Post-process: replace all finding names using our dictionary."""
    for f in result.get('findings', []):
        raw_name = f.get('name', '')
        # Extract just the abbreviation part (before any brackets)
        abbr = re.split(r'\s*[\(\（]', raw_name)[0].strip()
        if abbr in PARAM_DICT:
            f['name'] = format_name(abbr, language)
        # else leave as-is (unknown params like "Blood Pressure")
    return result


def _detect_report_type(extracted_text: str) -> str:
    text = (extracted_text or "").lower()
    patterns = [
        ("Complete Blood Count (CBC) Report", ["cbc", "hemoglobin", "wbc", "rbc", "platelet"]),
        ("Blood Sugar Report", ["glucose", "hba1c", "fasting blood sugar", "postprandial"]),
        ("Liver Function Report", ["sgpt", "sgot", "bilirubin", "alkaline phosphatase"]),
        ("Kidney Function Report", ["creatinine", "urea", "egfr", "uric acid"]),
        ("Thyroid Report", ["tsh", "t3", "t4", "thyroid"]),
        ("Urine Report", ["urine", "pus cells", "epithelial cells", "albumin"]),
        ("Lipid Profile Report", ["cholesterol", "hdl", "ldl", "triglycerides"]),
    ]
    for label, keywords in patterns:
        if sum(1 for keyword in keywords if keyword in text) >= 2:
            return label
    return "Medical Report"


def _extract_number(value) -> float | None:
    if value is None:
        return None
    match = re.search(r'-?\d+(?:\.\d+)?', str(value).replace(',', ''))
    return float(match.group()) if match else None


def _extract_range(range_text: str):
    if not range_text:
        return None, None
    cleaned = str(range_text).replace(',', '')
    cleaned = re.sub(r'(?<=\d)\s*-\s*(?=\d)', ' to ', cleaned)
    numbers = re.findall(r'\d+(?:\.\d+)?', cleaned)
    if len(numbers) >= 2:
        return float(numbers[0]), float(numbers[1])
    return None, None


DEFAULT_RANGES = {
    "HB": "13.0-17.0 gm/dl",
    "Hemoglobin": "13.0-17.0 gm/dl",
    "HCT": "40-50%",
    "Hematocrit": "40-50%",
    "RBC": "4.5-5.5 million/cmm",
    "Red Blood Cells": "4.5-5.5 million/cmm",
    "WBC": "4000-11000 cells/cumm",
    "White Blood Cells": "4000-11000 cells/cumm",
    "MCV": "83-101 fl",
    "Mean Cell Volume": "83-101 fl",
    "MCH": "27-33 pg",
    "Mean Cell Hemoglobin": "27-33 pg",
    "MCHC": "32-38%",
    "Mean Cell Hemoglobin Concentration": "32-38%",
    "Platelet Count": "150000-450000 /cumm",
    "Platelets": "150000-450000 /cumm",
}


def _base_parameter_name(name: str) -> str:
    return re.split(r'\s*[\(\[]', name or '')[0].strip()


def _default_range_for(name: str) -> str:
    base = _base_parameter_name(name)
    if base in DEFAULT_RANGES:
        return DEFAULT_RANGES[base]
    for key, value in DEFAULT_RANGES.items():
        if key.lower() == base.lower():
            return value
    return ""


def _normalize_finding_copy(finding: dict, status: str, direction: str | None):
    label = _base_parameter_name(finding.get("name") or "This parameter") or "This parameter"
    if status == "normal":
        finding["layman"] = f"{label} is within the normal range."
        finding["tip"] = "No specific action needed for this parameter."
        return
    if status == "warning":
        finding["layman"] = f"{label} is slightly {direction} than normal."
        finding["tip"] = "Please discuss this with a doctor if you have symptoms or ongoing health concerns."
        return
    if status == "critical":
        finding["layman"] = f"{label} is {direction} than the normal range."
        finding["tip"] = "Please consult a doctor for proper evaluation."
        return
    finding["layman"] = f"{label} is reported, but the normal range is not available in this document."
    finding["tip"] = "Please confirm this value with your doctor."


def _reconcile_finding_statuses(result: dict) -> dict:
    findings = result.get("findings") or []
    for finding in findings:
        if not finding.get("normalRange"):
            finding["normalRange"] = _default_range_for(finding.get("name", ""))
        value = _extract_number(finding.get("value"))
        low, high = _extract_range(finding.get("normalRange"))
        if value is None or low is None or high is None:
            finding["status"] = "warning"
            _normalize_finding_copy(finding, "unknown", None)
            continue
        if low <= value <= high:
            finding["status"] = "normal"
            _normalize_finding_copy(finding, "normal", None)
            continue

        if value < low:
            direction = "lower"
            deviation = (low - value) / low if low else 1
        else:
            direction = "higher"
            deviation = (value - high) / high if high else 1

        finding["status"] = "warning" if deviation <= 0.15 else "critical"
        _normalize_finding_copy(finding, finding["status"], direction)
    if findings and any(item.get("status") == "critical" for item in findings):
        result["overallStatus"] = "attention"
    elif findings and any(item.get("status") == "warning" for item in findings):
        result["overallStatus"] = "borderline"
    else:
        result["overallStatus"] = "normal"
    return result


def _finding_label(finding: dict) -> str:
    name = (finding.get("name") or "").strip()
    return name or "This parameter"


def _ensure_audio_script(result: dict, language: str) -> dict:
    summary = (result.get("summary") or "").strip()
    findings = result.get("findings") or []
    important_terms = result.get("importantTerms") or []
    checklist = result.get("checklist") or []
    abnormal = [item for item in findings if item.get("status") in {"critical", "warning"}][:4]

    parts = []
    if summary:
        parts.append(summary)
    for finding in abnormal:
        explanation = finding.get("layman") or finding.get("tip") or ""
        if explanation:
            parts.append(f"{_finding_label(finding)}: {explanation}")
    for item in important_terms[:2]:
        meaning = (item.get("meaning") or "").strip()
        if meaning:
            parts.append(meaning)
    if checklist:
        parts.append(checklist[0])
    emergency = (result.get("emergencyAlert") or {}).get("message")
    if emergency:
        parts.append(emergency)
    if not parts:
        parts.append(f"I have analyzed your report in {language}.")
    result["audioScript"] = " ".join(part.strip() for part in parts if part and part.strip())
    return result


def _localize_report_type(label: str, language: str) -> str:
    labels = {
        "Complete Blood Count (CBC) Report": {
            "Tamil": "முழு இரத்த எண்ணிக்கை (CBC) அறிக்கை",
            "Hindi": "पूर्ण रक्त गणना (CBC) रिपोर्ट",
            "Telugu": "పూర్తి రక్త పరీక్ష (CBC) నివేదిక",
            "Kannada": "ಸಂಪೂರ್ಣ ರಕ್ತ ಗಣನೆ (CBC) ವರದಿ",
            "Malayalam": "സമ്പൂർണ്ണ രക്ത പരിശോധന (CBC) റിപ്പോർട്ട്",
        },
        "Blood Sugar Report": {
            "Tamil": "இரத்த சர்க்கரை அறிக்கை",
            "Hindi": "ब्लड शुगर रिपोर्ट",
            "Telugu": "రక్తంలో చక్కెర నివేదిక",
            "Kannada": "ರಕ್ತ ಸಕ್ಕರೆ ವರದಿ",
            "Malayalam": "രക്തത്തിലെ പഞ്ചസാര റിപ്പോർട്ട്",
        },
        "Liver Function Report": {
            "Tamil": "கல்லீரல் செயல்பாட்டு அறிக்கை",
            "Hindi": "लिवर फ़ंक्शन रिपोर्ट",
            "Telugu": "కాలేయ పనితీరు నివేదిక",
            "Kannada": "ಯಕೃತ್ತಿನ ಕಾರ್ಯ ವರದಿ",
            "Malayalam": "കരൾ പ്രവർത്തന റിപ്പോർട്ട്",
        },
        "Kidney Function Report": {
            "Tamil": "சிறுநீரக செயல்பாட்டு அறிக்கை",
            "Hindi": "किडनी फ़ंक्शन रिपोर्ट",
            "Telugu": "మూత్రపిండ పనితీరు నివేదిక",
            "Kannada": "ಮೂತ್ರಪಿಂಡ ಕಾರ್ಯ ವರದಿ",
            "Malayalam": "വൃക്ക പ്രവർത്തന റിപ്പോർട്ട്",
        },
        "Thyroid Report": {
            "Tamil": "தைராய்டு அறிக்கை",
            "Hindi": "थायरॉइड रिपोर्ट",
            "Telugu": "థైరాయిడ్ నివేదిక",
            "Kannada": "ಥೈರಾಯ್ಡ್ ವರದಿ",
            "Malayalam": "തൈറോയ്ഡ് റിപ്പോർട്ട്",
        },
        "Urine Report": {
            "Tamil": "சிறுநீர் அறிக்கை",
            "Hindi": "मूत्र रिपोर्ट",
            "Telugu": "మూత్ర నివేదిక",
            "Kannada": "ಮೂತ್ರ ವರದಿ",
            "Malayalam": "മൂത്ര റിപ്പോർട്ട്",
        },
        "Lipid Profile Report": {
            "Tamil": "கொழுப்பு சுயவிவர அறிக்கை",
            "Hindi": "लिपिड प्रोफ़ाइल रिपोर्ट",
            "Telugu": "లిపిడ్ ప్రొఫైల్ నివేదిక",
            "Kannada": "ಲಿಪಿಡ್ ಪ್ರೊಫೈಲ್ ವರದಿ",
            "Malayalam": "ലിപിഡ് പ്രൊഫൈൽ റിപ്പോർട്ട്",
        },
        "Medical Report": {
            "Tamil": "மருத்துவ அறிக்கை",
            "Hindi": "मेडिकल रिपोर्ट",
            "Telugu": "వైద్య నివేదిక",
            "Kannada": "ವೈದ್ಯಕೀಯ ವರದಿ",
            "Malayalam": "മെഡിക്കൽ റിപ്പോർട്ട്",
        },
    }
    if language == "English":
        return label
    return labels.get(label, {}).get(language, label)


def _detect_attention_terms(extracted_text: str, findings: list, language: str) -> list:
    attention_messages = {
        "English": 'This term appears in the report as "{term}". This may need attention. Would you like me to explain it?',
        "Tamil": '???? ???? ??????????? "{term}" ????? ??????. ?????? ????? ????????????. ???? ?????????? ?????????',
        "Hindi": '?? ???? ??????? ??? "{term}" ?? ??? ??? ??? ?? ?? ????? ???? ??? ???? ??? ???? ??? ???? ???? ???????',
        "Telugu": '? ??? ????????? "{term}" ??? ????. ?????? ?????? ????? ???????. ???? ????? ?????????',
        "Kannada": '? ???? ????????? "{term}" ???? ??????. ?????? ??? ????????????. ??? ????????? ????????????',
        "Malayalam": '? ??? ???????????? "{term}" ????? ????????. ????? ?????? ??????????. ??????? ???? ????????????????',
    }
    text = extracted_text or ""
    lower = text.lower()
    watched = ["lesion", "mass", "infarct", "blockage", "inflammation"]
    found = []

    for term in watched:
        if term in lower:
            found.append({
                "term": term,
                "meaning": attention_messages.get(language, attention_messages["English"]).format(term=term),
                "severity": "attention",
            })

    for finding in findings or []:
        if finding.get("status") in {"warning", "critical"}:
            term = finding.get("name", "")
            if term and not any(item["term"] == term for item in found):
                found.append({
                    "term": term,
                    "meaning": finding.get("layman") or finding.get("tip") or term,
                    "severity": finding.get("status"),
                })
    return found[:6]


def _detect_emergency(extracted_text: str, findings: list, language: str):
    reasons = []
    text = (extracted_text or "").lower()

    for finding in findings or []:
        name = (finding.get("name") or "").lower()
        value = (finding.get("value") or "").lower()
        if ("glucose" in name or "sugar" in name) and any(token in value for token in ["400", "450", "500"]):
            reasons.append("very high sugar")
        if ("hb" in name or "hemoglobin" in name) and any(token in value for token in ["4", "5", "6"]):
            reasons.append("very low hemoglobin")

    if any(token in text for token in ["stroke", "infarct", "brain infarct", "cva"]):
        reasons.append("stroke indicators")

    if not reasons:
        return None

    messages = {
        "English": "This may require urgent medical attention. Please visit a hospital immediately.",
        "Tamil": "?????? ????? ???????? ????? ????????????. ?????????? ???? ??????????????? ???????????.",
        "Hindi": "??? ????? ?????????? ????? ?? ?????? ?? ???? ??? ????? ????? ??????? ?????",
        "Telugu": "??? ??????? ????? ?????? ????? ???????. ?????? ?????? ?????????? ????????.",
        "Kannada": "?????? ?????? ???????? ??? ????????????. ???????? ????? ?????????? ????.",
        "Malayalam": "????? ???????? ?????????? ??????????. ?????? ??? ??????????? ?????.",
    }
    return {
        "isEmergency": True,
        "message": messages.get(language, messages["English"]),
        "reasons": list(dict.fromkeys(reasons)),
    }


async def analyze(extracted_text: str, language: str, question: str = "") -> dict:
    ex_abbrs = ['HB', 'WBC', 'RBC', 'MCV']
    examples = '\n'.join(
        f'  - {format_name(a, language)}'
        for a in ex_abbrs if a in PARAM_DICT
    )

    system_prompt = f"""You are a medical report interpreter helping patients understand their reports.

PARAMETER NAME FORMAT - CRITICAL:
Each parameter \"name\" field must follow this exact format:
  ABBREVIATION (English Full Name) ({language} Name)

Examples:
{examples}

If the language is English, format is: ABBREVIATION (English Full Name)
Use only English and {language} in the brackets.
All explanations, summaries, tips, and report type must be in {language} only.
Return ONLY a valid JSON object. No markdown.

{{
  \"reportType\": \"Short report type label in {language}\",
  \"summary\": \"8-14 sentences in {language}. Mention the main important terms exactly as written in the report. If multiple documents are present, clearly mention what was found in each document by document name.\",
  \"overallStatus\": \"normal\",
  \"findings\": [
    {{
      \"name\": \"ABBR (English Full Name) ({language} name)\",
      \"value\": \"exact value from report\",
      \"normalRange\": \"normal range with units\",
      \"status\": \"normal\",
      \"layman\": \"Simple explanation in {language}\",
      \"tip\": \"One practical advice in {language}\"
    }}
  ],
  \"hiddenConcerns\": null,
  \"checklist\": [\"Step 1 in {language}\"],
  \"dietarySuggestions\": \"3-4 sentences in {language}\",
  \"specialist\": \"English Specialist Name ({language} translation)\",
  \"specialistReason\": \"One sentence in {language}\",
  \"urgency\": \"routine\",
  \"audioScript\": \"Warm spoken explanation in {language}\"
}}"""

    user_msg = f"Medical report:\n\n{extracted_text}"
    if question.strip():
        user_msg += f"\n\nPatient question: {question.strip()}"

    payload = {
        "model": ANALYSIS_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
        "max_tokens": 2500,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(GROQ_BASE, json=payload, headers=get_headers())

    if resp.status_code != 200:
        raise RuntimeError(f"Groq error {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    choices = data.get("choices")
    if not choices:
        raise ValueError(f"No choices: {data}")
    raw = choices[0].get("message", {}).get("content", "").strip()
    if not raw:
        raise ValueError("Empty response")

    result = _parse_json(raw)
    result = _clean(result)
    result = _fix_all_names(result, language)
    result = _reconcile_finding_statuses(result)
    fallback_report_type = _detect_report_type(extracted_text)
    result["reportType"] = result.get("reportType") or _localize_report_type(fallback_report_type, language)
    result["importantTerms"] = _detect_attention_terms(extracted_text, result.get("findings", []), language)
    result["emergencyAlert"] = _detect_emergency(extracted_text, result.get("findings", []), language)
    result = _ensure_audio_script(result, language)
    return result


