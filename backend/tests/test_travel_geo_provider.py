import datetime
import os
import unittest

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/pocketbuddy_test")

from app.services.travel_geo import (  # noqa: E402
    build_geo_cache_key,
    build_geo_headers,
    get_geo_cache,
    normalize_geo_part,
    set_geo_cache,
    travel_geo_source_note,
    utc_now,
)
from app.api.travel import compute_route, settings  # noqa: E402


class FakeGeoCacheCollection:
    def __init__(self):
        self.docs = {}

    async def find_one(self, query):
        return self.docs.get(query["_id"])

    async def replace_one(self, query, doc, upsert=False):
        self.docs[query["_id"]] = doc


class FakeTravelDb:
    def __init__(self, cache):
        self.travel_geo_cache = cache


class TravelGeoProviderTests(unittest.IsolatedAsyncioTestCase):
    def test_geo_cache_key_normalizes_equivalent_queries(self):
        key_one = build_geo_cache_key(
            "place_geocode",
            "public_osm",
            "ABV-IIITM Gwalior",
            "  Gwalior   Station ",
        )
        key_two = build_geo_cache_key(
            "place_geocode",
            "public_osm",
            "abv iiitm gwalior",
            "gwalior station",
        )

        self.assertEqual(key_one, key_two)
        self.assertTrue(key_one.startswith("travel_geo:place_geocode:public_osm:"))

    def test_geo_headers_use_identifying_user_agent(self):
        headers = build_geo_headers("")

        self.assertIn("User-Agent", headers)
        self.assertIn("PocketBuddy", headers["User-Agent"])
        self.assertNotIn("python", headers["User-Agent"].lower())
        self.assertNotIn("httpx", headers["User-Agent"].lower())
        self.assertEqual(headers["Accept-Language"], "en-IN,en;q=0.9")

    async def test_geo_cache_ignores_expired_entries(self):
        cache = FakeGeoCacheCollection()
        key = build_geo_cache_key("route", "osrm", 26.2514, 78.1685, 26.2183, 78.1828)
        cache.docs[key] = {
            "_id": key,
            "payload": {"distance_km": 12.1},
            "expires_at": utc_now() - datetime.timedelta(minutes=1),
        }

        self.assertIsNone(await get_geo_cache(cache, key))

    async def test_geo_cache_round_trips_valid_payloads(self):
        cache = FakeGeoCacheCollection()
        key = build_geo_cache_key("route", "osrm", 26.2514, 78.1685, 26.2183, 78.1828)
        payload = {"distance_km": 12.1, "duration_mins": 28}

        await set_geo_cache(cache, key, kind="route", provider="osrm", payload=payload, ttl_days=7)

        self.assertEqual(await get_geo_cache(cache, key), payload)

    async def test_compute_route_can_reuse_cached_osrm_route_without_provider_call(self):
        cache = FakeGeoCacheCollection()
        db = FakeTravelDb(cache)
        lat1, lon1 = 26.2514, 78.1685
        lat2, lon2 = 26.2183, 78.1828
        base_url = settings.osrm_route_url.rstrip("/")
        key = build_geo_cache_key("osrm_route", base_url, lat1, lon1, lat2, lon2)
        cache.docs[key] = {
            "_id": key,
            "payload": {
                "distance_km": 8.4,
                "duration_mins": 24,
                "geometry": [[lat1, lon1], [lat2, lon2]],
            },
            "expires_at": utc_now() + datetime.timedelta(days=1),
        }

        result = await compute_route(lat1, lon1, lat2, lon2, db=db)

        self.assertEqual(result[0], 8.4)
        self.assertEqual(result[1], 24)
        self.assertEqual(result[6], "OSRM cached")
        self.assertTrue(result[7])

    def test_source_note_separates_demo_public_provider_from_production_option(self):
        note = travel_geo_source_note("https://nominatim.openstreetmap.org")

        self.assertIn("OpenStreetMap-compatible", note)
        self.assertIn("cache", note.lower())

    def test_source_note_names_configured_traffic_provider(self):
        note = travel_geo_source_note("https://api.tomtom.com")

        self.assertIn("Traffic-aware ETA", note)
        self.assertIn("fare guardrails", note)

    def test_normalize_geo_part_keeps_numeric_precision_stable(self):
        self.assertEqual(normalize_geo_part(26.25141234), "26.25141")
        self.assertEqual(normalize_geo_part("  City   Centre,   Gwalior "), "city centre gwalior")


if __name__ == "__main__":
    unittest.main()
