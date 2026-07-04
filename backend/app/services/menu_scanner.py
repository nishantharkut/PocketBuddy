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
    """
    Use free OCR.space API (Engine 2, proven to work) to extract text from a menu photo.
    Tries JPG first (most common from phone cameras), falls back to PNG detection.
    """
    import base64
    import urllib.request
    import urllib.parse
    import json

    base64_image = base64.b64encode(image_bytes).decode("utf-8")

    # Detect content type from magic bytes
    if image_bytes[:4] == b'\x89PNG':
        mime = "image/png"
        filetype = "PNG"
    elif image_bytes[:4] == b'GIF8':
        mime = "image/gif"
        filetype = "GIF"
    else:
        mime = "image/jpeg"
        filetype = "JPG"

    data = urllib.parse.urlencode({
        "apikey": settings.OCR_SPACE_API_KEY,
        "base64image": f"data:{mime};base64,{base64_image}",
        "language": "eng",
        "isOverlayRequired": "false",
        "filetype": filetype,
        "detectOrientation": "true",
        "scale": "true",
        "OCREngine": "2",          # Engine 2 proven to work for printed menus
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.ocr.space/parse/image",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=30.0) as response:
            res_data = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        logger.error("OCR.space network error: %s", exc)
        raise RuntimeError("Could not reach OCR service. Please try again.") from exc

    if res_data.get("IsErroredOnProcessing"):
        msg = res_data.get("ErrorMessage", ["OCR failed"])
        logger.warning("OCR.space processing error: %s", msg)
        raise ValueError(f"OCR error: {msg[0] if isinstance(msg, list) else msg}")

    results = res_data.get("ParsedResults", [])
    if not results:
        raise ValueError("No results returned from OCR service.")

    parsed_text = results[0].get("ParsedText", "").strip()
    if not parsed_text:
        raise ValueError("OCR returned empty text. Image may be too blurry or low-contrast.")

    logger.info("OCR.space extracted %d chars from image", len(parsed_text))
    return parsed_text


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


def spell_correct_item_name(item_name: str) -> tuple[str, bool]:
    """
    Fuzzy checks item_name against a standard list of campus food items.
    Returns (corrected_name, was_corrected).
    """
    canteen_dictionary = {
        "masala chai": "Masala Chai",
        "ginger tea": "Ginger Tea",
        "green tea": "Green Tea",
        "lemon tea": "Lemon Tea",
        "coffee": "Coffee",
        "cold coffee": "Cold Coffee",
        "milkshake": "Milkshake",
        "lassi": "Lassi",
        "chaas": "Chaas",
        "butter milk": "Butter Milk",
        "oreo shake": "Oreo Shake",
        "samosa": "Samosa",
        "kachori": "Kachori",
        "aloo paratha": "Aloo Paratha",
        "paneer paratha": "Paneer Paratha",
        "poha": "Poha",
        "idli": "Idli",
        "vada": "Vada",
        "dosa": "Dosa",
        "masala dosa": "Masala Dosa",
        "bread butter": "Bread Butter",
        "bun maska": "Bun Maska",
        "veg sandwich": "Veg Sandwich",
        "cheese sandwich": "Cheese Sandwich",
        "grilled sandwich": "Grilled Sandwich",
        "french fries": "French Fries",
        "veg thali": "Veg Thali",
        "special thali": "Special Thali",
        "mini thali": "Mini Thali",
        "dal tadka": "Dal Tadka",
        "dal makhani": "Dal Makhani",
        "paneer butter masala": "Paneer Butter Masala",
        "kadai paneer": "Kadai Paneer",
        "shahi paneer": "Shahi Paneer",
        "chana masala": "Chana Masala",
        "aloo gobhi": "Aloo Gobhi",
        "mix veg": "Mix Veg",
        "tandoori roti": "Tandoori Roti",
        "butter roti": "Butter Roti",
        "naan": "Naan",
        "butter naan": "Butter Naan",
        "laccha paratha": "Laccha Paratha",
        "jeera rice": "Jeera Rice",
        "veg biryani": "Veg Biryani",
        "chicken biryani": "Chicken Biryani",
        "veg maggi": "Veg Maggi",
        "cheese maggi": "Cheese Maggi",
        "egg maggi": "Egg Maggi",
        "masala maggi": "Masala Maggi",
        "veg noodles": "Veg Noodles",
        "hakka noodles": "Hakka Noodles",
        "schezwan noodles": "Schezwan Noodles",
        "veg momos": "Veg Momos",
        "fried momos": "Fried Momos",
        "paneer roll": "Paneer Roll",
        "egg roll": "Egg Roll",
        "chicken roll": "Chicken Roll",
        "veg burger": "Veg Burger",
        "cheese burger": "Cheese Burger",
    }
    val = item_name.strip().lower()
    if val in canteen_dictionary:
        return canteen_dictionary[val], False

    cleaned = val
    replacements = {
        "4": "a", "1": "i", "0": "o", "3": "e", "5": "s", "vg": "veg",
        "m4ggi": "maggi", "cha1": "chai", "rot1": "roti", "tha1i": "thali"
    }
    for k, v in replacements.items():
        cleaned = cleaned.replace(k, v)

    if cleaned in canteen_dictionary:
        return canteen_dictionary[cleaned], True

    def edit_distance(s1, s2):
        if len(s1) > len(s2):
            s1, s2 = s2, s1
        distances = range(len(s1) + 1)
        for i2, c2 in enumerate(s2):
            distances_ = [i2+1]
            for i1, c1 in enumerate(s1):
                if c1 == c2:
                    distances_.append(distances[i1])
                else:
                    distances_.append(1 + min((distances[i1], distances[i1 + 1], distances_[-1])))
            distances = distances_
        return distances[-1]

    best_match = None
    min_dist = 999
    for k, v in canteen_dictionary.items():
        if abs(len(cleaned) - len(k)) <= 2:
            dist = edit_distance(cleaned, k)
            if dist < min_dist:
                min_dist = dist
                best_match = v

    if min_dist <= 2 and best_match:
        return best_match, True
    return item_name, False


def _normalize_parsed_items(items: list[dict], venue_name: str, campus: str) -> list[dict[str, Any]]:
    """Normalize AI-parsed items into DB-ready documents with spelling checks."""
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

        corrected_name, was_corrected = spell_correct_item_name(item_name)
        price_paise = price * 100

        normalized.append({
            "id": f"{venue_name.lower().replace(' ', '_')}_{corrected_name.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}",
            "campus": campus,
            "venue_name": venue_name,
            "item_name": corrected_name,
            "was_corrected": was_corrected,
            "original_name": item_name if was_corrected else "",
            "category": item.get("category", "other"),
            "price": price_paise,
            "price_history": [{"price": price_paise, "changed_at": datetime.datetime.utcnow().isoformat()}],
            "status": "active",
            "verification_votes": 0,
            "verification_threshold": 3,
            "scanned_at": datetime.datetime.utcnow().isoformat(),
        })
    return normalized


def _heuristic_parse(raw_text: str, venue_name: str, campus: str) -> list[dict[str, Any]]:
    """
    Robust menu parser. Handles OCR.space Engine 2 output layouts:
      Next-line:  'Dal Tadka\nRs 59'
      Same-line:  'Dal Tadka  Rs. 59'
      With dashes: 'Dal Tadka ---- Rs. 59'
    Never treats a price line as an item name.
    """
    import re

    # Normalise common OCR noise
    text = (raw_text
            .replace("R$", "Rs").replace("Rs.", "Rs").replace("RS.", "Rs")
            .replace("₹", "Rs ").replace("Ps", "Rs").replace("Fs", "Rs"))

    lines = [l.strip() for l in text.split("\n")]

    # Regex: a line is ONLY a price (e.g. "Rs 59", "59", "INR 120")
    price_only_re = re.compile(r"^(?:Rs|INR|Re)?\s*(\d{1,4})\s*$", re.IGNORECASE)

    # Regex: price embedded at end of line (after dashes, spaces, etc.)
    # Handles: "Dal Tadka - - - Rs. 59", "Dal Tadka  59", "Dal Tadka Rs 59"
    inline_re = re.compile(
        r"^(.+?)\s*[-–—.\s]*(?:Rs|INR|Re|₹)?\s*(\d{1,4})\s*$",
        re.IGNORECASE
    )

    # Regex to DETECT if a line looks like a price (to skip as item name)
    looks_like_price = re.compile(
        r"^(?:Rs|INR|Re|₹|R\$|Ps|Fs)?\s*\d{1,4}\s*$", re.IGNORECASE
    )

    # Skip known non-item header words
    skip_words = {"main course", "starter", "appetizer", "dessert", "drinks",
                  "beverages", "snacks", "combo", "special", "menu", "today"}

    items: list[dict[str, Any]] = []
    skip_next = False

    for i, line in enumerate(lines):
        if skip_next:
            skip_next = False
            continue

        if not line or len(line) < 2:
            continue

        # Skip lines that are purely a price
        if looks_like_price.match(line):
            continue

        # Skip section headers
        if line.lower().strip(" :-") in skip_words:
            continue

        # Pattern 1: next line is the price
        if i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            pm = price_only_re.match(next_line)
            if pm:
                price = int(pm.group(1))
                item_name = _clean_name(line)
                if item_name and len(item_name) >= 2 and price > 0:
                    items.append(_make_item(item_name, price, venue_name, campus))
                    skip_next = True
                    continue

        # Pattern 2: price at end of same line
        im = inline_re.match(line)
        if im:
            raw_name = im.group(1)
            price = int(im.group(2))
            item_name = _clean_name(raw_name)
            # Make sure the name part isn't itself a price
            if item_name and len(item_name) >= 2 and price > 0 and not looks_like_price.match(item_name):
                items.append(_make_item(item_name, price, venue_name, campus))

    return items


def _clean_name(raw: str) -> str:
    """Clean up OCR noise from item names and apply title case."""
    import re
    # Remove trailing/leading punctuation, dashes, dots
    cleaned = re.sub(r"^[\s\-–—.:,|]+|[\s\-–—.:,|]+$", "", raw)
    # Remove sequences of dashes used as separators in menus
    cleaned = re.sub(r"[-–—]{2,}.*$", "", cleaned).strip()
    # Title-case: "DAL TADKA" → "Dal Tadka"
    if cleaned.isupper():
        cleaned = cleaned.title()
    return cleaned.strip()


def _make_item(item_name: str, price: int, venue_name: str, campus: str) -> dict[str, Any]:
    """Build a DB-ready menu item dict."""
    corrected_name, was_corrected = spell_correct_item_name(item_name)
    price_paise = price * 100
    return {
        "id": f"{venue_name.lower().replace(' ', '_')}_{corrected_name.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}",
        "campus": campus,
        "venue_name": venue_name,
        "item_name": corrected_name,
        "was_corrected": was_corrected,
        "original_name": item_name if was_corrected else "",
        "category": "other",
        "price": price_paise,
        "price_history": [{"price": price_paise, "changed_at": datetime.datetime.utcnow().isoformat()}],
        "status": "active",
        "verification_votes": 0,
        "verification_threshold": 3,
        "scanned_at": datetime.datetime.utcnow().isoformat(),
    }


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
