import datetime
import hashlib
import re
from typing import Any, Optional


DEFAULT_GEO_USER_AGENT = (
    "PocketBuddy-TravelGuard/1.0 "
    "(https://github.com/nishantharkut/PocketBuddy; student travel affordability demo)"
)


def utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC).replace(tzinfo=None)


def normalize_geo_part(value: Any) -> str:
    """Normalize cache-key parts without losing meaningful place intent."""
    if isinstance(value, float):
        return f"{value:.5f}"
    if isinstance(value, int):
        return str(value)

    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9.]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def build_geo_cache_key(kind: str, provider: str, *parts: Any) -> str:
    normalized_parts = [normalize_geo_part(part) for part in parts]
    digest = hashlib.sha256("|".join(normalized_parts).encode("utf-8")).hexdigest()[:24]
    kind_slug = normalize_geo_part(kind).replace(" ", "_")
    provider_slug = normalize_geo_part(provider).replace(" ", "_")
    return f"travel_geo:{kind_slug}:{provider_slug}:{digest}"


def build_geo_headers(user_agent: Optional[str]) -> dict[str, str]:
    agent = str(user_agent or "").strip()
    if not agent or agent.lower() in {"python", "python-requests", "httpx"}:
        agent = DEFAULT_GEO_USER_AGENT
    return {
        "User-Agent": agent,
        "Accept-Language": "en-IN,en;q=0.9",
    }


def travel_geo_source_note(base_url: str) -> str:
    url = str(base_url or "").lower()
    if "nominatim.openstreetmap.org" in url:
        return "Place lookup uses an OpenStreetMap-compatible geocoder through PocketBuddy's backend cache."
    if "router.project-osrm.org" in url:
        return "Mapped road route from an OSRM-compatible provider, cached by PocketBuddy. This is not live ride-app pricing."
    if "photon.komoot.io" in url:
        return "Search suggestions use an OpenStreetMap-compatible provider through PocketBuddy's backend cache."
    if "api.tomtom.com" in url:
        return "Traffic-aware ETA uses the configured TomTom provider; PocketBuddy still computes fare guardrails separately."
    return "Configured travel geo provider with backend caching."


def cache_expiry(ttl_days: int) -> datetime.datetime:
    safe_ttl_days = max(1, int(ttl_days or 1))
    return utc_now() + datetime.timedelta(days=safe_ttl_days)


async def get_geo_cache(collection: Any, cache_key: str) -> Optional[dict[str, Any]]:
    doc = await collection.find_one({"_id": cache_key})
    if not doc:
        return None

    expires_at = doc.get("expires_at")
    if isinstance(expires_at, datetime.datetime) and expires_at <= utc_now():
        return None

    payload = doc.get("payload")
    return payload if isinstance(payload, dict) else None


async def set_geo_cache(
    collection: Any,
    cache_key: str,
    *,
    kind: str,
    provider: str,
    payload: dict[str, Any],
    ttl_days: int,
) -> None:
    now = utc_now()
    await collection.replace_one(
        {"_id": cache_key},
        {
            "_id": cache_key,
            "kind": kind,
            "provider": provider,
            "payload": payload,
            "created_at": now,
            "expires_at": cache_expiry(ttl_days),
        },
        upsert=True,
    )
