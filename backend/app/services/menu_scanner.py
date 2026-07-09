"""
Menu Scanner Service - photo-to-menu helpers.

Flow:
  1. Student uploads a photo of a physical menu board/sign.
  2. OCR.space extracts raw text when OCR_SPACE_API_KEY is configured.
  3. Deterministic heuristics structure raw OCR text into review candidates.
  4. If BEDROCK_ENABLED is true, Bedrock may assist with text structuring.
     Model output is sanitized and still remains pending community review.
  5. API endpoints decide whether and how those candidates enter review.
"""

import json
import logging
import uuid
import datetime
from typing import Any

from app.core.config import settings
from app.services.campus_food import compute_food_verification_threshold

logger = logging.getLogger(__name__)


def demo_menu_text_for_venue(venue_name: str) -> str:
    """
    Demo-mode fallback menu text.

    This is intentionally venue-shaped, not file-shaped: it exists only to keep
    a recorded demo unblocked when OCR is not configured or a sample PDF cannot
    be read. API callers still store the resulting rows as pending verification
    candidates, never as trusted menu data.
    """
    venue = str(venue_name or "").lower()
    if any(k in venue for k in ("bh2", "bh-2", "night", "late")):
        return "Egg Paratha 45\nMasala Maggi 35\nAloo Paratha 40\nPaneer Roll 70\nTea 10\nCold Coffee 50"
    if any(k in venue for k in ("nescafe", "coffee", "cafe", "library")):
        return "Cold Coffee 55\nVeg Sandwich 45\nCheese Sandwich 60\nSamosa 15\nMasala Chai 15\nBrownie 40"
    if any(k in venue for k in ("juice", "shake", "smoothie")):
        return "Banana Shake 35\nOreo Shake 60\nLemon Soda 25\nPoha 25\nSprout Salad 45"
    if any(k in venue for k in ("tea", "chai")):
        return "Cutting Chai 10\nMasala Chai 15\nSamosa 15\nKachori 18\nBun Maska 25"
    if any(k in venue for k in ("canteen", "mess", "dining", "hostel", "main")):
        return "Veg Thali 70\nRajma Rice 60\nChole Rice 65\nPaneer Fried Rice 75\nCurd 20\nTea 10"
    if any(k in venue for k in ("dhaba", "punjabi")):
        return "Aloo Paratha 40\nPaneer Paratha 60\nDal Makhani 90\nButter Roti 12\nLassi 35"
    return "Masala Maggi 35\nCheese Maggi 45\nVeg Burger 55\nFrench Fries 60\nLemon Soda 25"


def upload_filetype_for_ocr(image_bytes: bytes) -> tuple[str, str]:
    """Return (mime, OCR.space filetype) from upload magic bytes."""
    if image_bytes[:4] == b'\x89PNG':
        return "image/png", "PNG"
    if image_bytes[:4] == b'GIF8':
        return "image/gif", "GIF"
    if image_bytes[:4] == b'%PDF':
        return "application/pdf", "PDF"
    return "image/jpeg", "JPG"


def _s3_client():
    import boto3
    return boto3.client("s3", region_name=settings.AWS_REGION)


def extract_text_from_image(image_bytes: bytes) -> str:
    """
    Use OCR.space to extract text from a menu or receipt photo.
    Requires OCR_SPACE_API_KEY to be configured explicitly.
    """
    import base64
    import urllib.request
    import urllib.parse
    import json

    api_key = settings.OCR_SPACE_API_KEY.strip()
    if not api_key:
        raise RuntimeError("OCR unavailable: OCR_SPACE_API_KEY is not configured.")

    base64_image = base64.b64encode(image_bytes).decode("utf-8")

    mime, filetype = upload_filetype_for_ocr(image_bytes)

    def request_ocr(engine: str) -> str:
        data = urllib.parse.urlencode({
            "apikey": api_key,
            "base64image": f"data:{mime};base64,{base64_image}",
            "language": "eng",
            "isOverlayRequired": "false",
            "isTable": "true",
            "filetype": filetype,
            "detectOrientation": "true",
            "scale": "true",
            "OCREngine": engine,
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
            logger.warning("OCR.space engine %s processing error: %s", engine, msg)
            raise ValueError(f"OCR error: {msg[0] if isinstance(msg, list) else msg}")

        results = res_data.get("ParsedResults", [])
        if not results:
            raise ValueError("No results returned from OCR service.")

        return results[0].get("ParsedText", "").strip()

    errors: list[Exception] = []
    for engine in ("2", "1"):
        try:
            parsed_text = request_ocr(engine)
            if len(parsed_text) >= 8:
                logger.info("OCR.space engine %s extracted %d chars from image", engine, len(parsed_text))
                return parsed_text
            errors.append(ValueError(f"OCR engine {engine} returned too little text."))
        except Exception as exc:
            errors.append(exc)

    if errors:
        raise errors[-1]
    raise ValueError("OCR returned empty text. Image may be too blurry or low-contrast.")


def structure_menu_text(raw_text: str, venue_name: str, campus: str) -> list[dict[str, Any]]:
    """
    Structure OCR text into menu item candidates.

    Deterministic parsing always runs first. Bedrock is optional and only helps
    recover visible item/price pairs from messy OCR text; its output is
    sanitized, merged with heuristic candidates, and never bypasses pending
    community verification.
    """
    heuristic_items = _heuristic_parse(raw_text, venue_name, campus)
    if not settings.BEDROCK_ENABLED:
        return heuristic_items

    try:
        bedrock_items = _bedrock_parse_menu_text(raw_text, venue_name, campus)
    except Exception as exc:
        logger.warning("Bedrock menu structuring failed; using heuristic parser only: %s", exc)
        return heuristic_items

    return _merge_menu_candidates(heuristic_items, bedrock_items)


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
    """Normalize parsed items into review-candidate documents with spelling checks."""
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
            "status": "pending_verification",
            "verification_votes": 0,
            "confirmation_count": 0,
            "dispute_count": 0,
            "verification_threshold": compute_food_verification_threshold("menu_scan_pending"),
            "needs_review": True,
            "scanned_at": datetime.datetime.utcnow().isoformat(),
        })
    return normalized


def _bedrock_parse_menu_text(raw_text: str, venue_name: str, campus: str) -> list[dict[str, Any]]:
    """
    Ask Bedrock to extract visible menu item/price pairs from OCR text.
    This is intentionally conservative: no guessing, no descriptions, no inferred prices.
    """
    from app.services.bedrock import generate_json

    clipped_text = raw_text.strip()[:6000]
    if not clipped_text:
        return []

    prompt = f"""You parse OCR text from an Indian college canteen menu.
Return ONLY JSON in this shape:
{{"items":[{{"item_name":"Masala Chai","price_rs":10,"category":"beverage"}}]}}

Rules:
- Extract only menu items and prices that are visibly present in the OCR text.
- Do not guess missing item names or prices.
- Ignore phone numbers, UPI IDs, headers, section names, addresses, totals, GST lines, and offers.
- price_rs must be a number in rupees, between 1 and 2000.
- Keep item names short and human-readable.
- If unsure, omit the item.

Venue: {venue_name}
Campus: {campus}
OCR text:
{clipped_text}
"""
    data = generate_json(prompt, max_tokens=900, temperature=0.0)
    raw_items = data.get("items", [])
    if not isinstance(raw_items, list):
        return []
    return _normalize_model_items(raw_items, venue_name, campus)


def _normalize_model_items(items: list[Any], venue_name: str, campus: str) -> list[dict[str, Any]]:
    """Sanitize Bedrock/menu-model output into the same pending candidate shape."""
    normalized: list[dict[str, Any]] = []
    allowed_categories = {"beverage", "snack", "meal", "dessert", "other"}

    for item in items:
        if not isinstance(item, dict):
            continue

        raw_name = str(item.get("item_name") or item.get("name") or "").strip()
        if not raw_name:
            continue

        raw_price = item.get("price_rs", item.get("price", item.get("amount")))
        try:
            price_rs = float(raw_price)
        except (TypeError, ValueError):
            continue

        if price_rs <= 0 or price_rs > 2000:
            continue

        item_name = _clean_name(raw_name)
        if not item_name or len(item_name) < 2:
            continue

        corrected_name, was_corrected = spell_correct_item_name(item_name)
        price_paise = int(round(price_rs * 100))
        category = str(item.get("category") or "other").strip().lower()
        if category not in allowed_categories:
            category = "other"

        normalized.append({
            "id": f"{venue_name.lower().replace(' ', '_')}_{corrected_name.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}",
            "campus": campus,
            "venue_name": venue_name,
            "item_name": corrected_name,
            "was_corrected": was_corrected,
            "original_name": item_name if was_corrected else "",
            "category": category,
            "price": price_paise,
            "price_history": [{"price": price_paise, "changed_at": datetime.datetime.utcnow().isoformat()}],
            "status": "pending_verification",
            "verification_votes": 0,
            "confirmation_count": 0,
            "dispute_count": 0,
            "verification_threshold": compute_food_verification_threshold("menu_scan_pending"),
            "needs_review": True,
            "parser_source": "bedrock_menu_parser",
            "scanned_at": datetime.datetime.utcnow().isoformat(),
        })

    return normalized


def _merge_menu_candidates(*candidate_groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge parser outputs by item/price, preferring deterministic candidates first."""
    merged: dict[tuple[str, int], dict[str, Any]] = {}
    for group in candidate_groups:
        for item in group:
            key = (str(item.get("item_name", "")).casefold(), int(item.get("price", 0) or 0))
            if not key[0] or key[1] <= 0:
                continue
            merged.setdefault(key, item)
    return list(merged.values())


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
            .replace("₹", "Rs ")
            .replace("Ps", "Rs").replace("Fs", "Rs")
            .replace("\t", " | "))

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
    price_token_re = re.compile(r"^(?:Rs|INR|Re|₹)?\s*(\d{1,4})$", re.IGNORECASE)

    def add_item(raw_name: str, price: int) -> bool:
        item_name = _clean_name(raw_name)
        if not item_name or len(item_name) < 2:
            return False
        if looks_like_price.match(item_name):
            return False
        if price <= 0 or price > 2000:
            return False
        items.append(_make_item(item_name, price, venue_name, campus))
        return True

    def parse_pairs_from_line(value: str) -> list[tuple[str, int]]:
        pairs: list[tuple[str, int]] = []
        segments = [seg.strip() for seg in re.split(r"\s{2,}|\||;", value) if seg.strip()]
        if len(segments) > 1:
            for seg in segments:
                match = inline_re.match(seg)
                if match:
                    pairs.append((match.group(1), int(match.group(2))))
            if pairs:
                return pairs

        tokens = value.split()
        name_tokens: list[str] = []
        i = 0
        while i < len(tokens):
            token = tokens[i].strip(".,:;|-")
            price_val: int | None = None
            if token.lower() in {"rs", "inr", "re", "₹"} and i + 1 < len(tokens):
                next_token = tokens[i + 1].strip(".,:;|-")
                if next_token.isdigit():
                    price_val = int(next_token)
                    i += 2
                else:
                    name_tokens.append(tokens[i])
                    i += 1
            else:
                match = price_token_re.match(token)
                if match:
                    price_val = int(match.group(1))
                    i += 1
                else:
                    name_tokens.append(tokens[i])
                    i += 1

            if price_val is not None and name_tokens:
                pairs.append((" ".join(name_tokens), price_val))
                name_tokens = []
        return pairs

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

        # Pattern 1: one or more item/price pairs on the same row.
        line_pairs = parse_pairs_from_line(line)
        if len(line_pairs) > 1:
            added_any = False
            for raw_name, price in line_pairs:
                added_any = add_item(raw_name, price) or added_any
            if added_any:
                continue

        # Pattern 2: next line is the price
        if i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            pm = price_only_re.match(next_line)
            if pm:
                price = int(pm.group(1))
                if add_item(line, price):
                    skip_next = True
                    continue

        # Pattern 3: price at end of same line
        im = inline_re.match(line)
        if im:
            raw_name = im.group(1)
            price = int(im.group(2))
            add_item(raw_name, price)

    deduped: dict[tuple[str, int], dict[str, Any]] = {}
    for item in items:
        key = (item["item_name"].lower(), item["price"])
        deduped.setdefault(key, item)
    return list(deduped.values())


def _clean_name(raw: str) -> str:
    """Clean up OCR noise from item names and apply title case."""
    import re
    # Remove trailing/leading punctuation, dashes, dots
    cleaned = re.sub(r"^[\s\-–—.:,|]+|[\s\-–—.:,|]+$", "", raw)
    cleaned = re.sub(r"^\d+[\).:-]\s*", "", cleaned)
    cleaned = re.sub(r"\b(?:rs|inr|price|only)\b", "", cleaned, flags=re.IGNORECASE)
    # Remove sequences of dashes used as separators in menus
    cleaned = re.sub(r"[-–—]{2,}.*$", "", cleaned).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    # Title-case: "DAL TADKA" → "Dal Tadka"
    if cleaned.isupper():
        cleaned = cleaned.title()
    return cleaned.strip()


def _make_item(item_name: str, price: int, venue_name: str, campus: str) -> dict[str, Any]:
    """Build a DB-ready review-candidate menu item dict."""
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
        "status": "pending_verification",
        "verification_votes": 0,
        "confirmation_count": 0,
        "dispute_count": 0,
        "verification_threshold": compute_food_verification_threshold("menu_scan_pending"),
        "needs_review": True,
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
