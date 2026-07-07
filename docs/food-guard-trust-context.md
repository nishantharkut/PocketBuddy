# Food Guard Trust Context

Status: implementation hardening branch
Branch: `fix/food-guard-trust-backend`

## Why This Change Exists

The first Food Guard version had a weak crowd model: scanned menu items could look verified after a tiny fixed vote count. That would not survive product or jury scrutiny because a campus can have hundreds or thousands of students, and three confirmations are not enough for every campus, every venue, and every price update.

This branch turns Food Guard from a static menu list into a trust-first campus food intelligence system.

## Kanika Contribution Included

This branch keeps Kanika's PR work as the base of the feature.

Picked/retained Kanika commits relative to `origin/main`:

| Commit | Author | Summary |
| --- | --- | --- |
| `498690a` | Kanika Singhal | `feat(food-guard): add trust-first OCR review backend` |

Count: **1 Kanika-authored commit** is present on this branch before the current hardening commit.

## Current Feature Logic

Food Guard now has three layers:

1. **Campus food source layer**
   - Active food items come from MongoDB.
   - Seeded demo data is inserted intentionally through `scripts/seed_demo_data.py`.
   - Local `data/campus_food.json` fallback is restricted to explicit `DEMO_MODE`, so normal product behavior does not silently depend on static JSON.

2. **Review and trust layer**
   - OCR/menu-scan items enter `pending_verification`.
   - Submitters cannot self-confirm their own scanned item unless they are trusted/admin users.
   - Confirmations and disputes are tracked separately:
     - `confirmation_count`
     - `dispute_count`
     - `verification_votes` as net score
   - Old rows with `verification_threshold: 3` are dynamically upgraded before reaching the UI.

3. **Recommendation layer**
   - Active recommendations exclude:
     - `pending_verification`
     - `needs_review`
     - `disputed_hidden`
     - `rejected`
     - `merged_into_active`
   - RAG/AI food context also excludes review-only and disputed items.
   - Recommendations are ranked by trust, budget fit, availability, meal-gap context, and price freshness.

## Adaptive Threshold Model

Normal crowd submissions use:

```text
threshold = max(5, min(25, ceil(1.5 * sqrt(active_campus_reviewers))))
```
This gives:

- a minimum of 5 independent confirmations for cold-start campuses;
- sub-linear scaling as the active reviewer pool grows;
- an upper cap so verification does not become impossible.

Price changes and manual corrections use a stricter threshold because wrong price data directly affects student decisions.

## What Users See

Dashboard path:

```text
Dashboard -> Runway Action -> All Campus Foods -> Verify
```

Example review states:

```text
Confirmed: 4/9 · Disputed: 1
Confirmed: 2/9
```

The old `1/3` style should no longer appear after the backend changes and reseeded demo data are applied.

## Why This Is Stronger

The feature now answers a real student problem:

> "What can I eat now that is affordable, available, and reliable enough to trust?"

It is stronger than a static food directory because PocketBuddy combines:

- monthly runway;
- safe food budget;
- last meal gap;
- venue availability;
- crowd confirmation;
- dispute handling;
- AI/RAG safety by excluding untrusted data.

## Still Worth Strengthening

These are the next product-level hardening steps. They should be prioritized only if they improve the demo or final pitch.

1. **Reviewer reputation**
   - Weight confirmations by account age, prior accepted corrections, and abuse flags.
   - Avoid giving equal weight to brand-new accounts and trusted campus contributors.

2. **Rate limiting and abuse controls**
   - Limit how many menu confirmations one user can submit per venue per day.
   - Detect repeated voting from the same device/IP/session pattern.

3. **Freshness decay**
   - Let old confirmations decay slowly.
   - Force price re-verification after a defined period, especially for volatile canteens.

4. **Source provenance**
   - Store whether an item came from OCR, manual edit, partner import, receipt, or transaction pattern.
   - Keep a masked audit trail so reviewers can understand why the item exists.

5. **Payment-pattern inference**
   - Use repeated food transactions at a venue to suggest likely menu items.
   - Keep it privacy-safe: aggregate counts only, no raw payment labels exposed.

6. **Merchant or campus admin verification**
   - Add a trusted role for canteen owners or campus admins to verify menu blocks faster.
   - This gives a business path: verified campus food boards and paid merchant visibility.

7. **Real OCR/provider hardening**
   - Replace fragile OCR paths with a stable provider before final production claims.
   - OCR should never directly publish items; it should only create review candidates.

8. **Business metrics**
   - Track measurable value:
     - skipped overpriced food choices;
     - cheaper alternatives selected;
     - meal gaps reduced;
     - verified menu coverage per campus;
     - active reviewers per campus.

9. **Campus expansion model**
   - Start with one campus seeded through a script.
   - Expand by importing starter menus, then letting students verify and correct.
   - This keeps the product scalable without requiring manual data entry by the core team.

10. **UI explanation**
    - The current UI shows counts, but the final UI should explain why an item is pending, verified, or disputed in one short line.
    - Avoid technical words like "threshold" in the main student-facing view.

## Demo Guidance

For the demo, show:

1. Runway food suggestion.
2. Campus food panel.
3. Verify tab with adaptive counts.
4. A disputed item hidden from recommendations.
5. The line: "PocketBuddy does not trust OCR blindly. Campus food becomes useful only after independent student confirmation."

Avoid claiming:

- live restaurant API coverage;
- fully solved OCR;
- perfect fraud prevention.

Claim confidently:

- trust-first food intelligence;
- budget-aware meal recommendations;
- review queue before recommendations;
- dispute handling;
- seeded account data, not UI hardcoding.

## Verification Used

The current branch was verified with:

```powershell
$env:PYTHONPATH='backend'
.\backend\.venv\Scripts\python.exe -m unittest backend.tests.test_campus_food_trust backend.tests.test_food_rag_recommendation
.\backend\.venv\Scripts\python.exe -m compileall backend\app backend\tests scripts\seed_demo_data.py
npm.cmd run check --workspace=frontend
git diff --check
```
