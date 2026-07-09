import os
import unittest

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/pocketbuddy_test")

from app.services.menu_scanner import (  # noqa: E402
    demo_menu_text_for_venue,
    structure_menu_text,
    upload_filetype_for_ocr,
)


class MenuScannerTests(unittest.TestCase):
    def test_upload_filetype_detects_pdf(self):
        mime, filetype = upload_filetype_for_ocr(b"%PDF-1.7\nsample")

        self.assertEqual(mime, "application/pdf")
        self.assertEqual(filetype, "PDF")

    def test_demo_menu_text_is_venue_shaped(self):
        canteen_text = demo_menu_text_for_venue("BH-2 Night Canteen")
        cafe_text = demo_menu_text_for_venue("Nescafe")

        self.assertIn("Veg Thali", canteen_text)
        self.assertIn("Masala Chai", cafe_text)

    def test_demo_menu_candidates_remain_pending_review(self):
        raw_text = demo_menu_text_for_venue("BH-2 Night Canteen")

        items = structure_menu_text(raw_text, "BH-2 Night Canteen", "ABV-IIITM Gwalior")

        self.assertGreaterEqual(len(items), 3)
        for item in items:
            self.assertEqual(item["status"], "pending_verification")
            self.assertTrue(item["needs_review"])
            self.assertGreaterEqual(item["verification_threshold"], 5)


if __name__ == "__main__":
    unittest.main()
