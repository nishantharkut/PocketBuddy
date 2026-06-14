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

### The Problem

Students living away from home rarely lose control of money through one big purchase. It usually happens through small, repeated decisions: a late-night snack, a shared delivery cart, a local travel quote, a subscription renewal, or a skipped meal during exams because the month is already tight.

The problem is that these signals are scattered. Payment alerts live on the phone, roommate payments live in chats, food choices live in canteen menus, travel fares live in local memory, and wellness signals are usually noticed only after the student is already stressed.

### Why It Matters

The affected user is a residential student on a fixed allowance, stipend, scholarship, or family transfer. This is a large and repeatable problem across campuses because millions of students live independently for the first time with limited budgets and high daily decision pressure.

The cost of inaction is practical:

- students run out of safe daily spending before allowance reset;
- small transactions are forgotten or double-counted;
- roommate repayments create awkward follow-ups;
- new students overpay for local travel because they do not know fair fares;
- students may delay meals during exam weeks to compensate for overspending;
- subscriptions and low-value recurring payments quietly reduce runway.

Traditional expense trackers ask students to behave like accountants. That assumption fails on campus, where the problem is not just record keeping. The real need is timely decision support.

### Theme Alignment

The theme asks for AI that improves campus, community, and everyday life. PocketBuddy is built exactly around that daily campus loop:

- everyday payments become budget runway;
- food gaps become meal check-ins;
- local fare reports become travel negotiation guidance;
- shared hostel purchases become verified pool flows;
- exam timing changes the tone and urgency of wellness nudges.

The AI is not presented as a generic chatbot. It is attached to concrete campus workflows where context matters.

### What Makes This Novel

PocketBuddy's insight is that student money management should start from passive payment signals and campus context, not from manual data entry.

The core loop is:

```text
Payment signal
  -> normalized transaction
  -> campus context
  -> practical student action
```

Existing products usually solve one slice: budgeting, food ordering, rides, subscriptions, or wellness. PocketBuddy connects them at the point where the student actually makes decisions. This makes the product disruptive because it turns scattered student-life signals into a campus-aware guardrail.

## 2. Customer & Solution

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
   The Android companion captures supported payment/SMS notifications, parses amount, merchant, direction, and transaction reference, then syncs them to PocketBuddy. The backend masks sensitive text and deduplicates duplicate payment-app/SMS alerts.

2. **Runway Dashboard**
   The dashboard answers the question students actually care about: "Can I last until reset?" It shows allowance, spend, safe daily limit, recent activity, category trends, and exportable history.

3. **Food & Wellness Guardrail**
   PocketBuddy links spending and routine. If no food transaction appears for a long stretch during exam context, it can ask whether the student ate in mess, cooked, ordered, or skipped. Bedrock/Nova Lite powers contextual campus messages where enabled.

4. **Wing Cart Pooler**
   Students can create shared cart pools for a room or wing, add items, track progress, share the pool, and verify repayments. Incoming credit notifications can also auto-verify pending UTR-based repayments.

5. **Travel Fare Guard**
   Students can compare a driver quote with expected local fare ranges and receive a practical negotiation script. This is designed for first-year students, visitors, and students entering unfamiliar campus cities.

### User Workflow

Paste this into Eraser's diagram-as-code editor for the PRD user-flow visual:

```eraser
direction: right

Student [icon: user]
Onboarding [icon: clipboard, color: blue]
Companion Setup [icon: smartphone, color: blue]
Passive Sync [icon: bell, color: orange]
PocketBuddy Web [icon: monitor, color: green]
Student Action [icon: check-circle, color: green]

Student > Onboarding: allowance, reset date, college, hostel, mess, exams
Onboarding > Companion Setup: download APK and paste connector config
Companion Setup > Passive Sync: grant notification access
Passive Sync > PocketBuddy Web: payment alerts become transactions
PocketBuddy Web > Student Action: runway, pools, food, travel, wellness

Student Action > Student: spend less, join pool, choose meal, negotiate fare
```

### Working Prototype

Live deployment: https://d3g6cg7q9hn7hi.cloudfront.net/

Android APK: https://d3g6cg7q9hn7hi.cloudfront.net/downloads/PocketBuddy-Connector-v0.1.0.apk

Repository: https://github.com/nishantharkut/PocketBuddy

Screenshots to insert in final PDF:

- Dashboard with allowance, safe daily limit, and recent sync activity.
- Companion Device page with Android setup and sync logs.
- Pool host view plus roommate/link flow.
- Travel Fare Guard with quote comparison and AI script.

Demo: Upload the final MP4 directly in the portal.

## 3. Tech Architecture & Scaling

### Architecture

Paste this into Eraser's diagram-as-code editor for the PRD architecture visual:

```eraser
direction: right

Student Browser [icon: monitor, color: blue]
Android Connector [icon: smartphone, color: blue]

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

Student Browser > Amazon CloudFront: HTTPS web app and API calls
Amazon CloudFront > Amazon S3: static React build and APK download
Amazon CloudFront > Nginx on EC2: /api product routes
Nginx on EC2 > FastAPI App: reverse proxy
FastAPI App > MongoDB Atlas: profiles, transactions, pools, travel, catalogs
FastAPI App > Amazon Bedrock Nova Lite: travel coach and campus nudges

Android Connector > Amazon CloudFront: /api/ingest/notification
Amazon CloudFront > API Gateway: mobile webhook behavior
API Gateway > Lambda Ingest: validate and enqueue event
Lambda Ingest > Amazon SQS: durable buffer
Amazon SQS > Lambda Processor: one event per batch
Lambda Processor > DynamoDB Ledger: normalized ingest event

FastAPI App > CloudWatch Logs: backend logs
Lambda Ingest > CloudWatch Logs: ingest logs
Lambda Processor > CloudWatch Logs: processor logs
AWS Budgets > Operations: cost guardrail
```

Export the Eraser diagrams as PNG/SVG and insert them into the final PDF in place of these code blocks.

### Tech Stack

| Layer | Technology | Why |
| --- | --- | --- |
| Frontend | React, Vite, TypeScript, TanStack Router, TanStack Query, Tailwind CSS | Fast interactive web app with typed routes, API caching, and responsive desktop/mobile screens. |
| Backend | Python, FastAPI, Pydantic, Motor/PyMongo | Async APIs, validation, and flexible MongoDB integration. |
| Android | Kotlin, NotificationListenerService, OkHttp | Native notification access and reliable webhook delivery. |
| Data/ML | MongoDB Atlas, DynamoDB, Amazon Bedrock Nova Lite | MongoDB for product data, DynamoDB for serverless ingest ledger, Bedrock for contextual guidance. |
| Infra | CloudFront, S3, EC2, Nginx, API Gateway, Lambda, SQS, CloudWatch | CDN delivery, stable backend, scalable mobile ingest, and operational visibility. |

### Key Algorithms & Complexity

1. **Notification parsing and deduplication**
   Payment alerts can arrive from both SMS and a payment app. PocketBuddy first uses transaction reference/UTR where present, then falls back to a short-window match on amount, merchant, direction, and timestamp.

   Expected complexity per event is constant time against a bounded recent-window query. This is important because notification ingest must stay fast on mobile and cloud.

2. **Privacy-preserving sync logging**
   Notification previews are masked before storage. Long digit sequences, links, transaction references, and sensitive fragments are replaced with placeholders. This keeps logs useful without storing raw personal payment alerts.

3. **Runway calculation**
   The dashboard computes remaining allowance and safe daily spend:

   ```text
   safe_daily_spend = remaining_allowance / days_left_in_cycle
   ```

   This is intentionally simple because the user decision must be immediate and understandable.

4. **Wellness signal scoring**
   PocketBuddy combines food gaps, late-night spend, spend velocity, exam period, and social/cart signals. It does not diagnose health. It produces practical nudges, such as asking whether dinner happened in mess after a long food gap.

5. **Cart pool verification**
   Pools track items, expected participant amounts, UTR submissions, and host verification. Matching incoming credit notifications can mark a pending payment as verified.

6. **Travel overcharge coefficient**
   Travel guidance compares a quoted fare to a route median:

   ```text
   overcharge_factor = quoted_fare / community_median_fare
   ```

   This powers warnings, expected ranges, and negotiation copy.

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

Links: GitHub https://github.com/nishantharkut/PocketBuddy | Demo Video [Uploaded MP4 in portal] | Live App https://d3g6cg7q9hn7hi.cloudfront.net/
