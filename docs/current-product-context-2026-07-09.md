# PocketBuddy Current Product Context - 2026-07-09

Purpose: this is the latest internal handoff for Nishant, teammates, Codex, Claude, Gemini, or any other AI assistant working on PocketBuddy during the HackOn with Amazon 6.0 finals period.

Read this before making product, code, demo, PPT, PRD, AWS, or deployment decisions. This file is not marketing copy. It is the working truth of where the product stands after the July 8-9 hardening sprint.

## Non-Negotiable Rules

1. Do not reduce PocketBuddy to a finance tracker. The original problem statement is broader: student financial and wellness support.
2. Do not overclaim live integrations. Amazon Pay and Account Aggregator flows are sandbox or simulated unless explicitly connected to real credentials and provider dashboards.
3. Do not push code without Nishant's permission.
4. Do not make broad UI rewrites unless asked. UI polish may be handled separately through Antigravity.
5. Do not leak secrets, `.env` values, Mongo URI, JWT secret, AWS keys, phone numbers, UPI IDs, or raw bank notifications.
6. Do not assume AWS is running. EC2 is often stopped to save credits.
7. Do not assume the local `main` branch is current. As of this file, `origin/main` is ahead of local `main`.

## Repo And Branch Reality

Main working path:

```text
C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy
```

At the time this context file was written, this checkout was on:

```text
feature/android-v2-sync-hardening
```

Latest remote main after fetch:

```text
a81c5fb Merge pull request #37 from nishantharkut/feature/pooling-product-hardening
```

Important: local `main` in this checkout was still at:

```text
e2debc7 Merge pull request #25 from nishantharkut/feature/food-guard
```

So before starting new work from main, run:

```powershell
cd "C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy"
git checkout main
git pull origin main
```

Do this only when you are sure you do not need the current feature branch checkout.

## Original Problem Statement

PocketBuddy - AI Financial & Wellness Assistant for Students

Many students struggle silently with budgeting, food expenses, emotional stress, irregular sleep, and balancing academics with social life. Existing apps focus on only one aspect: finance, fitness, or productivity, without understanding the realities of student living. What if students had an AI companion that could help manage monthly expenses, recommend affordable food and travel options, detect burnout patterns, encourage healthy routines, and provide personalized support for both financial and emotional well-being throughout college life?

## Correct Product Positioning

PocketBuddy is a student-life assistant that turns permitted payment signals and campus context into practical daily decisions across:

- allowance runway,
- food and meal regularity,
- shared room and wing purchases,
- travel fare safety,
- recurring commitments,
- passive Android sync,
- privacy and consent,
- wellness signals around exams, late-night activity, and meal gaps.

The core product thesis:

> Students do not fail at budgeting because they cannot read charts. They fail because small daily decisions compound quietly, and manual logging does not survive real college life.

The product should be framed as automation-first, not spreadsheet-first.

## Finals Context

PocketBuddy is a HackOn with Amazon 6.0 finalist project.

Known final-round constraints:

- PPT submission deadline was moved to July 10, 2026.
- Final presentation slot is 10 minutes.
- Q&A is 5 minutes.
- Laptops may not be connected live in finals, so the demo video must be embedded inside the PPT.
- The pitch should use the 10 minutes carefully:
  - 3 minutes: idea, customer pain, expected impact,
  - 5 minutes: working prototype/demo video,
  - 2 minutes: architecture and future vision.
- Judges may include senior Amazon/AWS/product leaders, so architecture, business fit, customer obsession, privacy, cost, and scale questions matter.

The presentation must not feel like a generic AI pitch. It should be visual, concise, product-led, and memorable.

## Current Deployment Architecture

Current deployed/hackathon architecture:

- Frontend: React/Vite hosted on S3 and served through CloudFront.
- Backend: FastAPI on EC2 behind Nginx.
- Database: MongoDB Atlas.
- AI: Amazon Bedrock Nova Lite.
- Android connector: Kotlin app using Android notification access.
- Serverless ingest path: API Gateway, Lambda ingest, SQS, Lambda processor, DynamoDB ledger.
- Observability: CloudWatch logs/metrics.

Live/demo URLs used earlier:

```text
Web app: https://d3g6cg7q9hn7hi.cloudfront.net/
APK: https://d3g6cg7q9hn7hi.cloudfront.net/downloads/PocketBuddy-Connector-v0.1.0.apk
```

AWS cost note:

- EC2 compute, VPC, and EC2-Other were the main credit consumers.
- EC2 was stopped to save credits.
- Start EC2 only for demo, test, mentoring, or final recording.
- After demo, stop EC2 again unless active testing is needed.
- Do not delete resources without a replacement plan.

## Important Architecture Positioning

Do not say there are "too many databases" defensively. The current split is intentional for the prototype:

- MongoDB Atlas: product state, user profiles, pools, food data, travel reports, subscriptions.
- DynamoDB: immutable/mobile ingest ledger and idempotent event processing.
- S3/CloudFront: static frontend and APK distribution.
- Bedrock Nova Lite: grounded text generation for coaching and campus intelligence.

If asked why not one DB:

> The product DB and the ingest ledger have different access patterns. MongoDB is useful for flexible product state and iteration. DynamoDB is better for high-throughput, idempotent event ingestion where phone notifications should not block on the web app. In production, we can consolidate or move parts to AWS-native services, but this split keeps the demo resilient and explains the scaling path.

Production-grade evolution:

- Move backend from EC2 to App Runner/ECS/Fargate or Lambda-based APIs depending on steady traffic.
- Add WAF in front of CloudFront.
- Use Secrets Manager instead of raw `.env`.
- Add DLQ and replay tooling for all ingest paths.
- Use managed or self-hosted routing/geocoding instead of public OSRM/Nominatim demo servers.
- Consider DocumentDB/DynamoDB/OpenSearch based on final data model, not for buzzword reasons.

## What Has Been Strengthened Recently

### 1. Food Guard

Relevant merged work:

```text
e2debc7 Merge pull request #25 from nishantharkut/feature/food-guard
b16482f feat: strengthen food freshness signals
9b71448 feat: strengthen campus food signals
```

Current direction:

- Food feature is trust-first, not "AI menu magic".
- Curated campus food data exists.
- Crowdsourced menu verification was strengthened.
- Static "3 confirmations" style thinking was challenged. The trust model should consider campus scale, confidence, reviewer independence, conflict, freshness, and recommendation eligibility.
- Menu/photo OCR should not rely on Textract because of cost/subscription constraints. Alternate OCR/service path can be used later.
- Scanned or community-submitted items should stay in review until independently trusted.
- Disputed items should be hidden from recommendations and sent back for review.
- Food intelligence should connect to transactions, not exist as a disconnected catalog.

Product logic to preserve:

- Repeated small food payments to the same vendor can become a food habit signal.
- Meal gaps matter: if no food transaction is seen for 16-17 hours, PocketBuddy can ask whether the student ate at mess or skipped a meal.
- During exam windows, food and wellness nudges become more relevant.

Remaining strengthening ideas:

- Manual add/edit/delete for menu items where appropriate.
- Connect food vendor payments to campus vendor profiles.
- Lightweight "Was this menu still accurate?" prompt instead of irritating quiz flows.
- Food confidence should be a trust score, not a hardcoded small vote count.

### 2. Travel Guard

Relevant merged work:

```text
412df79 Merge pull request #31 from nishantharkut/feature/travel-campus-planner
d106843 feat: strengthen travel fare guard
a523fe7 feat: strengthen travel fare guard trust
```

Current direction:

- Route planning works and estimates are close enough for demo.
- OSRM route estimation and caching were improved.
- Quote check needed clearer route context and less noisy UI.
- Timing context matters: morning/evening/night fare planning should be possible.
- Crowdsourced travel reports should follow similar trust principles as food:
  - independent reports,
  - freshness,
  - route specificity,
  - confidence,
  - stale report warnings,
  - no blind hardcoded thresholds.

Important limitation:

- Public OSRM/Nominatim endpoints are not production-grade for commercial/heavy usage.
- For finals, say demo uses open routing where available and production would use self-hosted OSRM/Nominatim on AWS or a commercial provider such as Mappls/Google Routes.

Bedrock/Nova Lite:

- Travel AI coach must be grounded in deterministic fare calculations.
- It must not invent rupee values outside computed ranges.
- Prompt should say: use only provided fare range, median, report count, route, timing, and safety context.

### 3. Android Connector

Relevant merged work:

```text
77758f5 Merge pull request #35 from nishantharkut/feature/android-v2-sync-hardening
d19e638 feat: harden android connector sync flow
```

Current direction:

- Android app is central to passive capture.
- It should be transparent and trust-building, not hidden or scary.
- One-tap auto-config was tested and should remain smooth.
- Android flow includes notification access, sync status, config/reset, and transparency.
- The web onboarding includes Android Auto-Sync as the primary path.

Trust positioning:

- Android notification access is sensitive.
- Truecaller became widely adopted despite high privacy sensitivity because it offered immediate utility, caller ID/spam protection, network effects, visible control, and consumer habit formation.
- PocketBuddy should borrow the trust pattern, not the privacy problem:
  - clear value first,
  - visible controls,
  - explain exactly what is read,
  - mask raw notification text,
  - allow review/delete,
  - no hidden background claims,
  - no raw SMS exposure in UI.

Android limitations:

- iOS cannot support passive notification reading the same way.
- iOS should use consent sandbox/manual/AA-style path and optional manual import, not pretend to have Android-equivalent capture.

### 4. Privacy And Consent Layer

Relevant merged work:

```text
1f698c5 Merge pull request #29 from nishantharkut/privacy-trust-layer
3eef8eb fix: tighten privacy trust flow
fc53376 merge: integrate onboarding UI improvements and sandbox demo flows from pr-29-privacy-trust
```

Current direction:

- Account Aggregator / Consent Sandbox is a demo/sandbox flow, not a live bank AA integration.
- Real AA is hard to implement for a prototype because it requires regulated ecosystem access, FIU/FIP/TSP onboarding, consent artifacts, sandbox constraints, and partner integrations.
- In UI and pitch, call it "Consent Sandbox" or "AA-style consent control flow".
- It should explain:
  - identifier,
  - institution,
  - masked accounts,
  - consent scope,
  - fetch,
  - revoke.
- It should not suggest real live bank data is being pulled unless that is genuinely true.

Onboarding direction:

- Present two clear paths:
  - Android Auto-Sync: recommended for the live Android product.
  - Consent Sandbox: demo of privacy-safe consent model, useful for iOS/future regulated integrations.

### 5. Transactions Consolidation

Relevant work:

```text
f1b15f5 fix: consolidate history and stats into transactions
```

Product decision:

- History and Stats should not feel like two separate unrelated modules.
- The better label is "Transactions", not "Ledger".
- Sidebar and mobile tabs should avoid duplicate "History" and "Stats" once consolidated.
- The transaction page should show both event list and analytics in one workflow.

### 6. Recurring Commitments

Relevant merged work:

```text
0bb2b00 Merge pull request #36 from nishantharkut/feature/recurring-commitments
c2b9799 fix: harden recurring commitment detection
dde93e6 feat: implement Recurring Commitments Engine with lifecycle, confidences, cadences, and runway alerts
ddb99fe seed: align seeded subscriptions and transactions with new Recurring Commitments lifecycle states
```

Current direction:

- Subscription detection should not be only a static known-app list.
- Stronger model:
  - recurring merchant detection,
  - cadence confidence,
  - expected next charge,
  - lifecycle states,
  - linked transactions,
  - runway collision warnings.
- Avoid claiming perfect automatic cancellation or direct merchant control.
- It should help the student see commitments before they collide with allowance runway.

### 7. Runway

Relevant open PR:

```text
PR #34: https://github.com/nishantharkut/PocketBuddy/pull/34
Title: Runway
Head branch: runway
Local worktree: C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy-pr34-runway-review
Local worktree branch: pr-34-review
```

Important current status as of July 9:

- PR #34 is open, not merged.
- GitHub reports `mergeStateStatus: DIRTY`, so it is not cleanly mergeable right now.
- The local worktree `PocketBuddy-pr34-runway-review` is one commit behind `origin/runway`.
- Missing from the local worktree:

```text
d2ae4e1 Refine runway meal check experience
```

- `origin/runway` is also behind the newest `origin/main`, because `origin/main` already includes PR #37 pooling hardening.
- Do not merge PR #34 as-is without syncing it with `origin/main`, or it may conflict with or appear to remove recent pooling hardening files.

Important PR #34 commits include:

```text
1022806 Improve runway simulator and typography consistency
8d7e96d feat(runway): overhaul runway UI with simplified layouts, dropdown actions, and sleek alert notification bar
5719e07 design(runway): polish calculator layout for high-end mobile responsiveness and presentation
330f056 feat(ui): professional student allocation planner on dashboard with color-coded coverage feedback
aebc0f4 fix(runway): mobile hero layout
b34d103 merge: sync runway with main and harden forecast
bfbb10f fix: align runway scenario contract
9f7da5f fix: use runway engine values in commitment warning
36daf4a fix: preserve traffic provider precedence
d2ae4e1 Refine runway meal check experience
```

PR #34 scope from GitHub:

- Adds a stronger Runway Forecasting V2 engine.
- Adds `drivers[]` to explain top factors affecting runway.
- Adds context-aware next-best action selection.
- Adds setup-required state when no funding source exists.
- Exposes pace source and stress band.
- Adds dynamic decision-engine summary.
- Touches `backend/app/services/runway.py`, `backend/tests/test_runway_forecast.py`, dashboard, onboarding, settings, and runway UI.

Product direction:

- Runway should answer: "Can I safely continue this month?"
- It should not become a generic financial calculator.
- Strong runway logic must connect to real student levers:
  - food pace,
  - recurring commitments,
  - pool dues,
  - exam buffer,
  - high-spend days,
  - travel caution,
  - allowance setup state.
- Judge-facing value is explainability: students should see why the runway is risky and what action changes it.

Before merging PR #34:

1. Update the local PR worktree to `origin/runway`.
2. Merge or rebase latest `origin/main` into the PR branch.
3. Resolve conflicts carefully, especially files touched by pooling hardening, travel, recurring commitments, and transactions consolidation.
4. Run backend runway tests.
5. Run full frontend typecheck/build.
6. Do a product pass on the runway UI so it does not look like a bloated calculator.

### 8. Pooling And Shared Cart

Relevant merged work:

```text
a81c5fb Merge pull request #37 from nishantharkut/feature/pooling-product-hardening
69447e0 fix: harden pool settlement boundaries
a00808b fix: protect settled pool payments
959e028 Harden pooling product readiness
98eee3e Polish pooling item management
4542cfb Harden pooling settlement flows
```

Current direction:

- Pooling is one of the strongest differentiators because it maps to real hostel/wing behavior.
- It supports shared cart planning, host checkout, split calculation, UTR fallback, passive host-credit verification, nudges, reliability, and settlement states.
- Host Android connector should be visible before checkout because passive auto-verification depends on host receiving payment notifications.

Recent hardening done:

- Public pool links no longer expose private settlement data.
- Public item responses hide internal user IDs and update ownership metadata.
- Shared-link signup no longer auto-adds outsider to the host wing.
- Manual UTR submission requires login and is locked to the logged-in user's own split.
- Frontend no longer lets roommate choose another participant for UTR submission.
- Amazon Pay sandbox settlement is also locked to the logged-in user's own split.
- Ambiguous sender + amount auto-verification goes to review instead of auto-verifying first match.
- Contact/nudge lookup resolves through pool participant ownership, not global name search.

Known remaining limitation:

- Full participant identity is not migrated everywhere to stable IDs. Some reliability/display logic still groups by names for backward compatibility.
- Manual UTR remains a trust fallback. Production-grade settlement needs provider/bank reconciliation.
- Public links still show cart participant names and items because that is core to shared pooling. Private contact/payment/UTR details are hidden.

### 9. Amazon Pay Sandbox

Do not overclaim.

Correct internal truth:

- Amazon Pay V2 is modeled as a local/simulated sandbox gateway following the documented contract/state-machine style.
- It is not currently hitting live Amazon Pay developer endpoints with real merchant credentials.

Safe wording:

> We modeled the Amazon Pay V2-style checkout and charge-permission lifecycle in a local sandbox to show how roommate settlement could work through authorized payment rails. PocketBuddy never needs to custody funds; production settlement would happen through a licensed payment provider's rails.

Avoid saying:

- "Live Amazon Pay integration"
- "Real pre-authorized roommate auto-charge"
- "PocketBuddy escrow"

Regulatory note:

- Do not say PocketBuddy custodies money or settles through its own merchant account. That walks into Payment Aggregator concerns.
- Better framing: PocketBuddy initiates and reconciles through authorized payment rails; it does not hold funds.

## What Still Needs Care Before Finals

### Feature Hardening

1. Runway feature is being handled by teammate separately.
2. Android flow should be re-tested on physical device after every APK build.
3. Pooling should be tested with:
   - host account,
   - roommate account,
   - public shared link,
   - open pool,
   - completed pool,
   - UTR fallback,
   - sandbox settlement,
   - host Android not paired,
   - host Android paired.
4. Food should be tested for:
   - recommendation display,
   - confidence/review states,
   - manual item management if available,
   - transaction-to-food signal.
5. Travel should be tested for:
   - plan campus ride,
   - quote check,
   - timing selection,
   - cache behavior,
   - trust/staleness signals,
   - Bedrock coach grounding.
6. Recurring commitments should be tested with seeded realistic data.
7. Transactions page should be checked on desktop and mobile after History/Stats consolidation.

### UI Risks

- Pooling has powerful logic but can become visually dense.
- Travel UI can become noisy if route, quote, timing, reports, and AI coach all compete on the same screen.
- Onboarding and privacy screens must not overflow or look like a compliance dump.
- Android screen should avoid too much text on one screen. Use clear secondary screens for transparency/details.
- Any mock/sandbox flow must be visually clear and not look broken.

### Demo Risks

- Do not show AWS secrets or `.env`.
- Do not show raw UPI IDs or personal phone numbers.
- Do not rely on live bank/payment apps during final video unless already rehearsed.
- If EC2 is stopped, the live URL will not work for API pages.
- CloudFront may cache stale frontend assets after S3 upload unless invalidated.
- APK sideload can trigger Play Protect. For final demo, install and configure beforehand.

## Mentor Feedback Themes To Preserve

1. Customer pain must be real and specific.
2. Do not pitch a generic finance tracker.
3. Novelty should appear through product flow, not a forced novelty slide.
4. Show what makes PocketBuddy different from Walnut/Fi/Truecaller-like SMS parsing/expense apps:
   - student context,
   - hostel/wing pools,
   - food and meal rhythm,
   - travel fare guard,
   - runway and recurring commitments,
   - wellness signals,
   - automation-first setup.
5. Amazon/business fit matters:
   - Amazon Pay style settlement path,
   - Amazon campus/student ecosystem,
   - Bedrock-powered coaching,
   - AWS scalable ingest architecture,
   - potential for student commerce, Prime Student, Pay Later, campus offers, and partner programs.
6. Pitch and visuals must be minimal and attention-holding.
7. Architecture should be explained in short points, not long paragraphs.
8. Judges will value clarity, impact, business thinking, and a working demo as much as technical depth.

## PPT Direction

Use 6-7 slides maximum.

Suggested flow:

1. Title with one-line thesis.
2. Problem as student pain, not generic budgeting.
3. Product map: what PocketBuddy watches and what actions it creates.
4. Embedded 5-minute demo video.
5. Architecture.
6. Business/Amazon fit and impact.
7. Future vision or final close.

Do not waste a slide on a generic novelty table unless it is extremely sharp. Mentor said novelty should be visible in demo/product flow.

Potential memorable framing:

> PocketBuddy is not another expense tracker. It is the layer between student life signals and better daily decisions.

## Demo Video Direction

Show the student day:

1. Student has allowance and campus setup.
2. Android connector captures a supported payment.
3. Dashboard/runway changes.
4. Food/meal signal or campus recommendation appears.
5. Shared cart pool flow shows host and roommate sides.
6. Travel fare guard checks a quote and gives safer guidance.
7. Recurring commitment or runway collision appears.
8. Privacy/consent controls show trust.
9. Architecture shown briefly.

Do not turn demo into a feature checklist. Make it a story of one student trying to survive a month on campus.

## Questions Judges May Ask

### Privacy

Q: Why should students trust notification access?

A: The Android connector is transparent, configurable, and scoped to supported payment/SMS alerts. Raw text is masked before telemetry where possible, users can review/correct/delete, and the roadmap is toward consented rails for non-Android paths.

### iOS

Q: What about iPhone users?

A: iOS does not allow the same passive notification listener model. For iOS, PocketBuddy uses consent/manual/sandbox flows and future regulated AA-style integrations instead of pretending iOS can do Android-style capture.

### Amazon Pay

Q: Is Amazon Pay live?

A: The current demo models the Amazon Pay V2-style lifecycle in a local sandbox. Production would use authorized payment rails and PocketBuddy would not custody funds.

### Account Aggregator

Q: Is AA live?

A: It is a consent sandbox in the prototype to show the flow and user control. Real AA requires regulated partner onboarding and cannot be casually enabled in a hackathon prototype.

### Crowdsourcing

Q: Why should food/travel crowdsourced data be trusted?

A: Recommendations are gated by confidence, freshness, independent confirmations, and dispute state. Unknown or disputed data stays in review instead of being shown as truth.

### Scale

Q: Does this architecture scale?

A: Phone ingest is separated from the web backend using API Gateway, Lambda, SQS, and DynamoDB. Static frontend is CDN-backed. Product APIs can move from EC2 to App Runner/ECS/Fargate. Routing/geocoding can move to self-hosted or commercial providers.

## Commands To Sync After Merges

If starting fresh from current main:

```powershell
cd "C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy"
git checkout main
git pull origin main
git status
```

If working on a feature branch:

```powershell
git fetch origin
git merge origin/main
```

or rebase only if the team agrees:

```powershell
git rebase origin/main
```

## Verification Commands

Backend targeted tests:

```powershell
cd "C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy\backend"
..\.venv\Scripts\python.exe -m pytest tests/test_pooling_hardening.py -q
```

Frontend typecheck:

```powershell
cd "C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy"
npm.cmd run check --workspace=frontend
```

Frontend production build:

```powershell
npm.cmd run build --workspace=frontend
```

Diff hygiene:

```powershell
git diff --check
git status -sb
```

## Latest Important Remote Main Commits

As of the fetch before this file was created:

```text
a81c5fb Merge pull request #37 from nishantharkut/feature/pooling-product-hardening
69447e0 fix: harden pool settlement boundaries
a00808b fix: protect settled pool payments
0bb2b00 Merge pull request #36 from nishantharkut/feature/recurring-commitments
c2b9799 fix: harden recurring commitment detection
77758f5 Merge pull request #35 from nishantharkut/feature/android-v2-sync-hardening
d19e638 feat: harden android connector sync flow
dde93e6 feat: implement Recurring Commitments Engine with lifecycle, confidences, cadences, and runway alerts
e2debc7 Merge pull request #25 from nishantharkut/feature/food-guard
412df79 Merge pull request #31 from nishantharkut/feature/travel-campus-planner
```

## Final Working Truth

PocketBuddy is strongest when presented as a student-life decision product, not an accounting app.

The best story is:

> PocketBuddy watches the daily campus signals students already create, then turns them into decisions before money, food, travel, or stress becomes a crisis.

Everything built or proposed should support that story. If a feature does not help the student make a better daily decision, it is likely bloat.
