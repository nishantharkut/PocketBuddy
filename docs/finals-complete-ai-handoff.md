# PocketBuddy Finals Complete AI Handoff

Last updated: 2026-07-01  
Audience: any future LLM or coding assistant helping with PocketBuddy during mentorship, final submission, or July 16 finale preparation.  
Status: internal working context. Do not paste this whole file into the PRD or public README.

## 0. Read This First

PocketBuddy is now past the initial hackathon stage. The team has been selected for the HackOn with Amazon 6.0 finals. The priority is no longer "build anything that works." The priority is:

1. keep the live demo stable;
2. sharpen the product story into a real sellable product;
3. incorporate mentor feedback on July 2 and July 3;
4. submit a stronger PRD and MP4 demo by July 5, 2026;
5. continue polishing implementation for the July 16 finale.

Do not make broad refactors without a clear reason. The product already has enough moving parts. Every change should improve one of these:

- demo reliability;
- product clarity;
- business credibility;
- AWS architecture maturity;
- final Q&A readiness.

## 1. Hard Rules For Any Future Assistant

1. Never expose secrets.
2. Never print or commit `.env`, MongoDB URI, JWT secret, AWS keys, real UPI IDs, real bank balances, raw bank SMS, phone numbers, or unmasked personal messages.
3. Before touching code, identify the exact repo copy.
4. Do not assume the current local folder is the active repo.
5. Do not overwrite user changes.
6. Do not "clean up" untracked files unless the user explicitly asks.
7. Do not change the architecture narrative to match a temporary debugging workaround.
8. Do not suggest deleting AWS resources before the user confirms demos/finals are over.
9. Avoid changes that need fresh app signing, new credentials, DNS propagation, or deep infrastructure migration unless there is enough time to test.
10. For video and PRD, lead with the strongest stable story. Avoid over-sharing temporary fixes.

Before any code or deployment advice, run:

```powershell
Get-Location
git status --short --branch
git log -3 --oneline --decorate
```

If working on AWS, confirm:

```text
Region for EC2/S3/API Gateway/Lambda/SQS/DynamoDB: ap-south-1
Region for Bedrock Nova Lite: us-east-1
CloudFront: global
```

## 2. Current Situation

Team name: Bad Luck  
Product: PocketBuddy  
Hackathon: HackOn with Amazon 6.0  
Theme: AI for Campus, Community & Everyday Life  
Chosen problem statement: PocketBuddy - AI Financial & Wellness Assistant for Students  
Mentor: Aditya Maharana  
Mentor sessions: July 2 and July 3, 2026, 11:00 AM to 12:00 PM IST  
Final submission deadline: July 5, 2026, 11:59 PM IST  
Grand Finale: July 16, 2026  
Grand Finale format: 10 minutes presentation + 5 minutes Q&A

Submission requirements:

- PRD must be a normal copy-pasteable PDF.
- PRD size limit: 4.5 MB.
- Demo video must be standard MP4, uploaded directly.
- Video size limit: 500 MB.
- Video max duration: 5 minutes.
- 3-4 minutes recommended by organizers.
- 1080p is enough.
- YouTube/Drive links are not accepted for the official demo video upload.

### Repository And Workspace Warning

There have been multiple local copies during the sprint:

```text
C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy
C:\Users\nhnis\Desktop\PocketBuddy
```

Do not assume the current shell directory is the active source of truth. Before editing, always run:

```powershell
Get-Location
git status --short --branch
git log -3 --oneline --decorate
```

If a future AI is given this file, it should first ask or verify which copy Nishant wants to modify. Several late UI fixes were made in the `C:\Users\nhnis\Desktop\PocketBuddy` copy, while many hackathon docs live under the `Amazon Hackon\PocketBuddy\PocketBuddy` copy.

Never merge or overwrite one copy into the other without checking the branch, latest commit, and working tree status.

### Current Operational Reality

The ideal architecture story remains hybrid AWS with CloudFront, S3, EC2/FastAPI, API Gateway, Lambda, SQS, DynamoDB, MongoDB Atlas, CloudWatch, and Bedrock Nova Lite.

However, demo stability matters more than architectural purity:

- EC2 may be stopped to save credits.
- CloudFront origin/behavior may need checking after EC2 restart because the public DNS can change.
- Android sync must be smoke-tested through the exact URL shown in the Companion Device config.
- If `/api/ingest/notification` returns HTML, CloudFront is routing the request to the static frontend instead of the API origin.
- If it returns `Invalid pairing code`, the token/user pair in the Android config does not match backend expectations.
- If direct EC2 API works but CloudFront API does not, fix CloudFront behavior/origin first; do not debug Android code first.

## 3. Product Thesis

Do not describe PocketBuddy as only an expense tracker.

The stronger product framing is:

> PocketBuddy is a campus affordability layer for students living on fixed monthly money. It passively captures payment signals, predicts financial runway, and turns campus context into timely actions across food, travel, shared purchases, subscriptions, and wellness.

Simpler pitch:

> PocketBuddy turns everyday student payment signals into decisions before the month goes wrong.

The product is strongest when presented as a decision layer, not a ledger.

## 4. Problem Being Solved

Students living away from home often operate on a fixed monthly allowance, scholarship, stipend, or family transfer. They do not usually lose control of money through one large decision. The problem is a series of small decisions:

- late-night snacks;
- food delivery;
- shared quick-commerce orders;
- local travel fares;
- subscription renewals;
- forgotten small UPI spends;
- skipped meals during exams;
- awkward roommate repayment follow-ups.

The signals already exist, but they are scattered:

- phone payment notifications;
- SMS alerts;
- bank/payment app notifications;
- hostel group chats;
- local fare memory;
- canteen menus;
- exam schedule;
- monthly reset date.

Traditional expense trackers fail because they expect students to manually log every transaction. PocketBuddy is built around the opposite assumption: students will not maintain a ledger, so the system must capture permitted signals passively and convert them into useful guidance.

## 5. Why This Is Timely

Use these market points in PRD/presentation when needed:

- UPI reached a record 23.20 billion transactions worth Rs 29.90 lakh crore in May 2026, according to reporting based on NPCI data. Sources: [Economic Times](https://m.economictimes.com/tech/technology/upi-processes-rs-29-9-lakh-crore-in-may-transaction-volumes-hit-23-2-billion/articleshow/131439222.cms), [IBEF](https://www.ibef.org/news/upi-transactions-soar-to-record-us-312-21-billion-in-may).
- India has about 4.46 crore higher-education students in AISHE 2022-23 provisional data. Source: [PIB/MoE AISHE coverage](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2219936).

Do not overstuff slides with statistics. One or two numbers are enough:

> The payments trail is already digital. The student context layer is missing.

## 6. Primary Users

### Student

The core user is a college student living in a hostel, dorm, PG, or shared room. They spend digitally, coordinate purchases with roommates, travel locally, and live under monthly money constraints.

### Wing or Room Purchase Host

The student who starts a shared cart and pays upfront. Their pain is collecting money, checking UTRs, and remembering who still owes what.

### New Student or Visitor

Someone arriving in a new campus city who does not know local travel prices and may overpay for autos/cabs.

### Campus or Hostel Stakeholder

Not the first user, but a possible buyer. They care about anonymized affordability pressure, food routine risks, and student welfare signals without seeing personal payment data.

## 7. Current Product Capabilities

### Authentication and Onboarding

The app supports signup/login and a student onboarding flow. Onboarding captures:

- monthly allowance;
- reset/cycle date;
- campus/college;
- hostel/wing/room;
- meal routine;
- payment app preferences;
- companion device setup.

Important product direction:

- defaults are allowed for demo readiness;
- defaults must not be product limits;
- future version should allow users/admins to add colleges, routes, vendors, categories, UPI apps, cart platforms, and food venues.

### Passive Android Payment Sync

The Android Connector app:

- is a Kotlin Android app;
- uses notification access after user permission;
- detects supported payment/SMS notifications;
- masks sensitive details;
- posts normalized-ish events to the backend webhook;
- supports a copied connector config from the web app.

Android APK:

```text
https://d3g6cg7q9hn7hi.cloudfront.net/downloads/PocketBuddy-Connector-v0.1.0.apk
```

Because the APK is sideloaded outside Play Store, Android/Play Protect may warn. In demo, do not spend time showing Play Protect. If needed, explain outside the final product flow:

> For hackathon distribution the APK is sideloaded; production would use Play Store or managed campus distribution.

### Companion Device Page

The web companion page shows:

- setup instructions;
- APK download;
- connector config;
- pairing/unpair flow;
- recent sync activity;
- test connection;
- activity details in newer builds.

Known demo priority:

- Pairing must be easy to show.
- If an account is already paired, there should still be a clean way to show setup or unpair/re-pair.
- Recent activity should show enough detail to prove the Android sync is real.

### Transaction Normalization

Backend parses:

- amount;
- direction: debit/credit;
- merchant/payer;
- source;
- transaction reference/UTR when available;
- confidence;
- masked preview.

It handles duplicate notifications from app and SMS by using transaction references where possible and fallback fingerprints.

### Dashboard

Dashboard focuses on:

- monthly allowance;
- remaining runway;
- safe daily spend;
- recent transactions;
- food/wellness signals;
- campus intelligence.

The message should be:

> It answers the question students actually ask: can I survive until allowance reset?

### History and Stats

History/stats provide:

- transaction list;
- category review/edit;
- income/expense breakdown;
- category chart;
- export.

If stats show income as zero in demo, seed or record with a better demo account. A zero-income stats page weakens the story.

### Food and Wellness

Food/wellness logic:

- tracks food-related transaction gaps;
- considers mess enrollment and meal routine;
- can ask whether the student ate in mess, cooked, ordered, or skipped;
- exam dates can adjust urgency/tone;
- Bedrock/Nova Lite can generate short contextual nudges.

Do not claim medical diagnosis. Say:

> PocketBuddy detects routine risk signals, not clinical burnout.

Strong demo line:

> No food payment for 16-17 hours does not automatically mean the student skipped food. The app asks first, because mess food may not create a transaction.

### Wing Cart Pooler

Pool feature supports:

- creating shared cart pools;
- active/completed/cancelled pool states;
- items from multiple participants;
- host view;
- roommate/share link flow;
- manual UTR entry;
- repayment state tracking;
- incoming credit matching for pool verification where possible.

Strong framing:

> A lot of campus spending is shared. PocketBuddy makes shared purchases accountable without turning roommates into accountants.

### Travel Fare Guard

Travel feature supports:

- campus route data;
- fare ranges;
- driver quote comparison;
- overcharge coefficient;
- AI negotiation script;
- safety note.

Use case:

> First-year students and visitors often do not know local fares. PocketBuddy gives a fair range and a script before they negotiate.

### Subscriptions

Subscription tracking exists for recurring digital services and monthly runway impact. Strong story:

> Subscriptions are small but predictable leaks in fixed allowance cycles.

### Bedrock/Nova Lite

Bedrock Nova Lite is used for targeted text, not as a generic chatbot.

Current model:

```text
Model: Amazon Nova Lite
Model ID: us.amazon.nova-lite-v1:0
Bedrock region: us-east-1
```

Use Bedrock for:

- travel negotiation text;
- campus/wellness nudges;
- short action-oriented explanations.

Do not use Bedrock for:

- basic math;
- every transaction parse;
- core demo flows that must work offline.

### OCR/Menu Scanner

There is/was a Textract/OCR path for menu scanning. In production testing, AWS Textract caused a subscription/access issue.

Do not center the final demo on OCR unless it is verified that day.

Best product framing:

> Menu scanning is a catalog onboarding accelerator. The food intelligence itself works from curated and community-moderated campus catalog data.

## 8. Current Architecture

Use this architecture story:

```text
Browser / Android Connector
        |
        v
Amazon CloudFront
  |             |
  |             +--> /api/* -> EC2 -> Nginx -> FastAPI
  |                                |        |
  |                                |        +--> MongoDB Atlas
  |                                |        +--> Bedrock Nova Lite
  |
  +--> S3 -> React static assets + APK

Serverless ingest lane:

Android/API event
  -> API Gateway
  -> Lambda ingest
  -> SQS
  -> Lambda processor
  -> DynamoDB ingest ledger
  -> CloudWatch logs/metrics
```

The architecture is hybrid:

- CloudFront is the single public HTTPS edge.
- S3 serves the web app and APK.
- EC2 + Nginx + FastAPI handles the product API.
- MongoDB Atlas stores product data.
- Bedrock Nova Lite generates grounded AI nudges.
- API Gateway/Lambda/SQS/DynamoDB form the serverless ingest architecture.
- CloudWatch observes logs and errors.
- AWS Budgets protects cost.

Important nuance:

During debugging, `/api/ingest/notification` was routed through the EC2 backend to keep Android token/profile pairing compatible. Do not make the PRD about this temporary routing decision. The product architecture remains hybrid and AWS-native: product API plus separated event-ingest path.

## 9. Known AWS Resources

AWS account:

```text
734705208425
```

Region:

```text
ap-south-1 for EC2/S3/API Gateway/Lambda/SQS/DynamoDB
us-east-1 for Bedrock Nova Lite
CloudFront global
```

CloudFront:

```text
Distribution ID: E39IGIZXM49Y9N
Domain: d3g6cg7q9hn7hi.cloudfront.net
```

S3:

```text
Bucket: pocketbuddy-frontend-734705208425-ap-south-1
```

EC2:

```text
Name: pocketbuddy-demo
Instance ID: i-0d2b2de6380411151
Instance type: t3.micro
OS: Ubuntu 24.04
```

Serverless ingest:

```text
API Gateway: pocketbuddy-mobile-ingest-api
API Gateway base URL: https://k2y5e0vvnh.execute-api.ap-south-1.amazonaws.com
Lambda functions: pocketbuddy-ingest, pocketbuddy-processor
SQS queue: pocketbuddy-ingest-queue
DynamoDB table: pocketbuddy_ingest_events
```

## 10. AWS Cost State

AWS budget alert was received around June 25, 2026:

- Budget: `pocketbuddy-monthly-5usd-alert`
- Alert threshold: actual cost over USD 3
- Actual reported in alert: about USD 4.51

Credits view later showed:

- estimated credits used: about USD 4.63;
- estimated credits remaining: about USD 155.37;
- largest costs: EC2 compute, VPC public IPv4, EC2-Other.

User stopped the EC2 instance to save credits.

Important:

- Stopping EC2 stops compute cost but storage/EBS/public IPv4-related charges may still exist depending on resources.
- No snapshot was created. That is okay as long as the instance and volume are not deleted.
- If EC2 is restarted, public IP/DNS may change unless an Elastic IP is used.
- If public DNS changes, update CloudFront EC2 origin and invalidate `/api/*`.

## 11. AWS Restart Checklist

Before mentor/demo:

1. Start EC2 instance `pocketbuddy-demo`.
2. Wait until status checks are `2/2`.
3. Copy the new public DNS.
4. If DNS changed, update CloudFront origin for EC2 API.
5. Ensure `/api/*` behavior still routes to EC2 origin.
6. Invalidate `/api/*` if API routing changed.
7. SSH or browser EC2 Instance Connect.
8. On EC2:

```bash
cd /home/ubuntu/PocketBuddy
git status
git pull

cd /home/ubuntu/PocketBuddy/backend
sudo systemctl restart pocketbuddy-backend
sudo systemctl reload nginx
sudo systemctl status pocketbuddy-backend --no-pager
sudo systemctl status nginx --no-pager
```

9. Test:

```text
https://d3g6cg7q9hn7hi.cloudfront.net/
https://d3g6cg7q9hn7hi.cloudfront.net/api/campus-food
```

10. Log in with demo account and test dashboard, companion, pool, travel.

## 12. Frontend Deployment Checklist

From a clean repo:

```powershell
cd "C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy"
npm.cmd run check --workspace=frontend
npm.cmd run build --workspace=frontend
```

Then upload contents of:

```text
frontend/dist/
```

to S3 bucket root:

```text
s3://pocketbuddy-frontend-734705208425-ap-south-1/
```

Important:

- Upload the contents of `dist`, not a nested `dist/` folder.
- Ensure `index.html`, `assets/`, `manifest.webmanifest`, icons, and `downloads/` as needed are present.
- After upload, create CloudFront invalidation:

```text
/*
```

If only API behavior changed:

```text
/api/*
```

## 13. Backend Deployment Checklist

On EC2:

```bash
cd /home/ubuntu/PocketBuddy
git pull

cd backend
.venv/bin/pip install -r requirements.txt
sudo systemctl restart pocketbuddy-backend
sudo journalctl -u pocketbuddy-backend --since "10 minutes ago" --no-pager
```

Do not show `.env`.

## 14. CloudFront Routing Checklist

Expected behaviors:

```text
Default (*) -> S3 frontend origin
/api/*      -> EC2 backend origin
```

For `/api/*`:

- allowed methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE;
- cache policy: CachingDisabled;
- origin request policy: AllViewerExceptHostHeader;
- viewer protocol: redirect HTTP to HTTPS;
- compress objects: yes or no is not critical for API.

If POST to:

```text
https://d3g6cg7q9hn7hi.cloudfront.net/api/ingest/notification
```

returns `index.html`, CloudFront is routing API traffic to S3, not backend. Fix `/api/*` behavior priority/order.

## 15. Demo Account

Known demo account email:

```text
harkutnishant27@gmail.com
```

Do not store or repeat passwords in docs.

Known user ID for seeded account:

```text
061e3ce2-e23d-4e7f-864f-59b4cf3b2061
```

Profile values used in demo:

- Name: Nishant
- Campus: ABV-IIITM Gwalior
- Hostel: BH-2
- Wing: BH-2 Wing B
- Room: 271
- Monthly allowance: Rs 7000
- Mess enrolled: yes

Seed data should include:

- income/allowance entry;
- 12-20 expenses;
- food transactions;
- travel transactions;
- subscriptions;
- companion sync activity;
- one duplicate notification;
- active and completed pools;
- travel route data;
- exam period.

If dashboard says runway zero or stats says income zero, demo data needs refreshing.

## 16. Demo Story

The video/pitch should show one student day:

1. Student signs in.
2. Onboarding captures campus context.
3. Android sync captures a real/safe payment signal.
4. Dashboard runway changes.
5. History/stats explain spend.
6. Pool handles shared purchases.
7. Travel fare guard prevents overpaying.
8. Food/wellness checks routine during exam pressure.
9. Architecture proves it is deployed on AWS.

Do not make the demo a feature checklist.

Core spoken line:

> PocketBuddy is not asking students to become accountants. It watches permitted payment signals and turns them into campus decisions.

## 17. PRD Positioning

The PRD should be structured around the official template:

1. Problem Statement & Relevance
2. Customer & Solution
3. Tech Architecture & Scaling
4. Future Vision

Use strong sides:

- passive automation;
- campus context;
- AWS event-driven ingest;
- community data loop;
- business model;
- measurable savings/time impact;
- privacy-first positioning.

Do not over-index on:

- OCR;
- internal temporary routing;
- debugging history;
- generic AI chatbot language.

## 18. Business Model

Preferred positioning:

- free student app for core runway and passive tracking;
- premium student plan around Rs 49-99/month after value is proven;
- campus/hostel license for privacy-preserving aggregate affordability dashboard;
- verified local offers only when they reduce cost;
- partner integrations for scholarship/stipend/allowance workflows.

Do not make advertising the core model. Trust is the product.

## 19. Strong Metrics To Use

Use these as market context, not fake traction:

- UPI May 2026: 23.20 billion transactions, Rs 29.90 lakh crore value. Sources: [Economic Times](https://m.economictimes.com/tech/technology/upi-processes-rs-29-9-lakh-crore-in-may-transaction-volumes-hit-23-2-billion/articleshow/131439222.cms), [IBEF](https://www.ibef.org/news/upi-transactions-soar-to-record-us-312-21-billion-in-may).
- AISHE 2022-23 provisional higher education enrolment: about 4.46 crore students. Source: [PIB/MoE](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2219936).

Value estimate:

- If a student saves Rs 300/month through avoided overpaying, duplicates, subscriptions, and impulse food/travel decisions, 1 lakh active students means Rs 36 crore/year in student-side savings potential.
- If passive sync saves 20-40 minutes/month per student, 1 lakh active students means 33,000-66,000 student hours/month not spent manually maintaining ledgers.

Make clear these are potential impact estimates, not current traction.

## 20. Known Weak Spots

Be aware:

- OCR/Textract may not work due AWS subscription/access.
- EC2 may be stopped to save credits.
- CloudFront API routing can break Android sync if `/api/*` points to S3.
- Demo account data can become stale.
- Android notification parsing depends on bank/payment app message format.
- Play Protect can warn on sideloaded APK.
- Multiple local repo copies can cause editing the wrong tree.

## 20A. Critical Product Boundaries For Future Work

Do not bloat PocketBuddy before finals. The product should remain a campus money guard, not a generic finance suite.

Core loops:

1. **Passive spend capture:** Android notification -> parser -> transaction/review -> dashboard.
2. **Shared spend settlement:** pool -> split -> UTR fallback -> incoming-credit auto-verification when possible.
3. **Contextual guardrails:** runway, subscriptions, food gaps, travel fare ranges, and exam-aware nudges.

Architecture boundary:

- Android captures signals only: notification text, source app, amount/merchant/direction when available, retry state, last sync state.
- Backend owns meaning: parser confidence, dedupe, pool matching, subscription detection, food/travel context, and financial calculations.
- Web owns review and decisions: needs-review corrections, pool status, dashboard insights, onboarding, and settings.

Do not move recurring subscription detection into Android. Recurrence requires transaction history and should work for all future ingestion sources, including manual entries, email imports, iOS assisted capture, and account-aggregator feeds.

Do not move pool business logic into Android. The best auto-verification signal is the host's incoming credit notification. Backend should match the host credit against pending pool splits using UTR, amount, sender text, and pool checkout time. UTR entry remains the fallback when the match is missing or ambiguous.

Top safe improvements:

1. Create masked `Needs review` events for low-confidence payment notifications.
2. Add SQS DLQ and replay handling for serverless ingest.
3. Harden pool auto-verification states: `auto_verified`, `needs_review`, `pending_utr`, `manual_verified`, `ambiguous_match`.
4. Show subscription source clearly: known service, manual, recurring pattern, or candidate.
5. Improve Android setup/trust copy without turning the app into a full mobile product.

## 21. Mentor Session Goals

July 2:

- validate product framing;
- ask if the problem is too India/UPI-specific or if campus affordability framing is strong;
- ask which feature should lead the demo;
- ask whether AWS architecture story is strong enough;
- ask what business model angle is most believable.

July 3:

- show revised PRD/video outline;
- get feedback on final pitch;
- ask hard Q&A questions;
- ask what Amazon judges will challenge;
- ask if any architecture component looks weak or overbuilt.

## 22. Final Pitch Skeleton

Use this:

1. Problem: students have money/routine stress from small daily decisions.
2. Insight: payment signals already exist but are scattered.
3. Solution: passive sync + campus context + action layer.
4. Product: dashboard, food/wellness, pools, travel, subscriptions.
5. Tech: CloudFront/S3/EC2/FastAPI + serverless ingest + Bedrock.
6. Business: student premium + campus pilots + verified savings ecosystem.
7. Future: campus affordability layer.

## 23. What Not To Say

Avoid:

- "It is just an expense tracker."
- "We used AI everywhere."
- "OCR failed."
- "We used EC2 because we did not know AWS."
- "We will build this later" in final video.
- "This is for one college only."
- "We store all SMS data."
- "We diagnose burnout."

Better:

- "AI is grounded in selected campus context."
- "Routine signals are check-ins, not medical diagnosis."
- "Defaults are seed data, not product limits."
- "The architecture separates interactive product APIs from event-driven mobile ingest."

## 24. Useful Commands

Local build:

```powershell
cd "C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy"
npm.cmd run check --workspace=frontend
npm.cmd run build --workspace=frontend
```

Git sanity:

```powershell
git status --short --branch
git log -3 --oneline --decorate
```

EC2 backend:

```bash
cd /home/ubuntu/PocketBuddy
git pull
cd backend
sudo systemctl restart pocketbuddy-backend
sudo journalctl -u pocketbuddy-backend --since "10 minutes ago" --no-pager
```

API smoke:

```powershell
Invoke-RestMethod "https://d3g6cg7q9hn7hi.cloudfront.net/api/campus-food"
```

## 25. Current Best Next Steps

Before mentorship:

1. Restart AWS only if needed for live walkthrough.
2. Refresh demo data.
3. Confirm Android sync works.
4. Confirm pool and travel pages are clean.
5. Keep PRD source editable.
6. Prepare mentor questions.

After mentorship:

1. Convert feedback into a short fix list.
2. Do not implement everything.
3. Prioritize demo-visible improvements.
4. Update PRD and video script.
5. Export PRD PDF under 4.5 MB.
6. Record MP4 under 5 minutes.
