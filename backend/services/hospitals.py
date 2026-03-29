"""
Hospitals Service
Strategy:
1. Try Overpass API (OpenStreetMap) - real hospital data, free
2. If Overpass fails, try Nominatim search for hospitals
3. Always return a Google Maps search link as guaranteed fallback
"""
import httpx
import json
import re


async def find_hospitals(location: str, specialist: str, language: str) -> list:
    """Find nearby hospitals. Multiple fallback strategies."""

    # Strategy 1: Overpass API via geocode first
    result = await _try_overpass(location, specialist)
    if result:
        return result

    # Strategy 2: Nominatim direct hospital search
    result = await _try_nominatim_search(location, specialist)
    if result:
        return result

    # Strategy 3: Always guaranteed — Google Maps deep links
    return _google_maps_fallback(location, specialist)


async def _try_overpass(location: str, specialist: str) -> list:
    """Try Overpass API for real hospital data."""
    try:
        headers = {"User-Agent": "ReportEase/1.0"}

        # Geocode location
        async with httpx.AsyncClient(timeout=10.0) as client:
            geo = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": location, "format": "json", "limit": 1},
                headers=headers
            )
        geo_data = geo.json()
        if not geo_data:
            return []

        lat = float(geo_data[0]["lat"])
        lon = float(geo_data[0]["lon"])

        # Overpass query
        query = f"""[out:json][timeout:15];
(node["amenity"~"hospital|clinic"](around:15000,{lat},{lon});
 way["amenity"~"hospital|clinic"](around:15000,{lat},{lon}););
out center 5;"""

        async with httpx.AsyncClient(timeout=20.0) as client:
            ov = await client.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": query},
                headers=headers
            )

        if ov.status_code != 200:
            return []

        text = ov.text.strip()
        if not text or text[0] != '{':
            return []

        ov_data = json.loads(text)
        elements = ov_data.get("elements", [])
        if not elements:
            return []

        hospitals = []
        for el in elements[:4]:
            tags   = el.get("tags", {})
            name   = tags.get("name") or tags.get("name:en") or "Hospital"
            phone  = tags.get("phone") or tags.get("contact:phone") or "Not available"
            hours  = tags.get("opening_hours") or "Contact for timings"
            addr_parts = [
                tags.get("addr:housenumber", ""),
                tags.get("addr:street", ""),
                tags.get("addr:suburb", ""),
                tags.get("addr:city", ""),
            ]
            address = ", ".join(p for p in addr_parts if p) or location
            el_lat  = float(el.get("lat") or el.get("center", {}).get("lat", lat))
            el_lon  = float(el.get("lon") or el.get("center", {}).get("lon", lon))
            dist_km = round(_dist(lat, lon, el_lat, el_lon), 1)
            hospitals.append({
                "name":        name,
                "address":     address,
                "phone":       phone,
                "hours":       hours,
                "appointment": "Walk-in or call ahead",
                "distance":    f"{dist_km} km",
                "mapsUrl":     f"https://www.google.com/maps/search/?api=1&query={name.replace(' ', '+')}+{address.replace(' ', '+')}",
            })
        return hospitals

    except Exception as e:
        print(f"[HOSPITALS] Overpass failed: {e}")
        return []


async def _try_nominatim_search(location: str, specialist: str) -> list:
    """Search Nominatim directly for hospitals near location."""
    try:
        headers = {"User-Agent": "ReportEase/1.0"}
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": f"hospital {location}",
                    "format": "json",
                    "limit": 4,
                    "addressdetails": 1,
                },
                headers=headers
            )
        data = resp.json()
        if not data:
            return []

        hospitals = []
        for item in data[:4]:
            addr    = item.get("address", {})
            city    = addr.get("city") or addr.get("town") or addr.get("village") or location
            road    = addr.get("road") or addr.get("suburb") or ""
            name    = item.get("display_name", "").split(",")[0]
            address = f"{road}, {city}".strip(", ")
            hospitals.append({
                "name":        name,
                "address":     address,
                "phone":       "Search Google Maps for contact",
                "hours":       "Varies — call ahead",
                "appointment": "Call or walk in",
                "distance":    "Near " + location,
                "mapsUrl":     f"https://www.google.com/maps/search/?api=1&query={name.replace(' ', '+')}+{address.replace(' ', '+')}",
            })
        return hospitals
    except Exception as e:
        print(f"[HOSPITALS] Nominatim search failed: {e}")
        return []


def _google_maps_fallback(location: str, specialist: str) -> list:
    """Guaranteed fallback — direct Google Maps search links."""
    queries = [
        f"{specialist} hospital {location}",
        f"hospital near {location}",
        f"medical clinic {location}",
    ]
    return [{
        "name":        f"Search: {specialist} near {location}",
        "address":     location,
        "phone":       "See Google Maps",
        "hours":       "Varies by hospital",
        "appointment": "Search online to book",
        "distance":    "—",
        "mapsUrl":     f"https://www.google.com/maps/search/?api=1&query={queries[0].replace(' ', '+')}",
    }, {
        "name":        f"Search: Hospitals near {location}",
        "address":     location,
        "phone":       "See Google Maps",
        "hours":       "Varies",
        "appointment": "Walk-in or call ahead",
        "distance":    "—",
        "mapsUrl":     f"https://www.google.com/maps/search/?api=1&query={queries[1].replace(' ', '+')}",
    }]


def _dist(lat1, lon1, lat2, lon2) -> float:
    from math import radians, sin, cos, sqrt, atan2
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))
