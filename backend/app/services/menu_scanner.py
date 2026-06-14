"""
Menu Scanner Service – Photo-to-menu pipeline using AWS Textract + Bedrock.

Flow:
  1. Student uploads a photo of a physical menu board/sign.
  2. Textract (standard text detection) extracts raw text from the image.
  3. Bedrock/Nova structures the raw text into menu item records.
  4. Items enter the DB as "pending_verification" for crowdsource voting.
"""

import json
import logging
import uuid
import datetime
from typing import Any

from app.core.config import settings
from app.services.bedrock import generate_json

logger = logging.getLogger(__name__)


def _textract_client():
    import boto3
    return boto3.client("textract", region_name=settings.AWS_REGION)


def _s3_client():
    import boto3
    return boto3.client("s3", region_name=settings.AWS_REGION)


def extract_text_from_image(image_bytes: bytes) -> str:
    """Use AWS Textract DetectDocumentText to OCR a menu image."""
    try:
        client = _textract_client()
        response = client.detect_document_text(
            Document={"Bytes": image_bytes}
        )
        lines = []
        for block in response.get("Blocks", []):
            if block["BlockType"] == "LINE":
                lines.append(block.get("Text", ""))
        return "\n".join(lines)
    except Exception as exc:
        logger.error("Textract OCR failed: %s", exc)
        raise


def structure_menu_text(raw_text: str, venue_name: str, campus: str) -> list[dict[str, Any]]:
    """Use Bedrock/Nova to parse raw OCR text into structured menu items."""
    if not settings.BEDROCK_ENABLED:
        # Fallback: simple line-by-line heuristic parsing
        return _heuristic_parse(raw_text, venue_name, campus)

    try:
        prompt = f"""
        You are a menu parser for an Indian campus canteen/food stall.
        Below is raw OCR text extracted from a photo of a menu board at "{venue_name}" on campus "{campus}".

        Raw OCR text:
        ---
        {raw_text[:2000]}
        ---

        Task:
        Extract all food/drink items with their prices. Return a JSON object with a single key "items" containing an array.
        Each item must have:
        - "item_name": string (the food/drink name, cleaned up from OCR artifacts)
        - "price": number (price in INR rupees, as a whole number)
        - "category": string (one of: "snack", "meal", "beverage", "dessert", "other")

        If a price cannot be determined, set it to 0.
        If an item name is garbled, skip it.
        Output ONLY valid JSON. Do not wrap in markdown fences.
        """
        result = generate_json(prompt, max_tokens=1000, temperature=0.1)
        items = result.get("items", [])
        return _normalize_parsed_items(items, venue_name, campus)
    except Exception as exc:
        logger.warning("Bedrock menu parsing failed, using heuristic: %s", exc)
        return _heuristic_parse(raw_text, venue_name, campus)


def _normalize_parsed_items(items: list[dict], venue_name: str, campus: str) -> list[dict[str, Any]]:
    """Normalize AI-parsed items into DB-ready documents."""
    normalized = []
    for item in items:
        item_name = (item.get("item_name") or "").strip()
        if not item_name:
            continue
        price = item.get("price", 0)
        try:
            price = int(float(price))
        except (TypeError, ValueError):
            price = 0

        normalized.append({
            "id": f"{venue_name.lower().replace(' ', '_')}_{item_name.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}",
            "campus": campus,
            "venue_name": venue_name,
            "item_name": item_name,
            "category": item.get("category", "other"),
            "price": price * 100,  # Convert to paise
            "status": "pending_verification",
            "verification_votes": 0,
            "verification_threshold": 3,
            "scanned_at": datetime.datetime.utcnow().isoformat(),
        })
    return normalized


def _heuristic_parse(raw_text: str, venue_name: str, campus: str) -> list[dict[str, Any]]:
    """
    Simple fallback parser: look for lines with a number
    that could be a price (pattern: "item name ... NN" or "item name ₹NN").
    """
    import re
    items = []
    for line in raw_text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # Try to find a price at the end of the line
        match = re.search(r"[₹Rs.]*\s*(\d{1,4})\s*$", line)
        if match:
            price = int(match.group(1))
            item_name = line[:match.start()].strip(" .-–—:|\t")
            if item_name and len(item_name) > 1 and price > 0:
                items.append({
                    "id": f"{venue_name.lower().replace(' ', '_')}_{item_name.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}",
                    "campus": campus,
                    "venue_name": venue_name,
                    "item_name": item_name,
                    "category": "other",
                    "price": price * 100,
                    "status": "pending_verification",
                    "verification_votes": 0,
                    "verification_threshold": 3,
                    "scanned_at": datetime.datetime.utcnow().isoformat(),
                })
    return items


async def upload_to_s3(image_bytes: bytes, filename: str) -> str:
    """Upload the raw menu image to S3 for auditing (if bucket configured)."""
    if not settings.CAMPUS_FOOD_S3_BUCKET:
        return ""
    try:
        client = _s3_client()
        key = f"menu-scans/{datetime.datetime.utcnow().strftime('%Y/%m/%d')}/{filename}"
        client.put_object(
            Bucket=settings.CAMPUS_FOOD_S3_BUCKET,
            Key=key,
            Body=image_bytes,
            ContentType="image/jpeg",
        )
        return f"s3://{settings.CAMPUS_FOOD_S3_BUCKET}/{key}"
    except Exception as exc:
        logger.warning("S3 upload failed: %s", exc)
        return ""

