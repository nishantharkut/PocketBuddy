# Menu OCR Edge Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PocketBuddy's campus menu scanner reliable enough for finals and defensible enough for production by turning menu photos into review candidates, not blindly trusted menu data.

**Architecture:** Keep the existing FastAPI campus food review pipeline as the source of truth. Add Android/on-device OCR as the preferred extraction path, keep OCR.space as an optional configured backend fallback, and always route extracted items through the existing adaptive verification threshold before they can affect recommendations, runway, or Bedrock context.

**Tech Stack:** Android Kotlin, Google ML Kit Text Recognition v2, FastAPI, MongoDB Atlas, optional OCR.space, optional Bedrock Nova Lite text structuring, existing campus food verification APIs.

---

## Why This Plan Exists

The Gemini notes correctly identify OCR as the weak point in the food feature, but several suggestions overclaim reliability. A menu scanner should not be pitched as "guaranteed OCR." The defensible product claim is:

> PocketBuddy digitizes menu photos into review candidates. The crowd, transaction signals, and verification thresholds decide what becomes trusted campus food data.

That framing is stronger than raw OCR because it matches the real user pain: students need current campus food options and prices, not a brittle OCR demo that can poison recommendations.

## Gemini Plan Review

Useful ideas to keep:

- Client-side or on-device OCR avoids AWS billing surprises and reduces backend load.
- OCR candidates should stay in `pending_verification`.
- Bounding boxes matter because canteen menus are often multi-column.
- Students should review extracted rows before submit.
- Passive payment signals should help detect price changes later.

Ideas to avoid or reframe:

- Do not use "guaranteed OCR" language. Blurry photos, stylized boards, handwriting, and mixed scripts still fail.
- Do not rely on Textract for the finals path. It has a real account-level failure history in this project and adds AWS setup risk.
- Do not make a filename or file-size demo fallback the core feature. It looks fake if asked in Q&A.
- Do not make Gemini image-to-JSON the default engine. It is useful as an optional experiment, but it adds a non-Amazon external key and current rate limits vary by model and tier.
- Do not self-host EasyOCR or PaddleOCR on the small EC2 path before finals. It adds model and dependency risk for a feature that should be edge-first.

## Current Codebase Reality

Already present:

- `backend/app/services/menu_scanner.py`
  - OCR.space extraction.
  - Deterministic text-to-item parser.
  - Optional Bedrock text structuring.
  - Sanitization and `pending_verification` candidate creation.

- `backend/app/api/campus_food.py`
  - `POST /api/campus-food/scan` accepts multipart image upload and JSON base64.
  - OCR failure returns `needs_review` instead of creating trusted data.
  - Scan candidates are stored as `pending_verification`.
  - Existing food signal endpoints connect repeated payment patterns to menu review.

- `backend/app/services/campus_food.py`
  - `compute_food_verification_threshold()` already uses adaptive thresholds instead of a fixed 3-vote model.
  - Review-only statuses prevent pending items from being treated as trusted recommendations.

- `frontend/src/routes/_authenticated/dashboard.lazy.tsx`
  - Food sheet has manual item add, menu photo scan, food signals, and verification tabs.
  - UI copy already says OCR candidates do not become trusted immediately.

Key gap:

- The current scanner sends the photo to OCR.space from the backend. If the key is missing, quota fails, or image quality is weak, the scanner becomes a review-only dead end. The product needs a local extraction path and a better review contract.

## Recommended Final Architecture

### Primary Path: Android Edge OCR

1. Student opens PocketBuddy Connector.
2. Student chooses "Scan campus menu."
3. Android runs ML Kit Text Recognition v2 on-device.
4. The connector sends structured OCR lines to PocketBuddy:
   - text,
   - line bounding box,
   - confidence if available,
   - rotation/source metadata,
   - campus,
   - venue name,
   - image hash or thumbnail reference.
5. FastAPI groups lines into item/price rows.
6. User reviews extracted candidates.
7. Backend stores candidates as `pending_verification`.
8. Enough independent confirmations promote the item to trusted campus menu data.

Why this should be the default:

- No per-scan server cost.
- No Textract subscription risk.
- No backend model memory burden.
- Better privacy story because raw image OCR happens on the device.
- Strong finals story: "We use the companion app not only for payment sync, but also as a campus sensing edge node."

### Fallback Path: Web Upload Review

1. Student uploads a photo in the web Food tab.
2. If `OCR_SPACE_API_KEY` is configured, backend uses OCR.space.
3. If OCR.space is missing or fails, the UI keeps the photo and opens a manual review grid.
4. Student can add rows manually.
5. Submitted rows still go to `pending_verification`.

This keeps the demo and product usable even without an OCR API key.

### Optional Assist: Bedrock Text Structuring

Bedrock should not be responsible for "seeing" the image in the current finals path. Use it only after OCR text/lines exist:

- merge broken OCR rows,
- normalize item names,
- classify category as `beverage`, `snack`, `meal`, `dessert`, or `other`,
- reject rows that are likely phone numbers, UPI IDs, GST lines, totals, or offers.

The prompt must explicitly say:

```text
Use only visible OCR text supplied in the request. Do not infer missing prices or invent menu items. If uncertain, omit the row.
```

## Implementation Tasks

### Task 1: Lock The Existing Scanner Contract

**Files:**
- Modify: `backend/app/services/menu_scanner.py`
- Modify: `backend/app/api/campus_food.py`
- Test: `backend/tests/test_menu_scanner.py`
- Test: `backend/tests/test_campus_food_scan.py`

- [ ] **Step 1: Add tests for the current safety contract**

Create tests that assert:

```python
def test_ocr_failure_returns_needs_review_without_db_insert():
    # OCR unavailable must return needs_review and zero scanned items.
    # No campus_food row should be inserted.
    assert response["status"] == "needs_review"
    assert response["items_scanned"] == 0

def test_scanned_candidates_are_pending_only():
    # Any parsed item from OCR must be pending_verification.
    assert item["status"] == "pending_verification"
    assert item["needs_review"] is True
    assert item["verification_threshold"] >= 5
```

- [ ] **Step 2: Run the focused tests**

Run:

```powershell
$env:PYTHONPATH="backend"
.\.venv\Scripts\python.exe -m pytest backend/tests/test_menu_scanner.py backend/tests/test_campus_food_scan.py -q
```

Expected:

```text
tests pass, or fail only because the new tests expose an existing unsafe path
```

- [ ] **Step 3: Tighten the failure response if needed**

The scan endpoint must never silently fall back into trusted data. Failure response shape:

```python
{
    "status": "needs_review",
    "reason": "ocr_unavailable" | "ocr_failed" | "unparseable_ocr",
    "items_scanned": 0,
    "items": [],
    "message": "Menu photo received, but OCR could not read it reliably. No menu items were added; please review manually.",
}
```

- [ ] **Step 4: Commit**

```powershell
git add backend/app/services/menu_scanner.py backend/app/api/campus_food.py backend/tests/test_menu_scanner.py backend/tests/test_campus_food_scan.py
git commit -m "test: lock menu OCR review contract"
```

### Task 2: Add A Structured OCR Lines Contract

**Files:**
- Create: `backend/app/services/menu_ocr_lines.py`
- Modify: `backend/app/api/campus_food.py`
- Test: `backend/tests/test_menu_ocr_lines.py`

- [ ] **Step 1: Define the input shape**

Add backend support for OCR lines from Android or browser-side OCR:

```python
class OcrLine(BaseModel):
    text: str
    left: float = 0
    top: float = 0
    right: float = 0
    bottom: float = 0
    confidence: Optional[float] = None

class SubmitOcrLinesRequest(BaseModel):
    campus: str
    venue_name: str
    source: Literal["android_mlkit", "web_tesseract", "ocrspace_overlay"]
    image_hash: Optional[str] = None
    lines: list[OcrLine]
```

- [ ] **Step 2: Implement line grouping**

Create:

```python
def extract_menu_candidates_from_lines(
    lines: list[dict[str, Any]],
    venue_name: str,
    campus: str,
) -> list[dict[str, Any]]:
    ...
```

Rules:

- Sort lines by `top`, then `left`.
- Merge lines with overlapping vertical center into rows.
- Detect price tokens using `₹`, `Rs`, `INR`, or a trailing 1 to 4 digit price.
- Ignore phone numbers, UPI IDs, GST lines, totals, offers, addresses, and section headers.
- Accept price range `₹5` to `₹1500` for campus food.
- For rows with multiple prices such as `Half 50 Full 90`, create explicit variants only if item name is clear:
  - `Paneer Fried Rice Half`
  - `Paneer Fried Rice Full`
- Return candidates using the same pending shape as `structure_menu_text()`.

- [ ] **Step 3: Add API endpoint**

Add:

```python
@router.post("/scan-lines")
async def scan_menu_ocr_lines(
    body: SubmitOcrLinesRequest,
    user_id: str = Depends(get_current_user),
):
    ...
```

Response:

```python
{
    "status": "pending_verification",
    "items_scanned": len(inserted),
    "items": inserted,
    "message": f"Saved {len(inserted)} menu candidate(s) from '{venue_name}' for community review.",
}
```

- [ ] **Step 4: Test the line parser**

Test cases:

```python
def test_extracts_multicolumn_menu_rows_from_bounding_boxes():
    lines = [
        {"text": "Masala Maggi", "left": 20, "top": 10, "right": 160, "bottom": 30},
        {"text": "40", "left": 220, "top": 12, "right": 250, "bottom": 30},
        {"text": "Cold Coffee", "left": 20, "top": 45, "right": 170, "bottom": 62},
        {"text": "60", "left": 220, "top": 46, "right": 250, "bottom": 62},
    ]
    items = extract_menu_candidates_from_lines(lines, "BH-2 Night Canteen", "ABV-IIITM Gwalior")
    assert {i["item_name"] for i in items} == {"Masala Maggi", "Cold Coffee"}

def test_ignores_phone_upi_gst_and_total_rows():
    ...

def test_multiple_prices_create_clear_variants_only():
    ...
```

- [ ] **Step 5: Run tests**

```powershell
$env:PYTHONPATH="backend"
.\.venv\Scripts\python.exe -m pytest backend/tests/test_menu_ocr_lines.py backend/tests/test_campus_food_scan.py -q
```

- [ ] **Step 6: Commit**

```powershell
git add backend/app/services/menu_ocr_lines.py backend/app/api/campus_food.py backend/tests/test_menu_ocr_lines.py backend/tests/test_campus_food_scan.py
git commit -m "feat: accept structured menu OCR lines"
```

### Task 3: Add Android ML Kit Menu Scan

**Files:**
- Modify: `android/connector/build.gradle.kts`
- Create: `android/connector/src/main/java/com/pocketbuddy/connector/ui/MenuScanActivity.kt`
- Create: `android/connector/src/main/java/com/pocketbuddy/connector/ocr/MenuOcrExtractor.kt`
- Create: `android/connector/src/main/java/com/pocketbuddy/connector/network/MenuScanClient.kt`
- Modify: `android/connector/src/main/AndroidManifest.xml`
- Test: Android manual test on device

- [ ] **Step 1: Add ML Kit dependencies**

Use the Latin recognizer first. Add Devanagari only if the APK size impact is acceptable.

```kotlin
implementation("com.google.mlkit:text-recognition:16.0.1")
implementation("com.google.mlkit:text-recognition-devanagari:16.0.1")
```

- [ ] **Step 2: Add OCR extractor**

Create a small wrapper that converts ML Kit blocks and lines into the backend contract:

```kotlin
data class OcrLinePayload(
    val text: String,
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
    val confidence: Float?
)
```

Extraction rules:

- Discard empty text.
- Keep bounding boxes.
- Keep source metadata: `android_mlkit`.
- Do not upload the raw image unless the user explicitly chooses "include photo for review."

- [ ] **Step 3: Add review UI before submit**

Screen sections:

- Venue name.
- Image picker or camera intent.
- Extracted rows list.
- Edit item name and price before submit.
- Delete bad rows.
- Submit to campus review.

Copy must be short:

```text
OCR only drafts menu rows. PocketBuddy publishes them after campus review.
```

- [ ] **Step 4: Add network submit**

POST to:

```text
/api/campus-food/scan-lines
```

Use the configured PocketBuddy base URL from existing connector settings. If the connector only has the notification webhook URL, derive API base by removing `/api/ingest/notification-v2`.

- [ ] **Step 5: Manual Android tests**

Test cases:

- Clear English menu photo.
- Blurry photo.
- Multi-column menu.
- One row with phone number or UPI ID.
- Hindi/Devanagari menu if the model is included.
- Offline mode should not crash.
- Missing connector config should show a setup prompt.

- [ ] **Step 6: Commit**

```powershell
git add android/connector
git commit -m "feat: add Android edge menu OCR"
```

### Task 4: Improve Web Fallback Without Bloating UI

**Files:**
- Modify: `frontend/src/routes/_authenticated/dashboard.lazy.tsx`
- Modify: `frontend/src/lib/api.ts`
- Test: `npm.cmd run check --workspace=frontend`

- [ ] **Step 1: Keep the current upload CTA**

Do not add a large new page. Keep Food → Add Menu → Bulk add from menu photo.

- [ ] **Step 2: Add a review state after scan**

If backend returns `needs_review`, show:

```text
Could not read the photo reliably. Add the visible rows manually and they will go through the same campus review.
```

Then show a compact editable row grid:

- item name,
- price,
- category,
- remove row,
- add row,
- submit for review.

- [ ] **Step 3: Submit manual rows through existing create flow**

Manual rows must use the same pending verification path as the one-item manual add. Do not insert active menu records.

- [ ] **Step 4: Mobile behavior**

On mobile, the row grid should be one row per item with stacked inputs. Do not use wide tables.

- [ ] **Step 5: Verify frontend**

```powershell
npm.cmd run check --workspace=frontend
npm.cmd run build --workspace=frontend
```

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/routes/_authenticated/dashboard.lazy.tsx frontend/src/lib/api.ts
git commit -m "feat: add menu scan review fallback"
```

### Task 5: Keep OCR.space As An Optional Provider

**Files:**
- Modify: `backend/app/services/menu_scanner.py`
- Modify: `backend/.env.example`
- Test: `backend/tests/test_menu_scanner.py`

- [ ] **Step 1: Keep provider gating explicit**

Do not call OCR.space unless:

```text
OCR_PROVIDER=ocrspace
OCR_SPACE_API_KEY=<configured>
```

- [ ] **Step 2: Request overlay data only when needed**

For menu rows, use:

```python
"isOverlayRequired": "true",
"isTable": "true",
"detectOrientation": "true",
"scale": "true",
"OCREngine": "2",
```

If overlay parsing is too slow, keep `ParsedText` fallback.

- [ ] **Step 3: Document limits accurately**

Update docs to say:

```text
OCR.space free API: 500 requests/day/IP and 25,000 requests/month, 1 MB file limit, 3-page PDF limit.
```

This comes from OCR.space's own API page.

- [ ] **Step 4: Commit**

```powershell
git add backend/app/services/menu_scanner.py backend/.env.example backend/tests/test_menu_scanner.py
git commit -m "docs: clarify optional OCR provider limits"
```

### Task 6: Strengthen Food Signal Loop

**Files:**
- Modify: `backend/app/api/campus_food.py`
- Modify: `frontend/src/routes/_authenticated/dashboard.lazy.tsx`
- Test: `backend/tests/test_food_signals.py`

- [ ] **Step 1: Keep prompts rare**

Do not ask users to classify every food transaction. Trigger only when:

- same venue and amount appears across enough independent users, or
- a trusted menu item has a probable price mismatch, or
- a repeated personal vendor is unmapped and the user has already seen it multiple times.

- [ ] **Step 2: Tie OCR candidates to transaction evidence**

If a pending OCR item has the same venue and price as repeated real payments, increase its review priority but do not auto-promote.

- [ ] **Step 3: Add tests**

Test:

```python
def test_repeated_payments_raise_review_priority_without_auto_promotion():
    ...

def test_single_user_repeated_payment_does_not_create_public_menu_truth():
    ...
```

- [ ] **Step 4: Commit**

```powershell
git add backend/app/api/campus_food.py frontend/src/routes/_authenticated/dashboard.lazy.tsx backend/tests/test_food_signals.py
git commit -m "feat: connect food OCR review with payment signals"
```

## Demo Script For This Feature

Use this flow in the finals demo:

1. Open Food.
2. Show a trusted menu item.
3. Open Add Menu.
4. Upload or scan a menu photo.
5. Show extracted candidates.
6. Say: "These are not trusted yet."
7. Open Verify Menu.
8. Confirm one item.
9. Show that the item needs independent confirmations before it becomes active.
10. Show Food Signals if repeated payments are available.

One-line pitch:

```text
PocketBuddy does not trust OCR. OCR creates candidates; students and real payment signals create campus truth.
```

## What Not To Build Before Finals

- Full self-hosted OCR stack on EC2.
- Real Textract dependency.
- Gemini-only photo-to-JSON as the default path.
- Large canteen marketplace UI.
- Public menu edit pages outside the existing Food sheet.
- Any flow that publishes OCR rows directly to active recommendations.

## Production Roadmap After Finals

1. Add Android ML Kit edge OCR.
2. Add structured line ingestion to backend.
3. Add browser review fallback.
4. Add optional OCR.space overlay parsing.
5. Add campus reviewer reputation weighting.
6. Add image quality checks:
   - blur score,
   - brightness,
   - skew/rotation,
   - minimum text density.
7. Add scan telemetry:
   - source,
   - candidate count,
   - dropped row count,
   - average confidence,
   - verification outcome after 7 days.

## Cost And Reliability Notes

- Google ML Kit runs on-device and avoids per-scan backend billing.
- OCR.space free API currently documents 500 requests per day per IP and 25,000 requests per month, but it is not an SLA-backed production dependency.
- Tesseract.js is useful as a browser fallback for clean printed text, but the project itself says it does not improve the core Tesseract model and does not support PDF directly.
- Gemini can process images and produce structured JSON, but rate limits and pricing depend on model and tier. Treat it as optional, not core.
- Textract has an official free tier, but PocketBuddy already hit an AWS account subscription/access blocker, so it should not be the finals path.

## Source Notes

- Google ML Kit Text Recognition v2: https://developers.google.com/ml-kit/vision/text-recognition/v2
- ML Kit Android Text Recognition setup: https://developers.google.com/ml-kit/vision/text-recognition/v2/android
- OCR.space API limits and parameters: https://ocr.space/ocrapi
- Tesseract.js project scope: https://github.com/naptha/tesseract.js/
- Gemini image understanding: https://ai.google.dev/gemini-api/docs/image-understanding
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- AWS Textract pricing and free tier: https://aws.amazon.com/textract/pricing/

## Final Recommendation

Build Android ML Kit edge OCR first, because it strengthens the product without adding cloud cost or demo fragility. Keep OCR.space as a configured fallback and keep Bedrock as a text-structuring assistant only. The product should never claim that OCR is perfect; the defensible novelty is the closed loop:

```text
menu photo -> edge OCR draft -> user review -> campus verification -> payment-signal correction -> trusted food recommendation
```
