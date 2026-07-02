# PocketBuddy Grand Finale PPT And Live Demo Guide

Purpose: create a sharp, mentor-ready and finale-ready presentation that supports the live product demo instead of replacing it.

Submission context:

- Grand Finale presentation is 10 minutes plus 5 minutes Q&A.
- Amazon guidance: 3 minutes idea, pain point, and impact; 5 minutes working prototype; 2 minutes architecture and future vision.
- Submission can be PPTX/PDF or demo video. PPTX is preferred for the finale.
- Demo video, if submitted, must be an MP4 file, not a streaming link.
- Product theme cannot change. PocketBuddy must stay aligned to the student finance, food, travel, routine, and well-being problem statement.

## Core Pitch

Use this as the main thesis:

> PocketBuddy turns passive payment signals into student decisions: when to slow down, what to eat, whether a travel quote is fair, and how to settle shared room purchases without manual tracking.

Avoid calling it only an expense tracker. The stronger frame is:

> A student money autopilot for campus life.

The product insight:

- Payment apps make spending instant.
- Financial awareness usually arrives too late.
- Students do not want to manually log every snack, ride, subscription, and shared order.
- PocketBuddy uses real payment activity to give timely, campus-aware guardrails.

## Amazon Fit

Say this clearly, but do not overclaim an integration that is not live:

> Today, PocketBuddy works beside UPI/payment apps through Android notification sync. The long-term opportunity is to bring this intelligence directly into payment ecosystems like Amazon Pay as a student mode: runway checks, shared purchase settlement, and responsible spending nudges before the payment is completed.

Why this matters to Amazon:

- Builds trust with young customers early in their financial lifecycle.
- Makes Amazon Pay more than a checkout surface: it becomes a responsible spending companion.
- Opens student-focused commerce: food, essentials, subscriptions, room purchases, travel partners.
- Uses AWS services in a way that can scale from campus pilot to multi-campus deployment.

## Presentation Rules

Keep the deck visual and low-text.

- 7 to 9 slides only.
- One idea per slide.
- Use screenshots, product flows, and diagrams instead of paragraphs.
- No generic AI images.
- No “we use AI” slide without showing what the AI changes for the student.
- Do not show secrets, AWS keys, MongoDB URI, personal UPI IDs, or bank balances.
- Do not mention internal temporary fixes.
- Do not lead with implementation details. Product value first, architecture later.

## Visual Style

Use the product’s real visual identity.

- Use the PocketBuddy logo from the repo.
- Prefer a clean light background for the deck unless screenshots look better in dark mode.
- Use one accent color, not many gradients.
- Use large headings, short labels, and simple arrows.
- Minimum body text size: 20 pt.
- Do not put more than 4 bullets on a slide.
- Use real product screenshots from the deployed app.

Suggested palette:

- Background: `#F8FAFC` or white.
- Text: `#111827`.
- Accent: product orange, but softened if it looks harsh.
- Success: muted green.
- Warning: muted amber.

## Slide Plan

### Slide 1 - Title

Objective: make the product memorable in 10 seconds.

Title:

> PocketBuddy

Subtitle:

> Student money autopilot from passive payment signals.

Visual:

- Product logo.
- One clean screenshot or mockup of the dashboard.
- Live URL small at the bottom: `https://d3g6cg7q9hn7hi.cloudfront.net/`

Speaker note:

> PocketBuddy helps students understand their money while they live through the month, not after they run out of it.

Avoid:

- Hackathon labels.
- Long team intro.

### Slide 2 - Problem

Objective: prove the pain is real and specific.

Headline:

> Students lose control through small daily decisions.

Use 4 short problem cards:

- Food orders and missed meals.
- Travel overcharging in unfamiliar places.
- Subscriptions and recurring leaks.
- Roommate cart splits and repayment confusion.

Speaker note:

> Existing apps treat this like accounting. But student spending is contextual: hostel, mess, exams, travel, roommates, and monthly allowance all affect the same decision.

Avoid:

- Saying “students are bad with money.”
- Generic “financial literacy” language.

### Slide 3 - Product Insight / Novelty

Objective: show why PocketBuddy is different.

Headline:

> The missing layer is not logging. It is timely intervention.

Three blocks:

- Passive capture: Android connector reads supported payment/SMS notifications.
- Student context: allowance, reset date, campus, hostel, meal routine, exam period.
- Action layer: runway, food, travel, pools, wellness nudges.

Speaker note:

> The novelty is combining passive payment signals with campus context. That lets PocketBuddy answer practical questions: can I afford this today, is this fare reasonable, did I skip food, and who still owes the host?

### Slide 4 - Solution Map

Objective: prepare the mentor/jury for the live demo.

Headline:

> One payment stream, five student decisions.

Show a simple map:

`Payment alerts -> PocketBuddy -> Runway | Food | Travel | Pools | Wellness`

Add one line under each:

- Runway: safe daily limit and survival estimate.
- Food: affordable campus options and meal-gap checks.
- Travel: fair-fare range and negotiation script.
- Pools: shared cart and repayment tracking.
- Wellness: exam-period and routine-aware nudges.

Speaker note:

> We are not adding five separate apps. We are using one signal stream to power decisions students already make every day.

### Slide 5 - Live Prototype Demo

Objective: stop presenting and prove it works.

Slide content:

> Live deployed demo

Checklist on slide:

- Onboarding
- Dashboard runway
- Android companion sync
- History and stats
- Pool
- Travel AI coach

Speaker note:

> I’ll switch to the deployed app now and show the product as a student would use it.

Then switch to browser.

### Slide 6 - AWS Architecture

Objective: show technical depth without drowning the panel.

Use the architecture image, but keep it readable.

Short labels beside the diagram:

- CloudFront + S3: HTTPS entry, frontend, APK delivery.
- EC2 + Nginx + FastAPI: product APIs and web workflows.
- API Gateway + Lambda + SQS + DynamoDB: durable mobile notification ingest path.
- MongoDB Atlas: product state, profiles, transactions, pools, travel data.
- Bedrock Nova Lite: contextual AI text for travel and campus nudges.
- CloudWatch: logs and operational visibility.

Speaker note:

> The current deployment keeps the web product stable on FastAPI while isolating mobile notification ingest as an event pipeline. The serverless path gives us buffering, retry, and room to scale phone events independently from the main web app.

Do not say:

- “Everything is fully serverless.”
- “OCR is production-ready.”
- “Amazon Pay is already integrated.”

### Slide 7 - Business And Amazon Opportunity

Objective: show this can become a real product.

Headline:

> From campus pilot to payment ecosystem.

Three business paths:

- Student Plus: smarter recurrence, pool automation, advanced runway planning.
- Campus/hostel pilots: affordability and wellness insights without exposing individual transaction data.
- Amazon Pay Student Mode: responsible spend nudges, shared purchases, campus merchant offers.

Speaker note:

> The first wedge is students because they feel the pain directly. The larger opportunity is payment-context intelligence: helping a customer make a better decision at the moment of spend.

### Slide 8 - Roadmap

Objective: show maturity and focus.

Headline:

> What we harden next.

Use a three-row roadmap:

| Horizon | What | Why |
| --- | --- | --- |
| Before finale | Parser review loop, pool auto-verification polish, demo reliability | Make passive sync trustworthy |
| 0-3 months | Campus pilot, Android Play Store release, DLQ/replay, observability | Reliable adoption |
| 3-6 months | Amazon Pay student-mode proposal, recurrence intelligence, iOS assisted capture | Wider ecosystem |

Speaker note:

> We are not trying to add random features. The roadmap is focused on making passive capture reliable, reducing roommate payment friction, and turning payment context into action.

### Slide 9 - Mentor Ask / Closing

Objective: get useful feedback.

Headline:

> What we want feedback on.

Ask only 4-5 questions:

- Which wedge is strongest for finals: passive sync, pools, travel guard, or Amazon Pay Student Mode?
- What would make this feel like a real Amazon product, not just a hackathon app?
- What should we cut from the final pitch?
- Which technical risk will leadership question first?
- Should our business story lead with students, campuses, or Amazon Pay?

Closing line:

> PocketBuddy helps students spend with context, not regret.

## Live Demo Flow

Keep the demo interactive but controlled.

### Demo Order

1. Landing page.
2. Sign in to the seeded demo account.
3. Open `/onboarding`.
4. Show allowance, reset date, campus, hostel/wing, meal routine, and companion setup.
5. Open dashboard.
6. Show runway, safe daily limit, recent transactions, food/wellness card.
7. Open companion page.
8. Show APK download/config and recent sync activity.
9. Show Android connector ready state.
10. Trigger or show a recent payment sync result.
11. Open history and stats.
12. Open pool active view and completed repayment state.
13. Open travel and run/show AI negotiation coach.
14. Return to dashboard.
15. Switch back to architecture slide.

### Demo Account

Use the seeded account:

- Email: `harkutnishant27@gmail.com`
- Do not type the password on camera.

Before recording or mentor call, verify:

- Login works.
- Dashboard has realistic non-zero income and expenses.
- Runway is not zero unless intentionally showing warning.
- Companion activity has recent rows.
- Pool has one active pool and one completed pool.
- Travel page loads routes.
- Bedrock travel AI returns a response.

### What Not To Demo

- Textract/OCR scanner unless it is working reliably.
- IAM role editing.
- AWS cost pages.
- Raw bank SMS.
- Payment app screen.
- Android Play Protect warning unless asked about APK installation.

## Deployment Readiness Checklist

Run these checks before the mentor call.

### 1. Browser Check

Open:

`https://d3g6cg7q9hn7hi.cloudfront.net/`

Expected:

- Landing page loads.
- Static assets load.
- No blank screen.

### 2. API Check From PowerShell

```powershell
$BASE = "https://d3g6cg7q9hn7hi.cloudfront.net"

Invoke-WebRequest "$BASE/api/campus-food" -UseBasicParsing
```

Expected:

- HTTP 200.
- JSON campus food data.

Then check a protected API route:

```powershell
$body = @{ email = "wrong@example.com"; password = "wrong" } | ConvertTo-Json

try {
  Invoke-WebRequest -Method Post `
    -Uri "$BASE/api/auth/login" `
    -ContentType "application/json" `
    -Body $body `
    -UseBasicParsing
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Expected:

- `401`, meaning the backend is reachable and rejected invalid credentials correctly.

### 3. EC2 Check

Direct EC2 public IP may be blocked or unavailable depending on security group rules. That is acceptable if CloudFront is the public entry.

The required production path is:

`Browser / Android -> CloudFront -> /api/* -> EC2 Nginx/FastAPI`

If CloudFront works, do not panic because `http://3.108.58.80` times out.

### 4. Backend On EC2

SSH/EC2 Instance Connect, then run:

```bash
cd /home/ubuntu/PocketBuddy
git log -1 --oneline
sudo systemctl status pocketbuddy-backend --no-pager
sudo journalctl -u pocketbuddy-backend --since "10 minutes ago" --no-pager
```

Expected:

- Backend service is active.
- Latest commit is the one you expect.
- No repeated Python exceptions.

### 5. Nginx Check On EC2

```bash
curl -i http://127.0.0.1/api/campus-food
curl -i http://127.0.0.1/
sudo nginx -t
```

Expected:

- `/api/campus-food` returns JSON.
- `/` returns frontend HTML if EC2 is serving fallback, or Nginx is configured as expected.
- `nginx -t` passes.

### 6. CloudFront Behavior Check

In CloudFront distribution `E39IGIZXM49Y9N`:

- Default behavior `*` -> S3 origin.
- `/api/*` behavior -> EC2 API origin.
- `/api/*` allowed methods: `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`.
- `/api/*` cache policy: `CachingDisabled`.
- `/api/*` origin request policy: `AllViewerExceptHostHeader`.

After any change:

- Save distribution.
- Wait until deployment finishes.
- Create invalidation for `/*` or at least `/api/*`.

## If The Deployed Link Looks Broken

Use this sequence. Do not guess.

1. Check if root loads:
   - `https://d3g6cg7q9hn7hi.cloudfront.net/`

2. Check if static assets are stale:
   - Hard refresh browser.
   - Open incognito.
   - Create CloudFront invalidation `/*`.

3. Check if API is broken:
   - Run `/api/campus-food`.
   - Run invalid login test.

4. If root works but login/API fails:
   - Check EC2 is running.
   - Check backend systemd service.
   - Check Nginx.
   - Check CloudFront `/api/*` behavior.

5. If Android sync fails:
   - Confirm companion page config has the same user ID and pairing token as the Android app.
   - Use CloudFront webhook URL, not raw EC2 IP:
     `https://d3g6cg7q9hn7hi.cloudfront.net/api/ingest/notification`
   - Send a controlled test POST.
   - Check Companion activity.

## Mentor Session Flow

Use this sequence tomorrow:

1. 60 seconds: problem statement interpretation.
2. 60 seconds: PocketBuddy thesis and novelty.
3. 6 minutes: live demo.
4. 90 seconds: architecture.
5. 60 seconds: business/Amazon fit.
6. Remaining time: mentor questions.

Do not let the mentor session become a feature tour. Keep asking:

> Which part of this should be the strongest finale story?

## Final Deck Export Checklist

- PPTX version saved.
- PDF version exported.
- Logo visible on title/footer.
- Live URL included.
- Architecture diagram readable at 100% zoom.
- No secrets in screenshots.
- No overclaiming Amazon Pay integration as already live.
- No screenshots of broken OCR/Textract.
- Slide count under 10.
- Can present without reading paragraphs.

## Best Final Story

If you need one clean story for the whole presentation:

> PocketBuddy starts with Android because that is where passive payment signals are available today. It turns those signals into student decisions across allowance, meals, travel, shared orders, and wellness. The larger Amazon opportunity is to make this intelligence part of the payment experience itself, especially for student customers using products like Amazon Pay.
