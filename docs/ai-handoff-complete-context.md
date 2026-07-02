# PocketBuddy Complete AI Handoff Context

Last updated: 2026-07-01  
Purpose: give another AI assistant enough context to help with PocketBuddy without making unsafe assumptions, breaking the demo, leaking secrets, or changing the wrong part of the system.

This is not the PRD, not the demo script, and not public marketing copy. It is an operational context file for handoff.

## First Rules For Any Future AI

1. Do not expose or write secrets in docs, code, screenshots, PRD, or demo material.
2. Do not show `.env`, MongoDB URI, JWT secret, AWS keys, private UPI details, real bank balances, phone numbers, or raw SMS content.
3. Do not make large refactors before a demo unless the user explicitly asks.
4. Do not change the architecture story to match a temporary debugging state.
5. Do not present broken or risky features in the final demo.
6. Do not assume the local working copy is current. There are multiple PocketBuddy folders on this machine.
7. Before code changes, always run:

```powershell
Get-Location
git status --short --branch
git log -3 --oneline --decorate
```

8. The safest demo principle is: preserve what already works, then polish only what directly improves the mentor/final presentation.

## Current User Situation

The team has been selected as a finalist for HackOn with Amazon 6.0.

Mentorship sessions:

- Mentor: Aditya Maharana
- Dates: July 2 and July 3, 2026
- Time: 11:00 AM - 12:00 PM IST
- Entire team should attend.

Final submission:

- Submission window opened: June 29, 2026, 6:00 PM IST
- Submission deadline: July 5, 2026, 11:59 PM IST
- PRD must be PDF, not scanned/photo PDF.
- PRD PDF size limit: 4.5 MB.
- Demo video must be MP4 uploaded directly, not YouTube/Drive.
- Demo video size limit: 500 MB.
- Demo video max duration: 5 minutes; 3-4 minutes recommended; 1080p enough.
- Grand Finale presentation format: 10 minutes presentation + 5 minutes Q&A.
- The team can update the PRD and demo video after mentor feedback before the deadline.

## Team And Product

Team name: Bad Luck  
Product: PocketBuddy  
Theme: AI for Campus, Community & Everyday Life  
Problem statement selected: PocketBuddy - AI Financial & Wellness Assistant for Students

Core product framing:

PocketBuddy is a campus money and routine guard for students. It passively captures supported Android payment/SMS notifications after permission, turns them into normalized financial events, and uses campus context to help with runway, food, shared carts, travel fare decisions, subscriptions, and wellness check-ins.

Do not describe it as only an expense tracker. The stronger framing is:

> PocketBuddy turns everyday student payment signals into decisions before the month goes wrong.

## Problem Statement Requirements

The problem statement asks for an AI companion that can help students:

- manage monthly expenses;
- recommend affordable food options;
- recommend affordable travel options;
- detect burnout patterns;
- encourage healthy routines;
- provide personalized support for financial and emotional well-being.

PocketBuddy maps to this as:

- monthly expenses: dashboard, runway, safe daily spend, transactions, stats;
- food: campus food intelligence and meal gap check-ins;
- travel: fare guard, route medians, quote comparison, negotiation script;
- burnout/routine: food gaps, exam-period context, wellness nudges;
- personalized support: Bedrock/Nova Lite contextual text based on profile, runway, route, and meal context;
- campus/community: room/wing cart pools and repayment verification.

## Important Live Links

Web app:

```text
https://d3g6cg7q9hn7hi.cloudfront.net/
```

Android APK:

```text
https://d3g6cg7q9hn7hi.cloudfront.net/downloads/PocketBuddy-Connector-v0.1.0.apk
```

API smoke test:

```text
https://d3g6cg7q9hn7hi.cloudfront.net/api/campus-food
```

GitHub:

```text
https://github.com/nishantharkut/PocketBuddy
```

## Local Folder Warning

There have been multiple project copies:

- `C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy`
- `C:\Users\nhnis\Desktop\PocketBuddy`
- review folders such as `PocketBuddy-main-review` and `PocketBuddy-pr10-review`

The current Codex working directory may be:

```text
C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy
```

The git repo inside that directory is usually:

```text
C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy
```

Before editing, check whether `.git` exists in the current folder. Do not edit the wrong copy.

## Repository Structure

Main repo layout:

```text
PocketBuddy/
  android/        Kotlin Android connector app
  backend/        FastAPI backend
  data/           demo/default data
  docs/           PRD, AWS runbooks, architecture, video plan
  frontend/       React/Vite/TypeScript web app
  public/         static public assets
  scratch/        local artifacts; do not blindly commit secrets/signing material
```

Key docs:

- `README.md` - public project overview and links.
- `docs/final-submission-prd.md` - current PRD draft.
- `docs/demo-video-recording-plan.md` - current demo video plan and script.
- `docs/aws-e2e-deployment-runbook.md` - AWS deployment details.
- `docs/final-architecture-decisions.md` - architecture decision record.
- `docs/mobile-ingest-contract.md` - Android webhook contract.
- `android/README.md` - Android setup/build/test notes.

## Current Architecture Narrative

Use this architecture story in PRD/demo. Do not over-explain temporary routing fixes.

PocketBuddy uses a hybrid AWS architecture:

- CloudFront is the public HTTPS entry point.
- S3 serves the React/Vite static frontend and downloadable APK.
- EC2 runs the main FastAPI backend behind Nginx.
- MongoDB Atlas stores product data: users, profiles, transactions, pools, travel, food, subscriptions.
- Bedrock Nova Lite powers contextual AI text where enabled.
- API Gateway, Lambda, SQS, and DynamoDB exist as the serverless mobile-ingest path.
- CloudWatch handles logs/metrics.
- AWS Budgets protects hackathon cost.

High-level flow:

```text
Browser
  -> CloudFront
  -> S3 for frontend/assets/APK
  -> EC2/Nginx/FastAPI for /api/*
  -> MongoDB Atlas and Bedrock

Android Connector
  -> CloudFront /api/ingest/notification
  -> backend validation and parsing
  -> transaction/sync log updates

Serverless ingest lane
  -> API Gateway
  -> Lambda ingest
  -> SQS
  -> Lambda processor
  -> DynamoDB ledger
```

Important nuance:

During debugging, CloudFront routing for `/api/ingest/notification` was changed to keep Android pairing compatible with the backend token/profile flow. The final narrative should still present the architecture as hybrid and scalable. Do not tell judges a long story about temporary path behavior unless they ask a direct technical question.

## AWS Resources Known From The Project

AWS account ID:

```text
734705208425
```

CloudFront:

```text
Distribution ID: E39IGIZXM49Y9N
Domain: d3g6cg7q9hn7hi.cloudfront.net
```

S3 bucket:

```text
pocketbuddy-frontend-734705208425-ap-south-1
```

EC2:

```text
Name: pocketbuddy-demo
Instance ID: i-0d2b2de6380411151
Region: ap-south-1
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

AI:

```text
Bedrock model: Amazon Nova Lite
Model ID used in backend: us.amazon.nova-lite-v1:0
Bedrock region used: us-east-1
```

## Current AWS Cost Situation

AWS budget alert triggered around June 25, 2026:

- Budget: `pocketbuddy-monthly-5usd-alert`
- Alert threshold: actual cost > USD 3.00
- Actual at alert: about USD 4.51

Credits page showed:

- Total credits remaining: about USD 160
- Estimated credits used: about USD 4.63
- Estimated credits remaining: about USD 155.37

Estimated bill page showed:

- Total in USD: USD 0.00
- Estimated grand total: USD 0.00

So the card was not charged; credits covered the usage.

Cost sources were mainly:

- EC2 compute
- VPC public IPv4 charge
- EC2-Other, likely EBS/storage/networking

The user stopped EC2 to save credits. This is okay. Stopping EC2 does not delete the disk. No snapshot is required unless the user plans to terminate/delete the instance or volume.

## AWS Restart Checklist Before Mentor Demo

If the live app backend is down, do this:

1. Go to AWS EC2 in `ap-south-1`.
2. Start instance `pocketbuddy-demo`.
3. Wait for status checks.
4. Copy the new Public IPv4/Public DNS if it changed.
5. Go to CloudFront distribution `E39IGIZXM49Y9N`.
6. Check Origins.
7. If the EC2 backend origin points to an old EC2 DNS/IP, update it to the new Public DNS.
8. Save changes.
9. Create CloudFront invalidation for:

```text
/api/*
```

10. Test:

```text
https://d3g6cg7q9hn7hi.cloudfront.net/api/campus-food
```

11. Login and test dashboard, companion page, travel page, and pool page.

Useful EC2 commands:

```bash
cd /home/ubuntu/PocketBuddy
git status
git pull

cd /home/ubuntu/PocketBuddy/backend
sudo systemctl status pocketbuddy-backend --no-pager
sudo systemctl status nginx --no-pager
sudo systemctl restart pocketbuddy-backend
sudo systemctl reload nginx
sudo journalctl -u pocketbuddy-backend --since "20 minutes ago" --no-pager
```

## Frontend Deployment Checklist

Build locally or on EC2:

```powershell
npm.cmd run check --workspace=frontend
npm.cmd run build --workspace=frontend
```

Upload contents of:

```text
frontend/dist/
```

to S3 bucket:

```text
s3://pocketbuddy-frontend-734705208425-ap-south-1/
```

Then create CloudFront invalidation:

```text
/*
```

If only API behavior changed, invalidate:

```text
/api/*
```

## Backend Deployment Checklist

On EC2:

```bash
cd /home/ubuntu/PocketBuddy
git pull
cd backend
.venv/bin/pip install -r requirements.txt
sudo systemctl restart pocketbuddy-backend
sudo systemctl status pocketbuddy-backend --no-pager
```

Do not print `.env` in a screen share.

## Android Connector Setup

The Android connector is a sideloaded APK. It may be blocked by Google Play Protect because it is not from Play Store and uses notification access.

For demo:

1. Open PocketBuddy web app.
2. Open Companion Device page.
3. Download APK or use direct APK URL.
4. Install APK on Android phone.
5. If blocked, temporarily disable Play Protect app scanning, install, then re-enable scanning.
6. Copy connector config from web app.
7. Paste config into Android app.
8. Save.
9. Enable notification access for PocketBuddy Connector.
10. Make a tiny real payment if safe.
11. Refresh Companion Device page and verify Recent Sync Activity.

Do not record real payment apps or raw bank SMS. Record the connector app and the web result.

## Known Stable Demo Account

Demo account email:

```text
harkutnishant27@gmail.com
```

Do not write the password in docs. The user knows it.

Known user ID from seeding:

```text
061e3ce2-e23d-4e7f-864f-59b4cf3b2061
```

Demo profile context:

- Name: Nishant
- College: ABV-IIITM Gwalior
- Hostel/block: BH-2
- Wing: BH-2 Wing B
- Room: 271
- Monthly allowance: Rs 7,000
- Mess enrolled: yes

Seed/demo data has included:

- realistic monthly allowance/income;
- expenses across food, travel, stationery, subscriptions, and other;
- food gap/wellness check-in context;
- companion sync logs;
- one completed pool with roommate payment states;
- one or more active/closed pools depending on seeding time;
- travel routes for Gwalior;
- travel savings reports;
- subscriptions such as Spotify, YouTube Premium, Amazon Prime.

Always verify the live account before recording because time-based seed data can expire.

## Features That Are Actually Built

### Authentication and Onboarding

- Signup/login.
- Profile setup.
- Monthly allowance and reset/cycle context.
- Campus/hostel/wing/room context.
- Meal routine and payment app preferences.
- Onboarding can be revisited at `/onboarding`.

### Dashboard

- Remaining allowance/runway.
- Safe daily spend.
- Recent transactions.
- Wellness/campus intelligence entry points.
- Designed for mobile and desktop.

### Transactions and Stats

- Transaction history.
- Category review/edit flow.
- Companion/manual source breakdown.
- Monthly stats and export.
- Categories include food, travel, subscription, stationery, other, income.

### Android Companion Sync

- Native Kotlin Android app.
- Notification listener captures supported payment app/SMS alerts.
- Webhook sends parsed or raw notification events.
- Backend parses/normalizes amount, merchant, direction, source, UTR/reference.
- Duplicate app/SMS alerts are handled.
- Companion page shows recent sync activity and activity details.

### Pooling

- Create cart pools for room/wing purchases.
- Platforms include Blinkit, Zepto, Instamart, BigBasket, custom.
- Host view and shared pool link flow exist.
- Members can add items.
- Completed pool shows split ledger.
- UTR/manual repayment flow exists.
- Incoming credit notification matching can auto-verify pending pool payments in supported cases.

### Food Intelligence

- Campus food catalog exists.
- Campus food API works.
- Food gap / meal check-in idea is part of the product.
- During exam context, the nudge should be positioned as practical wellness support, not medical diagnosis.

### Travel Fare Guard

- Travel routes exist.
- Route fare reports exist.
- User can compare a quote against expected route fare.
- Travel savings logging exists.
- Bedrock AI coach can generate negotiation script/tactics/safety note.

### Subscriptions

- Manual and detected subscriptions exist.
- Recurring merchants can be tracked.
- Subscription category contributes to stats.

### Bedrock/Nova Lite

- Backend supports Amazon Bedrock Nova Lite.
- Use for short contextual messages, travel negotiation scripts, and campus nudges.
- Do not present AI as therapy or diagnosis.

### Serverless Ingest

- API Gateway, Lambda ingest, SQS queue, Lambda processor, DynamoDB ledger were built and tested.
- This is the architecture story for scaling mobile notification events.
- Current live Android path may route through EC2 backend for compatibility. Do not let that weaken the PRD narrative.

## Features To Be Careful With

### OCR / Menu Scanner

There is a backend OCR/menu scanner path, but AWS Textract caused a subscription/access error in production:

```text
SubscriptionRequiredException when calling DetectDocumentText
```

Do not show OCR in the demo unless it has been verified live on AWS. In PRD, it can be mentioned as an expansion accelerator or optional pathway, not a core dependency.

### API Gateway Direct Ingest

The pure serverless ingest path was tested, but Android pairing tokens and product sync state were more reliable through the FastAPI backend path. If debugging mobile sync, test both:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://d3g6cg7q9hn7hi.cloudfront.net/api/ingest/notification?cb=manual" `
  -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer <token-from-companion-config>" } `
  -Body $body
```

Expected success should return JSON, not `index.html`.

If it returns HTML, CloudFront behavior is routing `/api/*` to S3/default behavior instead of backend.

## Most Important Demo Flow

Use the seeded account and show a student day, not a feature checklist.

Recommended structure:

1. Landing page and sign in.
2. Onboarding at `/onboarding`.
3. Dashboard: runway, allowance, safe daily spend.
4. Companion setup: APK, config, notification access.
5. Real or recent payment sync into Companion Device activity.
6. History/Stats: normalized transaction becomes useful.
7. Pool: host active pool, roommate link if clean, completed pool payment verification.
8. Travel: quote comparison and AI negotiation coach.
9. Food/wellness: food gap, exam-period check-in, campus intelligence.
10. AWS architecture: CloudFront, S3, EC2, API Gateway, Lambda, SQS, DynamoDB, Bedrock, CloudWatch.
11. Close: PocketBuddy helps students spend with context, not regret.

## What Not To Show In Demo

- AWS IAM policy editing.
- Terminal commands with secrets.
- MongoDB URI.
- JWT secret.
- Payment apps.
- Raw bank SMS.
- Phone numbers.
- UPI IDs.
- Play Protect bypass as a main product feature.
- OCR/Textract failure.
- Long setup/debugging.
- ADB debug broadcast unless real sync is unavailable.

## PRD Positioning

Use strong sides. Do not waste PRD space explaining temporary debugging decisions.

Keep PRD aligned to the template:

1. Problem Statement & Relevance
2. Customer & Solution
3. Tech Architecture & Scaling
4. Future Vision

Jury focus:

- novelty and theme alignment;
- clear working prototype;
- architecture depth and scalability;
- algorithms, not just CRUD;
- future business/value impact.

Strong PRD claims that are fair:

- automation-first: students should not manually maintain a ledger;
- payment signals already exist, PocketBuddy turns them into decisions;
- campus context matters: hostel, mess, exams, shared carts, travel routes;
- architecture separates product UX from bursty notification ingest;
- AI is grounded in selected context, not a generic chatbot;
- the product is privacy-aware through masking and bounded context.

Do not claim:

- medical diagnosis;
- guaranteed burnout detection;
- official banking integration;
- production-grade security certification;
- Textract/OCR works live unless verified;
- full serverless migration of all APIs.

## Realistic Metrics To Use Carefully

Known references previously used in PRD:

- UPI processed 23.2 billion transactions worth Rs 29.90 lakh crore in May 2026.
- UPI accounted for about 85.5% of payment transaction volume in an RBI-reported period.
- Indian higher education enrolment is about 4.46 crore students for 2022-23.

Use these as context, not as fake PocketBuddy traction. Say:

> The payment trail already exists; the product opportunity is interpreting it for student life.

Value impact can be expressed as:

- avoid a few overcharges or unnecessary delivery fees per month;
- reduce manual logging time;
- reduce awkward repayment follow-ups;
- prevent duplicate counting of payment app + SMS alerts;
- preserve extra runway days through earlier intervention.

## Business Model Notes

Do not make revenue the main pitch, but include a realistic path:

- Free student tier for basic passive tracking and dashboard.
- Student premium for advanced history, exports, smart alerts, multi-device, subscription intelligence.
- Campus/hostel license for privacy-preserving affordability dashboards and moderated catalogs.
- Verified local offers only if they reduce student cost and do not compromise trust.
- Partner integrations for scholarship/allowance/student-benefit workflows.

Trust matters more than ads. Do not frame raw student payment data as a monetization asset.

## OBS Recording Notes

Use OBS scenes:

- Desktop Web App
- Phone Android
- Split Phone + Web
- Architecture

Settings:

- record MKV first, remux to MP4;
- 1920x1080;
- 30 FPS;
- one microphone;
- disable desktop audio unless needed;
- 8-12 Mbps bitrate;
- test 20 seconds before final recording.

## Commands Commonly Needed

Frontend:

```powershell
npm.cmd run check --workspace=frontend
npm.cmd run build --workspace=frontend
```

Backend local:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

Android:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:LOCALAPPDATA\Android\Sdk\platform-tools;$env:Path"
.\android\gradlew.bat -p android :connector:testDebugUnitTest :connector:assembleDebug
```

AWS EC2 service:

```bash
sudo systemctl restart pocketbuddy-backend
sudo systemctl status pocketbuddy-backend --no-pager
sudo journalctl -u pocketbuddy-backend --since "20 minutes ago" --no-pager
```

## Post-Demo Cost Safety

After final demo/submission:

1. Stop EC2 instance.
2. Confirm no Elastic IP is allocated.
3. Check EBS volumes and snapshots.
4. Disable/delete Lambda/API Gateway/SQS/DynamoDB if no longer needed.
5. Keep S3/CloudFront only if the public demo must stay live.
6. If keeping S3/CloudFront, make sure no large logs/artifacts are accumulating.
7. Keep AWS Budgets alerts enabled.
8. Review Cost Explorer by service.

Do not terminate EC2 unless the user is sure the disk/setup is no longer needed or a snapshot/backup exists.

## Suggested Mentor Questions

Ask the mentor:

1. Should the final pitch lead with passive payment automation or broader student wellness?
2. Which three features should dominate the 10-minute presentation?
3. Is the hybrid AWS architecture clear enough, or should we emphasize the serverless ingest lane more?
4. Should OCR/menu scanning appear as roadmap or be left out?
5. What would make the PRD stronger: business model, scalability, or user evidence?
6. In the demo, should we show real phone sync live, or show a reliable recent sync event to avoid network/payment risk?

## Current Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| EC2 is stopped to save credits | App backend down | Start EC2 before mentor/demo and update CloudFront origin if public DNS changed. |
| CloudFront routes API to S3 | POST returns `index.html` | Ensure `/api/*` behavior points to EC2 backend, allows POST, caching disabled, origin request policy forwards viewer except Host header. |
| Android Play Protect blocks APK | Demo install friction | Preinstall before demo; if showing install, explain sideloaded hackathon APK briefly. |
| OCR/Textract not enabled | Scanner fails | Do not show OCR live; mention as expansion path only. |
| Seed data expires | Pools/travel/wellness look empty | Verify demo account and reseed/refresh data before recording. |
| Real payment notification delayed | Demo awkward pause | Have recent sync activity ready; record phone and web separately if needed. |
| Secrets shown in terminal | Serious demo/security issue | Close terminals or clear screen before recording. |
| Multiple repo copies | Wrong files changed | Verify path and git status before edits. |

## Final Reminder For Future AI

The goal at this stage is not to rebuild PocketBuddy. The goal is to protect a working finalist demo, improve the PRD/video after mentor feedback, and avoid last-minute breakage.

When in doubt:

1. Verify live behavior first.
2. Prefer documentation/demo guidance over code changes.
3. If code must change, keep it small and test the exact affected flow.
4. Never leak secrets.
5. Never turn a temporary debugging workaround into the public product story.
