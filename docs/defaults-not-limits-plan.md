# PocketBuddy: Defaults Exist, Platform Is Not Limited

This document captures the product and implementation direction discussed after reviewing hardcoded values in the current PocketBuddy platform.

The corrected core goal is:

> PocketBuddy should ship with strong demo defaults, but users should never be blocked because their college, UPI app, category, cart platform, food venue, or local campus habit is missing from our initial list.

More precisely:

> Defaults are allowed as placeholders, suggestions, and demo seed data. They should not silently become prefilled user data in a real account.

## Why This Matters

Hardcoded defaults are useful for a hackathon demo because they make the product feel populated immediately. But if the product is actually for Indian college students across campuses, fixed lists create a bad product ceiling.

There are two different things here:

1. Product defaults/placeholders:
   These help the user understand what to enter, but should not automatically fill their profile as real data.

2. Demo seed data:
   This is a script/file we intentionally run for one demo account before recording or presenting.

Do not mix these two.

Examples:

- If a college is not listed during onboarding, the user should be able to add it.
- If a UPI provider or bank app is not listed, the user should still be able to select or add it.
- If a cart platform is not Zepto, Blinkit, or Swiggy Instamart, the user should still be able to create a pool.
- If a transaction category is not in our default list, the user should be able to define a custom category.
- If a campus food item or venue is not in the static JSON, the platform should support adding it later.

The right model is not "remove defaults." The right model is "seed defaults, then allow extension."

## Current Hardcoded Areas

### 1. Onboarding College List

Current issue:

- The frontend has a fixed college list.
- If the user's college is missing, the UI does not properly support adding a new college as a first-class value.
- The onboarding flow currently risks feeling prefilled for one campus instead of asking the user for their real campus.

Required direction:

- Move colleges to a backend-backed catalog.
- Use known colleges only as suggestions in the dropdown/search.
- Let authenticated users add a missing college.
- Store the selected college name or campus ID in the user's profile.

Minimum expected behavior:

- Placeholder says something like `Search or add your college`.
- No real account should be auto-filled with `ABV-IIITM Gwalior`.
- Suggested list can include `ABV-IIITM Gwalior` and a few known demo colleges.
- User can click/add "My college is not listed."
- New college becomes selectable immediately.
- The platform continues without needing admin approval during demo.

Better later:

- Add verification status: `user_added`, `verified`, `hidden`.
- Add city/state fields.
- Add campus-specific food/vendor defaults after a college is added.

### 2. UPI App Options

Current issue:

- UPI apps are hardcoded in onboarding.
- Android parsing already handles some notification sources, but the user's declared app list is fixed.
- The UI should not assume every user uses a specific provider.

Required direction:

- Move UPI/payment provider options to a backend-backed catalog.
- Show common providers as selectable suggestions:
  - Google Pay
  - PhonePe
  - Paytm
  - Amazon Pay
  - CRED
  - Kotak811 or bank apps where relevant
- Let the user add another provider/bank app.

Important distinction:

- The user-facing provider list can be dynamic.
- Android notification parsing still needs package-name and text-pattern support.
- Adding a UPI app in onboarding does not automatically guarantee parser support, but it should allow the user to declare what they use.

Required UX:

- No UPI app should be selected by default.
- Show default provider chips.
- Provide "Add another UPI/bank app."
- Save selected provider values to profile.
- Do not block setup if the provider is unknown.

Backend later:

- Store optional parser metadata:
  - package name fragments
  - known sender IDs
  - debit/credit patterns
  - confidence level

### 3. Transaction Categories

Current status:

- Transaction category defaults are mostly fixed.
- `Other` can already become custom in some edit flows.

Required direction:

- Keep default categories:
  - Food
  - Stationery
  - Travel
  - Subscription
  - Other
- Add backend-backed category catalog.
- Let users create custom categories like:
  - Laundry
  - Books
  - Printing
  - Medical
  - Trips
  - Gym

Expected behavior:

- Category filters should include defaults plus user-created categories.
- Add/edit transaction dialogs should use the same catalog.
- Custom categories should be normalized safely, but display labels should remain human-readable.
- Manual transaction forms can default the selector visually to a common option only if the user still confirms it before saving.

Avoid:

- Hardcoding only five categories forever.
- Losing custom category names by forcing everything into `other`.

### 4. Cart Pool Platforms

Current issue:

- Cart pool platforms are hardcoded around quick-commerce defaults.
- Current defaults are good for demo, but the feature should support any pooled purchase.

Required direction:

- Keep quick-commerce defaults:
  - Zepto
  - Blinkit
  - Swiggy Instamart
- Add more default options:
  - BigBasket
  - JioMart
- Add "Other platform/store" support.

Important product shift:

The feature should not be limited to quick-commerce apps only. It can represent any shared purchase:

- Canteen group order
- Stationery bulk order
- BigBasket/JioMart groceries
- Medicine run
- Local shop purchase
- Event supplies

Expected UX:

- User can select default platform.
- User can add custom platform/store name.
- Platform suggestions can show recommended min cart value and delivery fee.
- Do not silently create a pool with platform/min-cart/fee defaults until the host confirms or edits them.
- Custom platform should allow custom min cart and fee.

Backend behavior:

- Do not reject unknown platform strings.
- Normalize values for storage.
- Preserve display label separately if possible.

### 5. Campus Food Data

Current issue:

- `data/campus_food.json` is effectively fixed demo data.
- It is useful for demo, but not scalable across campuses.

Required direction:

- Treat current JSON as seed data or fallback suggestions, not source of truth.
- Store campus food venues/items in DB.
- Seed ABV-IIITM Gwalior demo food only when intentionally preparing the demo account/environment.
- Let future flows add/edit campus food options.

Suggested data model:

- `campuses`
  - id
  - name
  - city
  - state
  - status
- `campus_venues`
  - id
  - campus_id
  - venue_name
  - hostel_block optional
  - opening time
  - closing time
- `campus_food_items`
  - id
  - venue_id
  - item_name
  - category
  - price_paise
  - available_from
  - available_until

For hackathon:

- Do not build full admin tooling unless time permits.
- A seed script plus backend endpoint is enough.
- Future UI can add "Suggest campus food item."

### 6. Wellness and Insight Thresholds

Current issue:

- Some insight thresholds are rule-based and hardcoded.

This is acceptable for now.

Required direction later:

- Move thresholds into config or rules collection only if needed.
- For demo, deterministic local rules are fine.

Do not overbuild this right now.

### 7. Android Notification Parser Defaults

Current issue:

- Android parser has fixed package names, sender IDs, and text patterns.

This is partly necessary.

Required direction:

- Keep deterministic parser rules in code for reliability.
- Document that provider support expands through parser rules.
- User-added UPI provider should not break onboarding.
- Unknown provider notifications can still be logged as `failed` or `needs_review`.

Future enhancement:

- Backend-managed parser rule catalog.
- Android app periodically fetches trusted parser config.
- This is not required for the immediate hackathon build.

## Recommended Architecture for Defaults

Use a catalog pattern.

### Backend Catalog Collections

Create lightweight collections such as:

- `catalog_campuses`
- `catalog_payment_providers`
- `catalog_transaction_categories`
- `catalog_cart_platforms`

Each catalog item should have:

- `id`
- `value`
- `label`
- `source`: `default` or `user`
- `created_by`: user ID if user-added
- `sort_order`
- optional metadata depending on catalog type

Example metadata:

- Campus: city, state
- Cart platform: default min cart value, default delivery fee
- Payment provider: package name fragments, sender IDs, parser support status

### Backend Endpoints

Suggested minimum endpoints:

```text
GET  /api/catalog/campuses
POST /api/catalog/campuses

GET  /api/catalog/payment-providers
POST /api/catalog/payment-providers

GET  /api/catalog/transaction-categories
POST /api/catalog/transaction-categories

GET  /api/catalog/cart-platforms
POST /api/catalog/cart-platforms
```

All should be authenticated.

GET behavior:

- Return suggestion items plus user-created items.
- Suggested/default catalog rows are allowed as selectable options.
- They must not automatically populate a user profile unless the user chooses them.
- If suggestion defaults are missing, seed them through a controlled seed script, not random UI code.

POST behavior:

- Validate label.
- Normalize value.
- Store under the current user.
- Return the created item.

### Frontend Behavior

Frontend should not own the master hardcoded lists.

Frontend can keep fallback constants only for resilience:

- If catalog API fails, show minimal placeholder suggestions.
- If catalog API works, use backend result.
- Inputs should start empty unless existing saved profile data is present.

Expected screens to update:

- Onboarding:
  - fetch colleges
  - fetch UPI providers
  - allow custom add
- Transactions:
  - fetch categories
  - allow custom add
  - use same category list in filters and edit dialogs
- Cart pool:
  - fetch platforms
  - allow custom platform/store
  - include BigBasket and JioMart defaults
- Campus food/RAG:
  - use DB data seeded from defaults
  - do not rely only on static JSON long-term

## Demo Seed Strategy

We still need demo data, but it should be separate from the normal product flow.

Recommended approach:

- Keep demo account data in a seed file or seed script.
- Do not hardcode demo account values directly inside UI components.
- Run a seed step before recording the video or presenting.
- The seed should target one known account/user ID, not every new user.

Suggested seed categories:

- Default campuses
- Default UPI/payment providers
- Default transaction categories
- Default cart platforms
- ABV-IIITM Gwalior campus food
- Demo transactions/check-ins/subscriptions for one demo user

This gives us:

- A polished demo
- A realistic product architecture
- Easy reset before video recording
- No product limitation from static frontend arrays

### Required Demo Seed File

Create a dedicated file for demo data, for example:

```text
backend/seeds/demo_account_seed.py
```

or:

```text
backend/seeds/demo_account.json
```

The seed should be explicit and safe:

- It should require a target user ID or email.
- It should not run automatically for every user.
- It should upsert deterministic demo data for that one account.
- It should be re-runnable without creating uncontrolled duplicates.
- It should be easy to clear/reset that demo account.

Example command shape:

```text
python backend/seeds/demo_account_seed.py --user-id <demo-user-id>
```

or:

```text
python backend/seeds/demo_account_seed.py --email demo@pocketbuddy.local
```

The seed should populate:

- Profile:
  - monthly allowance
  - cycle start day
  - selected college
  - hostel/wing/room
  - mess settings
  - exam dates
  - selected UPI apps
- Transactions:
  - recent food spends
  - stationery spend
  - travel spend
  - subscription debit
  - one or two companion-ingested UPI examples
- Companion sync logs:
  - parsed debit
  - duplicate
  - received credit
  - failed/needs-review example only if useful for the demo
- Subscriptions:
  - one active subscription
  - one paused or detected subscription
- Check-ins:
  - meal check-ins
  - stress/food gap signal if needed
- Cart pools:
  - one open pool
  - one completed pool with roommate split payments
  - one auto-verified payment example if available
- Campus food:
  - ABV-IIITM Gwalior demo venues/items, scoped as campus seed data

The seed file is the correct place for demo richness. The onboarding UI is not.

## Priority Order for Teammate

### Priority 1: Catalog Backend

Implement catalog endpoints and seeded defaults.

Acceptance criteria:

- `GET /api/catalog/campuses` returns defaults.
- `POST /api/catalog/campuses` adds a user custom college.
- Same pattern works for UPI providers, categories, and cart platforms.
- Defaults and user-added entries both appear in GET responses.
- Defaults are suggestions only and are not automatically written into the user's profile.

### Priority 2: Onboarding Dynamic Options

Replace hardcoded college and UPI options with catalog API data.

Acceptance criteria:

- College field starts empty unless the user already has saved profile data.
- User can select a suggested college.
- User can add missing college.
- No UPI app is selected by default.
- User can select suggested UPI apps.
- User can add missing UPI/bank app.
- Saved profile uses the selected/custom values.
- New users are not silently assigned ABV-IIITM, BH-2, Wing 4B, room 412, or allowance 8000.

### Priority 3: Cart Pool Dynamic Platforms

Replace fixed platform buttons with catalog-driven options.

Acceptance criteria:

- Zepto/Blinkit/Instamart remain defaults.
- BigBasket and JioMart appear as defaults.
- User can add a custom store/platform.
- Pool creation works for custom platform.
- Existing public pool page still displays custom platform names cleanly.

### Priority 4: Transaction Categories

Use catalog-driven categories in transaction filters and edit/manual-add dialogs.

Acceptance criteria:

- Existing categories remain available.
- User-created categories appear in edit/manual-add flows.
- Filters include custom categories or provide an "Other/custom" grouping.
- Custom category is not silently collapsed into `other`.

### Priority 5: Campus Food as Seeded Data

Treat `data/campus_food.json` as seed input.

Acceptance criteria:

- Existing campus-food endpoint still works.
- DB-backed campus food remains primary.
- JSON is only fallback/seed.
- Future UI can add campus food without code changes.

## What Not To Do Right Now

Do not build a complex admin dashboard yet.

Do not remove suggestions/placeholders.

Do not prefill real user accounts with demo data.

Do not block unknown user inputs because they are not in our initial list.

Do not convert every rule into remote config immediately. Android parser and wellness thresholds can stay deterministic for now.

Do not add heavy approval workflows during the hackathon demo. User-added entries can be private to that user first.

## Final Product Principle

The demo should feel curated, but the product should feel open.

In implementation terms:

> Product defaults should be placeholders and suggestions. Demo richness should come from an explicit seed file for one demo account. User choices should be extensible data. UI source code should not be the product boundary.
