# HackOn with Amazon

## A Universe of Opportunity

## 48-Hour Hackathon | Solution Document

### Team Name

PocketBuddy

### Hackathon Theme

AI for Campus, Community & Everyday Life

### Date

15 June 2026

### Team Members

| Name | College / University | Contribution |
| --- | --- | --- |
| Nishant Harkut | ABV-IIITM Gwalior | Product, Android, AWS, deployment, demo recording |
| Kanika Singhal | ABV-IIITM Gwalior | Frontend, backend flows, UI polish, product validation |

## 1. Problem Statement & Relevance

> Jury focus: innovativeness, theme alignment, and degree of disruption.

### The Problem

Students living away from home rarely lose control of money through one big purchase. It usually happens through small, repeated decisions: a late-night snack, a shared delivery cart, a local travel quote, a subscription renewal, or a skipped meal during exams because the month is already tight.

The problem is that these signals are scattered. Payment alerts live on the phone, roommate payments live in chats, food choices live in canteen menus, travel fares live in local memory, and wellness signals are usually noticed only after the student is already stressed.

### Why It Matters

The affected user is a residential student on a fixed allowance, stipend, scholarship, or family transfer. This is a large and repeatable problem across campuses because millions of students live independently for the first time with limited budgets and high daily decision pressure.

The payment behavior has already moved to digital rails. In May 2026, UPI processed 23.2 billion transactions worth Rs 29.90 lakh crore. RBI-reported payments data also shows UPI carrying about 85.5% of India's payment transaction volume in the second half of CY2025. For student life, this means the spending trail already exists on the phone; the missing product layer is automated interpretation.

The student base is also large enough for this to matter beyond one campus. India's higher-education enrolment reached about 4.46 crore students in 2022-23. Even if a small fraction of residential students face monthly allowance pressure, shared-cart friction, local travel overcharging, or meal-skipping during exams, the problem is still campus-scale and repeatable.

The cost of inaction is practical:

- students run out of safe daily spending before allowance reset;
- small transactions are forgotten or double-counted;
- roommate repayments create awkward follow-ups;
- new students overpay for local travel because they do not know fair fares;
- students may delay meals during exam weeks to compensate for overspending;
- subscriptions and low-value recurring payments quietly reduce runway.

Traditional expense trackers ask students to behave like accountants. That assumption fails on campus. A busy student will not manually log every tea, bus ride, canteen meal, and shared delivery. The real need is a system that watches permitted payment signals, understands the campus context, and turns them into timely decisions.

### Theme Alignment

The theme asks for AI that improves campus, community, and everyday life. PocketBuddy is built exactly around that daily campus loop:

- everyday payments become budget runway;
- food gaps become meal check-ins;
- local fare reports become travel negotiation guidance;
- shared hostel purchases become verified pool flows;
- exam timing changes the tone and urgency of wellness nudges.

The AI is not presented as a generic chatbot. It is attached to concrete campus workflows where context matters.

### What Makes This Novel

PocketBuddy's novelty is the automation-first loop. The product does not start with a blank expense form. It starts from the student's actual payment notifications, then layers campus context over them: hostel, mess routine, shared pools, local fare ranges, subscription habits, and exam timing.

The core loop is:

```text
Payment signal
  -> normalized transaction
  -> campus context
  -> practical student action
```

Existing products usually solve one slice: budgeting, food ordering, rides, subscriptions, or wellness. PocketBuddy connects them at the point where the student actually makes decisions. This makes the product disruptive because it turns scattered student-life signals into a campus-aware guardrail.

The practical difference is time. A student does not waste precious time maintaining a ledger. PocketBuddy turns everyday signals into actions: reduce today's spend, join a pool, eat before the food gap becomes too long, negotiate a fair ride, or verify a roommate repayment.

## 2. Customer & Solution

> Jury focus: clarity of presentation and quality of implementation as a working prototype.

### Target Customer

The primary user is a college student living in a hostel, dorm, PG, or shared room. They receive a monthly allowance or stipend, spend digitally, coordinate with roommates, and make food/travel decisions under time pressure.

They need:

- low-friction tracking;
- early warning before money becomes unsafe;
- shared-expense workflows that match hostel life;
- practical guidance for food, travel, subscriptions, and wellness.

### How We Solve It

PocketBuddy is a campus financial guard. It connects a student's Android phone, reads supported payment and SMS notifications after permission, and turns those events into runway, insights, and actions in the web app.

Key features:

1. **Passive Android Payment Sync**
   The student pairs the phone once. After that, supported UPI/SMS alerts flow into PocketBuddy without manual logging. The system parses amount, merchant, direction, and transaction reference, masks sensitive text, and deduplicates duplicate app/SMS alerts.

2. **Runway Dashboard**
   The dashboard answers the question students actually care about: "Can I last until reset?" It shows remaining allowance, safe daily limit, recent synced payments, category trends, and exportable history.

3. **Food & Wellness Guardrail**
   PocketBuddy links spending and routine. If no food transaction appears for a long stretch, especially during exam context, it can ask whether the student ate in mess, cooked, ordered, or skipped. Bedrock/Nova Lite powers contextual campus nudges where enabled.

4. **Wing Cart Pooler**
   Students create shared cart pools for a room or wing, add items, track progress, share the pool, and verify repayments. Incoming credit notifications can auto-verify pending UTR-based repayments when the host receives money.

5. **Travel Fare Guard**
   Students compare a driver quote with expected local fare ranges and receive a practical negotiation script. This protects first-year students, visitors, and anyone entering an unfamiliar campus city.

6. **Campus Intelligence Layer**
   Defaults exist for demo readiness, but the platform is not limited to one campus. Food menus, travel routes, categories, cart platforms, and payment providers are designed as configurable data, not hardcoded product boundaries.

### User Workflow

Paste this into Eraser's diagram-as-code editor for the PRD user-flow visual:

```eraser
direction: down

Student [icon: user, color: blue]
Student Context [icon: clipboard, color: blue]
Phone Pairing [icon: smartphone, color: blue]
Payment Signal [icon: bell, color: orange]
Normalization [icon: filter, color: orange]
Decision Surface [icon: monitor, color: green]
Student Action [icon: check-circle, color: green]

Student > Student Context: allowance, reset date, campus, hostel, meals, exams
Student Context > Phone Pairing: download APK and paste connector config
Phone Pairing > Payment Signal: notification access captures supported UPI/SMS alerts
Payment Signal > Normalization: parse amount, merchant, direction, UTR, source
Normalization > Decision Surface: dashboard, history, pools, travel, food, wellness
Decision Surface > Student Action: spend less, join pool, choose meal, negotiate fare
```

### Working Prototype

Live deployment: https://d3g6cg7q9hn7hi.cloudfront.net/

Android APK: https://d3g6cg7q9hn7hi.cloudfront.net/downloads/PocketBuddy-Connector-v0.1.0.apk

Repository: https://github.com/nishantharkut/PocketBuddy

### Working Prototype Evidence

| Capability | Current status | How it appears in demo |
| --- | --- | --- |
| Web app, onboarding, dashboard, history, stats, pools, travel | Live in production behind CloudFront. | Main desktop walkthrough. |
| Android companion sync | Live for supported Android notification/SMS alerts after notification access is granted. | Phone-to-web payment sync proof. |
| Bedrock/Nova Lite guidance | Enabled for contextual text such as travel negotiation and campus nudges. | Travel coach and campus intelligence. |
| Wing cart repayment verification | Working with manual UTR flow and incoming-credit matching where the host receives a repayment notification. | Completed pool and repayment state. |
| Serverless ingest lane | Built and verified with API Gateway, Lambda, SQS, and DynamoDB as the scalable mobile-ingest path. | Architecture/scaling proof for high-volume Android events. |
| Photo menu OCR scanner | Backend pathway exists for turning menu photos into campus food catalog entries. Curated campus catalogs remain the default reliable data path. | Optional accelerator for campus food intelligence. |

Screenshots to insert in final PDF:

- Dashboard with allowance, safe daily limit, and recent sync activity.
- Companion Device page with Android setup and sync logs.
- Pool host view plus roommate/link flow.
- Travel Fare Guard with quote comparison and AI script.

Demo: Upload the final MP4 directly in the portal.

## 3. Tech Architecture & Scaling

> Jury focus: architecture complexity, algorithmic choices, API quality, and scalability.

### Architecture

Paste this into Eraser's diagram-as-code editor for the PRD architecture visual:

```eraser
direction: down

Clients [color: blue] {
  Student Browser [icon: monitor]
  Android Connector [icon: smartphone]
}

AWS Edge [color: orange] {
  Amazon CloudFront [icon: aws-cloudfront]
  Amazon S3 [icon: aws-s3]
  API Gateway [icon: aws-api-gateway]
}

Product Backend [color: green] {
  Nginx on EC2 [icon: aws-ec2]
  FastAPI App [icon: python]
  MongoDB Atlas [icon: database]
  Amazon Bedrock Nova Lite [icon: brain]
}

Serverless Ingest [color: purple] {
  Lambda Ingest [icon: aws-lambda]
  Amazon SQS [icon: aws-sqs]
  Lambda Processor [icon: aws-lambda]
  DynamoDB Ledger [icon: aws-dynamodb]
}

Operations [color: gray] {
  CloudWatch Logs [icon: aws-cloudwatch]
  AWS Budgets [icon: wallet]
}

Student Browser > Amazon CloudFront: HTTPS web app
Amazon CloudFront > Amazon S3: React build and APK
Amazon CloudFront > Nginx on EC2: /api/* product routes
Nginx on EC2 > FastAPI App: reverse proxy
FastAPI App > MongoDB Atlas: profiles, transactions, pools, travel, catalogs
FastAPI App > Amazon Bedrock Nova Lite: AI campus guidance

Android Connector > Amazon CloudFront: mobile webhook
Amazon CloudFront > API Gateway: /api/ingest/notification
API Gateway > Lambda Ingest: validate event
Lambda Ingest > Amazon SQS: durable queue
Amazon SQS > Lambda Processor: batch size 1
Lambda Processor > DynamoDB Ledger: normalized event

FastAPI App > CloudWatch Logs: backend logs
Lambda Ingest > CloudWatch Logs: ingest logs
Lambda Processor > CloudWatch Logs: processor logs
AWS Budgets > Operations: cost guardrail
```

Export the Eraser diagrams as PNG/SVG and insert them into the final PDF in place of these code blocks.

### Tech Stack

| Layer | Technology | Why |
| --- | --- | --- |
| Frontend | React, Vite, TypeScript, TanStack Router, TanStack Query, Tailwind CSS | Gives a fast, typed, mobile-responsive product surface. TanStack Query is important because synced phone events can refresh dashboard/history views without turning the app into a static mockup. |
| Backend | Python, FastAPI, Pydantic, Motor/PyMongo | FastAPI gives strict request contracts for auth, transactions, pools, travel, food, and ingest. Motor/PyMongo keeps MongoDB operations flexible for evolving campus data. |
| Android | Kotlin, NotificationListenerService, OkHttp | Android notification access is the only practical way to reduce manual ledger entry. OkHttp keeps delivery simple and reliable from the companion app to the webhook. |
| Data/ML | MongoDB Atlas, DynamoDB, Amazon Bedrock Nova Lite | MongoDB Atlas stores user lifecycle data, profiles, transactions, pools, travel, and catalogs. DynamoDB is the append-style ledger for serverless ingest. Bedrock Nova Lite generates contextual travel and campus guidance without hosting a model. |
| Infra | CloudFront, S3, EC2, Nginx, API Gateway, Lambda, SQS, CloudWatch | CloudFront creates one public entrypoint. S3 serves the frontend and APK. EC2/Nginx keeps the core product backend stable. API Gateway/Lambda/SQS isolate bursty phone ingest from the main backend. CloudWatch makes the demo observable. |
| OCR pathway | Amazon Textract integration point | Optional menu-scanning path for faster campus catalog onboarding. The product's food intelligence also works from curated campus data, so OCR is an expansion accelerator, not a core dependency. |
| Retrieval approach | Structured retrieval plus Bedrock context packing on MongoDB Atlas data | The current prototype retrieves scoped campus/profile data and packs it into bounded Bedrock prompts. The same Atlas data model can later support Vector Search for semantic campus memory without changing the product model. |

### Key Algorithms & Complexity

1. **Passive notification normalization**
   Raw payment/SMS notifications are converted into a normalized event:

   ```text
   {amount, currency, direction, merchant, source, transaction_reference, confidence}
   ```

   The parser uses strong signals first: debit/credit words, UPI/SMS phrases, rupee amounts, UTR/reference numbers, and merchant tokens. If a field is weak, the event is still logged with lower confidence instead of being silently dropped. This is important for a campus product because students should not lose events just because one bank uses a different SMS format.

   Complexity: O(n) over notification text length, where n is small. In practice this behaves as constant time per phone alert.

2. **Duplicate-event suppression**
   One real payment can generate both a payment-app notification and a bank SMS. PocketBuddy avoids double-counting by using a layered identity strategy:

   ```text
   primary key: transaction_reference / UTR
   fallback key: amount + direction + merchant + bounded time window
   ```

   Complexity: O(1) for fingerprint creation plus an indexed bounded-window lookup. This keeps ingest cheap even when many phones sync at the same time.

3. **Privacy-preserving sync logging**
   Notification previews are masked before storage. Long digit sequences, links, transaction references, and sensitive fragments are replaced with placeholders. This keeps logs useful without storing raw personal payment alerts.

   Design choice: store enough context to explain and build trust, but not raw private bank messages.

4. **Runway and safe-spend calculation**
   The dashboard computes the student's monthly state:

   ```text
   remaining_allowance = monthly_allowance + income - expenses
   days_left = reset_date - today
   safe_daily_spend = remaining_allowance / max(days_left, 1)
   ```

   Complexity: O(t) over transactions in the current cycle, with normal database indexing by user and date. The algorithm is intentionally explainable: students can trust the number because it maps directly to their allowance cycle.

5. **Food-gap and exam-context wellness state**
   PocketBuddy treats wellness as a practical state machine, not a diagnosis. Signals include:

   ```text
   last_food_transaction_age
   meal schedule
   exam window
   spend velocity
   recent late-night food/travel behavior
   ```

   Example: if there is no food transaction for 16-17 hours during an exam window, the product can ask whether the student ate in mess, cooked, ordered, or skipped. This avoids a false assumption that "no payment" always means "no meal."

   Complexity: O(1) after fetching the user's recent bounded transaction window.

6. **Cart pool payment verification**
   Pools maintain item-level contributions, participant states, UTR submissions, and host verification. Incoming credit notifications are matched against pending pool repayments using:

   ```text
   amount + direction=credit + payer alias/merchant text + UTR/reference + pool pending state
   ```

   Complexity: O(k) over a small set of pending repayments for the host, or O(log k) with an indexed pending-payment lookup. This is a high-value campus workflow because it reduces awkward manual follow-ups after shared orders.

7. **Travel overcharge coefficient**
   Travel guidance compares a quoted fare to a route median:

   ```text
   overcharge_factor = quoted_fare / community_median_fare
   ```

   This powers warnings, expected ranges, and negotiation copy. It is simple enough to explain to a first-year student while still capturing the core problem: uncertainty in a new city creates overpayment risk.

8. **Bounded Bedrock context packing**
   Bedrock/Nova Lite is used only after PocketBuddy selects the relevant context: route, quote, campus fare range, runway, food options, meal gap, and exam state. The model is not asked to inspect the whole database.

   ```text
   selected_context -> concise prompt -> short action message
   ```

   Complexity: O(c) where c is the bounded context size. This controls cost, latency, and privacy while making the AI output grounded in actual product data.

9. **Catalog expansion path**
   The food catalog and travel routes use defaults for demo readiness, but they are not product limits. The long-term path is moderated campus data: users and admins add colleges, routes, canteens, payment providers, cart platforms, and category rules without changing application code.

10. **Menu OCR boundary**
   A photo-menu scanner was implemented as a candidate ingestion path for campus menu onboarding. The product does not depend on OCR for the final demo because campus food intelligence also works from curated/catalog data. This keeps the core user flow stable while leaving menu photo ingestion as an expansion path.

### Scaling Strategy

PocketBuddy separates high-volume notification ingest from the main product backend.

- CloudFront and S3 scale the frontend globally.
- API Gateway and Lambda accept mobile ingest events without tying them to the EC2 backend.
- SQS absorbs bursts from many Android devices and protects downstream processors.
- DynamoDB stores append-style ingest events with serverless scaling.
- FastAPI can later move from EC2 to ECS/Fargate or Lambda without changing client contracts.
- Catalogs are defaults, not hard limits: colleges, payment providers, transaction categories, travel routes, and cart platforms can be extended.

At 100x-1000x growth, the ingest path remains event-driven, while product APIs can be horizontally scaled behind a load balancer or moved to managed containers.

## 4. Future Vision

> Jury focus: long-term thinking, multi-segment expansion, and value impact.

### Where This Goes

In 1-3 years, PocketBuddy can become a campus affordability layer: a privacy-first system that helps students understand money, food, travel, shared purchases, subscriptions, and routine stress before problems become urgent.

The vision is not to build another expense dashboard. The vision is to reduce the number of bad last-mile decisions students make because they lack context.

### Roadmap

| Horizon | Milestone | Impact |
| --- | --- | --- |
| 0-3 mo | Harden Android parser coverage, improve onboarding, add parser feedback review, and create reliable campus seed/admin tools. | More accurate passive tracking and smoother first-run setup. |
| 3-6 mo | Expand food menus, travel routes, cart pool templates, subscription detection, and community reporting across multiple campuses. | More campus-specific intelligence without central manual data entry. |
| 6-12 mo | Add moderation dashboards, privacy-preserving aggregate insights, and stronger repayment automation. | Safer multi-campus operation and more reliable shared-expense workflows. |
| 1-3 yr | Build verified campus affordability networks for food, travel, student services, and shared purchases. | Better financial resilience for students and useful affordability signals for institutions. |

### Multi-Segment Expansion

PocketBuddy starts with residential students, but the same model can expand to:

- first-year students moving to new cities;
- exchange students and campus visitors;
- PG and coaching-hostel communities;
- early-career workers in shared housing;
- stipend, scholarship, and fellowship programs;
- universities that want anonymized affordability and wellness indicators.

The expansion path is campus-by-campus: seed default data, allow community reporting, moderate the catalog, and grow local intelligence over time.

### Revenue Model

PocketBuddy can make money without selling raw student payment data.

| Revenue line | Buyer | What they pay for | Why it is realistic |
| --- | --- | --- | --- |
| Student premium | Individual students | Advanced insights, longer history, smarter subscription detection, custom alerts, exports, and multi-device sync. | Students already pay for small monthly digital services. A low-cost plan in the Rs 49-99/month range is realistic only after the free product proves savings. |
| Campus/hostel license | Colleges, hostels, student welfare bodies | Privacy-preserving affordability dashboards, moderated campus catalogs, route/fare guardrails, and student check-in workflows. | Institutions benefit when students have fewer money-stress and basic-routine issues during exam periods. |
| Verified local offers | Campus vendors and student services | Opt-in, relevant offers such as meal combos, stationery, laundry, or travel partners. | This works only if offers reduce student cost and remain clearly separated from financial advice. |
| Partner integrations | Fintech, banking, scholarship, and student-benefit programs | Consent-based integrations for allowance, scholarship, and student-benefit workflows. | The platform already has the student context layer; partners can reduce friction without owning the whole experience. |

The first monetization path should be campus pilots plus student premium. Advertising should not be the core model because trust is the product.

### Value Impact

PocketBuddy's impact should be measured by outcomes students can feel:

- extra runway days gained per month;
- duplicate payment alerts ignored safely;
- delivery/cart-pooling fees saved;
- verified repayments without awkward follow-ups;
- fare overpayments avoided;
- subscriptions reviewed before renewal;
- meal-gap check-ins completed during exam periods.

At scale, even small savings compound. A few avoided overcharges, duplicate counts, or unnecessary delivery fees per student per month becomes meaningful across a campus. The larger impact is cognitive relief: students should understand the month without maintaining a spreadsheet.

### Links

- GitHub: https://github.com/nishantharkut/PocketBuddy
- Live app: https://d3g6cg7q9hn7hi.cloudfront.net/
- Android APK: https://d3g6cg7q9hn7hi.cloudfront.net/downloads/PocketBuddy-Connector-v0.1.0.apk
- Demo video: uploaded as MP4 in the submission portal.

### Source Notes For Market Context

- NPCI UPI product statistics: https://www.npci.org.in/what-we-do/upi/product-statistics
- UPI May 2026 transaction volume and value report: https://m.economictimes.com/tech/technology/upi-processes-rs-29-9-lakh-crore-in-may-transaction-volumes-hit-23-2-billion/articleshow/131439222.cms
- RBI payments report coverage on UPI's volume share: https://m.economictimes.com/industry/banking/finance/upi-processes-85-of-indias-payment-volumes-but-just-9-5-of-value-rtgs-dominates-at-68-6/articleshow/131179619.cms
- Higher-education enrolment context: https://timesofindia.indiatimes.com/city/bhubaneswar/indias-education-system-transformed-in-last-few-years-min/articleshow/123210126.cms
