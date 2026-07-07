# PocketBuddy Current AI Context - 2026-07-08

Purpose: this is the latest internal handoff for any AI assistant, teammate, or future Codex session helping with PocketBuddy. Read this before making product, code, demo, PRD, or PPT decisions.

This is not marketing copy. It is the working truth of the project: what PocketBuddy is, what has been built, what is simulated, what must not be overclaimed, and what matters for the HackOn with Amazon 6.0 finals.

## First Rules For Any Future AI

1. Do not reduce PocketBuddy to a finance tracker or transaction ledger. The original problem statement is broader: student financial and wellness support.
2. Do not invent claims. If something is simulated, say internally that it is simulated and frame it carefully externally.
3. Do not push changes without Nishant's permission.
4. Do not make broad UI rewrites unless explicitly asked. Nishant often uses Antigravity for final UI polish.
5. Do not leak or write secrets into docs, screenshots, commits, or prompts.
6. Do not assume EC2 is running. It is often stopped to preserve AWS credits.
7. Do not assume one PocketBuddy folder. The main active repo for this snapshot is:

```text
C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy
```

## Original Problem Statement

PocketBuddy - AI Financial & Wellness Assistant for Students

Many students struggle silently with budgeting, food expenses, emotional stress, irregular sleep, and balancing academics with social life. Existing apps focus on only one aspect: finance, fitness, or productivity, without understanding the realities of student living. What if students had an AI companion that could help manage monthly expenses, recommend affordable food and travel options, detect burnout patterns, encourage healthy routines, and provide personalized support for both financial and emotional well-being throughout college life?

## Correct Product Positioning

PocketBuddy is a student-life assistant that turns permitted payment signals and campus context into practical decisions across money, food, travel, shared purchases, subscriptions, and wellness.

The core insight:

> Students do not fail at budgeting because they cannot read charts. They fail because small daily campus decisions compound quietly, and manual expense logging does not survive real college life.

PocketBuddy's answer is automation-first:

1. Capture supported payment signals passively or through consented/sandboxed flows.
2. Normalize them into trusted transaction context.
3. Combine them with campus, hostel, mess, exam, travel, and roommate context.
4. Convert that context into actions before the month goes wrong.

## Current Repo State At This Snapshot

Branch:

```text
feature/consolidate-ledger
```

Latest commit:

```text
f1b15f5 fix: consolidate history and stats into transactions
```

Recent history:

```text
f1b15f5 fix: consolidate history and stats into transactions
1f698c5 Merge pull request #29 from nishantharkut/privacy-trust-layer
3eef8eb fix: tighten privacy trust flow
113f1f8 chore: keep android connector changes separate from privacy PR
85daac5 Merge pull request #30 from nishantharkut/fix/food-guard-trust-backend
01d75ac docs(food-guard): clean trust context formatting
21948b5 fix(food-guard): align dashboard review UI with trust model
352f1e3 fix(food-guard): harden campus menu trust model
498690a feat(food-guard): add trust-first OCR review backend
4242cf3 feat(privacy): support multi-account bank consent
```

Current branch status before this doc was created:

```text
## feature/consolidate-ledger...origin/feature/consolidate-ledger
```

After this file is added, the working tree will have this doc as an uncommitted change unless Nishant commits it.

## Finals Situation

HackOn with Amazon 6.0 finals are the current priority.

Submission requirements shared by the organizers:

1. Submit a PPT, preferred, or a demo video.
2. Demo video must be embedded in the PPT for finals because laptops will not be connected live.
3. Finals presentation flow:
   - 3 minutes: idea, customer pain point, expected impact.
   - 5 minutes: working prototype demo video.
   - 2 minutes: technical architecture and future vision.
   - 5 minutes: Q&A.
4. The team can continue coding after the submission deadline and polish before finals.
5. PPT and video must show the strongest coherent product, not a timid status report. Still, avoid claims that would collapse under Amazon/AWS/payments scrutiny.

## Current Architecture

Hackathon architecture:

1. Frontend: React/Vite app served from S3 through CloudFront.
2. APK distribution: Android connector APK hosted in S3 and served through CloudFront.
3. Product backend: FastAPI behind Nginx on EC2.
4. Product database: MongoDB Atlas.
5. Serverless ingest path: API Gateway, Lambda ingest, SQS, processor Lambda, DynamoDB ledger.
6. AI: Amazon Bedrock Nova Lite for grounded text generation where enabled.
7. Observability: CloudWatch logs and metrics.

Important deployment details:

1. EC2 has been stopped at times to save credits. Start it before any demo.
2. Cost previously came mostly from EC2 Compute, VPC, and EC2 Other.
3. CloudFront behavior was simplified so `/api/*` routes to the EC2 API origin with caching disabled and all methods allowed.
4. Serverless ingest exists conceptually and in AWS, but practical Android compatibility may route through the EC2-backed API path depending on current CloudFront/API setup.

Production architecture direction:

1. Keep static frontend and APK on S3 plus CloudFront.
2. Put AWS WAF in front of CloudFront for basic protection.
3. Move FastAPI from raw EC2 toward App Runner or ECS Fargate for managed deployment.
4. Keep serverless ingest decoupled through API Gateway, Lambda, SQS, DLQ, and idempotent storage.
5. Move secrets to AWS Secrets Manager or SSM Parameter Store.
6. Consider AWS-native DB consolidation only if it makes product and ops sense:
   - DynamoDB for immutable ingest/event ledger.
   - DocumentDB or MongoDB Atlas for product/profile/pool/catalog data.
   - Do not migrate blindly just to look AWS-native.

## Core Feature State

### 1. Android Companion And Passive Capture

Built:

1. Native Kotlin Android connector under `android/connector`.
2. Notification listener reads supported payment/SMS/UPI notifications after user permission.
3. One-tap config through `pocketbuddy://configure`.
4. Companion page shows setup, APK download, sync state, recent activity, and trust details.
5. Device identity and pairing are handled by backend/profile state.

Critical constraints:

1. Passive notification capture is Android-only. iOS cannot read other apps' notifications in the same way.
2. Sideloading can trigger Google Play Protect warnings. This is an adoption/trust issue, not just a technical issue.
3. Pairing token is currently long-lived/static. Production should use one-time pairing plus device-bound HMAC signing stored in Android Keystore.

Correct framing:

> Android sync is the live zero-entry path. Consent sandbox/manual paths exist for iOS, unsupported banks, and privacy-sensitive users.

Do not frame Android notification capture alone as novel. Some existing apps read SMS/notifications. PocketBuddy's novelty is what happens after capture: campus context, runway, wellness, food, travel, pools, and review trust.

### 2. Transactions

Recently consolidated:

1. History and Stats were merged into one user-facing `Transactions` section.
2. Desktop sidebar now has one `Transactions` entry.
3. Mobile bottom navigation now has one `Transactions` tab.
4. `/stats` redirects to `/transactions?view=analytics`.
5. `/transactions` defaults to the list view.
6. The page has an internal `Transactions / Analytics` switcher.
7. User-facing "Ledger" language was renamed to "Transactions".

Why this matters:

1. The product should feel like a coherent student assistant, not a collection of finance screens.
2. Combining history and analytics reduces navigation noise before finals.

Verification already run on this branch:

```powershell
npm.cmd run check --workspace=frontend
npm.cmd run build --workspace=frontend
git diff --cached --check
```

### 3. Parser, Trust Path, And Review

Built:

1. Transactions are normalized from mobile/webhook/manual sources.
2. Parser confidence and status can mark entries for review.
3. Raw notification text should not be exposed as the primary artifact.
4. Manual corrections are stored as masked parser feedback.
5. Low-confidence or incomplete records flow into review paths.

Main risk:

> Parser coverage is the biggest technical risk for the zero-entry promise. Banks and UPI apps format notifications differently and change formats over time.

Correct judge-facing answer:

> The current parser handles supported formats and flags uncertain records for review. The production roadmap is a feedback loop where low-confidence notifications become masked parser training examples, not silent failures.

### 4. Runway Forecasting

Built:

1. Runway forecast based on balance, allowance cycle, daily pace, fixed commitments, subscriptions, mess/food assumptions, active pool dues, and exam context.
2. V2 logic includes weekday-adjusted EWMA, 56-day lookback, and shortfall probability.
3. UI includes Runway and forecast cards plus simulator-style controls.

Known limitation:

1. Parametric normal CDF can understate student spending spikes.
2. V2 should use empirical bootstrap or Monte Carlo sampling of real historical spikes.

Correct framing:

> Current runway is directionally strong and lightweight. The natural production upgrade is empirical simulation so train tickets, exam fees, and one-off spikes are modeled from actual student behavior instead of a thin-tailed distribution.

### 5. Food Guard

Merged through PR #30 / food guard trust backend.

Built:

1. Campus food data and recommendations.
2. Trust-first menu candidate pipeline.
3. Community verification/review model for scanned or submitted menu items.
4. Disputed or review-only items are hidden from recommendations.
5. Dashboard UI aligns with the trust model.
6. Food gap and meal context connect to wellness.

Important correction already made:

1. Do not use a naive fixed `Confirmed: 1/3` model for all campuses.
2. Verification thresholds should scale with campus size, source trust, conflict rate, and independent confirmations.
3. The model should feel like Reddit/community trust, not a magic hardcoded number.

OCR reality:

1. Textract caused cost/access concerns and should not be central unless verified.
2. OCR/menu scanning should be treated as an onboarding accelerator for campus catalog data, not the whole food intelligence.
3. If OCR is not reliable, demo the trust/review workflow and curated/reviewed recommendations.

Correct framing:

> Food Guard is not just a static list. It is a campus menu trust system: students can contribute items, the system holds them in review until enough independent trust exists, and only trusted food options influence recommendations.

### 6. Shared Pools

Built:

1. Wing/cart pools for roommates and shared purchases.
2. Active, completed, cancelled states.
3. Item adding, split calculation, and payment/UTR state.
4. Host and roommate flows.
5. Incoming credit notifications can support passive repayment verification when the host has Android sync.

Amazon Pay reality:

1. Current Amazon Pay-style flow is simulated against the documented API/state-machine idea.
2. It is not live Amazon Pay sandbox/production unless future code explicitly integrates real credentials and Amazon endpoints.

Safe wording:

> The prototype uses an Amazon Pay-style simulated checkout gateway modeled on the documented V2 contract.

Unsafe wording:

> Integrated with Amazon Pay V2.

Payments regulatory caution:

1. Do not claim PocketBuddy custodies funds.
2. Do not describe PocketBuddy as a merchant-mediated escrow unless legal/payment aggregator implications are handled.
3. Production framing should be: PocketBuddy coordinates or initiates through licensed payment rails; licensed providers move the money.

Remaining risk:

1. Manual UTR entry is trust-based unless reconciled against a real settlement feed.
2. Fake/manual UTR can be mitigated with duplicate registry and review, but true settlement requires payment-provider/bank reconciliation.

### 7. Travel Fare Guard

Built:

1. Route fare ranges for campus travel.
2. Community fare reports.
3. Confidence/trust badges based on report count and age.
4. OSRM route geometry with Haversine fallback.
5. Nominatim/geocoding sandboxing around campus location.
6. Bedrock/Nova Lite coach for negotiation scripts and safety tips.

Critical limitation:

1. Public OSRM/Nominatim endpoints are demo-grade and have usage constraints.
2. Production should self-host OSRM/Nominatim on AWS or use Mappls/Google Routes/other commercial APIs.
3. Live Ola/Uber/Rapido pricing APIs are not broadly available for arbitrary app use; scraping is fragile and risky.

Correct framing:

> The demo uses deterministic fare ranges and community reports. Production can add partner routing/pricing APIs where legally available, but the core safety feature does not depend on scraping ride-hailing apps.

Bedrock grounding rule:

> The AI coach must only use fare numbers computed by the deterministic backend. It must not invent rupee amounts.

### 8. Privacy And Account Aggregator Sandbox

Merged through PR #29 / privacy trust layer.

Built:

1. Privacy Center.
2. Trust path for transaction sources.
3. Review inbox and parser correction path.
4. Cascading account delete.
5. Account Aggregator-style consent sandbox with masked accounts, consent, fetch, and revoke.
6. Onboarding offers safer connection paths.

Important truth:

1. AA is a sandbox/mock consent-style flow, not a live bank integration.
2. Real Account Aggregator integration requires regulated/partner setup and is not a quick hackathon add-on.
3. The UI must not imply accounts magically appear without identifier, institution, consent, and sandbox/mock account discovery.

Correct framing:

> The consent sandbox demonstrates the privacy control model for bank-source data. Android auto-sync is the live low-friction path for supported UPI/SMS alerts.

### 9. Subscriptions

Built:

1. Known service subscription detection.
2. Some recurring pattern handling.

Important product decision:

1. Recurring detection should live in the backend because it needs transaction history and must work across Android, AA sandbox, manual, and future imports.
2. Android should not own long-term subscription intelligence.

Correct framing:

> Today we recognize known services and candidate recurring patterns. The stronger roadmap is interval clustering on merchant, amount, and billing cadence across all transaction sources.

### 10. Wellness

Built or represented:

1. Food gap checks.
2. Exam context.
3. Late-night activity signals.
4. Runway pressure.
5. Social/shared-pool signals.
6. Bedrock/Nova contextual nudges.

Do not overclaim:

1. Do not say PocketBuddy diagnoses burnout.
2. Do not say it detects medical sleep deprivation.
3. Use "risk signals", "late-night activity pattern", "meal gap", and "check-in".

Correct framing:

> PocketBuddy detects routine risk signals, not clinical burnout. It asks practical check-in questions when spending rhythm suggests skipped meals, late-night stress, or exam-period pressure.

## Demo And PPT Direction

The demo should prove:

> A student's daily campus activity becomes useful decisions without manual bookkeeping.

Strong demo sequence:

1. Landing/product entry.
2. Onboarding with allowance, campus, hostel/mess, connection choices.
3. Dashboard runway and wellness context.
4. Android companion / sync proof.
5. Transactions with trust path and review.
6. Food Guard trust/recommendation workflow.
7. Shared pool host and repayment flow.
8. Travel fare guard and AI negotiation coach.
9. Privacy Center / consent sandbox / delete or revoke.
10. Architecture and future scale.

Do not make the demo a feature dump. It should feel like a student day:

1. Student sets context.
2. A transaction or routine signal appears.
3. PocketBuddy interprets it.
4. Student takes a better action.

## Amazon And Business Fit

Do not force unsupported "Amazon Pay integration" claims.

Good Amazon fit:

1. Responsible student spending layer that could complement Amazon Pay or student commerce.
2. Shared cart and campus commerce insights.
3. Bedrock-powered contextual assistance.
4. AWS-native scalable event ingestion.
5. Privacy-aware customer trust.
6. Potential student mode for responsible checkout and affordability nudges.

Business model directions:

1. Free student core.
2. Premium student plan for advanced forecasts, exports, and multi-device support.
3. Campus/hostel B2B dashboards with privacy-preserving aggregate insights.
4. Campus merchant/canteen catalog and menu trust tools.
5. Responsible commerce integrations that help students save, not just spend more.

## Competitor Positioning

Do not say "nobody reads notifications." That is false.

Better framing:

1. Expense trackers capture spend but do not understand campus routines.
2. Split apps help divide bills but do not connect to allowance runway or passive repayment verification.
3. Delivery apps optimize ordering, not student affordability.
4. Wellness apps track mood/routine but do not connect to financial stress.
5. PocketBuddy combines permitted spend signals, student context, and action loops.

## Claim Safety Table

| Topic | Safe Claim | Unsafe Claim |
| --- | --- | --- |
| Amazon Pay | Amazon Pay-style simulated checkout modeled on V2 contract | Live Amazon Pay V2 integration |
| AA | Consent sandbox / AA-style flow for privacy demo | Live bank AA integration |
| Wellness | Routine risk signals and check-ins | Burnout diagnosis |
| Sleep | Late-night activity signal | Sleep deprivation diagnosis |
| OCR | Menu onboarding/review accelerator | Fully automatic reliable live food intelligence |
| Travel pricing | Community median + deterministic route/fare guard | Live Ola/Uber/Rapido price integration |
| Payments | Future licensed rail/provider settlement | PocketBuddy holds/custodies roommate funds |
| Parser | Supported formats plus review fallback | Works for every bank/UPI notification |

## Known Risks Judges May Ask About

1. Parser coverage across banks and UPI apps.
2. Android-only passive capture and iOS fallback.
3. Trust and privacy around notification listener permission.
4. Play Protect warning for sideloaded APK.
5. Static pairing token and replay risk.
6. Manual UTR spoofing risk.
7. Simulated Amazon Pay/AA flows.
8. OSRM/Nominatim demo API scalability.
9. Bedrock hallucinating specific fare or finance advice.
10. Feature breadth vs hardening.

Good answer style:

1. Name the risk directly.
2. Explain the current guardrail.
3. Explain the production hardening path.
4. Do not ramble.

## Current Priorities

Immediate:

1. Keep `feature/consolidate-ledger` clean and mergeable if not already merged.
2. Keep the PPT/demo narrative aligned with the original PS.
3. Avoid adding bloated features that weaken the story.
4. Stabilize the demo path rather than adding more scope.

Before finals:

1. Harden Android pairing and sync reliability.
2. Tighten parser confidence and review UX.
3. Ground Bedrock travel coach strictly.
4. Polish onboarding connection choices.
5. Validate Food Guard trust workflow end to end.
6. Validate pooled repayment fallback and wording.
7. Keep EC2/AWS startup and cost checklist ready.

## Useful Commands

Local repo status:

```powershell
cd "C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy"
git status -sb
git log --oneline --decorate -12
```

Frontend:

```powershell
npm.cmd run check --workspace=frontend
npm.cmd run build --workspace=frontend
```

Backend local setup:

```powershell
cd "C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

If backend errors with missing settings:

1. Ensure backend env variables are available.
2. Required minimum: `JWT_SECRET`, `MONGO_URI`.
3. Do not paste real secrets into docs or chat unless absolutely necessary.

AWS deploy reminders:

1. Pull latest on EC2.
2. Restart backend service if backend changed.
3. Build frontend dist if frontend changed.
4. Upload `frontend/dist` to S3.
5. Invalidate CloudFront paths after frontend upload.
6. Start EC2 before any live demo.

## Key Files And Areas

Frontend:

```text
frontend/src/routes/index.tsx
frontend/src/routes/_authenticated/onboarding.tsx
frontend/src/routes/_authenticated/dashboard.lazy.tsx
frontend/src/routes/_authenticated/transactions.lazy.tsx
frontend/src/routes/_authenticated/companion.lazy.tsx
frontend/src/routes/_authenticated/privacy.lazy.tsx
frontend/src/routes/_authenticated/runway.lazy.tsx
frontend/src/routes/_authenticated/travel.lazy.tsx
frontend/src/routes/_authenticated/pool/index.lazy.tsx
frontend/src/routes/pool.$id.lazy.tsx
frontend/src/lib/api/db.functions.ts
```

Backend:

```text
backend/app/api/webhook.py
backend/app/api/profile.py
backend/app/api/transactions.py
backend/app/api/insights.py
backend/app/api/pools.py
backend/app/api/runway.py
backend/app/api/travel.py
backend/app/api/campus_food.py
backend/app/api/account_aggregator.py
backend/app/services/menu_scanner.py
backend/app/services/bedrock.py
backend/app/core/config.py
backend/app/core/privacy.py
```

Android:

```text
android/connector
android/releases/PocketBuddy-Connector-v0.1.0.apk
```

Important docs:

```text
docs/finals-complete-ai-handoff.md
docs/finals-master-guide-july-2026.md
docs/finals-amazon-research-and-positioning-context.md
docs/finals-ppt-attention-guide-july-2026.md
docs/food-guard-trust-context.md
docs/pooling_strategy_status.md
docs/final-architecture-decisions.md
docs/aws-e2e-deployment-runbook.md
docs/demo-video-recording-plan.md
```

## What Not To Do

1. Do not describe PocketBuddy as "just an expense tracker."
2. Do not bury wellness; it is part of the original PS.
3. Do not overclaim simulated Amazon Pay or AA work.
4. Do not build new features just because they sound impressive.
5. Do not move business-critical logic into Android if it needs cross-source history.
6. Do not make the product feel like a generic fintech dashboard.
7. Do not break the demo path with last-minute architecture purity.
8. Do not assume public APIs for ride-hailing/food delivery are production-safe.
9. Do not leave mock/sandbox flows with wording that looks like real bank/payment integration.
10. Do not make UI copy sound like generic AI marketing.

## North Star

PocketBuddy should feel like a product a student would actually keep installed because it saves time, prevents avoidable money stress, and understands campus life.

The strongest final story is not "we built many features." It is:

> PocketBuddy connects the signals students already generate to the decisions they keep missing: can I afford this week, did I skip food, is this fare fair, who still owes for the shared order, and what should I do next?
