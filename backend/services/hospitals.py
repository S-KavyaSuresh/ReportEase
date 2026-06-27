import asyncio
import asyncio
import json
from math import atan2, cos, radians, sin, sqrt

import httpx

from config import ANALYSIS_MODEL, GROQ_BASE, get_headers

USER_AGENT = {"User-Agent": "ReportEase/5.0"}

_TRANSLATED_STRINGS_CACHE: dict[str, dict] = {}
_NAME_PRONUNCIATION_CACHE: dict[str, str] = {}

HOSPITAL_STATIC_EN = {
    "call_for_number": "Call hospital for current number",
    "call_to_confirm": "Please call to confirm timings",
    "call_ahead":      "Call ahead or use the maps link to check booking options",
    "open_maps":       "Open in Maps",
    "phone_label":     "Phone",
    "hours_label":     "Hours",
    "km_label":        "km",
}

HOSPITAL_STATIC_TAMIL = {
    "call_for_number": "எண்ணை உறுதிப்படுத்த மருத்துவமனைக்கு அழைக்கவும்",
    "call_to_confirm": "வருகைக்கு முன் நேரத்தை உறுதிப்படுத்தவும்",
    "call_ahead":      "முன்கூட்டியே அழைத்து முன்பதிவு விவரங்களை சரிபார்க்கவும்",
    "open_maps":       "வரைபடத்தில் திறக்கவும்",
    "phone_label":     "தொலைபேசி",
    "hours_label":     "நேரம்",
    "km_label":        "கிமீ",
}

# Languages that need pronunciation of English names
_NEEDS_PRONUNCIATION = {
    "Tamil", "Telugu", "Kannada", "Malayalam", "Hindi", "Marathi",
    "Bengali", "Gujarati", "Punjabi", "Thai", "Korean", "Japanese",
    "Chinese", "Arabic", "Urdu",
}


async def _groq_with_backoff(payload: dict, max_retries: int = 3) -> dict:
    """Call Groq with exponential backoff."""
    delay = 1.5
    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(GROQ_BASE, json=payload, headers=get_headers())
        except (httpx.ReadTimeout, httpx.ConnectTimeout):
            if attempt < max_retries:
                await asyncio.sleep(delay)
                delay = min(delay * 2, 12)
                continue
            raise
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code in (429, 502, 503) and attempt < max_retries:
            retry_after = resp.headers.get("retry-after")
            wait = float(retry_after) if retry_after else delay
            await asyncio.sleep(min(wait, 15.0))
            delay = min(delay * 2, 15)
            continue
        raise RuntimeError(f"Groq {resp.status_code}: {resp.text[:150]}")
    raise RuntimeError("Groq retries exhausted")


async def _get_translated_strings(language: str) -> dict:
    """Get translated hospital static strings for a given language."""
    if language in ("", "English"):
        return HOSPITAL_STATIC_EN
    if language == "Tamil":
        return HOSPITAL_STATIC_TAMIL
    if language in _TRANSLATED_STRINGS_CACHE:
        return _TRANSLATED_STRINGS_CACHE[language]

    system_prompt = (
        f"Translate all values in this JSON into {language}. "
        f"Keep JSON keys exactly as-is. Return ONLY valid JSON, no markdown."
    )
    payload = {
        "model": ANALYSIS_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": json.dumps(HOSPITAL_STATIC_EN, ensure_ascii=False)},
        ],
        "temperature": 0,
        "max_tokens": 600,
        "response_format": {"type": "json_object"},
    }
    try:
        data = await _groq_with_backoff(payload)
        result = json.loads(data["choices"][0]["message"]["content"])
        _TRANSLATED_STRINGS_CACHE[language] = result
        return result
    except Exception:
        return HOSPITAL_STATIC_EN


async def _get_name_pronunciation(name: str, language: str) -> str:
    """Return the phonetic pronunciation of a hospital name in the target language script."""
    if language in ("", "English"):
        return ""
    cache_key = f"{language}::{name}"
    if cache_key in _NAME_PRONUNCIATION_CACHE:
        return _NAME_PRONUNCIATION_CACHE[cache_key]

    payload = {
        "model": ANALYSIS_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    f"You transliterate English proper nouns into {language} script. "
                    f"Given an English hospital or clinic name, write ONLY how it is "
                    f"pronounced in {language} script (phonetic transliteration). "
                    f"Do NOT translate the meaning. Do NOT add any explanation. "
                    f"Return ONLY the {language} script pronunciation, nothing else. "
                    f"Example: 'City General Hospital' in Tamil → 'சிட்டி ஜெனரல் ஹாஸ்பிட்டல்'"
                ),
            },
            {"role": "user", "content": name},
        ],
        "temperature": 0,
        "max_tokens": 80,
    }
    try:
        data = await _groq_with_backoff(payload)
        pronunciation = data["choices"][0]["message"]["content"].strip()
        # Sanity check: result should contain target-language characters
        _NAME_PRONUNCIATION_CACHE[cache_key] = pronunciation
        return pronunciation
    except Exception:
        return ""


async def find_hospitals(location: str, specialist: str, language: str) -> list:
    strings = await _get_translated_strings(language)
    provider_result = await _try_openstreetmap_provider(location, specialist, strings, language)
    if provider_result:
        return provider_result
    return []


async def _try_openstreetmap_provider(
    location: str, specialist: str, strings: dict, language: str
) -> list:
    needs_pronunciation = language in _NEEDS_PRONUNCIATION
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            geo = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": location, "format": "json", "limit": 1},
                headers=USER_AGENT,
            )
        places = geo.json()
        if not places:
            return []
        lat = float(places[0]["lat"])
        lon = float(places[0]["lon"])

        query = f"""[out:json][timeout:18];
(
  node["amenity"~"hospital|clinic|doctors"](around:15000,{lat},{lon});
  way["amenity"~"hospital|clinic|doctors"](around:15000,{lat},{lon});
);
out center 8;"""

        async with httpx.AsyncClient(timeout=20.0) as client:
            result = await client.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": query},
                headers=USER_AGENT,
            )
        if result.status_code != 200 or not result.text.strip().startswith("{"):
            return []
        osm_payload = json.loads(result.text)
        items = []
        specialist_lower = (specialist or "").lower()

        for element in osm_payload.get("elements", [])[:8]:
            tags = element.get("tags", {})
            name = tags.get("name") or tags.get("name:en") or "Hospital / Clinic"
            address = ", ".join(
                part
                for part in [
                    tags.get("addr:housenumber", ""),
                    tags.get("addr:street", ""),
                    tags.get("addr:suburb", ""),
                    tags.get("addr:city", ""),
                ]
                if part
            ) or location

            raw_phone = tags.get("phone") or tags.get("contact:phone")
            phone = raw_phone if raw_phone else strings.get("call_for_number", HOSPITAL_STATIC_EN["call_for_number"])

            raw_hours = tags.get("opening_hours")
            hours = raw_hours if raw_hours else strings.get("call_to_confirm", HOSPITAL_STATIC_EN["call_to_confirm"])

            appointment     = strings.get("call_ahead",  HOSPITAL_STATIC_EN["call_ahead"])
            open_maps_label = strings.get("open_maps",   HOSPITAL_STATIC_EN["open_maps"])
            phone_label     = strings.get("phone_label", HOSPITAL_STATIC_EN["phone_label"])
            hours_label     = strings.get("hours_label", HOSPITAL_STATIC_EN["hours_label"])
            km_label        = strings.get("km_label",    HOSPITAL_STATIC_EN["km_label"])

            el_lat   = float(element.get("lat") or element.get("center", {}).get("lat", lat))
            el_lon   = float(element.get("lon") or element.get("center", {}).get("lon", lon))
            distance = round(_distance_km(lat, lon, el_lat, el_lon), 1)
            relevance = 1
            haystack = f"{name} {tags.get('healthcare:speciality', '')} {tags.get('description', '')}".lower()
            if specialist_lower and specialist_lower.split("/")[0].strip().lower() in haystack:
                relevance = 0

            items.append({
                "name":          name,
                "namePronunciation": "",  # filled below
                "address":       address,
                "phone":         phone,
                "phoneLabel":    phone_label,
                "hours":         hours,
                "hoursLabel":    hours_label,
                "appointment":   appointment,
                "openMapsLabel": open_maps_label,
                "distance":      f"{distance} {km_label}",
                "mapsUrl":       f"https://www.google.com/maps/search/?api=1&query={name.replace(' ', '+')}+{address.replace(' ', '+')}",
                "_relevance":    relevance,
            })

        items.sort(key=lambda item: (item["_relevance"], float(item["distance"].split()[0])))
        top_items = [{k: v for k, v in item.items() if k != "_relevance"} for item in items[:5]]

        # Add name pronunciations for non-English scripts (batch, staggered)
        if needs_pronunciation and top_items:
            for i, item in enumerate(top_items):
                if i > 0:
                    await asyncio.sleep(0.3)   # stagger to avoid rate limit
                pronunciation = await _get_name_pronunciation(item["name"], language)
                item["namePronunciation"] = pronunciation

        return top_items
    except Exception:
        return []


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return radius * 2 * atan2(sqrt(a), sqrt(1 - a))
