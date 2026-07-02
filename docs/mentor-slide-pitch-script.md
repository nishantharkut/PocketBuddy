# PocketBuddy Mentor Pitch Script

Use this for the mentorship session deck. Keep it conversational. Do not read it word-for-word.

Goal: set up the problem and product clearly, hand over to the live demo, then close with architecture and specific questions for the mentor.

## Timing

- Slides 1-4: 3 to 4 minutes total.
- Slide 5: hand over to live demo.
- Slide 6: 90 seconds after demo.
- Mentor questions: remaining time.

## Slide 1 - PocketBuddy

**What to say**

> Hi, we are Team Bad Luck, and this is PocketBuddy.
>
> The problem statement is about students struggling with money, food, travel, routine, and emotional well-being together. We did not interpret it as just an expense-tracking problem.
>
> PocketBuddy is an AI companion for student life. It uses payment activity and student context to help students understand what is safe before they spend, what changed after they spend, and what action they should take next.

**Keep it crisp**

- Do not explain every feature here.
- Do not say "expense tracker."
- Do not mention Amazon Pay yet.

## Slide 2 - Problem Statement

**What to say**

> The core problem is fragmentation.
>
> A student does not experience finance, food, travel, academics, sleep, and stress as separate problems. They happen together in the same month, often in the same day.
>
> Small decisions compound silently: skipped meals, late-night food orders, subscriptions, travel overcharges, and shared room purchases.
>
> Existing tools are split. Finance apps track money. Fitness apps track routine. Productivity apps track tasks. But none of them understand student living as one connected context.

**Point to make**

> That connected context is what we are solving for.

**Avoid**

- Do not introduce PocketBuddy's solution on this slide.
- Do not make it sound like students are careless. The issue is lack of timely context.

## Slide 3 - Product Insight / Novelty

**What to say**

> Our product insight is simple: students should not have to manually log everything for an assistant to help them.
>
> PocketBuddy starts with passive capture. The Android connector reads supported payment and SMS notifications, so the student does not have to type every transaction.
>
> Then we add student context: allowance cycle, campus, hostel, meal routine, and exam period.
>
> Once those two layers are connected, the product can move from tracking to intervention: runway, meal gaps, travel fares, shared pools, and wellness nudges.

**Strong line**

> The novelty is not one feature. It is connecting passive payment signals with student-life context.

## Slide 4 - Solution Map

**What to say**

> This is the product map.
>
> On the left, payment alerts come from the Android connector. They become the signal stream for PocketBuddy.
>
> The web app then turns that stream into five decisions students actually make:
>
> Runway: how long the month can continue safely.
>
> Food: affordable campus options and meal-gap checks.
>
> Travel: fair fare ranges and negotiation help.
>
> Pools: shared cart purchases and repayment tracking.
>
> Wellness: exam-period and routine-aware nudges.

**Strong line**

> We are not building five separate tools. We are using one student-life signal stream to support five daily decisions.

## Slide 5 - Live Prototype Demo

**What to say before handover**

> I will now hand over to Kanika for the live deployed demo.
>
> She will show the flow from onboarding to dashboard, companion sync, transaction history, shared pools, travel guardrails, and wellness or food intelligence.
>
> The purpose of the demo is to show that PocketBuddy is not just a dashboard. It reacts to student context and turns payment activity into useful decisions.

**Do not say**

- Do not promise every feature is production-complete.
- Do not mention OCR unless it is working and planned for the demo.

## Slide 6 - AWS Architecture

Use this after the demo.

**What to say**

> I will quickly cover the architecture behind the prototype.
>
> The frontend is served through CloudFront with S3 for static assets and APK delivery.
>
> The product APIs currently run on FastAPI behind Nginx on EC2. This keeps the main web experience stable for the demo.
>
> Mobile notification ingest is separated as an event path: API Gateway, Lambda, SQS, processor Lambda, and DynamoDB. That gives us buffering and lets phone-event processing scale independently from the web app.
>
> MongoDB Atlas stores product data such as profiles, transactions, pools, and travel data. Bedrock Nova Lite powers contextual AI responses for travel and student nudges. CloudWatch gives us logs and operational visibility.

**Strong line**

> The key architecture decision is separation: the web product serves the student experience, while payment events are handled as a durable event pipeline.

**If asked about future hardening**

> The next hardening steps are DLQ and replay for failed ingest events, stronger parser review for unsupported notification formats, and moving the main backend from single EC2 to a managed container path such as ECS/Fargate when we scale beyond the demo.

## Mentor Questions

Ask these after the demo and architecture. Do not ask vague "any feedback?" questions.

1. Which part feels strongest for the final story: passive sync, runway/wellness, shared pools, or travel guardrails?
2. Does the Amazon Pay Student Mode direction make the product stronger for finals, or should we keep the story focused on campus life first?
3. What should we cut or downplay from the final pitch?
4. What technical risk would an Amazon leadership panel question first?
5. What would make this feel like a real product students would actually adopt?

## Short Backup Pitch

Use this if time is tight:

> PocketBuddy is an AI companion for student money, food, travel, and wellness. It starts with passive Android payment sync, adds student context like allowance, campus, meals, hostel, and exams, then turns that into practical decisions: safe spend runway, meal-gap checks, fair travel fares, shared cart pools, and wellness nudges.

## What Not To Say

- "This is an expense tracker."
- "We have already integrated Amazon Pay."
- "AI solves student wellness."
- "Everything is fully production-ready."
- "We read all notifications." Say supported payment and SMS notifications.
- "This works the same on iOS." Android enables passive capture; iOS would need assisted capture or bank/payment integrations.

## Tone

Use plain language:

- "students need timely context"
- "small decisions compound"
- "payment activity becomes a useful signal"
- "we move from tracking to intervention"

Avoid pitch-deck filler:

- "revolutionary"
- "seamless ecosystem"
- "AI-powered transformation"
- "game-changing"
- "holistic solution" unless you explain what is connected
