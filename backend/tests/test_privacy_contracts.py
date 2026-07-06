import datetime
import os
import unittest

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017")

from app.api.account_aggregator import aa_runtime_state, build_sandbox_records
from app.api.webhook import build_android_consent_id, clean_confidence
from app.core.config import settings
from app.main import app


class PrivacyContractTests(unittest.TestCase):
    def setUp(self):
        self.original_settings = {
            "AA_SANDBOX_ENABLED": settings.AA_SANDBOX_ENABLED,
            "AA_SANDBOX_PROVIDER": settings.AA_SANDBOX_PROVIDER,
            "AA_SANDBOX_BASE_URL": settings.AA_SANDBOX_BASE_URL,
            "AA_CLIENT_ID": settings.AA_CLIENT_ID,
            "AA_CLIENT_SECRET": settings.AA_CLIENT_SECRET,
            "AA_FIU_ID": settings.AA_FIU_ID,
            "AA_CALLBACK_SECRET": settings.AA_CALLBACK_SECRET,
        }

    def tearDown(self):
        for key, value in self.original_settings.items():
            setattr(settings, key, value)

    def test_aa_sandbox_is_disabled_until_explicitly_enabled(self):
        settings.AA_SANDBOX_ENABLED = False
        settings.AA_SANDBOX_PROVIDER = "local"

        state = aa_runtime_state()

        self.assertEqual(state["status"], "not_configured")
        self.assertFalse(state["can_start_sandbox"])
        self.assertFalse(state["uses_dummy_data"])

    def test_local_aa_sandbox_is_dummy_data_only(self):
        settings.AA_SANDBOX_ENABLED = True
        settings.AA_SANDBOX_PROVIDER = "local"
        settings.AA_CALLBACK_SECRET = ""

        state = aa_runtime_state()
        records = build_sandbox_records(datetime.datetime(2026, 7, 7, 12, 0, 0))

        self.assertEqual(state["status"], "sandbox_ready")
        self.assertTrue(state["can_start_sandbox"])
        self.assertTrue(state["uses_dummy_data"])
        self.assertEqual(len(records), 3)
        self.assertTrue(all(record["transaction_reference"].startswith("AA-SBX-") for record in records))
        self.assertTrue(all(record["masked_account_ref"].startswith("XXXX") for record in records))

    def test_provider_sandbox_reports_missing_required_credentials(self):
        settings.AA_SANDBOX_ENABLED = True
        settings.AA_SANDBOX_PROVIDER = "provider"
        settings.AA_SANDBOX_BASE_URL = ""
        settings.AA_CLIENT_ID = ""
        settings.AA_CLIENT_SECRET = ""
        settings.AA_FIU_ID = ""
        settings.AA_CALLBACK_SECRET = ""

        state = aa_runtime_state()

        self.assertEqual(state["status"], "misconfigured")
        self.assertIn("AA_CLIENT_ID", state["required_env"])
        self.assertFalse(state["can_start_sandbox"])

    def test_strict_connector_route_is_registered(self):
        paths = {route.path for route in app.routes}

        self.assertIn("/api/ingest/notification-v2", paths)
        self.assertIn("/api/ingest/notification", paths)

    def test_connector_privacy_helpers_are_stable(self):
        self.assertEqual(clean_confidence("HIGH"), "high")
        self.assertEqual(clean_confidence(" medium "), "medium")
        self.assertIsNone(clean_confidence("certain"))
        self.assertEqual(
            build_android_consent_id("user-1", None),
            "android:user-1:unknown-device",
        )


if __name__ == "__main__":
    unittest.main()
