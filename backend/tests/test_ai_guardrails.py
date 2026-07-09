import unittest

from app.services.ai_guardrails import (
    GroundingError,
    ai_response_metadata,
    validate_grounded_advice,
)


class AiGuardrailTests(unittest.TestCase):
    def test_allows_backend_supplied_numbers_and_entities(self):
        text = validate_grounded_advice(
            "Try Egg Paratha at BH-2 for Rs 45. It fits the 8 hours food gap.",
            allowed_rupee_values=[45],
            allowed_time_values=[8],
            allowed_entities=["Egg Paratha", "BH-2"],
            require_entity=True,
        )

        self.assertIn("Egg Paratha", text)

    def test_rejects_invented_rupee_amounts(self):
        with self.assertRaises(GroundingError):
            validate_grounded_advice(
                "Keep spend under Rs 250 today.",
                allowed_rupee_values=[120],
            )

    def test_rejects_external_food_app_drift(self):
        with self.assertRaises(GroundingError):
            validate_grounded_advice(
                "Order from Zepto for Rs 45.",
                allowed_rupee_values=[45],
                forbidden_terms=["zepto"],
            )

    def test_allows_grounded_plain_numbers_when_enabled(self):
        text = validate_grounded_advice(
            "Rs 600 is scheduled across 3 commitments.",
            allowed_rupee_values=[600],
            allowed_plain_values=[3],
        )

        self.assertIn("3 commitments", text)

    def test_rejects_ungrounded_plain_numbers_when_enabled(self):
        with self.assertRaises(GroundingError):
            validate_grounded_advice(
                "Rs 600 is scheduled across 4 commitments.",
                allowed_rupee_values=[600],
                allowed_plain_values=[3],
            )

    def test_rejects_medical_overclaims(self):
        with self.assertRaises(GroundingError):
            validate_grounded_advice(
                "Your burnout risk is high, so eat soon.",
                allowed_time_values=[],
            )

    def test_metadata_labels_ai_vs_fallback(self):
        ai_meta = ai_response_metadata(source="bedrock", facts_used=["safe_daily_spend_rs=120"])
        fallback_meta = ai_response_metadata(
            source="local_fallback",
            facts_used=["safe_daily_spend_rs=120"],
            fallback_reason="bedrock_unavailable",
        )

        self.assertEqual(ai_meta["advice_label"], "Grounded AI advice")
        self.assertEqual(ai_meta["grounding"]["status"], "grounded")
        self.assertTrue(fallback_meta["grounding"]["fallback_used"])
        self.assertEqual(fallback_meta["grounding"]["fallback_reason"], "bedrock_unavailable")


if __name__ == "__main__":
    unittest.main()
