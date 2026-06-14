"""
Campus Food API – menu listing, photo scanning, and crowdsource verification.

Existing GET / endpoint remains unchanged.
New endpoints:
  POST /scan          – Upload a menu photo for OCR + AI structuring
  POST /{id}/verify   – Crowdsource verification vote on a scanned item
"""

import uuid
import logging
import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user, map_doc, map_docs
from app.services.campus_food import load_campus_food

router = APIRouter()
logger = logging.getLogger("app.api.campus_food")

# Max upload size: 5 MB
MAX_IMAGE_SIZE = 5 * 1024 * 1024


# ---------------------------------------------------------------------------
# Existing endpoint – unchanged
# ---------------------------------------------------------------------------

@router.get("")
@router.get("/")
async def get_campus_food(status: Optional[str] = Query(None)):
    db = get_db()
    if status:
        cursor = db.campus_food.find({"status": status})
    else:
        # Only return active or legacy items — exclude pending_verification and rejected
        cursor = db.campus_food.find({
            "status": {"$nin": ["pending_verification", "rejected"]}
        })
    items = await cursor.to_list(length=1000)

    if not items and not status:
        raw_items = load_campus_food()
        if raw_items:
            for item in raw_items:
                item["_id"] = item.pop("id", None) or str(uuid.uuid4())
            await db.campus_food.insert_many(raw_items)
            items = raw_items

    return map_docs(items)


# ---------------------------------------------------------------------------
# Strategy 2: Photo Menu Scanner
# ---------------------------------------------------------------------------

@router.post("/scan")
async def scan_menu_photo(
    venue_name: str = Form(...),
    campus: str = Form("ABV-IIITM Gwalior"),
    image: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
    """
    Upload a menu photo → Textract OCR → Bedrock structuring → save as pending items.

    This endpoint accepts a multipart form with an image file, venue name, and campus.
    Items are created with status='pending_verification' and need crowdsource votes
    to become active.
    """
    db = get_db()

    # Validate file type
    content_type = image.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image (JPEG, PNG)")

    image_bytes = await image.read()
    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Image too large (max 5 MB)")
    if len(image_bytes) < 1024:
        raise HTTPException(status_code=400, detail="Image too small or empty")

    # Import scanner service (lazy to avoid import errors if boto3 not configured)
    try:
        from app.services.menu_scanner import (
            extract_text_from_image,
            structure_menu_text,
            upload_to_s3,
        )
    except ImportError as exc:
        logger.error("Menu scanner service not available: %s", exc)
        raise HTTPException(status_code=503, detail="Menu scanning service unavailable")

    # Step 1: Upload raw image to S3 for auditing (non-blocking, best-effort)
    filename = f"{uuid.uuid4().hex}_{image.filename or 'menu.jpg'}"
    s3_uri = ""
    try:
        s3_uri = await upload_to_s3(image_bytes, filename)
    except Exception:
        pass  # S3 upload is best-effort; don't fail the request

    # Step 2: Textract OCR
    try:
        raw_text = extract_text_from_image(image_bytes)
    except Exception as exc:
        logger.error("OCR failed: %s", exc)
        raise HTTPException(status_code=502, detail="OCR processing failed. Please try again.")

    if not raw_text or len(raw_text.strip()) < 5:
        raise HTTPException(status_code=422, detail="Could not extract text from image. Try a clearer photo.")

    # Step 3: Structure the raw text into menu items
    parsed_items = structure_menu_text(raw_text, venue_name.strip(), campus.strip())
    if not parsed_items:
        raise HTTPException(
            status_code=422,
            detail="No menu items could be identified from the image. Try a different angle or clearer photo."
        )

    # Step 4: Insert into DB as pending_verification
    now = datetime.datetime.utcnow()
    inserted = []
    for item in parsed_items:
        doc = {
            "_id": item["id"],
            "campus": item["campus"],
            "venue_id": item.get("venue_id", item["venue_name"].lower().replace(" ", "_")),
            "venue_name": item["venue_name"],
            "item_name": item["item_name"],
            "category": item.get("category", "food"),
            "price": item["price"],
            "status": "pending_verification",
            "verification_votes": 0,
            "verification_threshold": 3,
            "scanned_by": user_id,
            "s3_image_uri": s3_uri,
            "available_from": "08:00",
            "available_until": "22:00",
            "created_at": now,
        }
        try:
            await db.campus_food.insert_one(doc)
            inserted.append(map_doc(doc))
        except Exception as exc:
            logger.warning("Failed to insert scanned item '%s': %s", item["item_name"], exc)

    # Log the scan event
    await db.menu_scan_log.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "venue_name": venue_name.strip(),
        "campus": campus.strip(),
        "raw_ocr_text_length": len(raw_text),
        "items_parsed": len(parsed_items),
        "items_inserted": len(inserted),
        "s3_image_uri": s3_uri,
        "created_at": now,
    })

    return {
        "status": "ok",
        "items_scanned": len(inserted),
        "items": inserted,
        "message": f"Scanned {len(inserted)} items from '{venue_name}'. They need verification votes to become active.",
    }


class VerifyVoteReq(BaseModel):
    vote: str  # "up" or "down"


@router.post("/{item_id}/verify")
async def verify_food_item(
    item_id: str,
    req: VerifyVoteReq,
    user_id: str = Depends(get_current_user),
):
    """
    Crowdsource verification: students vote thumbs-up/down on scanned menu items.
    Once an item hits the verification threshold (default 3), it becomes 'active'.
    """
    db = get_db()

    if req.vote not in ("up", "down"):
        raise HTTPException(status_code=400, detail="Vote must be 'up' or 'down'")

    item = await db.campus_food.find_one({"_id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    # Prevent double-voting by same user
    voters = item.get("voters", [])
    if user_id in voters:
        return {"status": "already_voted", "verification_votes": item.get("verification_votes", 0)}

    increment = 1 if req.vote == "up" else -1
    update_ops = {
        "$inc": {"verification_votes": increment},
        "$push": {"voters": user_id},
        "$set": {"updated_at": datetime.datetime.utcnow()},
    }

    await db.campus_food.update_one({"_id": item_id}, update_ops)

    # Check if threshold reached → promote to active
    updated_item = await db.campus_food.find_one({"_id": item_id})
    current_votes = updated_item.get("verification_votes", 0)
    threshold = updated_item.get("verification_threshold", 3)

    if current_votes >= threshold and updated_item.get("status") == "pending_verification":
        await db.campus_food.update_one(
            {"_id": item_id},
            {"$set": {"status": "active"}}
        )
        return {"status": "promoted_to_active", "verification_votes": current_votes}

    # If votes go too negative, mark as rejected
    if current_votes <= -3 and updated_item.get("status") == "pending_verification":
        await db.campus_food.update_one(
            {"_id": item_id},
            {"$set": {"status": "rejected"}}
        )
        return {"status": "rejected", "verification_votes": current_votes}

    return {"status": "voted", "verification_votes": current_votes, "vote": req.vote}

