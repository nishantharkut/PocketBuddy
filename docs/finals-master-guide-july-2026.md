# PocketBuddy Finals Master Guide

Last updated: July 2, 2026

Purpose: this is the single handoff document for PocketBuddy after the July 2 mentorship session. It is written so Nishant, a teammate, or another AI assistant can understand the full context, avoid bad assumptions, and continue the work toward the July 5 submission and July 15/16 finale.

This document is internal. Do not paste it directly into the PRD or presentation. Use it to decide what to build, what to say, what to avoid, and what to ask.

## 1. Current Situation

PocketBuddy is a finalist project for HackOn with Amazon 6.0.

Original problem statement:

> PocketBuddy - AI Financial & Wellness Assistant for Students. Many students struggle silently with budgeting, food expenses, emotional stress, irregular sleep, and balancing academics with social life. Existing apps focus on only one aspect - finance, fitness, or productivity - without understanding the realities of student living. What if students had an AI companion that could help manage monthly expenses, recommend affordable food and travel options, detect burnout patterns, encourage healthy routines, and provide personalized support for both financial and emotional well-being throughout college life?

Current product thesis:

> PocketBuddy is a student money decision layer. It captures real payment signals with minimal manual effort, converts them into runway, food, travel, shared-pool, subscription, and wellness context, then nudges the student before small daily choices become a monthly crisis.

Important deadlines:

- Mentorship sessions: July 2 and July 3, 2026.
- Final PRD or PPT/demo submission deadline: July 5, 2026, 11:59 PM IST.
- Final presentation/demo: around July 15/16, 2026.
- Submission can show a polished guided prototype, but by final presentation the product should be hardened wherever possible.

Current deployment:

- Frontend: React/Vite app hosted on Amazon S3 and served through CloudFront.
- Backend: FastAPI app on EC2 behind Nginx.
- Database: MongoDB Atlas.
- AI: Amazon Bedrock Nova Lite.
- Android connector: Kotlin app using Android notification access to sync payment/SMS notifications.
- Serverless ingest path: API Gateway, Lambda ingest, SQS, Lambda processor, DynamoDB ledger.
- Demo URL: `https://d3g6cg7q9hn7hi.cloudfront.net/`
- APK URL: `https://d3g6cg7q9hn7hi.cloudfront.net/downloads/PocketBuddy-Connector-v0.1.0.apk`

Cost status:

- EC2, VPC, and EC2-Other were the main costs.
- EC2 was stopped to save credits.
- For mentorship/demo, start only when required, confirm app works, then stop again.
- Do not delete resources before final submission unless a replacement is already live.

## 2. What Already Exists

This list is important because future work must strengthen the existing product, not create random new features.

### Web App

- Landing page.
- Authentication.
- Onboarding:
  - monthly allowance,
  - reset/cycle date,
  - college/campus,
  - hostel/wing/room,
  - food/mess context,
  - payment app context,
  - companion setup.
- Dashboard:
  - allowance/runway,
  - safe daily spend,
  - spend stats,
  - recent activity,
  - food/wellness context,
  - Bedrock/Nova generated campus intelligence where enabled.
- History/transactions.
- Stats and analytics.
- Companion Device:
  - APK link,
  - config copy,
  - Android setup instructions,
  - recent sync activity,
  - unpair/test connection.
- Pool:
  - active/completed/cancelled pools,
  - cart items,
  - share/join flow,
  - UTR fallback,
  - partial payment states.
- Travel:
  - route list,
  - fare guardrail,
  - AI negotiation coach.
- Food/campus intel:
  - curated campus food data,
  - recommendations,
  - planned OCR/menu scanner feature was attempted but AWS Textract subscription blocked in current account.

### Android Connector

- Android-only passive capture using notification access.
- Can sync payment/SMS notifications into PocketBuddy.
- Works after installing APK and pasting web config.
- Play Protect can warn because the APK is sideloaded, not Play Store distributed.

### Cloud/AWS

- CloudFront routes web traffic.
- S3 serves static frontend and APK.
- EC2 runs the main FastAPI backend.
- API Gateway/Lambda/SQS/DynamoDB ingest path exists and has been tested independently.
- Bedrock Nova Lite is integrated for AI-generated text.
- CloudWatch logs exist for backend/serverless paths.

## 3. Mentor Advice From July 2

Mentor feedback was useful because it pointed to product-grade gaps, not just UI bugs.

### 3.1 iOS and Permission Denial

Concern:

- Android notification access is powerful but Android-only.
- iOS cannot support the same passive notification reading model.
- What happens if Android users deny notification access?

Strengthened direction:

- Android passive capture remains the sharp differentiator.
- For iOS and permission-denied users, PocketBuddy needs consent-based fallbacks:
  - Account Aggregator for bank-account data where available.
  - Email receipt sync for merchant receipts where user consents.
  - Bank statement import only as a controlled prototype/backup, not the privacy hero.
  - One-tap quick log as last fallback.

How to say it:

> Our primary passive capture is Android-native because Android allows notification access. For iOS, we do not pretend to read notifications. We move to consent-based rails: Account Aggregator, email receipts, or statement import. The product stays useful, but Android gets the most automated experience first.

### 3.2 Privacy and Trust

Concern:

- Notification access is sensitive.
- A sideloaded APK plus payment notification access is a trust barrier.
- Bank statement upload can look risky.

Strengthened direction:

- Privacy must be a visible product feature, not a backend footnote.
- Needed before final:
  - clear permission explanation,
  - masked preview of what is captured,
  - "only payment notifications" language,
  - export/delete controls,
  - failed/low-confidence review inbox,
  - no raw notification display in public demo.

Architecture principle:

> Parse at the edge where possible, store normalized fields, mask raw notification content, and let the user review low-confidence events.

### 3.3 Pooling and Splitwise Comparison

Concern:

- Splitwise already exists.
- UTR entry is manual.
- If someone does not pay, delivery cannot wait because Zepto/Swiggy/Blinkit delivery is fast.
- Reminders are not enough.

Strengthened direction:

- PocketBuddy pools are not generic expense splitting. They are short-window campus cart coordination.
- Delivery must never be blocked by payment lag.
- Host starts pool, roommates join, host checks out.
- Payment is verified through:
  - Android incoming credit notification matching amount/sender/time/pool,
  - UPI Intent/QR payment reference where possible,
  - UTR fallback when auto-verification fails.
- Add:
  - wing reliability score,
  - debt netting across future pools,
  - unpaid amount inside debtor's runway,
  - "settle in kind" option.

Important correction:

- Do not propose UPI Collect as the main future path. NPCI has phased out/restricted UPI Collect for many merchant/P2M use cases. The safer direction is UPI Intent and QR, plus notification-based verification.

How to say it:

> We do not delay the cart. The host can still checkout. PocketBuddy handles trust after checkout using auto-verification, reliability, and debt netting. UTR is fallback, not the primary verification model.

### 3.4 Food Intelligence

Concern:

- Current food data can look static.
- If prices change or menus change, recommendation quality drops.
- OCR/Textract is not working in the current AWS account due subscription/access issue.

Strengthened direction:

- The food feature should be framed as "budget-aware campus food intelligence", not a full Zomato clone.
- The decision is:
  - what is open now,
  - what fits today's runway,
  - what avoids skipped meals,
  - what students nearby actually repeat,
  - what is safe during exams/late night.
- Menu OCR is enrichment, not the core.
- Needed product data fields:
  - source,
  - last updated,
  - confidence,
  - campus/city,
  - price history,
  - open hours,
  - student repeat rate.

How to say it:

> Today we use curated and seeded campus food data. The product direction is not "scan menu once and call it AI." It is a living food layer where prices, open hours, repeat visits, meal gaps, and budget runway decide the recommendation.

### 3.5 Travel Fare Guard

Concern:

- Where do fares come from?
- How do we avoid false positives and false negatives?
- Ola/Uber/Rapido live APIs may not be publicly available.

Strengthened direction:

- Do not claim live Ola/Uber/Rapido fare integration unless actually integrated.
- Use:
  - route distance/time from Google Routes or Mappls,
  - official fare rules where available,
  - community median fares,
  - timestamp and confidence,
  - user-submitted actual paid fare reports.
- Add source labels:
  - "official",
  - "community median",
  - "recent student report",
  - "stale".

How to say it:

> Travel fare guard is a decision aid, not a legal price quote. It shows a confidence band with source and freshness, then helps the student negotiate or choose a safer route.

### 3.6 Runway and Forecasting

Concern:

- Dashboard stats are useful but too descriptive.
- Need prediction:
  - next month,
  - quarter,
  - half-year,
  - year,
  - "how much should I ask home for?"

Strengthened direction:

- Runway must become the spine of the product.
- Build/describe:
  - committed vs discretionary spend,
  - recurring subscription detection,
  - mess billing model,
  - EWMA/day-of-week spend projection,
  - confidence range,
  - shortfall probability,
  - "ask home for Rs. X" branch,
  - exam safety fund.

How to say it:

> PocketBuddy does not only say what you spent. It predicts how the month ends and gives a specific action: slow down, join a pool, eat at mess, negotiate fare, or ask home for a realistic amount.

### 3.7 "AI Is Not Novel"

Concern:

- Everyone says AI.
- Bedrock alone is not novelty.

Strengthened direction:

- Deterministic engine computes the important values.
- Bedrock/Nova should narrate and personalize.
- Novelty is the combination:
  - passive capture,
  - campus context,
  - runway as central budget spine,
  - food/travel/pools/wellness as actions,
  - privacy-aware review loop.

How to say it:

> AI is not the product. The product is the campus decision engine. Bedrock converts computed signals into a clear nudge the student can act on.

## 4. Teammate Strategy Notes To Keep

The teammate strategy has strong principles. Keep these.

### 4.1 One-Time Effort, Then Nothing

The strongest user promise:

> Set it once. PocketBuddy keeps the month updated without daily bookkeeping.

This should drive every feature. If a feature needs daily manual work, it weakens the pitch.

### 4.2 Deterministic Engine First, Bedrock Second

Use code for:

- parsing,
- classification,
- runway,
- forecasts,
- pool matching,
- confidence,
- anomaly detection.

Use Bedrock for:

- explanation,
- negotiation script,
- wellness wording,
- next-best action language.

This is more credible to judges than "AI magically manages money."

### 4.3 Mechanism, Not Hope

For every mentor concern, answer with a mechanism:

- Parser fails -> needs-review queue.
- Roommate does not pay -> reliability score + debt netting + runway penalty.
- Price data goes stale -> source/freshness/confidence labels.
- User denies notification access -> AA/email/statement/quick-log fallbacks.
- Impulse spend -> pre-purchase and post-purchase nudge loop.

## 5. Claude Review Items: Keep, Adapt, Reject

### Keep

- Account Aggregator as the real regulated fallback for iOS and permission denial.
- Privacy framing around consent, masking, delete/export, and minimum data.
- Runway as the product spine.
- Pooling as commerce coordination, not expense splitting.
- Amazon Pay and Amazon Now as future Amazon-fit integrations.
- ONDC/Beckn/Mappls/Google Routes for travel and local discovery.
- Bedrock as explanation layer, not calculation layer.

### Adapt

- Bank statement import:
  - Keep as prototype/backup.
  - Do not make it the main privacy story.
- Email receipt sync:
  - Useful, but Gmail APIs involve restricted scopes and security review. Present as later consent-based fallback, not immediate guaranteed coverage.
- Account Aggregator:
  - Powerful, but not instant for hackathon unless using sandbox/mock. Present as roadmap/architecture path unless actually integrated.

### Reject Or Correct

- UPI Collect as primary pool flow:
  - Do not build around it. NPCI restrictions/deprecations make UPI Intent/QR safer.
- Direct Amazon Now API:
  - Do not claim a public integration. Use as future Amazon partnership/product-fit path.
- Live Ola/Uber/Rapido pricing:
  - Do not claim unless integrated. Use distance/time + official/community fare band.
- iOS notification reading:
  - Not possible under iOS app rules. Use consent rails instead.

## 6. Final Product Direction

The product should be positioned as:

> A campus financial operating layer for students, starting with passive payment capture and ending with real actions: spend less today, eat affordably, avoid travel overpay, split a shared order, and ask for support before the month collapses.

Not:

- just an expense tracker,
- just a chatbot,
- just a food app,
- just Splitwise for students,
- just a dashboard.

Core loop:

1. Capture payment signals.
2. Normalize and classify with confidence.
3. Update monthly runway.
4. Detect risk or opportunity.
5. Recommend a campus action.
6. Learn from user corrections.

## 7. Feature Improvement Plan

### 7.1 Capture And Parser Review

Current gap:

- Parser coverage is the biggest threat to the zero-manual-entry pitch.
- Banks and payment apps format notifications differently.

Build direction:

- Add a parser confidence field.
- If confidence is low, store event as `needs_review`.
- Show review UI:
  - amount,
  - direction,
  - merchant,
  - category,
  - transaction reference,
  - masked notification preview.
- User correction writes to feedback collection.
- Do not auto-update regex in production.
- Later: use corrections to generate parser test cases.

By July 5:

- If full backend loop is not done, show a UI mock and one seeded needs-review event.

By July 16:

- Make it real.

### 7.2 Subscription Detection

Current gap:

- Static known-service matching is not intelligent enough.

Build direction:

- Phase 1:
  - known merchant list,
  - normalized merchant aliases,
  - active subscriptions page.
- Phase 2:
  - detect recurring merchant/amount patterns:
    - 28-31 day interval,
    - same merchant,
    - same or near-same amount,
    - at least 2-3 occurrences.
- Phase 3:
  - forecast next charge into runway.
  - alert if subscription makes month risky.

By July 5:

- Show known services plus "recurring detection coming from transaction rhythm" in deck.

By July 16:

- Implement simple interval clustering.

### 7.3 Pool Repayment Auto-Verification

Current gap:

- UTR entry is fallback but too manual as primary flow.
- Reminders alone do not solve non-payment. A senior judge will not accept "we remind them" as a settlement mechanism.

Build direction:

- Host creates pool.
- Roommates join and add items.
- When payment is due:
  - show UPI Intent/QR to host UPI ID,
  - include expected amount,
  - optionally include pool code/reference in note.
- Android connector on host phone watches incoming credit notifications.
- Auto-match if:
  - amount equals pending split or within small tolerance,
  - timestamp is within active repayment window,
  - sender name roughly matches roommate,
  - transaction reference is new,
  - pool is active/recent.
- If match confidence high:
  - mark split verified.
- If medium:
  - show "needs host review."
- If no match:
  - allow UTR fallback.

Non-payment mechanisms:

1. Wing reliability score:
   - track whether a roommate usually pays instantly, within hours, within a day, or late;
   - show this to hosts before future pools;
   - avoid public shaming, but make trust visible.
2. Debt netting:
   - if Rohan owes Rs. 89 today and hosts tomorrow's pool where Nishant owes Rs. 120, net the settlement to Rs. 31;
   - reduce repeated back-and-forth payments.
3. Debtor runway impact:
   - unpaid pool debt becomes committed spend in the debtor's own runway;
   - this creates self-pressure without blocking the host's checkout.
4. Settle-in-kind:
   - allow host to close a small debt if roommate buys equivalent snacks/tea/supplies later;
   - useful in real hostels where not every small debt is settled by cash.
5. Reminder:
   - keep reminder as the weakest fallback, not the core trust system.

Important product principle:

> Delivery should not wait for repayment. The host can checkout. PocketBuddy handles trust through auto-verification, reliability, debt netting, and runway pressure.

By July 5:

- Show seeded/polished flow.
- Say "auto verification is the primary path; UTR is fallback."

By July 16:

- Implement robust matching.

### 7.4 Runway Engine V2

Current gap:

- Stats are too descriptive.

Build direction:

Runway should use:

- monthly allowance,
- committed expenses,
- discretionary expenses,
- subscriptions,
- mess billing model,
- exam safety buffer,
- day-of-week spend tendency,
- recent spend velocity,
- known upcoming pool obligations.

Outputs:

- days until broke,
- safe/day,
- committed vs flexible spend,
- forecast end-of-month balance,
- shortfall probability,
- "ask home for Rs. X" amount if unavoidable,
- confidence band.

Algorithm suggestion:

- Keep deterministic, explainable.
- Start with EWMA:
  - more weight to recent days,
  - day-of-week adjustment,
  - exclude one-time refunded/duplicate transactions,
  - include committed future charges.
- Optional Monte Carlo:
  - sample discretionary spend from recent daily variance,
  - estimate shortfall probability.

By July 5:

- Show as product concept or seeded demo card if not built.

By July 16:

- Build a lightweight version.

### 7.5 Food Intelligence

Current gap:

- Static food data feels weak.

Build direction:

- Keep campus food catalog.
- Add:
  - open-now filter,
  - runway fit,
  - meal gap,
  - exam context,
  - price freshness,
  - student repeat signal,
  - "mess vs outside" suggestion.
- OCR/menu scanner is optional enrichment.

Food should become a campus food graph, not a menu list.

Core data fields:

| Field | Source |
| --- | --- |
| `venue_id`, `venue_name` | campus seed, Google Places/Mappls, transaction merchant |
| `campus`, `location_label`, `lat/lng` | campus seed, map APIs, admin/vendor update |
| `open_hours` | vendor/campus seed, Google Places, student reports |
| `item_name`, `category` | curated seed, menu upload, OCR/manual correction |
| `price_paise` | curated seed, student report, transaction inference, vendor update |
| `source` | curated, student_report, vendor, transaction_derived, OCR |
| `last_verified_at` | write timestamp from latest confirmation |
| `confidence` | computed from source count, recency, and source quality |
| `verified_by_count` | number of confirming users |
| `is_mess_option` | profile/campus catalog |
| `budget_tags` | cheap, moderate, expensive, computed from campus price bands |
| `meal_tags` | breakfast, lunch, dinner, late-night |
| `student_repeat_count` | repeated user transactions at same venue/item |

Automation path:

1. Start with curated campus defaults.
2. Infer venue and spend from Android payment notifications.
3. Ask one-tap micro-confirmations only when useful:
   - "Was this dinner at BH-2 Night Canteen?"
   - "Did you eat at mess?"
   - "Is tea still Rs. 10?"
4. Use student confirmations to update confidence and freshness.
5. Use nearby place APIs for outside campus venues and open status.
6. Use OCR/menu scan only as an enrichment layer, not as the core source.

Decision engine:

```text
current runway
+ meal gap
+ time of day
+ exam status
+ open venues
+ price freshness
+ repeat student choices
= food recommendation
```

Example output:

> You have Rs. 142 safe/day left. Since dinner gap is 7h and exams are active, prefer mess or BH-2 thali under Rs. 60. Avoid ordering Rs. 180+ tonight unless you join a pool.

Do not rely on Textract unless AWS access is confirmed. It failed with subscription required.

Alternatives:

- Manual menu add with photo as proof.
- Bedrock vision only if account supports image input and cost is acceptable.
- Google Vision/OCR only if allowed and setup is quick.
- For demo, seeded menu update is safer.

### 7.6 Travel Fare Guard

Current gap:

- Fare trust/source must be explicit.
- Live Ola/Uber/Rapido prices cannot be assumed. Some providers have APIs, but access, scopes, geography, and approval matter.

Build direction:

- Use route data:
  - Google Routes API or Mappls Routing for distance/time.
- Use fare baseline:
  - official city fare rules where available,
  - community median,
  - last verified paid fare,
  - campus-specific saved fares.
- Add confidence:
  - high: official + recent community reports,
  - medium: community only,
  - low: stale or sparse reports.
- Add "source shown to user" UI.

Do not overclaim:

- "We fetch live Ola/Uber/Rapido fares."

Better claim:

> We compare a quote to route distance and community/official fare bands, then give a negotiation script and safer alternative.

Provider strategy:

| Provider/Data Source | Reality | PocketBuddy Decision |
| --- | --- | --- |
| Uber APIs | Uber has official estimate endpoints in some products/scopes, but access and geography can vary | Integrate if approved; keep behind provider adapter |
| Ola ride fares | Public Ola Maps APIs exist for maps/routing, but ride-hailing fare APIs are not guaranteed for general use | Use Ola Maps/route data if useful; do not depend on live Ola fare |
| Rapido | No reliable official public fare API identified | Do not use unofficial APIs in production path |
| ONDC Mobility | Real open network direction, but integration is not a quick drop-in API | Treat as future network integration |
| Google Routes/Mappls | Reliable route distance/time APIs | Use for route baseline |
| Official/community fares | Buildable now | Use as primary fare guardrail |

Best architecture:

```text
TravelQuoteProvider
  - RouteDistanceProvider: Google Routes / Mappls / Ola Maps
  - OfficialFareProvider: city fare rules where available
  - CommunityFareProvider: student paid-fare reports
  - PartnerFareProvider: Uber/Ola/Rapido only if official access exists
```

This keeps the product useful even when closed ride-hailing APIs are unavailable.

### 7.7 Wellness And AI

Current gap:

- Must avoid sounding like medical diagnosis.

Build direction:

- Wellness signals:
  - skipped meal gap,
  - late-night spend spikes,
  - exam dates,
  - budget stress,
  - sleep proxy only if reliable data exists.
- Output:
  - practical check-in,
  - meal reminder,
  - spending reset,
  - campus support resources,
  - "talk to someone" suggestion where needed.

Do not say:

- "diagnoses burnout."

Say:

> Detects risk patterns and offers a supportive check-in.

### 7.8 Privacy Center

Build direction:

- What we capture:
  - amount,
  - merchant,
  - direction,
  - timestamp,
  - transaction reference if available.
- What we do not capture:
  - full chats,
  - non-payment notifications,
  - bank balance unless user opts into a specific data source,
  - raw messages after parsing unless needed for review and masked.
- Controls:
  - pause sync,
  - delete device,
  - delete account data,
  - export data,
  - review low-confidence transactions.

By July 5:

- At least show clear language in Companion/Onboarding.

By July 16:

- Add a real Privacy Center.

## 8. AWS Architecture Direction

### 8.1 Current Demo Architecture

Use this for the July 5 submission if stable:

- Browser and Android connector enter through CloudFront.
- S3 serves frontend and APK.
- `/api/*` goes to EC2/Nginx/FastAPI.
- FastAPI talks to MongoDB Atlas and Bedrock Nova Lite.
- `/api/ingest` can route to serverless ingest path if configured:
  - API Gateway,
  - Lambda ingest,
  - SQS,
  - Lambda processor,
  - DynamoDB ledger.
- CloudWatch stores logs/metrics.

### 8.2 What Was Temporarily Changed

At one point, a dedicated CloudFront behavior for `/api/ingest/notification` routed to API Gateway. Later, to make Android pairing work consistently with the platform, CloudFront should route `/api/*` to the EC2 backend unless the backend and mobile app are explicitly moved to serverless ingest.

Current correct principle:

> One app-visible ingest contract should exist. Do not let Android config point to a user/token path that disagrees with the visible Companion Device page.

### 8.3 Production Architecture Improvements

Near-term hardening:

- Add SQS DLQ for failed ingest events.
- Add CloudWatch alarms for:
  - Lambda errors,
  - SQS visible messages,
  - DLQ messages,
  - EC2 CPU/memory/disk,
  - backend 5xx.
- Add structured request IDs across ingest and backend.
- Add AWS Budgets alert below credit risk.
- Keep EC2 stopped outside demos if not needed.

Finals-grade architecture direction:

- Keep CloudFront + S3 for web and APK.
- Keep API Gateway + Lambda + SQS + DynamoDB for mobile event ingest.
- Move monolithic FastAPI from EC2 to:
  - AWS App Runner, or
  - ECS Fargate,
  - if time permits.
- Keep MongoDB Atlas for flexible product data unless moving database becomes a priority.
- If moving to AWS DB:
  - DynamoDB for event ledger and high-scale append-only ingest.
  - DocumentDB is possible for Mongo-like app data, but migration risk is high.
  - RDS/Postgres is more work and not necessary before finals.

Recommendation:

- Before July 5: do not migrate backend infrastructure.
- Before July 16: add DLQ/alarms and consider App Runner only if the app is stable.
- Do not attempt a full database migration unless mentor specifically pushes for AWS-native data.

### 8.4 Ledger And Database Decision

Do not use one database for every responsibility just to look AWS-native. Use the right storage model per workload.

Current principle:

> DynamoDB is good for raw ingest event ledger. It is not the entire financial accounting ledger.

Recommended split:

| Data Type | Best Fit | Why |
| --- | --- | --- |
| Raw notification/event ingest | DynamoDB | append-heavy, idempotent writes, Lambda/SQS integration, TTL, cheap scale |
| Duplicate/idempotency keys | DynamoDB | conditional writes can safely reject duplicates |
| User profile/catalog/product data | MongoDB Atlas for now | flexible existing schema, low migration risk before finals |
| Pool obligations and settlements | Aurora PostgreSQL/RDS PostgreSQL in production | ACID transactions, relational constraints, double-entry accounting model |
| Audit exports/snapshots | S3 | cheap durable archive |
| Analytics aggregates | DynamoDB streams/Lambda or later warehouse | derived data, not source of truth |

Why not only DynamoDB?

- DynamoDB is excellent for event capture, but pool debts, repayments, credits/debits, reversals, and settlement reports are easier and safer in a relational ledger.
- A production-grade money obligation system should avoid ad hoc balance updates. Use append-only ledger entries and derive balances.

Why not QLDB?

- Amazon QLDB is not a good choice now because AWS discontinued it for new customers and directed migration away from it. Do not propose QLDB in finals.

Production ledger model:

```text
accounts
  user_wallet
  pool_receivable
  pool_payable

ledger_entries
  id
  user_id
  pool_id
  entry_type
  debit_account
  credit_account
  amount_paise
  source_event_id
  created_at

settlements
  pool_id
  payer_user_id
  receiver_user_id
  amount_paise
  verification_status
  matched_notification_id
```

Final answer if a judge asks:

> We use DynamoDB for the high-scale raw event ledger because it is append-heavy and retry-safe. For production financial obligations, the next step is Aurora/PostgreSQL with double-entry ledger tables. That gives us relational integrity for pool debts and settlements without losing the serverless ingest benefits.

## 9. Business Model And Amazon Fit

This is important because judges will care about impact and product viability, not only code.

### 9.1 Real Customer

Primary user:

- Android-first college students living on fixed monthly allowance.
- Students in hostels, campuses, or shared apartments.
- Users who spend across small merchants, food, travel, subscriptions, and shared carts.

Secondary customers:

- Colleges wanting student wellbeing/financial literacy support.
- Student affairs offices.
- Campus vendors.
- Payment/commerce platforms.

### 9.2 Why Someone Would Pay

Students may not pay much upfront. The stronger business routes:

- Freemium student app:
  - free passive tracking and runway,
  - premium insights/family planning/export features.
- College B2B:
  - wellness and financial literacy dashboards,
  - anonymized aggregate stress/spend trends,
  - campus affordability insights.
- Commerce/affiliate:
  - campus-safe deals,
  - affordable food/travel recommendations,
  - opt-in merchant discovery.
- Amazon ecosystem fit:
  - Amazon Pay: pre-payment guardrail and budget-aware checkout.
  - Amazon Now/Fresh/quick commerce: shared cart pools and affordability nudges.
  - Bedrock: AI explanation layer.
  - AWS: scalable event ingestion and data processing.

### 9.3 Amazon Fit

Do not force the Amazon story too early in the mentor deck unless asked. For finals, make it stronger.

Strong Amazon angle:

> PocketBuddy could become an affordability and wellbeing layer around Amazon Pay and student commerce. Instead of only helping students after they overspend, it can intervene before checkout, route users to safer choices, and increase trust in digital payments.

Defense if asked "does this reduce Amazon/commerce revenue?":

> It reduces regret-driven churn, failed repayment, and low-trust spending. Students who understand their runway are more likely to stay in the payment ecosystem responsibly. The goal is not to stop commerce; it is to make student commerce sustainable.

## 10. Customer And Amazon Business Lens

This guidance matters because Amazon judges will not only ask "does it work?" They will ask whether the team understands customers, trust, scale, and business impact.

Amazon's first Leadership Principle is Customer Obsession: leaders start with the customer and work backwards, earning and keeping trust. PocketBuddy should be presented exactly that way. Do not start from "we used AI" or "we used AWS." Start from the student who has Rs. 7,000 for a month, spends Rs. 45 here and Rs. 160 there, forgets subscriptions, overpays on travel, joins shared room orders, and only realizes the problem when the month is already broken.

### 10.1 Customer-Backwards Narrative

Customer:

- A student living on a fixed monthly allowance.
- They do not want to log expenses manually.
- They spend through UPI/payment apps, campus food, travel, subscriptions, and shared carts.
- Their actual question is not "what category was this transaction?" It is "can I safely spend today?"

PocketBuddy answer:

- Capture payment signals with minimal manual effort.
- Turn signals into runway.
- Convert runway into decisions:
  - eat at mess or canteen,
  - join or avoid a pool,
  - negotiate travel fare,
  - review subscriptions,
  - ask home for a realistic amount,
  - take a wellness reset during exam pressure.

This is stronger than saying:

- "AI budget assistant."
- "Expense tracker for students."
- "Chatbot for finance."

### 10.2 Why This Can Help Amazon

Do not claim current integrations that are not built. Frame these as credible business directions.

| Amazon Area | Why PocketBuddy Helps | Possible Business Metric |
| --- | --- | --- |
| Amazon Pay | Adds responsible-spend context before and after payment, increasing trust in digital payments | payment retention, repeat usage, lower regret-driven churn |
| Amazon Now/Fresh/quick commerce | Wing pools can aggregate small student orders into coordinated shared carts | cart conversion, basket size, lower abandoned carts |
| Amazon Pay Later / affordability | Runway can warn when a student should avoid debt or split a purchase | healthier repayment behavior, lower risky usage |
| Bedrock | AI nudges run on grounded financial/campus signals, not generic chat | Bedrock usage tied to high-frequency consumer decisions |
| AWS | Event-driven ingest, AI personalization, and analytics are natural AWS workloads | scalable SaaS workload, referenceable student fintech architecture |
| Campus commerce | Opt-in insights can help vendors understand affordability and demand without exposing individual data | vendor partnerships, anonymized aggregate insights |

The core point:

> PocketBuddy does not try to stop students from spending. It helps them spend with confidence. That can increase long-term trust in payment and commerce ecosystems.

### 10.3 What To Say If Asked About Revenue

Short answer:

> Students are price-sensitive, so the first revenue path is not charging every student immediately. The stronger model is freemium plus campus and commerce partnerships: free runway and passive tracking, premium planning features for families/students, college wellness dashboards, and opt-in commerce integrations around shared carts and affordable local recommendations.

Stronger breakdown:

- Student freemium:
  - free passive tracking, runway, basic pools,
  - paid advanced forecasts, family reports, export, multi-account planning.
- College B2B:
  - financial wellness and anonymized wellbeing insights,
  - student support office dashboards,
  - no individual transaction exposure.
- Commerce/payment partnerships:
  - Amazon Pay-aware budget guardrails,
  - shared cart coordination,
  - campus deals that fit a student's runway.
- Vendor insights:
  - anonymized demand/price sensitivity,
  - campus-level food/travel affordability trends.

### 10.4 Metrics That Make The Product Feel Real

Use outcome metrics, not vanity metrics.

Student value metrics:

- manual entries avoided per student per month,
- days of runway preserved,
- shortfall warnings generated before the last week of the month,
- skipped-meal check-ins resolved,
- estimated travel overpay avoided,
- time to settle roommate pool repayments,
- subscriptions detected before renewal.

Business metrics:

- weekly active students,
- companion sync success rate,
- parser review completion rate,
- pool completion rate,
- repayment verification rate,
- cart-pool order value,
- repeat usage after first allowance cycle,
- Bedrock nudge acceptance/action rate.

Trust metrics:

- notification permission opt-in rate,
- unpair/delete usage,
- low-confidence parser rate,
- false positive transaction rate,
- user correction rate,
- privacy screen completion rate.

These metrics show the team has thought beyond the prototype.

### 10.5 How To Avoid A Forced Amazon Slide

Bad framing:

> This makes Amazon money because students will buy more.

Better framing:

> This improves trust and decision quality around student commerce. Students who understand their runway are less likely to abandon digital spending after a bad month. That makes PocketBuddy relevant to Amazon Pay, quick commerce, Bedrock, and AWS without pretending every feature is already integrated.

Best mentor/finals line:

> Our Amazon fit is not "put a logo on the product." It is responsible student commerce: payment trust through Amazon Pay, shared campus carts for quick commerce, Bedrock for grounded nudges, and AWS for event-driven scale.

### 10.6 Research Notes For This Business Lens

Use these only if needed in appendix/Q&A:

- Amazon Leadership Principles emphasize starting with the customer and working backwards to earn trust: `https://www.amazon.jobs/content/en/our-workplace/leadership-principles`
- India's higher education enrollment was reported at about 4.33 crore in AISHE 2021-22, showing the student segment is not niche: `https://www.pib.gov.in/PressReleasePage.aspx?PRID=1999713`
- Amazon Pay Checkout Sessions support buyer checkout sessions and one-time/multiple charges, which makes Amazon Pay a plausible future payment surface, not a current claim: `https://developer.amazon.com/docs/amazon-pay-api-v2/checkout-session.html`
- AWS Well-Architected emphasizes cost optimization and scaling without overspending, matching the product's event-driven ingest and demo-cost discipline: `https://aws.amazon.com/architecture/well-architected/`

### 10.7 Payment-Rail Strategy

Amazon Pay is a strong strategic fit, but PocketBuddy should not be Amazon-Pay-only. Students already use many payment apps and banks. The product promise is "PocketBuddy understands my money life," not "PocketBuddy only works if I switch payment apps."

Correct architecture:

> Payment-rail agnostic capture, Amazon ecosystem depth where it creates extra value.

Capture rails:

| Rail | Why It Matters | PocketBuddy Role |
| --- | --- | --- |
| Android payment notifications | Fastest path to passive capture across UPI apps, wallets, and banks | Primary Android differentiator |
| Bank SMS alerts | Works even when payment app notifications are inconsistent | Backup parser source |
| Account Aggregator | Regulated consent-based bank-data fallback, useful for iOS and trust | Future production fallback |
| Email receipts | Useful for Amazon, food delivery, quick commerce, travel receipts | Optional consent fallback |
| Statement import | Useful for prototype and denied-permission users | Backup only, not privacy hero |
| Manual quick log | Last-resort correction path | Fallback, not core promise |

Payment/action rails:

| Rail | Use Case | Positioning |
| --- | --- | --- |
| UPI Intent | Roommate repayment, opens any UPI app | Primary India-friendly pool payment path |
| UPI QR | Desktop and cross-app repayment | Works across apps, easy to explain |
| Amazon Pay Checkout | Future Amazon commerce integration | Strong Amazon business fit |
| Amazon Now/Fresh/quick commerce | Future shared cart integration | Helps convert campus group demand |
| Generic payment gateway | College subscriptions or B2B billing | Later business tooling |

How to say it:

> We do not lock the student into one payment app. PocketBuddy normalizes spend from whichever rail the student already uses. Amazon Pay becomes powerful as an integrated commerce and affordability layer, but the student value starts before that.

What not to say:

- "We support every payment app perfectly today."
- "Amazon Pay is required."
- "We have a direct Amazon Now API."

Better:

- "The ingestion contract is payment-rail agnostic. Android notifications give us broad UPI coverage today. Account Aggregator and receipt rails extend the model beyond Android. Amazon Pay is the best strategic integration path for responsible checkout and shared commerce."

### 10.8 Cost Model And Unit Economics

The judges may ask whether the architecture scales economically. Represent costs at three levels: current demo cost, production cost drivers, and business metrics.

Current demo cost:

- The visible AWS credit usage came mainly from:
  - EC2 compute,
  - VPC,
  - EC2-Other.
- S3, CloudFront, API Gateway, Lambda, SQS, DynamoDB, and Bedrock were not the major cost drivers in the current small-scale demo.
- Keep EC2 stopped outside mentorship/demo windows.

Production cost drivers:

| Cost Area | What Drives Cost | Cost Control |
| --- | --- | --- |
| Frontend delivery | CloudFront requests and data transfer, S3 storage/requests | static assets, caching, hashed builds |
| Main backend | always-on EC2/App Runner/ECS compute | right-size, autoscale, move bursty work to Lambda |
| Mobile ingest | API Gateway calls, Lambda invocations, SQS requests, DynamoDB writes | event batching, idempotency, small payloads |
| Bedrock | input/output tokens per nudge | deterministic pre-processing, short prompts, only call AI when useful |
| Maps/travel APIs | route calls and place searches | cache campus routes, precompute common routes, rate limits |
| OCR/menu scan | per-image/page processing | make optional, crowd verification first |
| Account Aggregator | consent/fetch/provider fees | use only for consent fallback and periodic refresh, not every screen load |
| Logs | CloudWatch log volume | structured concise logs, retention policy |

Useful AWS pricing anchors:

- Lambda includes a large request free tier and then low per-million request pricing; good for bursty ingest.
- SQS has a monthly free request tier and low per-million request pricing; good for buffering.
- API Gateway charges per API call; HTTP APIs are generally cheaper than REST APIs.
- Nova Lite is a low-cost Bedrock model. The public Nova pricing page lists Amazon Nova Lite at low per-million-token rates, making short nudges affordable if prompts are controlled.
- CloudFront/S3 are appropriate for static frontend delivery because assets can be cached globally.

Do not put exact monthly cost promises in the main pitch unless you have calculated them for the final architecture and region. Use ranges and drivers.

### 10.9 Example Unit-Economics Story

Use this as a Q&A answer, not necessarily as a slide.

Assumption:

- 10,000 monthly active students.
- 30 payment events per student per month.
- 4 AI nudges per student per month.
- Most travel routes are cached campus routes, not live API calls every time.

Monthly workload:

- 300,000 transaction events.
- 40,000 AI nudges.
- Static frontend traffic served through CloudFront.
- Most event ingestion is serverless and usage-based.

Cost perspective:

- Event ingestion should remain low because each transaction is a small API/Lambda/SQS/DynamoDB write path.
- Bedrock cost stays controlled because AI is not called for every dashboard render; deterministic logic computes risk first, then AI writes a short explanation only when there is a useful action.
- Maps/travel and Account Aggregator are the costs to watch because they depend on third-party/API pricing.
- Always-on backend compute is the easiest cost to waste; this is why the long-term plan moves bursty workloads to serverless and keeps the main API right-sized/autoscaled.

Business perspective:

- If a student premium plan is even Rs. 29-49/month, infra and AI costs are not the limiting issue. Trust, retention, and acquisition are.
- If sold through colleges, even a low annual per-student fee can fund infra because the workload is lightweight.
- Amazon/commerce integrations are more valuable as ecosystem engagement and trust layers than as immediate direct subscription revenue.

### 10.10 Business Metrics To Show In PPT/PRD

Use a small number of metrics. Do not overload the slide.

Customer impact:

- Manual entries avoided per student per month.
- Days of runway preserved.
- Travel overpay avoided.
- Roommate repayment time reduced.
- Subscriptions detected before renewal.
- Meal-gap check-ins resolved.

Product health:

- Companion sync success rate.
- Parser confidence rate.
- Needs-review completion rate.
- Pool completion rate.
- Auto-verification rate.
- Repeat use across two allowance cycles.

Business/Amazon fit:

- Payment trust and repeat usage.
- Shared-cart conversion.
- Average pool order value.
- Opt-in campus commerce recommendations clicked.
- Bedrock nudge action rate.
- Cost per active student.

Best slide line:

> We measure success by fewer manual entries, earlier shortfall warnings, faster roommate settlement, and more confident student commerce - not by time spent inside the app.

## 11. Timeline And Action Plan

### 11.1 Today: July 2 Night

Goal: stabilize story and prepare for July 3 mentorship.

Do:

- Keep EC2 stopped unless actively testing.
- Read this guide once end to end.
- Align team on one product thesis:
  - "campus money decision layer",
  - "runway is the spine",
  - "AI explains, deterministic engine decides."
- Prepare a 5-slide mentor presentation:
  1. Problem.
  2. Product loop.
  3. Live demo.
  4. Architecture.
  5. What we need mentor feedback on.
- Do not spend the night rebuilding infrastructure.
- List exact mentor questions from section 12.

If coding:

- Only do low-risk fixes:
  - broken demo path,
  - seed data,
  - copy/messaging,
  - Companion setup,
  - pool UI dialog,
  - visible source/confidence labels if already easy.

Avoid:

- full DB migration,
- new OCR provider,
- changing mobile pairing contract without a complete test,
- overhauling auth,
- touching AWS routing unless broken.

### 11.2 Before July 3 Mentorship

Goal: extract useful advice, not generic feedback.

Prepare:

- One clean demo account.
- One live deployed URL.
- One Android phone with connector installed.
- One fallback screen recording if live sync fails.
- Architecture diagram.
- Short list of gaps and proposed solutions.

Ask mentor:

- Which 1-2 improvements matter most for leadership panel?
- Is AA fallback necessary before finals or acceptable as roadmap?
- Is Android-first acceptable if iOS has consent fallback?
- Is pool auto-verification via incoming credit notification + UPI Intent/QR credible?
- Should travel focus on official/community fare guardrails instead of trying unavailable ride-hailing APIs?
- Would Amazon Pay/Now integration be a strong future fit, or should we avoid that claim unless implemented?
- Does the "runway spine" make the product differentiated enough?
- What would make this look like a real product rather than a hackathon app?

### 11.3 Before July 5 Submission

Goal: submit the strongest story and stable demo/video/PPT.

The July 5 submission can include guided/mock pieces where necessary, but it must look coherent.

Must have:

- Stable deployed web app.
- Demo account with realistic data.
- Dashboard showing runway.
- Companion setup screen.
- Android connector proof or recorded proof.
- History/stats.
- Pool active/completed flow.
- Travel fare guard.
- Food/wellness/Bedrock campus intelligence.
- Architecture diagram.
- 3-4 minute video or PPT with demo.

If a feature is not fully built:

- Show it as a designed/guided prototype.
- Do not include broken live flows.
- Do not expose failed OCR/Textract.
- Do not show AWS errors.

Recommended July 5 submission message:

> PocketBuddy is a working prototype with live passive Android sync, runway tracking, cart pools, travel guardrails, campus food intelligence, and Bedrock-powered nudges. The finals path focuses on hardening parser review, auto-verifying pool repayments, and adding production-grade fallbacks for iOS/permission-denied users.

### 11.4 July 5 To July 15/16 Finals

Goal: turn the strongest pitch into real working product.

Priority order:

1. Parser confidence + needs-review inbox.
2. Pool auto-verification from incoming credit notification.
3. Runway Engine V2:
   - committed/discretionary split,
   - recurring detection,
   - forecast,
   - ask-home amount.
4. Privacy Center:
   - pause sync,
   - data captured explanation,
   - delete/export.
5. Food source/freshness/confidence and meal gap logic.
6. Travel source/freshness/confidence and Mappls/Google route integration.
7. SQS DLQ and CloudWatch alarms.
8. Android APK polish and install trust.
9. Account Aggregator sandbox/prototype.
10. App Runner/ECS backend migration only if app is stable.

Do not prioritize:

- Full iOS app.
- Full social network.
- Full Zomato clone.
- Full bank statement parser if AA/parser review is not done.
- New AI chatbot.
- OCR if AWS access remains blocked.

## 12. Mentor Round Questions

Use these to avoid vague mentor advice.

### Product Positioning

1. "We are positioning PocketBuddy as a campus money decision layer, not an expense tracker. Does that land clearly, or should we narrow the thesis?"
2. "Which feature would make this feel most real to leadership: passive capture, runway forecast, shared pools, or travel/food affordability?"
3. "What would make this look like a product Amazon could care about, not just a student utility?"

### Capture And Privacy

4. "Our Android differentiator uses notification access. For iOS and denied permissions, would Account Aggregator plus email/statement fallback be a credible path?"
5. "What privacy proof would you expect on-screen before trusting a sideloaded payment-notification app?"
6. "Should low-confidence parser review be shown as a core feature or kept behind the scenes?"

### Pooling

7. "For shared carts, we plan host checkout first, then auto-verify roommate repayments from incoming credit notifications. Does this solve the delivery-delay problem?"
8. "Should we use UPI Intent/QR plus auto-verification instead of trying to force direct payment APIs?"
9. "What would make our pool feature clearly different from Splitwise?"

### Runway And AI

10. "We want deterministic forecasting and Bedrock only for explanation. Is that the right balance for credibility?"
11. "Would a shortfall probability and 'ask home for Rs. X' feature make the product meaningfully stronger?"
12. "How much forecast horizon should we show in finals: end of month, quarter, semester, or year?"

### Food And Travel

13. "For travel, should we prioritize official/community fare bands over trying to fetch live ride-hailing prices?"
14. "For food, is budget-aware recommendation with source/freshness enough, or do we need menu scanning before finals?"
15. "Would campus crowd data be seen as a moat or as unreliable?"

### AWS/Architecture

16. "Is our architecture credible if the core backend remains on EC2 for finals, while ingest is serverless?"
17. "Should we move FastAPI to App Runner/ECS before the final, or would DLQ/alarms/observability be a better use of time?"
18. "Would DynamoDB for event ledger plus MongoDB Atlas for product data be acceptable, or should we move all data to AWS?"

### Business

19. "Which business model is strongest: freemium student app, college B2B, Amazon Pay integration, or campus commerce insights?"
20. "What one slide would make leadership believe this can become a real product?"

## 13. Hard Q&A Cheat Sheet

### "Is this just an expense tracker?"

No. Expense trackers ask users to log after spending. PocketBuddy captures payments passively or through consent rails, projects runway, and turns it into actions across food, travel, pools, subscriptions, and wellness.

### "Why not Splitwise?"

Splitwise is a ledger. PocketBuddy pools are for short-window campus commerce. It helps students coordinate an active cart, understand affordability before joining, and verify repayments through payment notifications.

### "Why not Zomato/Swiggy?"

Those optimize food ordering. PocketBuddy optimizes the student's monthly runway and meal routine. It can recommend mess, campus canteen, or outside food depending on budget, meal gap, exam state, and time.

### "Why should anyone trust notification access?"

The app should show exactly what it reads, mask sensitive content, let users pause/delete/export, and review low-confidence events. The long-term path includes regulated consent rails like Account Aggregator.

### "What about iOS?"

iOS does not allow reading other apps' notifications. Android gets the fully passive experience first. iOS uses Account Aggregator, email receipts, statement import, and quick log fallback.

### "What if parser fails?"

Low-confidence events go to review, not silent failure. User corrections improve parser test cases and future coverage.

### "Is Bedrock doing financial decisions?"

No. Deterministic logic computes runway, risk, and category signals. Bedrock Nova Lite generates concise, human-readable guidance and negotiation/wellness language.

### "Will this hurt commerce platforms by reducing spending?"

It reduces regretful spending, not useful spending. Students who trust their runway are more likely to keep using digital commerce responsibly.

### "Why AWS?"

CloudFront/S3 handle global web delivery. API Gateway/Lambda/SQS/DynamoDB decouple mobile event ingestion. Bedrock powers AI language. CloudWatch and DLQs support operational reliability.

### "What is the biggest technical risk?"

Parser coverage and trust. That is why parser review, consent fallbacks, and privacy controls are top priorities before finals.

## 14. Research-Backed Source Decisions

Use these sources when defending the roadmap. Do not overload the presentation with links; keep them for Q&A/appendix.

### Account Aggregator

Why it matters:

- Regulated consent-based financial data sharing.
- Best answer for iOS, permission denial, and trust.

Sources:

- Government AA framework: `https://financialservices.gov.in/account-aggregator-framework`
- Sahamati AA ecosystem: `https://sahamati.org.in/account-aggregators/`
- Setu AA integration docs: `https://docs.setu.co/data/account-aggregator/api-integration`

Decision:

- Use AA as roadmap/sandbox/fallback.
- Do not pretend it is already fully integrated unless built.

### UPI Pool Payments

Why it matters:

- UTR entry is not enough.
- UPI Collect is risky as a future claim due deprecation/restrictions.

Source:

- Cashfree UPI Collect note: `https://www.cashfree.com/docs/payments/manage/payment-methods/upi-collect`

Decision:

- Prefer UPI Intent/QR + Android incoming credit verification.
- Keep UTR as fallback.

### Amazon Pay

Why it matters:

- Strong Amazon ecosystem fit.

Source:

- Amazon Pay Checkout Sessions: `https://developer.amazon.com/docs/amazon-pay-api-v2/checkout-session.html`

Decision:

- Present as future merchant/commerce integration.
- Do not claim current Amazon Pay integration unless built.

### Travel

Why it matters:

- Need credible route/fare data.

Sources:

- Google Routes API: `https://developers.google.com/maps/documentation/routes`
- Mappls Routing API: `https://about.mappls.com/api/routing`
- ONDC mobility specification: `https://github.com/ONDC-Official/mobility-specification`

Decision:

- Use Google/Mappls for route distance/time.
- Use official/community fare bands for price.
- ONDC/Beckn mobility is future network path.

### Food Discovery

Why it matters:

- Need outside campus/nearby food.

Source:

- Google Places Nearby Search: `https://developers.google.com/maps/documentation/places/web-service/nearby-search`

Decision:

- Use Places/Mappls for nearby food/open-now.
- Campus catalog remains core.

### Bedrock Nova Lite

Why it matters:

- AWS-native AI.

Sources:

- Nova Lite model card: `https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-lite.html`
- Bedrock Converse API examples: `https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-runtime_example_bedrock-runtime_Converse_AmazonNovaText_section.html`

Decision:

- Use Bedrock for narration, negotiation scripts, wellness language.
- Keep finance calculations deterministic.

### Email Receipt Sync

Why it matters:

- Possible fallback, but production review is not trivial.

Source:

- Google restricted scopes: `https://support.google.com/cloud/answer/13464325?hl=en`

Decision:

- Use as future fallback with explicit consent.
- Do not promise quick production Gmail integration unless review path is clear.

## 15. What To Build Next

If only one week of focused work remains, build in this order:

1. Parser review inbox.
2. Pool auto-verification.
3. Runway forecast card.
4. Privacy explanation and controls.
5. Travel source/freshness labels.
6. Food source/freshness labels.
7. SQS DLQ and CloudWatch alarms.

Reason:

- These directly answer mentor concerns.
- They improve trust.
- They avoid bloating the app.
- They strengthen the "automated, real product" story.

## 16. What Not To Build

Avoid these unless the basics are stable:

- Full iOS app.
- Full social feed.
- Full chatbot.
- New payment gateway.
- Zomato clone.
- Ride-hailing clone.
- Full DB migration.
- Textract OCR if account access is still blocked.
- Large UI redesign before submission.

## 17. Suggested Final Slide Structure

For mentorship/finals, keep slides minimal.

### Slide 1: Problem

Title:

> Students do not lose control in one transaction. They lose it one small decision at a time.

Bullets:

- Allowance, food, travel, subscriptions, and shared orders are disconnected.
- Manual budgeting fails because students do not log every spend.
- Existing apps solve one slice, not the campus life loop.

### Slide 2: Product Loop

Title:

> PocketBuddy turns payment signals into student decisions.

Flow:

Capture -> Parse -> Runway -> Action -> Learn

Actions:

- eat cheaper,
- join/split pool,
- negotiate travel,
- review subscription,
- check in during exam stress.

### Slide 3: Demo

Show:

- Dashboard runway.
- Android sync.
- Pool.
- Travel.
- Food/wellness.

### Slide 4: Architecture

Show:

- CloudFront/S3.
- EC2/FastAPI.
- API Gateway/Lambda/SQS/DynamoDB ingest.
- MongoDB Atlas.
- Bedrock Nova Lite.
- CloudWatch.

Caption:

> Frontend is globally cached, payment ingestion is event-driven, and AI is separated from deterministic financial logic.

### Slide 5: What We Need Feedback On

Ask:

- Android-first plus AA fallback.
- Pool repayment mechanism.
- Runway forecasting depth.
- Amazon Pay/Now business fit.
- Top priority before July 16.

## 18. Demo Strategy For July 5

Use a clean guided demo.

Show:

1. Landing page.
2. Onboarding.
3. Dashboard runway.
4. Companion setup.
5. Android sync proof.
6. History/stats.
7. Pool host and roommate flow.
8. Travel fare guard + AI script.
9. Food/wellness check-in.
10. AWS architecture.

If live Android sync is risky:

- Use a pre-recorded phone clip.
- Show latest real sync in Companion page.
- Do not use ADB in final video unless absolutely necessary.

If OCR is broken:

- Do not show it.

If EC2 is stopped:

- Start it before recording.
- Verify login, dashboard, travel, companion, pool.
- Stop after recording.

## 19. Operational And Submission Runbook

This section is for the person who has to keep the demo alive without Codex help.

### 19.1 Feature Truth Table

Use this internally. The public PRD/video should frame the product strongly, but the team needs to know what is live, what needs hardening, and what can be guided for July 5.

| Area | Current State | July 5 Treatment | July 15/16 Hardening |
| --- | --- | --- | --- |
| Web app | Live through CloudFront/S3/EC2 when EC2 is running | Show live | Keep stable, only polish |
| Dashboard/runway | Live, but forecasting depth can improve | Show current runway and safe/day | Add committed/discretionary forecast and ask-home branch |
| Android passive sync | Live but sensitive to config/token/routing | Show real sync or pre-recorded proof | Add parser review and privacy center |
| Companion setup | Live; must use fresh config from logged-in account | Show APK/config/pairing clearly | Improve trust copy and status accuracy |
| Transactions/stats | Live | Show history, categories, stats | Add proactive projections |
| Pool | Live host/completed flow; repayment still partly manual | Show active + completed + UTR fallback | Add incoming-credit auto-verification |
| Travel | Live route/fare guard + AI coach | Show quote vs fare band and script | Add source/freshness/confidence labels |
| Food/wellness | Live curated data + Bedrock campus intelligence | Show food gap/exam context/nudge | Add source/freshness and crowd updates |
| OCR/menu scanner | Attempted, blocked by Textract subscription in AWS | Do not show unless fixed | Rebuild with supported OCR or make it optional |
| Serverless ingest | Tested separately | Mention as decoupled ingest path | Add DLQ/alarms and connect cleanly |
| AWS reliability | Working but cost-sensitive | Show architecture only | Add DLQ, alarms, budget policy, optional App Runner/ECS |

### 19.2 Before Any Demo Or Mentorship

1. Start EC2 only when needed.
2. Wait for instance checks to pass.
3. Open the CloudFront URL: `https://d3g6cg7q9hn7hi.cloudfront.net/`.
4. Test login with the demo account.
5. Test these pages:
   - `/dashboard`
   - `/companion`
   - `/pool`
   - `/travel`
   - `/stats`
6. Test an API route in browser:
   - `https://d3g6cg7q9hn7hi.cloudfront.net/api/campus-food`
7. On Android, open the Companion page and copy the latest config for the currently logged-in account. Do not reuse old config from screenshots.
8. Send a small test notification/payment only if you can hide private data.
9. Keep a fallback screen recording ready in case live sync is delayed.

### 19.3 If Frontend Is Stale

Use this only after code is pushed and built.

1. Build locally or on EC2:

```powershell
npm.cmd run build --workspace=frontend
```

2. Upload the contents of `frontend/dist/` to the S3 bucket root:

```text
s3://pocketbuddy-frontend-734705208425-ap-south-1/
```

3. Make sure files are not accidentally uploaded under an extra `dist/` folder.
4. Invalidate CloudFront:

```text
/*
```

5. Hard refresh the browser.

### 19.4 If Backend Is Stale

On EC2, after starting the instance:

```bash
cd /home/ubuntu/PocketBuddy
git pull
cd backend
.venv/bin/pip install -r requirements.txt
sudo systemctl restart pocketbuddy-backend
sudo systemctl status pocketbuddy-backend --no-pager
```

Check logs:

```bash
sudo journalctl -u pocketbuddy-backend --since "10 minutes ago" --no-pager
```

Do not print `.env` during recording.

### 19.5 If Android Sync Does Not Appear

Check in this order:

1. Is EC2 running?
2. Does `/api/campus-food` return JSON from CloudFront?
3. Does Companion page show the same user you are testing?
4. Is Android config freshly copied from `/companion`?
5. Does `POCKETBUDDY_USER_ID` match the logged-in demo account?
6. Does `POCKETBUDDY_WEBHOOK_URL` point to CloudFront `/api/ingest/notification`?
7. Does `POCKETBUDDY_WEBHOOK_TOKEN` match the current pairing token shown by the web app?
8. Is Android notification access enabled?
9. Is the payment notification actually visible on the phone?
10. Check backend logs for invalid pairing code, parser failure, duplicate, or auth error.

Most common cause:

- stale config copied from another user/account.

Second most common cause:

- CloudFront route changed so `/api/ingest/notification` returns the frontend HTML instead of backend JSON.

Correct principle:

- If POST to `/api/ingest/notification` returns HTML, CloudFront routing is wrong.
- If it returns `Invalid pairing code`, config/token/account is wrong.
- If it returns `ok` but does not show, UI refresh or database/user mismatch is likely.

### 19.6 After Demo Or Mentorship

To save credits:

1. Stop EC2. Do not terminate it.
2. Keep S3/CloudFront unless instructed otherwise.
3. Keep API Gateway/Lambda/SQS/DynamoDB unless cleanup is explicitly planned.
4. Check AWS Budgets and Cost Explorer.
5. Main cost sources previously were:
   - EC2 compute,
   - VPC,
   - EC2-Other.

Do not delete resources before final presentation unless there is a tested replacement.

## 20. PRD Guidance

The PRD should not be too honest in a way that weakens the product, but it should not lie.

Strong framing:

- "Working prototype includes..."
- "Finals hardening focuses on..."
- "Roadmap extends this to..."

Avoid:

- "This feature is fake."
- "We could not implement..."
- "This is only static..."

Better:

- "The current prototype uses a curated campus dataset; the production layer adds crowd verification and price freshness."
- "UTR is available as fallback; primary direction is notification-based auto-verification."
- "Android passive capture is live; consent-based fallbacks extend coverage to iOS."

## 21. Final Path Summary

The product should move from:

> passive transaction tracker

to:

> campus affordability and wellbeing operating layer.

The strongest final story:

1. Students do not want to budget manually.
2. PocketBuddy captures real spend signals.
3. It predicts runway.
4. It turns runway into food, travel, pool, subscription, and wellness actions.
5. It uses AWS for scalable ingestion and Bedrock for personalized nudges.
6. It can extend into Amazon Pay and student commerce as a responsible spending layer.

The strongest build path:

1. Fix trust and parser coverage.
2. Make pool repayment auto-verification real.
3. Make runway predictive.
4. Add source/confidence/freshness to food and travel.
5. Harden AWS with DLQ/alarms.
6. Keep product focused.

## 22. Final Reminder For Any Future AI Assistant

Do not suggest random feature expansion.

Do not rebuild the whole stack before deadlines.

Do not claim integrations that are not available.

Do not weaken the pitch by calling everything mock.

Do strengthen:

- capture,
- trust,
- runway,
- pool verification,
- forecast,
- source confidence,
- Amazon fit,
- AWS reliability.

If time is limited, improve the story and the demo path first. Then build the highest-risk mechanisms: parser review, pool auto-verification, and runway forecasting.
