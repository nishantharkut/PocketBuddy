"""
Campus Food API – menu listing, photo scanning, and crowdsource verification.

Existing GET / endpoint remains unchanged.
New endpoints:
  POST /scan          – Upload a menu photo for OCR + heuristic structuring
  POST /{id}/verify   – Crowdsource verification vote on a scanned item
"""

import uuid
import logging
import datetime
import base64
import hashlib
from typing import Optional

import re
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user, map_doc, map_docs
from app.services.campus_food import (
    REVIEW_ONLY_STATUSES,
    apply_food_context_metadata,
    build_food_recommendations,
    build_food_trust_metadata,
    compute_food_verification_threshold,
    food_confirmation_count,
    food_dispute_count,
    food_dispute_hide_threshold,
    food_effective_verification_threshold,
    food_net_vote_score,
    load_campus_food,
)
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger("app.api.campus_food")

async def _is_user_trusted(db, user_id: str) -> bool:
    user = await db.users.find_one({"_id": user_id})
    if not user:
        return False
    role = user.get("role", "").lower()
    is_admin = user.get("is_admin", False)
    return role in ("admin", "moderator") or is_admin


async def _campus_review_population(db, campus: str) -> int:
    """Estimate active reviewer population without leaking raw transaction data."""
    campus_name = (campus or "").strip()
    if not campus_name:
        return 0

    since = datetime.datetime.utcnow() - datetime.timedelta(days=60)
    try:
        recent_voters = await db.campus_food.distinct(
            "voters",
            {
                "campus": {"$regex": f"^{re.escape(campus_name)}$", "$options": "i"},
                "updated_at": {"$gte": since},
            },
        )
        recent_count = len([voter for voter in recent_voters if voter])
    except Exception:
        recent_count = 0

    try:
        profile_count = await db.profiles.count_documents({
            "college_name": {"$regex": f"^{re.escape(campus_name)}$", "$options": "i"},
        })
    except Exception:
        profile_count = 0

    return max(recent_count, min(profile_count, 300))


async def _verification_threshold_for(db, campus: str, source_type: str) -> int:
    population = await _campus_review_population(db, campus)
    return compute_food_verification_threshold(source_type, active_reviewers=population)


async def _effective_verification_threshold_for(db, item: dict, source_type: str | None = None) -> int:
    campus = item.get("campus", "ABV-IIITM Gwalior")
    population = await _campus_review_population(db, campus)
    return food_effective_verification_threshold(
        item,
        source_type=source_type or _review_source_for_item(item),
        active_reviewers=population,
    )


def _review_counts_for_new_candidate() -> dict:
    return {
        "verification_votes": 0,
        "confirmation_count": 0,
        "dispute_count": 0,
        "voters": [],
    }


def _review_counts_after_submitter_confirmation(user_id: str) -> dict:
    return {
        "verification_votes": 1,
        "confirmation_count": 1,
        "dispute_count": 0,
        "voters": [user_id],
    }


def _review_source_for_item(item: dict) -> str:
    source = str(item.get("source") or "").lower()
    if source in {"manual_correction", "student_correction"}:
        return "manual_correction"
    if source in {"receipt_price_spike_review", "price_spike_quiz", "receipt_ocr"}:
        return "price_change_review"
    if source in {"external_snapshot", "apify_snapshot", "google_places_snapshot", "swiggy_snapshot", "zomato_snapshot"}:
        return "external_snapshot"
    if source in {"partner_api", "partner_verified", "swiggy_partner", "zomato_partner", "ondc_partner"}:
        return "partner_verified"
    if source in {"community_item_quiz"}:
        return "community_item_quiz"
    if source in {"ocr_menu_scan", "demo_menu_scan"}:
        return "menu_scan_pending"
    return "menu_scan_pending" if item.get("status") == "pending_verification" else "curated_baseline"


def _review_progress_payload(item: dict, status: str | None = None) -> dict:
    confirmations = food_confirmation_count(item)
    disputes = food_dispute_count(item)
    source_type = _review_source_for_item(item)
    threshold = food_effective_verification_threshold(item, source_type=source_type)
    return {
        "status": status or item.get("status", "voted"),
        "verification_votes": food_net_vote_score(item),
        "confirmation_count": confirmations,
        "dispute_count": disputes,
        "verification_threshold": threshold,
        "dispute_hide_threshold": food_dispute_hide_threshold(threshold),
    }

# Max upload size: 5 MB
MAX_IMAGE_SIZE = 5 * 1024 * 1024

MIN_QUIZ_USERS_THRESHOLD = 3
MIN_QUIZ_TXNS_THRESHOLD = 5


def _stable_quiz_id(prefix: str, *parts: object) -> str:
    raw = "|".join(str(part) for part in parts)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}_{digest}"


async def _store_quiz_context(db, quiz_id: str, quiz_type: str, context: dict):
    """Store sensitive quiz context server-side so raw merchant strings are not sent to clients."""
    await db.community_quiz_context.update_one(
        {"_id": quiz_id},
        {"$set": {"quiz_type": quiz_type, **context, "updated_at": datetime.datetime.utcnow()}},
        upsert=True,
    )


async def _get_quiz_context(db, quiz_id: str) -> dict:
    return await db.community_quiz_context.find_one({"_id": quiz_id}) or {}


# ---------------------------------------------------------------------------
# Existing endpoint – unchanged
# ---------------------------------------------------------------------------

@router.get("")
@router.get("/")
async def get_campus_food(
    status: Optional[str] = Query(None),
    safe_food_budget_paise: Optional[int] = Query(None, ge=0),
    meal_gap_hours: Optional[float] = Query(None, ge=0),
):
    db = get_db()
    if status == "review_queue":
        cursor = db.campus_food.find({"status": {"$in": ["pending_verification", "disputed_hidden"]}})
    elif status:
        cursor = db.campus_food.find({"status": status})
    else:
        # Only return active or legacy items — exclude review-only candidate states.
        cursor = db.campus_food.find({"status": {"$nin": list(REVIEW_ONLY_STATUSES)}})
    items = await cursor.to_list(length=1000)

    if not items and not status and settings.DEMO_MODE:
        raw_items = load_campus_food()
        if raw_items:
            for item in raw_items:
                item["_id"] = item.pop("id", None) or str(uuid.uuid4())
            await db.campus_food.insert_many(raw_items)
            items = raw_items

    # Dynamic Crowd Density Heatmap & Price Stability Engine
    now = datetime.datetime.utcnow()
    one_hour_ago = now - datetime.timedelta(hours=1)

    venue_counts = {}
    try:
        pipeline = [
            {
                "$match": {
                    "created_at": {"$gte": one_hour_ago},
                    "mapped_merchant_name": {"$exists": True, "$ne": None}
                }
            },
            {
                "$group": {
                    "_id": "$mapped_merchant_name",
                    "count": {"$sum": 1}
                }
            }
        ]
        agg_cursor = db.transactions.aggregate(pipeline)
        recent_counts = await agg_cursor.to_list(length=100)
        venue_counts = {item["_id"]: item["count"] for item in recent_counts if item["_id"]}
    except Exception as e:
        logger.exception("Error estimating crowd densities: %s", str(e))

    # Demo-only heatmap seed data. Production never fabricates crowd density.
    if settings.DEMO_MODE:
        if "BH-2 Night Canteen" not in venue_counts:
            venue_counts["BH-2 Night Canteen"] = 4
        if "Campus Juice Center" not in venue_counts:
            venue_counts["Campus Juice Center"] = 1

    campus_review_population_cache: dict[str, int] = {}
    mapped_items = []
    for item in items:
        # 1. Recent demand estimation. This is not a live queue sensor.
        venue = item.get("venue_name", "")
        txn_count = venue_counts.get(venue, 0)
        if txn_count >= 3:
            item["crowd_density"] = "High recent demand"
        elif txn_count >= 1:
            item["crowd_density"] = "Moderate recent demand"
        else:
            item["crowd_density"] = "Low recent demand"
        item["crowd_density_source"] = "recent_transactions"

        # 2. Price Stability check (stable for 30 days)
        price_stable = True
        price_change_pct = 0
        history = item.get("price_history", [])
        if len(history) > 1:
            try:
                last_change = history[-1]
                changed_at_str = last_change.get("changed_at")
                if changed_at_str:
                    # Clean up isoformat strings
                    changed_at = datetime.datetime.fromisoformat(changed_at_str.replace("Z", "+00:00"))
                    changed_at_naive = changed_at.replace(tzinfo=None)
                    if (now - changed_at_naive).days < 30:
                        price_stable = False
                        old_p = history[-2].get("price", 0)
                        new_p = last_change.get("price", 0)
                        if old_p > 0:
                            price_change_pct = int(((new_p - old_p) / old_p) * 100)
            except Exception:
                pass
        item["price_stable"] = price_stable
        item["price_change_pct"] = price_change_pct

        # 3. Source & freshness metadata + price spike alerts (Food Trust Layer)
        confirmations = food_confirmation_count(item)
        source_review_type = _review_source_for_item(item)
        campus_key = str(item.get("campus") or "ABV-IIITM Gwalior")
        if campus_key not in campus_review_population_cache:
            campus_review_population_cache[campus_key] = await _campus_review_population(db, campus_key)
        threshold = food_effective_verification_threshold(
            item,
            source_type=source_review_type,
            active_reviewers=campus_review_population_cache[campus_key],
        )
        item["verification_threshold"] = threshold
        item["confirmation_count"] = confirmations
        item["dispute_count"] = food_dispute_count(item)
        item["verification_votes"] = food_net_vote_score(item)
        history = item.get("price_history", [])
        last_change_str = "recently"
        if history:
            try:
                last_change_t = datetime.datetime.fromisoformat(history[-1]["changed_at"].replace("Z", "+00:00"))
                last_change_t = last_change_t.replace(tzinfo=None)
                diff_hours = int((now - last_change_t).total_seconds() / 3600)
                if diff_hours < 1:
                    last_change_str = "just now"
                elif diff_hours == 1:
                    last_change_str = "1 hour ago"
                else:
                    last_change_str = f"{diff_hours} hours ago"
            except Exception:
                pass

        if str(item.get("status") or "active").lower() not in REVIEW_ONLY_STATUSES and source_review_type == "curated_baseline":
            item["freshness_info"] = "Baseline campus catalog item"
            item["source_freshness"] = "Campus baseline"
        elif source_review_type == "partner_verified":
            item["freshness_info"] = "Official partner/API source"
            item["source_freshness"] = "Partner verified"
        elif confirmations >= threshold:
            item["freshness_info"] = f"Verified {last_change_str} by {confirmations} independent confirmations"
            item["source_freshness"] = "Community verified"
        else:
            item["freshness_info"] = f"Awaiting community verification ({confirmations}/{threshold} confirmations)"
            item["source_freshness"] = "Community suggested, pending verification"

        item["price_spike_alert"] = not price_stable and price_change_pct >= 15
        item.update(build_food_trust_metadata(item, now))
        apply_food_context_metadata(item, safe_food_budget_paise, meal_gap_hours)

        mapped_items.append(item)

    return map_docs(mapped_items)


@router.get("/recommendations")
async def get_campus_food_recommendations(
    campus: Optional[str] = Query(None),
    safe_food_budget_paise: Optional[int] = Query(None, ge=0),
    meal_gap_hours: Optional[float] = Query(None, ge=0),
    limit: int = Query(3, ge=1, le=10),
):
    """
    Return ranked food decisions, not raw menu data.
    This keeps Food Guard deterministic: trust, budget fit, freshness,
    availability, and price-spike risk decide the ranking.
    """
    db = get_db()
    query = {"status": {"$nin": list(REVIEW_ONLY_STATUSES)}}
    if campus:
        query["campus"] = {"$regex": f"^{re.escape(campus.strip())}$", "$options": "i"}

    items = await db.campus_food.find(query).to_list(length=1000)
    if not items and settings.DEMO_MODE:
        items = load_campus_food()
        if campus:
            campus_lower = campus.strip().lower()
            items = [item for item in items if str(item.get("campus", "")).lower() == campus_lower]

    recommendations = build_food_recommendations(
        items,
        now=datetime.datetime.utcnow(),
        safe_food_budget_paise=safe_food_budget_paise,
        meal_gap_hours=meal_gap_hours,
        limit=limit,
    )

    return {
        "status": "ok",
        "strategy": "ranked_by_trust_budget_availability",
        "count": len(recommendations),
        "recommendations": recommendations,
    }


class CreateFoodItemReq(BaseModel):
    venue_name: str
    item_name: str
    price: int  # in paise
    campus: str = "ABV-IIITM Gwalior"
    status: str = "pending_verification"


@router.post("")
@router.post("/")
async def create_food_item(
    body: CreateFoodItemReq,
    user_id: str = Depends(get_current_user),
):
    """
    Manually create a menu item.
    Supports creating items as 'active' (e.g. from manual menus) or 'pending_verification'.
    """
    db = get_db()
    is_trusted = await _is_user_trusted(db, user_id)
    venue_name = body.venue_name.strip()
    item_name = body.item_name.strip()
    campus = body.campus.strip()
    status = body.status if (body.status in ("active", "pending_verification") and is_trusted) else "pending_verification"

    existing = await db.campus_food.find_one({
        "venue_name": {"$regex": f"^{re.escape(venue_name)}$", "$options": "i"},
        "item_name": {"$regex": f"^{re.escape(item_name)}$", "$options": "i"}
    })
    if existing:
        return map_doc(existing)

    source_type = "trusted_direct_edit" if status == "active" and is_trusted else "menu_scan_pending"
    review_counts = (
        _review_counts_after_submitter_confirmation(user_id)
        if status == "pending_verification"
        else {"verification_votes": 1, "confirmation_count": 1, "dispute_count": 0, "voters": [user_id]}
    )
    doc = {
        "_id": f"{venue_name.lower().replace(' ', '_')}_{item_name.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}",
        "campus": campus,
        "venue_id": venue_name.lower().replace(" ", "_"),
        "venue_name": venue_name,
        "item_name": item_name,
        "category": "other",
        "price": body.price,
        "price_history": [{"price": body.price, "changed_at": datetime.datetime.utcnow().isoformat()}],
        "status": status,
        **review_counts,
        "verification_threshold": await _verification_threshold_for(db, campus, source_type),
        "scanned_by": user_id,
        "submitted_by": user_id,
        "source": source_type,
        "s3_image_uri": "",
        "available_from": "08:00",
        "available_until": "22:00",
        "created_at": datetime.datetime.utcnow(),
    }
    await db.campus_food.insert_one(doc)
    return map_doc(doc)


# ---------------------------------------------------------------------------
# Strategy 2: Photo Menu Scanner.
# ---------------------------------------------------------------------------

class ScanMenuRequest(BaseModel):
    venue_name: str
    campus: str = "ABV-IIITM Gwalior"
    image_b64: str   # base64-encoded image bytes (data URI or raw b64)


def _decode_base64_image(raw_b64: str) -> bytes:
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]
    try:
        return base64.b64decode(raw_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data.")


async def _read_scan_upload(request: Request) -> tuple[str, str, bytes, str]:
    """
    Accept both the current frontend multipart contract and JSON/base64 clients.
    Returns venue, campus, raw bytes, and a data URI suitable for audit storage.
    """
    content_type = request.headers.get("content-type", "").lower()
    if "application/json" in content_type:
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body.")

        venue_name = str(payload.get("venue_name") or "").strip()
        campus = str(payload.get("campus") or "ABV-IIITM Gwalior").strip()
        raw_b64 = str(payload.get("image_b64") or "").strip()
        if not raw_b64:
            raise HTTPException(status_code=400, detail="Missing image_b64.")
        image_bytes = _decode_base64_image(raw_b64)
        stored_image_b64 = raw_b64 if raw_b64.startswith("data:") else f"data:image/jpeg;base64,{raw_b64}"
        return venue_name, campus, image_bytes, stored_image_b64

    try:
        form = await request.form()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid multipart form body.")

    venue_name = str(form.get("venue_name") or "").strip()
    campus = str(form.get("campus") or "ABV-IIITM Gwalior").strip()
    image = form.get("image")
    if image is None or not hasattr(image, "read"):
        raise HTTPException(status_code=400, detail="Missing menu image upload.")
    image_bytes = await image.read()
    mime = getattr(image, "content_type", None) or "image/jpeg"
    stored_image_b64 = f"data:{mime};base64,{base64.b64encode(image_bytes).decode('utf-8')}"
    return venue_name, campus, image_bytes, stored_image_b64


@router.post("/scan")
async def scan_menu_photo(
    request: Request,
    user_id: str = Depends(get_current_user),
):
    """
    Upload a menu photo -> OCR.space -> heuristic structuring -> pending review candidates.
    Accepts current web multipart fields: venue_name, campus, image.
    Also accepts JSON: { venue_name, campus, image_b64 }.
    """
    db = get_db()
    venue_name, campus, image_bytes, stored_image_b64 = await _read_scan_upload(request)

    if not venue_name:
        raise HTTPException(status_code=400, detail="Missing venue name.")
    if not campus:
        raise HTTPException(status_code=400, detail="Missing campus.")

    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Image too large (max 5 MB).")
    if len(image_bytes) < 512:
        raise HTTPException(status_code=400, detail="Image too small or empty.")

    # Import scanner service
    try:
        from app.services.menu_scanner import extract_text_from_image, structure_menu_text
    except ImportError as exc:
        logger.error("Menu scanner not available: %s", exc)
        raise HTTPException(status_code=503, detail="Menu scanning service unavailable.")

    # Step 1: OCR via OCR.space Engine 2
    raw_text = ""
    try:
        raw_text = extract_text_from_image(image_bytes)
        logger.info("OCR extracted %d chars for venue '%s'", len(raw_text), venue_name)
    except Exception as exc:
        logger.warning("OCR request failed for menu scan: %s", exc)
        reason = "ocr_unavailable" if "OCR_SPACE_API_KEY" in str(exc) or "OCR unavailable" in str(exc) else "ocr_failed"
        message = (
            "Menu photo received, but OCR is not configured. No menu items were added; please review the photo manually."
            if reason == "ocr_unavailable"
            else "Menu photo received, but OCR could not read it reliably. No menu items were added; please review the photo manually."
        )
        return {
            "status": "needs_review",
            "reason": reason,
            "items_scanned": 0,
            "items": [],
            "message": message,
        }

    # Step 2: Structure into items with robust fallback
    parsed_items = []
    if raw_text.strip():
        parsed_items = structure_menu_text(raw_text, venue_name, campus)

    is_fallback = False
    if not parsed_items:
        if settings.DEMO_MODE:
            logger.warning("OCR returned empty or unparseable text. Using venue-based fallback in DEMO_MODE.")
            is_fallback = True
            vl = venue_name.lower()
            if any(k in vl for k in ("tea", "chai", "nescafe", "coffee")):
                raw_text = "Masala Chai 10\nGinger Tea 12\nSamosa 15\nKachori 15\nBun Maska 25"
            elif any(k in vl for k in ("canteen", "mess", "dining", "hostel", "bh2", "bh-2")):
                raw_text = "Veg Thali 80\nSpecial Thali 120\nPaneer Butter Masala 110\nTandoori Roti 8\nJeera Rice 60"
            elif any(k in vl for k in ("dhaba", "punjabi")):
                raw_text = "Aloo Paratha 40\nPaneer Paratha 60\nDal Makhani 90\nLassi 35"
            else:
                raw_text = "Masala Maggi 30\nCheese Maggi 40\nVeg Sandwich 45\nCold Coffee 35"
            parsed_items = structure_menu_text(raw_text, venue_name, campus)
        else:
            logger.warning("OCR returned empty or unparseable text for menu scan.")
            return {
                "status": "needs_review",
                "reason": "unparseable_ocr",
                "items_scanned": 0,
                "items": [],
                "message": "Menu photo received, but no reliable menu items could be read. No menu items were added; please review manually.",
            }

    # Step 3: Store OCR results only as pending review candidates.
    now = datetime.datetime.utcnow()
    source_type = "demo_menu_scan" if is_fallback else "ocr_menu_scan"
    threshold = await _verification_threshold_for(db, campus, "menu_scan_pending")
    inserted = []
    for item in parsed_items:
        existing = await db.campus_food.find_one({
            "venue_name": {"$regex": f"^{re.escape(item['venue_name'])}$", "$options": "i"},
            "item_name":  {"$regex": f"^{re.escape(item['item_name'])}$",  "$options": "i"},
        })
        if existing and existing.get("status") == "pending_verification":
            await db.campus_food.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "price": item["price"],
                        "category": item.get("category", existing.get("category", "other")),
                        "needs_review": True,
                        "updated_at": now,
                        "last_review_source": source_type,
                        "parser_source": item.get("parser_source", "heuristic_menu_parser"),
                        "verification_threshold": max(threshold, int(existing.get("verification_threshold") or 0)),
                    }
                },
            )
            updated = await db.campus_food.find_one({"_id": existing["_id"]})
            inserted.append(map_doc(updated))
        else:
            doc = {
                "_id": item["id"],
                "campus": item["campus"],
                "venue_id": item["venue_name"].lower().replace(" ", "_"),
                "venue_name": item["venue_name"],
                "item_name": item["item_name"],
                "category": item.get("category", "other"),
                "price": item["price"],
                "price_history": item.get("price_history", [{"price": item["price"], "changed_at": now.isoformat()}]),
                "status": "pending_verification",
                **_review_counts_for_new_candidate(),
                "verification_threshold": threshold,
                "scanned_by": user_id,
                "submitted_by": user_id,
                "source": source_type,
                "parser_source": item.get("parser_source", "heuristic_menu_parser"),
                "needs_review": True,
                "candidate_for_item_id": existing.get("_id") if existing else None,
                "s3_image_uri": "",
                "available_from": "08:00",
                "available_until": "22:00",
                "created_at": now,
            }
            await db.campus_food.insert_one(doc)
            inserted.append(map_doc(doc))

    # Store venue photo in venue_photos collection (best-effort)
    try:
        await db.venue_photos.update_one(
            {"venue_name": {"$regex": f"^{re.escape(venue_name)}$", "$options": "i"}},
            {"$set": {"venue_name": venue_name, "image_b64": stored_image_b64, "updated_at": datetime.datetime.utcnow()}},
            upsert=True,
        )
    except Exception as exc:
        logger.warning("Failed to store venue photo: %s", exc)

    return {
        "status": "pending_verification",
        "items_scanned": len(inserted),
        "items": inserted,
        "message": f"Saved {len(inserted)} menu candidate(s) from '{venue_name}' for community review.",
    }


@router.get("/venue-photo")
async def get_venue_photo(venue: str = Query(...)):
    """Return the stored menu photo for a venue (base64 data URI)."""
    db = get_db()
    doc = await db.venue_photos.find_one(
        {"venue_name": {"$regex": f"^{re.escape(venue)}$", "$options": "i"}}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="No photo for this venue.")
    return {"venue_name": doc["venue_name"], "image_b64": doc.get("image_b64", "")}


class EditFoodItemReq(BaseModel):
    item_name: Optional[str] = None
    price: Optional[int] = None  # price in paise


@router.patch("/{item_id}")
async def edit_food_item(
    item_id: str,
    req: EditFoodItemReq,
    user_id: str = Depends(get_current_user),
):
    """
    Trusted maintainers may edit directly.
    Regular students submit correction candidates that require community verification.
    """
    db = get_db()
    item = await db.campus_food.find_one({"_id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")

    is_creator = item.get("scanned_by") == user_id
    is_trusted = await _is_user_trusted(db, user_id)
    item_status = item.get("status", "active")
    direct_edit_allowed = is_trusted or (is_creator and item_status == "pending_verification")
    now = datetime.datetime.utcnow()

    proposed_name = req.item_name.strip() if req.item_name is not None else item.get("item_name", "")
    proposed_price = req.price if req.price is not None else item.get("price")
    if req.price is not None and req.price <= 0:
        raise HTTPException(status_code=400, detail="Price must be positive.")

    has_name_change = proposed_name != item.get("item_name")
    has_price_change = proposed_price != item.get("price")
    if not has_name_change and not has_price_change:
        raise HTTPException(status_code=400, detail="Nothing to update.")

    if not direct_edit_allowed:
        if item_status != "active":
            raise HTTPException(
                status_code=403,
                detail="Only the creator or a trusted maintainer can edit this pending menu candidate.",
            )

        existing_candidate = await db.campus_food.find_one({
            "candidate_for_item_id": item_id,
            "item_name": proposed_name,
            "price": proposed_price,
            "status": "pending_verification",
            "source": "manual_correction",
        })
        if existing_candidate:
            if user_id not in existing_candidate.get("voters", []):
                confirmations = food_confirmation_count(existing_candidate) + 1
                disputes = food_dispute_count(existing_candidate)
                candidate_threshold = await _effective_verification_threshold_for(
                    db,
                    existing_candidate,
                    "manual_correction" if has_name_change else "price_change_review",
                )
                await db.campus_food.update_one(
                    {"_id": existing_candidate["_id"]},
                    {
                        "$addToSet": {"voters": user_id},
                        "$set": {
                            "verification_votes": confirmations - disputes,
                            "confirmation_count": confirmations,
                            "dispute_count": disputes,
                            "verification_threshold": candidate_threshold,
                            "updated_at": now,
                        },
                    },
                )
            updated_candidate = await db.campus_food.find_one({"_id": existing_candidate["_id"]})
            latest_votes = food_confirmation_count(updated_candidate) if updated_candidate else 0
            latest_threshold = updated_candidate.get("verification_threshold", 5) if updated_candidate else 5
            candidate_for_item_id = updated_candidate.get("candidate_for_item_id") if updated_candidate else None
            if updated_candidate and candidate_for_item_id and latest_votes >= latest_threshold:
                target_item = await db.campus_food.find_one({"_id": candidate_for_item_id})
                if target_item:
                    await db.campus_food.update_one(
                        {"_id": candidate_for_item_id},
                        {
                            "$set": {
                                "item_name": updated_candidate.get("item_name", target_item.get("item_name")),
                                "price": updated_candidate.get("price", target_item.get("price")),
                                "category": updated_candidate.get("category", target_item.get("category", "other")),
                                "updated_at": now,
                                "last_review_source": "manual_correction",
                            },
                            "$push": {
                                "price_history": {
                                    "price": updated_candidate.get("price", target_item.get("price", 0)),
                                    "changed_at": now.isoformat(),
                                    "source": "manual_correction",
                                    "verified_by_votes": latest_votes,
                                }
                            },
                        },
                    )
                    await db.campus_food.update_one(
                        {"_id": updated_candidate["_id"]},
                        {"$set": {"status": "merged_into_active", "merged_at": now, "merged_into": candidate_for_item_id}},
                    )
                    result = map_doc(updated_candidate)
                    result["status"] = "merged_into_active"
                    result["message"] = "Correction reached the verification threshold and was merged into the trusted menu."
                    return result
            result = map_doc(updated_candidate)
            result["message"] = "Existing correction candidate confirmed. It will update the trusted menu after enough independent confirmations."
            return result

        correction_id = f"{str(item.get('venue_name', 'venue')).lower().replace(' ', '_')}_{proposed_name.lower().replace(' ', '_')}_correction_{uuid.uuid4().hex[:6]}"
        price_history = item.get("price_history") or []
        if has_price_change:
            price_history = [
                {"price": item.get("price", 0), "changed_at": now.isoformat(), "source": "current_trusted_price"},
                {"price": proposed_price, "changed_at": now.isoformat(), "source": "student_correction"},
            ]

        candidate_doc = {
            "_id": correction_id,
            "campus": item.get("campus", "ABV-IIITM Gwalior"),
            "venue_id": item.get("venue_id") or str(item.get("venue_name", "")).lower().replace(" ", "_"),
            "venue_name": item.get("venue_name"),
            "item_name": proposed_name,
            "category": item.get("category", "other"),
            "price": proposed_price,
            "price_history": price_history,
            "status": "pending_verification",
            **_review_counts_after_submitter_confirmation(user_id),
            "verification_threshold": await _verification_threshold_for(
                db,
                item.get("campus", "ABV-IIITM Gwalior"),
                "manual_correction" if has_name_change else "price_change_review",
            ),
            "scanned_by": user_id,
            "submitted_by": user_id,
            "source": "manual_correction",
            "needs_review": True,
            "candidate_for_item_id": item_id,
            "correction_context": {
                "previous_item_name": item.get("item_name"),
                "previous_price": item.get("price"),
                "suggested_item_name": proposed_name,
                "suggested_price": proposed_price,
            },
            "s3_image_uri": item.get("s3_image_uri", ""),
            "available_from": item.get("available_from", "08:00"),
            "available_until": item.get("available_until", "22:00"),
            "created_at": now,
            "updated_at": now,
        }
        await db.campus_food.insert_one(candidate_doc)
        result = map_doc(candidate_doc)
        result["message"] = "Correction saved for community verification. The trusted menu is unchanged until enough students confirm it."
        return result

    updates: dict = {"updated_at": now, "edited_by": user_id}
    push_updates: dict = {}
    if req.item_name is not None:
        updates["item_name"] = proposed_name
    if req.price is not None:
        updates["price"] = proposed_price
        push_updates["price_history"] = {
            "price": proposed_price,
            "changed_at": now.isoformat(),
            "source": "trusted_direct_edit" if is_trusted else "creator_pending_edit",
        }

    db_ops: dict = {"$set": updates}
    if push_updates:
        db_ops["$push"] = push_updates

    await db.campus_food.update_one({"_id": item_id}, db_ops)
    updated = await db.campus_food.find_one({"_id": item_id})
    return map_doc(updated)


@router.delete("/{item_id}")
async def delete_food_item(
    item_id: str,
    user_id: str = Depends(get_current_user),
):
    """Delete a food item. Active trusted menu items require a trusted maintainer."""
    db = get_db()
    item = await db.campus_food.find_one({"_id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    is_creator = item.get("scanned_by") == user_id
    is_trusted = await _is_user_trusted(db, user_id)
    item_status = item.get("status", "active")
    can_delete = is_trusted or (is_creator and item_status in ("pending_verification", "rejected", "disputed_hidden"))
    if not can_delete:
        raise HTTPException(
            status_code=403,
            detail="Trusted menu items cannot be deleted by regular students. Submit a correction or downvote a pending candidate instead.",
        )

    await db.campus_food.delete_one({"_id": item_id})
    return {"message": "Item deleted successfully."}


class VerifyVoteReq(BaseModel):
    vote: str  # "up" or "down"


@router.post("/{item_id}/verify")
async def verify_food_item(
    item_id: str,
    req: VerifyVoteReq,
    user_id: str = Depends(get_current_user),
):
    """
    Crowdsource verification: independent confirmations promote candidates.
    Disputes hide questionable items from recommendations instead of deleting trusted data.
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
        return _review_progress_payload(item, "already_voted")

    submitter_id = item.get("submitted_by") or item.get("scanned_by")
    is_trusted = await _is_user_trusted(db, user_id)
    if req.vote == "up" and submitter_id == user_id and not is_trusted:
        return _review_progress_payload(item, "submitter_cannot_self_confirm")

    now = datetime.datetime.utcnow()
    source_type = _review_source_for_item(item)
    threshold = await _effective_verification_threshold_for(db, item, source_type)
    confirmations = food_confirmation_count(item) + (1 if req.vote == "up" else 0)
    disputes = food_dispute_count(item) + (1 if req.vote == "down" else 0)
    net_score = confirmations - disputes

    await db.campus_food.update_one(
        {"_id": item_id},
        {
            "$set": {
                "verification_votes": net_score,
                "confirmation_count": confirmations,
                "dispute_count": disputes,
                "verification_threshold": threshold,
                "updated_at": now,
            },
            "$addToSet": {"voters": user_id},
        },
    )

    # Check if threshold reached → promote to active
    updated_item = await db.campus_food.find_one({"_id": item_id})
    current_confirmations = food_confirmation_count(updated_item)
    current_disputes = food_dispute_count(updated_item)

    if current_confirmations >= threshold and updated_item.get("status") in ("pending_verification", "disputed_hidden"):
        candidate_for_item_id = updated_item.get("candidate_for_item_id")
        if candidate_for_item_id:
            active_item = await db.campus_food.find_one({"_id": candidate_for_item_id})
            if active_item:
                set_updates = {
                    "price": updated_item.get("price", active_item.get("price")),
                    "category": updated_item.get("category", active_item.get("category", "other")),
                    "updated_at": now,
                    "last_review_source": updated_item.get("source", "community_verification"),
                    "last_verified_by_count": current_confirmations,
                }
                if updated_item.get("item_name"):
                    set_updates["item_name"] = updated_item["item_name"]

                await db.campus_food.update_one(
                    {"_id": candidate_for_item_id},
                    {
                        "$set": set_updates,
                        "$push": {
                            "price_history": {
                                "price": updated_item.get("price", active_item.get("price", 0)),
                                "changed_at": now.isoformat(),
                                "source": updated_item.get("source", "community_verification"),
                                "verified_by_votes": current_confirmations,
                            }
                        },
                    },
                )
                await db.campus_food.update_one(
                    {"_id": item_id},
                    {"$set": {"status": "merged_into_active", "merged_at": now, "merged_into": candidate_for_item_id}},
                )
                updated_item["status"] = "merged_into_active"
                return _review_progress_payload(updated_item, "merged_into_active")

        await db.campus_food.update_one(
            {"_id": item_id},
            {"$set": {"status": "active", "activated_at": now, "last_verified_by_count": current_confirmations}}
        )
        updated_item["status"] = "promoted_to_active"
        return _review_progress_payload(updated_item, "promoted_to_active")

    hide_threshold = food_dispute_hide_threshold(threshold)
    if current_disputes >= hide_threshold and updated_item.get("status") == "active":
        await db.campus_food.update_one(
            {"_id": item_id},
            {"$set": {"status": "disputed_hidden", "hidden_at": now, "last_review_source": "community_dispute"}}
        )
        updated_item["status"] = "disputed_hidden"
        return _review_progress_payload(updated_item, "disputed_hidden")

    if current_disputes >= threshold and updated_item.get("status") in ("pending_verification", "disputed_hidden"):
        await db.campus_food.update_one(
            {"_id": item_id},
            {"$set": {"status": "rejected", "rejected_at": now, "last_review_source": "community_dispute"}}
        )
        updated_item["status"] = "rejected"
        return _review_progress_payload(updated_item, "rejected")

    if current_disputes >= hide_threshold and updated_item.get("status") == "pending_verification":
        await db.campus_food.update_one(
            {"_id": item_id},
            {"$set": {"status": "disputed_hidden", "hidden_at": now, "last_review_source": "community_dispute"}}
        )
        updated_item["status"] = "disputed_hidden"
        return _review_progress_payload(updated_item, "disputed_hidden")

    return {**_review_progress_payload(updated_item, "voted"), "vote": req.vote}


class ScanReceiptRequest(BaseModel):
    image_b64: str


@router.post("/scan-receipt")
async def scan_receipt(
    body: ScanReceiptRequest,
    user_id: str = Depends(get_current_user),
):
    """
    Accepts standard JSON containing a base64 receipt screenshot, extracts text,
    parses visible fields, and stores a review candidate only.
    """
    import base64
    import re
    from app.services.menu_scanner import extract_text_from_image

    db = get_db()
    raw_b64 = body.image_b64
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]
    try:
        image_bytes = base64.b64decode(raw_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 receipt image.")

    try:
        raw_text = extract_text_from_image(image_bytes)
        logger.info("Receipt OCR extracted %d chars", len(raw_text))
    except Exception as exc:
        logger.warning("OCR request failed for receipt scan: %s", exc)
        reason = "ocr_unavailable" if "OCR_SPACE_API_KEY" in str(exc) or "OCR unavailable" in str(exc) else "ocr_failed"
        message = (
            "Receipt scan could not be read because OCR is not configured. No transaction was added; please review manually."
            if reason == "ocr_unavailable"
            else "Receipt scan could not be read reliably. No transaction was added; please review manually."
        )
        return {
            "status": "needs_review",
            "reason": reason,
            "candidate_id": None,
            "amount": None,
            "venue_name": None,
            "item_name": None,
            "transaction_id": None,
            "message": message,
        }

    # 1. Parse amount only when OCR exposes an explicit amount marker.
    amount: Optional[float] = None
    amt_match = re.search(r"(?:Paid|Total|Amount|₹|Rs\.?|INR)\s*(?:₹|Rs\.?)?\s*(\d+(?:\.\d{2})?)", raw_text, re.IGNORECASE)
    if amt_match:
        try:
            amount = float(amt_match.group(1))
        except ValueError:
            pass

    # 2. Parse Recipient Name
    recipient: Optional[str] = None
    rt_lower = raw_text.lower()
    if any(k in rt_lower for k in ("bh2", "bh-2", "hostel 2")):
        recipient = "BH-2 Night Canteen"
    elif "juice" in rt_lower:
        recipient = "Campus Juice Center"
    elif any(k in rt_lower for k in ("nescafe", "coffee")):
        recipient = "Nescafe Coffee"
    elif any(k in rt_lower for k in ("tapri", "maggi", "raju")):
        recipient = "Late Night Maggi / Tapri"

    # 3. Parse Transaction ID / Reference
    ref_match = re.search(r"(?:UPI Ref|Txn|Transaction|Ref)\s*(?:No|ID)?\s*:?\s*([A-Za-z0-9]+)", raw_text, re.IGNORECASE)
    txn_ref = ref_match.group(1) if ref_match else None

    # 4. Insert pending receipt candidate. Uncertain OCR never affects active menu data.
    target_price_paise = int(amount * 100) if amount is not None else None
    now = datetime.datetime.utcnow()
    notes = "Receipt OCR pending review"
    if txn_ref:
        notes += f" (Ref: {txn_ref})"
    candidate_doc = {
        "_id": f"receipt_candidate_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "amount": target_price_paise,
        "category": "food",
        "direction": "debit",
        "mapped_merchant_name": recipient or "Receipt pending review",
        "created_at": now,
        "notes": notes,
        "needs_verification": True,
        "status": "needs_review",
        "source": "receipt_ocr",
        "parsing_confidence": "needs_review",
        "ocr_fields": {
            "amount_present": amount is not None,
            "recipient_present": bool(recipient),
            "reference_present": bool(txn_ref),
        },
    }
    await db.receipt_review_candidates.insert_one(candidate_doc)

    return {
        "status": "needs_review",
        "candidate_id": candidate_doc["_id"],
        "amount": amount,
        "venue_name": recipient,
        "item_name": None,
        "transaction_id": txn_ref,
        "message": "Receipt saved for review. Please confirm details before it affects menus or spending."
    }


# ---------------------------------------------------------------------------
# Interactive Crowdsourced Canteen Quizzes Endpoints
# ---------------------------------------------------------------------------

class SubmitQuizRequest(BaseModel):
    quiz_id: str
    quiz_type: str  # "category", "item_name", "price_spike", "meal_guess"
    venue_name: Optional[str] = None
    response_val: str
    price: Optional[int] = None  # in paise
    item_name: Optional[str] = None
    old_price: Optional[int] = None
    new_price: Optional[int] = None
    custom_category: Optional[str] = None
    location: Optional[str] = None
    image_b64: Optional[str] = None  # supporting receipt verification!

def mask_merchant_name(raw_string: str) -> str:
    # Remove UPI address formats (e.g. user@bank -> user***@bank)
    if "@" in raw_string:
        parts = raw_string.split("@")
        name = parts[0]
        bank = parts[1]
        if len(name) > 3:
            name = name[:3] + "***"
        else:
            name = "***"
        raw_string = f"{name}@{bank}"

    # If it looks like a phone number (e.g., contains 10 consecutive digits)
    phone_match = re.search(r"\d{10}", raw_string)
    if phone_match:
        num = phone_match.group(0)
        raw_string = raw_string.replace(num, num[:3] + "****" + num[7:])

    return raw_string


@router.get("/quizzes")
@router.get("/quizzes/")
async def get_community_quizzes(user_id: str = Depends(get_current_user)):
    db = get_db()
    quizzes = []

    # 1. Category check quizzes: Find unmapped transactions with repeating count across different users
    try:
        pipeline = [
            {
                "$group": {
                    "_id": "$raw_merchant_string",
                    "count": {"$sum": 1},
                    "unique_users": {"$addToSet": "$user_id"},
                    "mapped": {"$first": "$is_mapped"},
                    "category": {"$first": "$category"},
                    "needs_verification": {"$max": "$needs_verification"},
                }
            },
            {
                "$sort": {"count": -1}
            }
        ]
        cursor = db.transactions.aggregate(pipeline)
        tx_counts = await cursor.to_list(length=100)

        for tc in tx_counts:
            raw_string = tc.get("_id")
            if not raw_string:
                continue

            # Skip if already marked as mapped in transactions
            if tc.get("mapped") is True and tc.get("category") not in [None, "", "other", "general"]:
                continue

            # Double check directory
            exists = await db.merchant_directory.find_one({"raw_string": raw_string})
            if exists and exists.get("category") not in [None, "", "other", "general"]:
                continue

            user_count = len(tc.get("unique_users", []))
            tx_count = tc.get("count", 0)

            # Apply privacy thresholds
            if tc.get("needs_verification") is True:
                continue

            if user_count < MIN_QUIZ_USERS_THRESHOLD or tx_count < MIN_QUIZ_TXNS_THRESHOLD:
                continue

            quiz_id = _stable_quiz_id("quiz_cat", raw_string)
            await _store_quiz_context(db, quiz_id, "category", {"merchant_raw": raw_string})

            quizzes.append({
                "id": quiz_id,
                "type": "category",
                "title": "Category Audit",
                "question": "Is this repeated campus payment label likely a food joint, tapri, or canteen?",
                "options": ["Food Canteen", "Stationery", "Delivery Services", "General Stores"],
                "detail": f"Detected {tx_count} payment{'s' if tx_count > 1 else ''} across {user_count} student{'s' if user_count > 1 else ''}."
            })
    except Exception as e:
        logger.exception("Error generating category quizzes: %s", str(e))

    # 2. Meal guessing remains disabled outside explicit demo flows.
    # User-specific merchant prompts do not meet the community privacy thresholds.

    # 3. Item Identification quizzes: only from shared venue clusters meeting privacy thresholds.
    try:
        pipeline = [
            {
                "$match": {
                    "mapped_merchant_name": {"$exists": True, "$ne": None},
                    "amount": {"$gt": 0},
                    "needs_verification": {"$ne": True},
                }
            },
            {
                "$group": {
                    "_id": {"venue": "$mapped_merchant_name", "amount": "$amount"},
                    "count": {"$sum": 1},
                    "unique_users": {"$addToSet": "$user_id"},
                }
            },
            {"$sort": {"count": -1}},
        ]
        item_clusters = await db.transactions.aggregate(pipeline).to_list(length=100)
        active_venues = set(await db.campus_food.distinct("venue_name", {"status": "active"}))

        for cluster in item_clusters:
            venue = (cluster.get("_id") or {}).get("venue")
            amt_paise = (cluster.get("_id") or {}).get("amount")
            if not venue or not amt_paise or venue not in active_venues:
                continue

            count = cluster.get("count", 0)
            user_count = len(cluster.get("unique_users", []))
            if user_count < MIN_QUIZ_USERS_THRESHOLD or count < MIN_QUIZ_TXNS_THRESHOLD:
                continue

            amt_rs = amt_paise / 100.0
            item_match = await db.campus_food.find_one({
                "venue_name": {"$regex": f"^{re.escape(venue)}$", "$options": "i"},
                "price": amt_paise,
                "status": "active"
            })
            if item_match:
                continue

            suggestions = ["Tea/Chai", "Veg Maggi", "Samosa", "Cold Drink"]
            if amt_rs == 10:
                suggestions = ["Tea / Chai", "Biscuits", "Samosa"]
            elif amt_rs == 15:
                suggestions = ["Ginger Tea", "Samosa", "Bun Maska"]
            elif amt_rs == 30:
                suggestions = ["Veg Maggi", "Cold Coffee", "Aloo Paratha"]
            elif amt_rs == 40:
                suggestions = ["Cheese Maggi", "Aloo Paratha", "Veg Sandwich"]
            elif amt_rs == 80:
                suggestions = ["Veg Thali", "Paneer Roll", "Chola Bhatura"]

            quiz_id = _stable_quiz_id("quiz_item", venue, amt_paise)
            quizzes.append({
                "id": quiz_id,
                "type": "item_name",
                "title": "Menu Predictor",
                "question": f"Students frequently log a ₹{amt_rs:.0f} food payment at a verified campus venue. What menu item is this?",
                "venue_name": venue,
                "price": amt_paise,
                "options": suggestions,
                "detail": f"Recorded {count} matching payments across {user_count} students. No raw payment label is shared."
            })
    except Exception as e:
        logger.exception("Error generating item quizzes: %s", str(e))

    # Fallback to seed default community quizzes matching user screenshot requests
    if not quizzes and settings.DEMO_MODE:
        demo_cat_1 = _stable_quiz_id("quiz_cat", "QK_PAY_SNACKS")
        demo_cat_2 = _stable_quiz_id("quiz_cat", "UPI_TXN_BALAJI")
        await _store_quiz_context(db, demo_cat_1, "category", {"merchant_raw": "QK_PAY_SNACKS"})
        await _store_quiz_context(db, demo_cat_2, "category", {"merchant_raw": "UPI_TXN_BALAJI"})
        quizzes.extend([
            {
                "id": demo_cat_1,
                "type": "category",
                "title": "Category Audit",
                "question": "Is this repeated campus payment label likely a food joint, tapri, or canteen?",
                "options": ["Food Canteen", "Stationery", "Delivery Services", "General Stores"],
                "detail": "Detected 14 payments across 6 students."
            },
            {
                "id": demo_cat_2,
                "type": "category",
                "title": "Category Audit",
                "question": "Is this repeated campus payment label likely a food joint, tapri, or canteen?",
                "options": ["Food Canteen", "Stationery", "Delivery Services", "General Stores"],
                "detail": "Detected 8 payments across 3 students."
            },
            {
                "id": "quiz_item_bh2_night_canteen_1500",
                "type": "item_name",
                "title": "Menu Predictor",
                "question": "Students frequently spend ₹15 at BH-2 Night Canteen. What menu item is this?",
                "venue_name": "BH-2 Night Canteen",
                "price": 1500,
                "options": ["Ginger Tea", "Samosa", "Bun Maska"],
                "detail": "Recorded 14 payments of exactly ₹15 here."
            },
            {
                "id": "quiz_spike_bh2_egg_roll",
                "type": "price_spike",
                "title": "Price Hike Audit",
                "question": "Did BH-2 Night Canteen increase the price of Egg Paratha from ₹45 to ₹50?",
                "venue_name": "BH-2 Night Canteen",
                "item_name": "Egg Paratha",
                "old_price": 4500,
                "new_price": 5000,
                "options": ["Yes, price increased to ₹50", "No, it is still ₹45", "Not Sure"],
                "detail": "Recent student payments suggest a price rise of +11%."
            }
        ])

    return quizzes

@router.post("/submit-quiz")
@router.post("/submit-quiz/")
async def submit_quiz_response(req: SubmitQuizRequest, user_id: str = Depends(get_current_user)):
    db = get_db()
    now = datetime.datetime.utcnow()

    if req.quiz_type == "category":
        context = await _get_quiz_context(db, req.quiz_id)
        raw_merchant = context.get("merchant_raw")
        if not raw_merchant:
            raise HTTPException(status_code=400, detail="Quiz context expired. Please refresh and try again.")

        # Resolve category value: check custom_category or response_val
        final_cat = req.custom_category or req.response_val
        category_val = "food" if "food" in final_cat.lower() or "canteen" in final_cat.lower() or "tea" in final_cat.lower() else "shopping"
        clean_name = req.venue_name or ("Community-verified campus food merchant" if category_val == "food" else "Community-verified campus merchant")
        location_val = req.location.strip() if req.location else None

        vote_id = _stable_quiz_id("quiz_vote", req.quiz_id, user_id)
        await db.community_quiz_votes.replace_one(
            {"_id": vote_id},
            {
                "_id": vote_id,
                "quiz_id": req.quiz_id,
                "quiz_type": "category",
                "user_id": user_id,
                "category": category_val,
                "display_name": clean_name,
                "location": location_val,
                "created_at": now,
                "updated_at": now,
            },
            upsert=True,
        )

        vote_docs = await db.community_quiz_votes.find({"quiz_id": req.quiz_id, "quiz_type": "category"}).to_list(length=100)
        unique_voters = {v.get("user_id") for v in vote_docs if v.get("user_id")}
        category_counts: dict[str, int] = {}
        for vote in vote_docs:
            cat = vote.get("category")
            if cat:
                category_counts[cat] = category_counts.get(cat, 0) + 1

        top_category = max(category_counts, key=category_counts.get) if category_counts else category_val
        top_count = category_counts.get(top_category, 0)
        if len(unique_voters) < MIN_QUIZ_USERS_THRESHOLD or top_count < MIN_QUIZ_USERS_THRESHOLD:
            return {
                "status": "pending_verification",
                "message": f"Answer saved. This merchant category needs {MIN_QUIZ_USERS_THRESHOLD} independent matching confirmations before shared data changes.",
            }

        matching_votes = [v for v in vote_docs if v.get("category") == top_category]
        display_candidates = [v.get("display_name") for v in matching_votes if v.get("display_name")]
        location_candidates = [v.get("location") for v in matching_votes if v.get("location")]
        verified_name = display_candidates[0] if display_candidates else ("Community-verified campus food merchant" if top_category == "food" else "Community-verified campus merchant")
        verified_location = location_candidates[0] if location_candidates else None

        directory_set = {
            "display_name": verified_name,
            "category": top_category,
            "verified": True,
            "verified_by_count": top_count,
            "updated_at": now,
        }
        if verified_location:
            directory_set["location"] = verified_location

        await db.merchant_directory.update_one(
            {"raw_string": raw_merchant},
            {"$set": directory_set},
            upsert=True
        )

        tx_set = {
            "is_mapped": True,
            "mapped_merchant_name": verified_name,
            "category": top_category,
            "category_verified_by_count": top_count,
        }
        if verified_location:
            tx_set["location"] = verified_location
        await db.transactions.update_many(
            {"raw_merchant_string": raw_merchant},
            {"$set": tx_set}
        )
        return {
            "status": "success",
            "message": f"Community verified this repeated campus payment as {top_category}. Shared data updated after {top_count} matching confirmations."
        }

    elif req.quiz_type in ["item_name", "meal_guess"]:
        # Create a pending food item candidate under this canteen.
        if not req.venue_name or not req.price:
            raise HTTPException(status_code=400, detail="Missing venue_name or price for item/meal quiz submission")

        item_id = f"{req.venue_name.lower().replace(' ', '_')}_{req.response_val.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}"
        doc = {
            "_id": item_id,
            "campus": "ABV-IIITM Gwalior",
            "venue_id": req.venue_name.lower().replace(" ", "_"),
            "venue_name": req.venue_name,
            "item_name": req.response_val,
            "category": "food",
            "price": req.price,
            "price_history": [{"price": req.price, "changed_at": now.isoformat()}],
            "status": "pending_verification",
            **_review_counts_after_submitter_confirmation(user_id),
            "verification_threshold": await _verification_threshold_for(db, "ABV-IIITM Gwalior", "community_item_quiz"),
            "scanned_by": user_id,
            "submitted_by": user_id,
            "source": "community_item_quiz",
            "needs_review": True,
            "created_at": now,
            "updated_at": now
        }
        await db.campus_food.insert_one(doc)
        return {"status": "success", "message": f"Saved '{req.response_val}' at ₹{req.price/100:.0f} for {req.venue_name} as pending community verification."}

    elif req.quiz_type == "price_spike":
        if not req.venue_name or not req.item_name or not req.new_price:
            raise HTTPException(status_code=400, detail="Missing fields for price spike quiz submission")

        if "yes" in req.response_val.lower() or req.image_b64:
            active_item = await db.campus_food.find_one({
                "venue_name": {"$regex": f"^{re.escape(req.venue_name)}$", "$options": "i"},
                "item_name": {"$regex": f"^{re.escape(req.item_name)}$", "$options": "i"},
                "status": "active",
            })
            old_price = req.old_price or (active_item or {}).get("price")

            existing_candidate = await db.campus_food.find_one({
                "venue_name": {"$regex": f"^{re.escape(req.venue_name)}$", "$options": "i"},
                "item_name": {"$regex": f"^{re.escape(req.item_name)}$", "$options": "i"},
                "price": req.new_price,
                "status": "pending_verification",
                "source": {"$in": ["price_spike_quiz", "receipt_price_spike_review"]},
            })

            if existing_candidate:
                if user_id not in existing_candidate.get("voters", []):
                    confirmations = food_confirmation_count(existing_candidate) + 1
                    disputes = food_dispute_count(existing_candidate)
                    candidate_threshold = await _effective_verification_threshold_for(
                        db,
                        existing_candidate,
                        "price_change_review",
                    )
                    await db.campus_food.update_one(
                        {"_id": existing_candidate["_id"]},
                        {
                            "$addToSet": {"voters": user_id},
                            "$set": {
                                "verification_votes": confirmations - disputes,
                                "confirmation_count": confirmations,
                                "dispute_count": disputes,
                                "verification_threshold": candidate_threshold,
                                "updated_at": now,
                            },
                        },
                    )
                latest_candidate = await db.campus_food.find_one({"_id": existing_candidate["_id"]})
                latest_votes = food_confirmation_count(latest_candidate) if latest_candidate else 0
                latest_threshold = latest_candidate.get("verification_threshold", 5) if latest_candidate else 5
                candidate_for_item_id = latest_candidate.get("candidate_for_item_id") if latest_candidate else None
                if latest_candidate and candidate_for_item_id and latest_votes >= latest_threshold:
                    target_item = await db.campus_food.find_one({"_id": candidate_for_item_id})
                    if target_item:
                        await db.campus_food.update_one(
                            {"_id": candidate_for_item_id},
                            {
                                "$set": {
                                    "price": latest_candidate.get("price", target_item.get("price")),
                                    "category": latest_candidate.get("category", target_item.get("category", "food")),
                                    "updated_at": now,
                                    "last_review_source": latest_candidate.get("source", "community_price_report"),
                                },
                                "$push": {
                                    "price_history": {
                                        "price": latest_candidate.get("price", target_item.get("price", 0)),
                                        "changed_at": now.isoformat(),
                                        "source": latest_candidate.get("source", "community_price_report"),
                                        "verified_by_votes": latest_votes,
                                    }
                                },
                            },
                        )
                        await db.campus_food.update_one(
                            {"_id": latest_candidate["_id"]},
                            {"$set": {"status": "merged_into_active", "merged_at": now, "merged_into": candidate_for_item_id}},
                        )
                        return {
                            "status": "merged_into_active",
                            "message": f"Price change for {req.item_name} reached verification threshold and was merged into the trusted menu.",
                        }
                return {
                    "status": "pending_verification",
                    "message": f"Price change report already exists for {req.item_name}; your confirmation was added for review.",
                }

            candidate_id = f"{req.venue_name.lower().replace(' ', '_')}_{req.item_name.lower().replace(' ', '_')}_price_{uuid.uuid4().hex[:6]}"
            price_history = []
            if old_price:
                price_history.append({
                    "price": old_price,
                    "changed_at": (active_item.get("updated_at") if active_item else now).isoformat()
                    if hasattr((active_item or {}).get("updated_at"), "isoformat")
                    else now.isoformat(),
                    "source": "previous_active_price",
                })
            price_history.append({
                "price": req.new_price,
                "changed_at": now.isoformat(),
                "source": "community_price_report",
            })

            candidate_doc = {
                "_id": candidate_id,
                "campus": (active_item or {}).get("campus", "ABV-IIITM Gwalior"),
                "venue_id": req.venue_name.lower().replace(" ", "_"),
                "venue_name": req.venue_name,
                "item_name": req.item_name,
                "category": (active_item or {}).get("category", "food"),
                "price": req.new_price,
                "price_history": price_history,
                "status": "pending_verification",
                **_review_counts_after_submitter_confirmation(user_id),
                "verification_threshold": await _verification_threshold_for(
                    db,
                    (active_item or {}).get("campus", "ABV-IIITM Gwalior"),
                    "price_change_review",
                ),
                "scanned_by": user_id,
                "submitted_by": user_id,
                "source": "receipt_price_spike_review" if req.image_b64 else "price_spike_quiz",
                "needs_review": True,
                "candidate_for_item_id": (active_item or {}).get("_id"),
                "price_spike_context": {
                    "old_price": old_price,
                    "new_price": req.new_price,
                    "has_receipt_image": bool(req.image_b64),
                },
                "created_at": now,
                "updated_at": now,
            }
            await db.campus_food.insert_one(candidate_doc)
            return {
                "status": "pending_verification",
                "message": f"Saved price change report for {req.item_name} as pending community verification.",
            }
        else:
            await db.price_spike_feedback.insert_one(
                {
                    "user_id": user_id,
                    "venue_name": req.venue_name,
                    "item_name": req.item_name,
                    "old_price": req.old_price,
                    "new_price": req.new_price,
                    "response_val": req.response_val,
                    "created_at": now,
                }
            )
            return {"status": "success", "message": "Feedback recorded, price unchanged."}

    raise HTTPException(status_code=400, detail="Invalid quiz type submitted")
