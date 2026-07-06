import datetime
import os
import unittest

import jwt
from fastapi.testclient import TestClient

os.environ["JWT_SECRET"] = "test-secret-for-privacy-contracts-minimum-32-bytes"
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017")

from app.api.account_aggregator import aa_runtime_state, build_sandbox_records
from app.api.auth import create_session_token
from app.api.webhook import (
    build_android_consent_id,
    clean_confidence,
    connector_ingest_block_reason,
    pairing_rotated_after_revocation,
)
from app.core.config import Settings, settings
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
            "DEMO_PHONE_AUTH_ENABLED": settings.DEMO_PHONE_AUTH_ENABLED,
            "ACCESS_TOKEN_EXPIRE_MINUTES": settings.ACCESS_TOKEN_EXPIRE_MINUTES,
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
        self.assertFalse(state["uses_sandbox_data"])

    def test_local_aa_sandbox_uses_separate_sandbox_records(self):
        settings.AA_SANDBOX_ENABLED = True
        settings.AA_SANDBOX_PROVIDER = "local"
        settings.AA_CALLBACK_SECRET = ""

        state = aa_runtime_state()
        records = build_sandbox_records(datetime.datetime(2026, 7, 7, 12, 0, 0))

        self.assertEqual(state["status"], "sandbox_ready")
        self.assertTrue(state["can_start_sandbox"])
        self.assertTrue(state["uses_sandbox_data"])
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

    def test_demo_phone_auth_is_disabled_by_default(self):
        self.assertFalse(Settings.model_fields["DEMO_PHONE_AUTH_ENABLED"].default)

    def test_phone_login_blocks_when_demo_mode_is_off(self):
        settings.DEMO_PHONE_AUTH_ENABLED = False

        response = TestClient(app).post("/api/auth/login/phone", json={"phone": "+919876543210"})

        self.assertEqual(response.status_code, 403)
        self.assertIn("disabled", response.json()["detail"])

    def test_auth_tokens_include_expiration(self):
        settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30

        token = create_session_token("user-1")
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])

        self.assertEqual(payload["userId"], "user-1")
        self.assertIn("iat", payload)
        self.assertIn("exp", payload)

    def test_connector_privacy_helpers_are_stable(self):
        self.assertEqual(clean_confidence("HIGH"), "high")
        self.assertEqual(clean_confidence(" medium "), "medium")
        self.assertIsNone(clean_confidence("certain"))
        self.assertEqual(
            build_android_consent_id("user-1", None),
            "android:user-1:unknown-device",
        )

    def test_connector_ingest_blocks_without_active_user_consent(self):
        active_profile = {"pairing_code": "PB-1234", "companion_sync_enabled": True}

        self.assertEqual(
            connector_ingest_block_reason({}, None),
            "connector_not_paired",
        )
        self.assertEqual(
            connector_ingest_block_reason({"pairing_code": "PB-1234", "companion_sync_enabled": False}, None),
            "sync_disabled_by_user",
        )
        self.assertEqual(
            connector_ingest_block_reason(active_profile, {"status": "paused"}),
            "sync_paused_by_user",
        )
        self.assertEqual(
            connector_ingest_block_reason(active_profile, {"status": "revoked"}),
            "consent_revoked_repair_required",
        )
        self.assertIsNone(connector_ingest_block_reason(active_profile, {"status": "active"}))

    def test_rotated_pairing_code_can_start_fresh_consent_after_revocation(self):
        revoked_at = datetime.datetime(2026, 7, 7, 10, 0, 0)
        consent = {"status": "revoked", "revoked_at": revoked_at}
        profile = {
            "pairing_code": "PB-NEWA",
            "companion_sync_enabled": True,
            "pairing_code_updated_at": revoked_at + datetime.timedelta(minutes=5),
        }

        self.assertTrue(pairing_rotated_after_revocation(profile, consent))
        self.assertIsNone(connector_ingest_block_reason(profile, consent))


if __name__ == "__main__":
    unittest.main()
