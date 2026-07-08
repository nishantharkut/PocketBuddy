# PocketBuddy Finals PPT Blueprint

This file is the working guide for building the final HackOn with Amazon 6.0 PPT and embedded demo video.

It is written for one goal: make PocketBuddy feel like the strongest product in the room.

It is not a code status report. It is not a defensive gap list. The PPT should present the strongest finals product experience. Code can keep improving before the finals, but the story, demo, and claims must already be sharp, believable, and safe in front of Amazon, AWS, product, payments, and security judges.

## The One-Line Product

Use this everywhere:

> PocketBuddy is an AI financial and wellness assistant for student life.

The memorized line:

> Know what is safe before you spend.

The core idea:

> Money is the signal. Student life is the problem.

What this means:

- We are not building another expense tracker.
- We are not building another budgeting dashboard.
- We are not building a wellness chatbot.
- We are building a student-life assistant that uses allowance, campus context, consented payment signals, and AI to guide daily decisions.

## The Original Problem Statement, Correctly Interpreted

Original PS:

> PocketBuddy - AI Financial & Wellness Assistant for Students. Many students struggle silently with budgeting, food expenses, emotional stress, irregular sleep, and balancing academics with social life. Existing apps focus on only one aspect - finance, fitness, or productivity - without understanding the realities of student living. What if students had an AI companion that could help manage monthly expenses, recommend affordable food and travel options, detect burnout patterns, encourage healthy routines, and provide personalized support for both financial and emotional well-being throughout college life?

Correct interpretation:

> The problem is not "students need a better budget app." The problem is that student decisions are connected: money affects meals, meals affect routine, exams affect sleep, travel affects allowance, and shared hostel spending affects social life. Existing apps split these into separate tools.

PocketBuddy answer:

> One assistant that connects finance, food, travel, shared spending, and routine-risk signals into daily campus decisions.

## What Judges Should Remember

If the jury remembers only three things:

1. PocketBuddy is student-life aware, not category-budget aware.
2. It reduces manual entry using consented signals, reviewable automation, and campus context.
3. It can become a responsible student commerce layer for Amazon Pay-style journeys, campus merchants, and AWS-backed AI assistants.

## Presentation Strategy

Do not present modules as a feature checklist. Present one student story.

Use this recurring demo story:

> It is exam week. A student has limited allowance left, has gone too long without a proper food signal, gets a higher-than-normal travel quote, and is hosting a shared cart pool where roommates still owe money. PocketBuddy tells them what is safe to do next.

This makes runway, food, travel, pooling, and wellness feel connected.

Opening hook option:

> At 11:48 PM before an exam, a student does not open five apps. They need one answer: what is safe right now?

Use it only if it sounds natural when spoken.

## Research Signals To Use

Do not overload the PPT with statistics. Use one or two strong metrics on the problem slide, then keep sources in tiny footer text or backup.

Good metrics:

- 59% of surveyed students considered dropping out due to financial stress.
- 41% food insecurity reported in a large student basic-needs survey.

Why these work:

- They connect directly to financial stress and food insecurity.
- They support the original PS without distracting into unrelated facts.

Do not cram the problem slide with UPI volume, AISHE, sleep prevalence, breakfast skipping, and every source you found. Too many metrics makes the slide look like research pasted onto design.

## What Winning Hackathon Decks Usually Do

From HackOn finalist/winner material, Unstop guidance, and Amazon's own working-backwards culture, the pattern is clear:

- The customer problem must be obvious in seconds.
- The prototype must show the actual product doing actual work.
- The architecture must show scalability without becoming a service-name dump.
- The business value must be tied to a customer behavior, not a vague market.
- The presentation has to be scannable because judges see many teams.
- The Q&A has to show judgment, not only coding speed.

Amazon-specific framing:

- Start from customer pain.
- Work backwards from customer experience.
- Invent and simplify.
- Be precise about trust, security, payments, and data.

## Final PPT Structure

Use 7 presented slides. Keep backup slides after them.

| Slide | Time | Purpose |
| --- | ---: | --- |
| 1. Title Hook | 0:15 | Make the room remember the product line. |
| 2. Problem | 1:00 | Show the connected student-life pain. |
| 3. Product Map | 1:10 | Show how PocketBuddy solves the month, not one category. |
| 4. Demo Chapters | 0:20 | Tell them how to watch the embedded video. |
| 5. Embedded Demo | 5:00 | Product proof. This is where novelty appears. |
| 6. Architecture | 1:15 | Prove it is AWS-ready and scalable. |
| 7. Amazon Fit + Future | 1:00 | Show business direction and why Amazon should care. |

Backup slides:

8. Trust and privacy
9. Competitor map
10. Q&A stress test

Do not present backup slides unless asked.

## Slide 1: Title Hook

Use this text:

```text
PocketBuddy
AI financial and wellness assistant for student life

Know what is safe before you spend.
Team Bad Luck
```

Optional tiny footer:

```text
HackOn with Amazon 6.0
```

Do not put:

- a paragraph
- feature list
- architecture
- problem statement text
- "not another budget app" as the main title

Speaker line:

> PocketBuddy is an AI financial and wellness assistant for student life. The key idea is simple: students should know what is safe before they spend, not only after they run out.

Visual:

- Keep the current handmade boy/girl energy if it looks memorable.
- Use the PocketBuddy logo clearly.
- Make the hook readable from far away.
- Keep Team Bad Luck visible but secondary.

## Slide 2: Problem

Headline:

```text
Student life breaks at the intersections.
```

Four visual corners:

```text
Money
Allowance runs out quietly

Meals
Food decisions become budget decisions

Travel
New students do not know fair fares

Routine
Late nights and exams change spending behavior
```

Center:

```text
Existing apps see one slice.
Students live all four at once.
```

Metric chips:

```text
59% considered dropping out due to financial stress
41% reported food insecurity
```

Footer:

```text
Sources: Ellucian student financial stress survey; Hope Center basic needs survey
```

Speaker line:

> The problem is not just budgeting. A student month breaks at the intersections: money affects meals, exams affect sleep, travel affects allowance, and shared hostel orders affect relationships. Existing apps usually solve one slice. Students live all of it together.

Do not say:

- "We diagnose burnout."
- "We solve mental health."
- "Students are bad at money."

Say:

> We detect routine-risk signals, not medical conditions.

## Slide 3: Product Map

Headline:

```text
One assistant for the student's month.
```

Left:

```text
Student context
Allowance, campus, hostel, meals, exams

Consented signals
Android payment alerts, review corrections, campus data
```

Center:

```text
PocketBuddy
```

Right outcome cards:

```text
Runway
How many safe days left?

Food
What is affordable, and did I eat?

Travel
Is this fare fair?

Pools
Who owes what?

Wellness
Is my routine slipping?
```

Speaker line:

> PocketBuddy starts with student context: allowance, campus, hostel, meals, exams, and consented payment signals. Then it turns that into five decisions: runway, food, travel, shared pools, and routine-risk nudges.

Why this slide matters:

- It shows the full PS coverage.
- It avoids a forced novelty slide.
- It makes the demo easier to follow.

## Competitor Positioning

This is speaker prep and backup slide material. Do not overload the main product slide.

| Product | Strong at | PocketBuddy difference |
| --- | --- | --- |
| axio/Walnut | SMS-based expense tracking | PocketBuddy connects spend to food gaps, runway, travel, pools, and routine-risk signals. |
| ET Money | personal finance, bills, investments | PocketBuddy is student-life-first, not investment-first. |
| CRED | credit-card behavior, rewards | PocketBuddy targets allowance runway and campus decisions, not affluent credit-card users. |
| Splitwise | shared expense balances | PocketBuddy adds campus pools, debt netting, repayment tracking, and runway impact. |
| Tricount/Settle Up | group expense tracking | PocketBuddy links shared spends to actual student budget and passive signals. |
| Zomato/Swiggy/Ola/Uber/Rapido | completes a transaction | PocketBuddy asks whether that transaction is safe or fair this month. |
| Headspace-style wellness apps | self-reported wellbeing routines | PocketBuddy uses campus routine-risk signals from meals, late nights, exams, and money pressure. |

Short line:

> Others optimize a category. PocketBuddy optimizes the student's month.

## Slide 4: Demo Chapters

Headline:

```text
The demo is one student day.
```

Chapters:

```text
1. Setup trust
2. Build student context
3. Forecast the month
4. Capture and review signals
5. Decide: food, pool, travel, wellness
```

Button:

```text
Play embedded demo
```

Speaker line:

> The demo is a student day, not a feature list: setup once, signals arrive, and PocketBuddy turns them into decisions.

Do not write "Switch to live demo" if the final presentation uses embedded video.

## Slide 5: Embedded Demo Video

This slide should be mostly video.

Layout:

- 85% to 90% of slide is the video.
- Add a thin chapter bar at the bottom:

```text
Setup -> Runway -> Sync -> Food -> Pools -> Travel -> Privacy
```

Do not keep a decorative monitor image if it wastes video space.

### Demo Video Storyboard

Target length: 4:45 to 5:00.

| Time | Scene | Proof |
| --- | --- | --- |
| 0:00-0:15 | Landing and sign in | Product is deployed and clear. |
| 0:15-0:40 | Onboarding | Student context, not generic budget setup. |
| 0:40-1:30 | Runway V2 | Safe daily spend, survive date, simulator, fixed costs, exams. |
| 1:30-2:05 | Android companion + review | Passive capture, pairing, reviewable activity. |
| 2:05-2:45 | Food + wellness | Menu-photo scan, affordable meal choice, meal-gap or exam routine nudge. |
| 2:45-3:30 | Shared pool | Host/roommate flow, debt netting, settlement status. |
| 3:30-4:10 | Travel | Route fare guard, community range, AI negotiation script. |
| 4:10-4:40 | Privacy center | Parser review, masked correction, export/delete controls. |
| 4:40-5:00 | Return dashboard | Close on "safe before you spend." |

### Demo Voice Lines

Use short voiceover. Do not narrate every click.

Opening:

> PocketBuddy helps students know what is safe before they spend.

Onboarding:

> The assistant starts with student context: allowance, campus, room, meal routine, and exams.

Runway:

> Instead of a static budget, PocketBuddy forecasts the month and lets students test decisions before making them.

Android sync:

> Manual tracking breaks because students are busy. PocketBuddy uses consented Android payment alerts, then keeps uncertain events reviewable.

Food:

> Food is not separate from money or wellness. PocketBuddy turns campus menu data and meal gaps into practical choices.

Pools:

> Hostel spending is shared. PocketBuddy turns quick orders into pools, nets debts, and tracks repayment.

Travel:

> Travel is where new students overpay. PocketBuddy compares a quote against route and community fare memory.

Privacy:

> Because notification access is sensitive, the user can pause sync, review parser mistakes, export data, or delete the account.

Close:

> PocketBuddy is not a tracker after money is gone. It is the assistant before student decisions happen.

### Demo Claim Rules

Do:

- Show polished product behavior.
- Show guided product scenes if the exact backend integration is being finished.
- Use a seeded account.
- Keep transitions fast.
- Show one student journey.

Do not:

- label screens as "mock"
- show terminal commands
- show AWS setup
- show Play Protect
- show raw SMS
- show UPI IDs
- show real bank balance
- claim live Amazon Pay integration unless actual sandbox callbacks are live

Payments wording:

- Use "Amazon Pay-style checkout flow" if the flow is simulated.
- Use "contract-compatible checkout flow" if asked in Q&A.
- Do not say PocketBuddy holds funds.
- Do not say escrow.

Wellness wording:

- Use "routine-risk signal."
- Do not say "diagnosis."

OCR wording:

- Use "menu-photo scan flow."
- Do not say Textract if Textract is not used.

## Slide 6: Architecture

Headline:

```text
Built as two paths: product APIs and event ingest.
```

Use four lanes:

```text
Clients
Web app
Android connector

Edge
CloudFront
S3 assets + APK
WAF

Product Brain
FastAPI services
Product DB
Bedrock Nova Lite

Event Ingest
API Gateway
Ingest Lambda
SQS + DLQ
Processor Lambda
DynamoDB ledger
CloudWatch
```

Speaker line:

> Architecturally, we split product APIs from mobile event ingest. The web app is served through CloudFront and S3. Product APIs run through FastAPI. Mobile events go through API Gateway, Lambda, SQS, processor Lambda, and DynamoDB so bursty phone events are buffered and idempotent.

The one architecture idea:

> A payment notification should not depend on the web server being free at that moment.

Why each major choice exists:

- CloudFront + S3: low-cost global delivery of the web app and APK.
- FastAPI: fast iteration for product workflows and domain logic.
- API Gateway + Lambda: isolated ingest path for phone events.
- SQS + DLQ: absorbs bursts, retries safely, keeps bad payloads inspectable.
- DynamoDB ledger: high-write immutable ingest events.
- Product DB: profile, transactions, pools, food, travel, wellness state.
- Bedrock Nova Lite: grounded assistant responses after deterministic facts are computed.
- CloudWatch: operational visibility.

Do not show:

- IAM policies
- every table and collection
- all API routes
- billing screens
- secret configuration

Architecture visual rule:

- Make it vertical or square enough for a slide.
- Avoid a very long horizontal diagram.
- Use large labels.
- Use color coding:
  - Green: product API
  - Orange: mobile event ingest
  - Purple: AI context

## Slide 7: Amazon Fit + Future

Headline:

```text
Responsible student commerce.
```

Three cards:

```text
For students
Spend with context, not regret.

For campuses
See affordability and routine signals without individual surveillance.

For Amazon
A student-mode layer before payment, commerce, food, travel, and AI assistance.
```

Business line:

```text
Revenue path: campus SaaS + merchant discovery + responsible payment partnerships.
```

Final close:

```text
PocketBuddy can become the assistant before the checkout.
```

Speaker line:

> This is not about charging students for being broke. The business sits around responsible commerce: campuses, merchants, and payment partners benefit when students can spend safely and consistently.

## Business Model

Use this for slide 7 and Q&A.

Primary paths:

1. Campus SaaS
   - anonymized affordability dashboards
   - food affordability signals
   - student routine-risk trends
   - paid by institutions, not struggling students

2. Merchant discovery
   - affordable campus meal offers
   - local travel offers
   - student-safe recommendations ranked by budget fit

3. Payment and commerce partnerships
   - safe-spend layer before checkout
   - student mode for responsible commerce
   - shared purchase and settlement journeys

4. Premium later
   - family sponsor view
   - advanced exports
   - multi-campus travel packs
   - only after core trust is established

Best line:

> The customer is the student. The buyer can be the campus, merchant ecosystem, or commerce partner.

## Amazon Pay And Payment Wording

This is important. Bad wording can damage trust.

Use:

- "Amazon Pay-style checkout experience"
- "contract-compatible checkout flow"
- "authorized payment rails"
- "PocketBuddy coordinates intent and reconciliation"

Avoid:

- "PocketBuddy holds funds"
- "we are an escrow"
- "we auto-charge roommates through our account"
- "live Amazon Pay integration" unless actual sandbox callbacks are live
- "pre-authorized roommate debit" without explaining authorized rails

Safe Q&A answer:

> PocketBuddy should not custody funds. The correct production model is that payment movement stays on authorized payment rails. PocketBuddy coordinates the pool, intent, reminders, matching, and reconciliation.

## Backup Slide 8: Trust And Privacy

Use if asked about notification access.

Headline:

```text
Trust is a feature.
```

Four cards:

```text
Consent
User pairs the connector intentionally.

Review
Low-confidence events go to review.

Control
Pause sync, unpair, export, delete.

Minimization
Parser feedback is masked before storage.
```

Speaker line:

> Notification access is sensitive. PocketBuddy cannot win without trust, so reviewability and control are product requirements, not afterthoughts.

## Backup Slide 9: Competitor Map

Use if asked why this is different.

Headline:

```text
Not a better tracker. A different job.
```

Axis:

- X axis: manual tracking -> passive/contextual
- Y axis: single category -> student-life assistant

Place:

- axio/Walnut: passive, finance-only
- Splitwise: manual, sharing-only
- ET Money/CRED: finance-only, not student-life
- Food/travel apps: transaction-specific
- PocketBuddy: passive/contextual + student-life assistant

Speaker line:

> The difference is not that we parse SMS. The difference is what the system does with the signal.

## Backup Slide 10: Q&A Stress Test

Use only if needed.

Q: Why not just use Walnut or axio?

A: Those apps track spending. PocketBuddy connects spending to campus decisions: safe daily runway, meal gaps, travel fairness, shared pools, and routine-risk signals.

Q: Why not Splitwise?

A: Splitwise is excellent for balances. PocketBuddy starts earlier: it creates campus pools, nets debts, watches runway impact, and tracks settlement from payment signals where possible.

Q: Is this a medical wellness app?

A: No. PocketBuddy detects routine-risk signals from meals, late-night activity, exam context, and money pressure. It nudges check-ins. It does not diagnose.

Q: What about iPhone users?

A: Android gives the best zero-entry passive capture. iOS can still use manual/review fallback, email/export rails, and the web assistant. The core value remains, but Android is the strongest capture path.

Q: Is Amazon Pay actually live?

A: The finals experience shows the checkout journey and contract-compatible flow. In production, money movement should stay on authorized payment rails. PocketBuddy coordinates context, intent, and reconciliation.

Q: How does this scale?

A: Product APIs and mobile event ingest are separated. The ingest path uses API Gateway, Lambda, SQS, processor Lambda, DynamoDB, DLQ, and CloudWatch so bursty phone events can scale independently.

Q: What is the biggest technical risk?

A: Parser coverage. Banks and payment apps format notifications differently. PocketBuddy handles this with confidence scoring, review inbox, masked corrections, and a feedback loop.

Q: What if OCR is wrong?

A: OCR output is a draft, not final truth. Users or campus contributors can correct it, and corrected data improves future recommendations.

Q: What stops fake repayment proof?

A: Settlement should not rely on one text field. The system combines amount, reference, roommate mapping, duplicate detection, review states, and authorized payment rails where available. Manual UTR stays fallback.

Q: Why would Amazon care?

A: PocketBuddy sits before student commerce decisions. It can support responsible payment behavior, student-mode checkout, and AWS/Bedrock-powered consumer assistance.

## Judge Persona Prep

### Amazon Product Leader

They will test:

- Is the customer pain specific?
- Why will students keep using it?
- Is the product behavior clear?
- Is there business value?

Your answer should keep returning to:

- "safe before you spend"
- student month story
- campus context
- responsible commerce

### AWS Architect

They will test:

- Why this architecture?
- How does event ingest scale?
- Where are retries and DLQ?
- How is AI grounded?

Your answer:

- product API and ingest are separated
- SQS buffers bursts
- DynamoDB ledger handles high-write ingest
- CloudWatch observes failures
- deterministic facts are computed before Bedrock speaks

### Amazon Pay / Payments Judge

They will test:

- Are you claiming real integration?
- Who moves money?
- Do you understand regulatory boundaries?
- What prevents fake settlements?

Your answer:

- no custody by PocketBuddy
- authorized rails
- reconciliation and intent coordination
- manual fallback plus review

### Security / Trust Judge

They will test:

- notification access sensitivity
- static tokens
- user deletion
- spoofed events

Your answer:

- consented setup
- reviewable sync
- masked parser feedback
- pause/unpair/export/delete
- production device-bound HMAC keys

### AI / Bedrock Judge

They will test:

- is AI useful or decorative?
- does it hallucinate prices?
- does it claim therapy?

Your answer:

- deterministic facts first
- AI explains computed context
- grounded prompts for fare, food, runway
- no diagnosis

## Attention Mechanics

Use these because the judges will see many presentations.

1. Start with a moment.
   - "Exam week. Low allowance. No meal signal. High travel quote."

2. Repeat one phrase.
   - "Safe before you spend."

3. Use one recurring student.
   - Do not jump between random users.

4. Give every module a decision.
   - Runway decides safe spend.
   - Food decides affordable meal.
   - Travel decides fair fare.
   - Pool decides who owes what.
   - Wellness decides whether to check in.

5. Show before and after.
   - Before: guessing.
   - After: safe action.

6. Keep demo moving.
   - Speed up typing.
   - Cut waiting.
   - Do not show loading screens.

7. Make architecture a confidence slide, not a reading test.

## Current Slide Fix List

Based on the current `slide images` folder:

1. Slide 1
   - Replace "not another budget app" with "Know what is safe before you spend."
   - Keep Team Bad Luck smaller.
   - Keep title strong.

2. Slide 2
   - Keep intersection idea.
   - Reduce metrics to two.
   - Move sources to footer.
   - Remove solution-like wording.

3. Slide 3
   - Replace "Solution?" with "One assistant for the student's month."
   - Convert modules into questions.
   - Keep phone + laptop.

4. Slide 4
   - Replace "Switch To Live Demo" with "Play Embedded Demo."
   - Keep five chapters.

5. Slide 5
   - Replace placeholder monitor with real embedded MP4.
   - Add chapter bar.

6. Slide 6
   - Replace vague "Vision & Amazon Fit" with "Responsible student commerce."
   - Use Students, Campuses, Amazon cards.

7. Slide 7
   - Redraw architecture.
   - Use four lanes.
   - Make labels readable.

8. Slide 8
   - Keep as backup only.
   - Do not present unless asked.

## Visual Style Rules

- Warm off-white background.
- Black high-contrast text.
- Muted orange accent.
- Muted green for "safe" or wellness.
- Avoid bright orange blocks that strain the eye.
- Use the PocketBuddy logo consistently.
- Use line-art if it looks intentional, not childish.
- One main visual per slide.
- No paragraph slide.
- No more than 35 words on main slides except architecture labels.

## Image Generation Prompts

Use these prompts in Gemini, GPT image generation, or any other tool. Keep generated images as backgrounds or visual elements, not as text-heavy final slides.

### Title Visual

```text
Create a clean 16:9 presentation cover for a student-life AI assistant called PocketBuddy. Warm off-white background, black ink line-art, small muted orange accent. Show two college students with a phone and laptop, realistic but friendly, not overly cute. Leave clean blank space for title text. Avoid generic robot, avoid stock photo style, avoid too many currency symbols.
```

### Problem Intersection

```text
Create a 16:9 infographic visual showing four connected student pressures: money, meals, travel, routine. Use simple line icons in four corners connected to a center point. Warm off-white background, black line-art, small orange and green accents. No fake statistics, no paragraphs, no clutter.
```

### Product Map

```text
Create a 16:9 product-system visual for PocketBuddy. Left: student context and consented phone signals. Center: laptop dashboard and Android connector. Right: five outcome cards named Runway, Food, Travel, Pools, Wellness. Minimal, readable, high contrast, warm off-white background, black cards, muted orange accent.
```

### Architecture

```text
Create a clean AWS architecture diagram for a finals presentation. Four vertical lanes: Clients, Edge, Product Brain, Event Ingest. Include React web, Android connector, CloudFront, S3, FastAPI backend, product database, Bedrock Nova Lite, API Gateway, Lambda, SQS, DLQ, DynamoDB ledger, CloudWatch. Use large readable labels and minimal arrows. Do not make it horizontally long.
```

### Amazon Fit

```text
Create a 16:9 strategic product slide visual titled Responsible student commerce. Show three simple columns: Students, Campuses, Amazon ecosystem. Use tasteful icons for student, campus, payment, and AI. Warm off-white background, black text, muted orange accent. No buzzwords, no futuristic city, no handshake stock art.
```

## Exact 10-Minute Run Of Show

0:00-0:15

- Slide 1
- Hook and product identity

0:15-1:15

- Slide 2
- Student-life pain

1:15-2:25

- Slide 3
- Product map

2:25-2:45

- Slide 4
- Demo chapters

2:45-7:45

- Slide 5
- Embedded video

7:45-9:00

- Slide 6
- Architecture

9:00-10:00

- Slide 7
- Amazon fit, business model, future

Do not spend more than 20 seconds introducing the demo. The demo is the proof.

## Final Export Checklist

- PPT has 7 main slides.
- Backup slides are after the main flow.
- Embedded demo MP4 plays offline.
- Demo is under 5 minutes.
- Total pitch fits 10 minutes.
- Problem slide uses original PS correctly.
- No unsupported Amazon Pay claim.
- No medical diagnosis claim.
- No raw SMS or secret visible.
- Architecture is readable at 1080p.
- Business model is specific.
- Sources are included in footer or backup, not cluttering main slides.

## Source Links

- HackOn With Amazon 6.0 Unstop page: https://unstop.com/hackathons/crp-hackon-with-amazon-60-amazon-1682652
- HackOn With Amazon 2026 guide: https://unstop.com/blog/hackon-with-amazon
- HackOn With Amazon experience write-up: https://bysaninavaneeth.medium.com/hackon-with-amazon-my-experience-fc270dc09684
- HackOn Season 5 finalist/winner experience post: https://www.linkedin.com/posts/vyom-goyal-09ab5b246_amazonhackon-amazon-hackathonexperience-activity-7372909479761203200-v3p_
- Amazon Leadership Principles: https://www.amazon.jobs/content/en/our-workplace/leadership-principles
- AWS Working Backwards overview: https://aws.amazon.com/video/watch/7a9dc2942e5/
- Ellucian student financial stress survey: https://www.ellucian.com/newsroom/national-survey-reveals-59-college-students-considered-dropping-out-due-financial-stress
- Hope Center basic needs survey: https://hope.temple.edu/research/hope-center-basic-needs-survey/2023-2024-student-basic-needs-survey-report
- Amazon Pay Checkout Session docs: https://developer.amazon.com/docs/amazon-pay-api-v2/checkout-session.html
- Amazon Pay Charge Permission docs: https://developer.amazon.com/docs/amazon-pay-api-v2/charge-permission.html
- Splitwise positioning: https://www.splitwise.com/l/c/su/sACiPS7fDTw
- axio/Walnut app positioning: https://play.google.com/store/apps/details?id=com.daamitt.walnut.app
