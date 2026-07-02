# PocketBuddy Mentor Round Playbook - July 2 And July 3

Last updated: 2026-07-01  
Mentor: Aditya Maharana  
Session dates: July 2 and July 3, 2026  
Time: 11:00 AM to 12:00 PM IST  
Purpose: prepare the team to use mentorship efficiently and turn feedback into the final PRD/video submission.

## 1. Goal Of The Mentor Sessions

The mentor sessions are not a normal project update. The goal is to find out what Amazon evaluators will care about and adjust the PRD/video before July 5.

The team should walk in with:

- a clear product thesis;
- a working demo link;
- current AWS architecture;
- a business model hypothesis;
- specific questions;
- willingness to refine.

Do not spend the session debugging. Do not show terminals unless the mentor specifically asks.

## 2. One-Line Product Explanation

Use this when introducing the product:

> PocketBuddy is a campus affordability layer for students living on fixed monthly money. It passively captures payment signals, predicts financial runway, and turns campus context into timely actions across food, travel, shared purchases, subscriptions, and wellness.

If that feels too long:

> PocketBuddy turns everyday student payment signals into decisions before the month goes wrong.

## 3. 60-Second Mentor Intro

Say this near the start:

> Our problem statement is the student financial and wellness assistant. We focused on the fact that students do not usually run out of money through one large decision. It happens through small daily decisions: food, travel, subscriptions, and shared purchases. PocketBuddy connects an Android companion, passively captures supported payment and SMS notifications after permission, and converts them into runway, food and wellness checks, cart pools, and travel fare guidance. The product is deployed on AWS with CloudFront/S3 for the frontend, FastAPI on EC2 for product APIs, and a serverless ingest path using API Gateway, Lambda, SQS, DynamoDB, and CloudWatch. Bedrock Nova Lite powers the contextual AI guidance where it adds value.

Then ask:

> We want your feedback on whether the product story, business model, and AWS architecture are strong enough for the final jury.

## 4. What To Show Live In The Mentor Session

If AWS is running and stable, show:

1. Landing page.
2. Dashboard with seeded account.
3. Companion Device page with sync activity.
4. Pool page with active/completed pool.
5. Travel page with fare guard and AI coach.
6. Architecture diagram.

Avoid:

- OCR if not verified;
- AWS IAM screens;
- `.env`;
- raw SMS;
- long setup;
- empty states.

If backend is stopped to save credits, either start EC2 before the session or use screenshots/video. For mentorship, a live demo is better.

## 5. How To Make The Mentorship Useful

Aditya Maharana mentored last year's winning team, so do not use the session like a casual product review. Use it like a jury calibration session.

The team should avoid broad questions such as:

- "What do you think?"
- "Any suggestions?"
- "Is this good?"
- "How can we improve?"

Those questions invite vague advice. Ask forced-choice and ranking questions instead:

- "If you were judging, which of these two stories is stronger?"
- "Which one feature should open the video?"
- "Which weakness would eliminate us?"
- "What would you remove from the PRD?"
- "Which claim sounds unbelievable?"

Use this rule during the call:

> Every answer from the mentor should turn into a decision: keep, cut, reframe, prove, or fix.

### Meeting Control Script

Say this after the 60-second intro:

> We know mentorship time is limited, so we do not want generic feedback. We have three things to validate: product positioning, AWS architecture, and final submission story. Please critique us like you are on the jury. If something feels weak, please say it directly.

If the mentor gives broad advice, ask a narrowing follow-up:

> Understood. If we can change only one thing before July 5, what should it be?

If the mentor says "business model should be stronger", ask:

> Should we lead with student premium, campus licensing, or verified savings marketplace? Which sounds most credible to an Amazon jury?

If the mentor says "architecture should be stronger", ask:

> Should we invest time before July 5 in improving the architecture diagram/story, or actually changing infrastructure?

If the mentor says "AI should be clearer", ask:

> Should Bedrock be positioned as a decision assistant for travel/food/wellness, or should we avoid over-emphasizing AI and lead with automation?

### Priority Questions To Ask First

Ask these before any optional questions. They are designed to produce useful answers quickly.

1. **Winning angle:** If you were pitching PocketBuddy, would you lead with passive payment automation, student runway, shared cart pools, travel fare guardrails, or food/wellness? Please rank the top three.
2. **Elimination risk:** What is the one weakness that could make judges say "good hackathon project, not a real product"?
3. **Business model:** Which buyer sounds most credible for version one: students, campuses/hostels, financial institutions, or local merchants?
4. **Architecture:** Does the hybrid AWS architecture sound intentional enough, or should we reframe it more clearly around traffic patterns?
5. **Demo proof:** In a 5-minute video, what must be shown live so the product feels real?
6. **Feature scope:** Which feature should we cut or downplay if the product feels too broad?
7. **AI story:** Is Bedrock Nova Lite best shown through travel negotiation, food/wellness nudges, or campus intelligence?
8. **Metrics:** Which impact metric is most believable: money saved, manual logging time saved, repayment friction reduced, or campus affordability visibility?
9. **PRD:** Which PRD section will judges read most carefully: novelty, business, architecture, or scaling?
10. **Finals readiness:** What should be built or hardened before July 16, even if it is not perfect by July 5?

### Decision Register During The Call

Keep a simple note while the mentor speaks:

| Topic | Mentor said | Our decision |
| --- | --- | --- |
| Product story |  | Keep / cut / reframe |
| Video opening |  | Keep / cut / reframe |
| PRD focus |  | Keep / cut / reframe |
| AWS architecture |  | Keep / cut / reframe |
| Business model |  | Keep / cut / reframe |
| Before July 5 |  | Fix / defer |
| Before July 16 |  | Fix / defer |

Do not leave the session with only notes. Leave with decisions.

## 6. Day 1 Strategy - July 2

### Objective

Use Day 1 to validate product direction and identify the biggest final-submission gaps.

### Recommended Flow

| Time | Topic |
| --- | --- |
| 0-5 min | Product intro and problem framing |
| 5-15 min | Show demo highlights |
| 15-25 min | Explain AWS architecture |
| 25-40 min | Ask mentor for critique |
| 40-55 min | Discuss PRD/video improvements |
| 55-60 min | Confirm action items for Day 2 |

### Day 1 Questions To Ask

Ask these directly:

1. Does "campus affordability layer" sound stronger than "AI financial assistant"?
2. Which feature should lead the video: passive sync, runway, pool, travel, or wellness?
3. Does the architecture look AWS-native enough, or does EC2 weaken the story?
4. Should the PRD emphasize business model more strongly?
5. What would an Amazon jury challenge first?
6. Is the product too India/UPI-specific, or is India a strong beachhead?
7. Should the demo show real Android sync, or is seeded companion activity enough if privacy is a concern?
8. Is Bedrock usage convincing if it is bounded to travel/wellness nudges rather than chat?
9. Which feature should be cut from the final video if time is tight?
10. What would make this feel like a real product, not a hackathon prototype?

## 7. Day 2 Strategy - July 3

### Objective

Use Day 2 to validate the revised final submission plan.

### Bring To Day 2

- revised PRD outline;
- final demo video flow;
- updated architecture diagram;
- list of mentor feedback from Day 1;
- what changed after Day 1;
- remaining risks.

### Recommended Flow

| Time | Topic |
| --- | --- |
| 0-5 min | Recap Day 1 feedback and changes |
| 5-20 min | Show improved product narrative/demo path |
| 20-35 min | Walk through PRD structure |
| 35-50 min | Ask hard jury-style questions |
| 50-60 min | Final submission checklist |

### Day 2 Questions To Ask

1. Is the final video structure compelling enough in under 5 minutes?
2. Does the PRD answer the official jury focus areas clearly?
3. Is the business model believable or too early?
4. Should we position campuses as buyers or keep students as primary buyer?
5. Is the architecture diagram too complex or too simple?
6. What AWS service should we highlight most?
7. What should we avoid saying in the finale?
8. If we only had one slide to explain novelty, what should it say?
9. What metric or impact claim sounds credible?
10. What should be improved in code before July 16?

## 8. Likely Mentor/Jury Questions And Strong Answers

### Q1. Why is this not just another expense tracker?

Answer:

> Traditional trackers require manual logging. PocketBuddy starts from permitted payment notifications and campus context. The output is not only a ledger; it is runway, meal checks, shared pool settlement, travel fare guidance, and subscription awareness. The difference is automation plus campus-specific action.

### Q2. Why would students trust this?

Answer:

> We mask notification text, avoid storing raw private messages where possible, and show the parsed event back to the student for review. We do not sell raw payment data. The business model is based on student value, campus pilots, and privacy-preserving aggregate insights.

### Q3. What is actually AI-powered?

Answer:

> The core math and parsing are deterministic because students need reliability. AI is used where language and context help: travel negotiation scripts, campus nudges, and wellness/food guidance. Bedrock Nova Lite receives bounded context, not the entire database.

### Q4. Why Amazon Bedrock?

Answer:

> Bedrock lets us add contextual AI without hosting our own model. For a student product, the model output must be grounded in product data: route, quote, allowance runway, food gap, and exam context. Nova Lite is low-latency and cost-aware for short action messages.

### Q5. Why this AWS architecture?

Answer:

> We separated the system by traffic shape. The web app is static and goes through S3/CloudFront. Product APIs are on FastAPI behind Nginx. Mobile notification ingest can be bursty, so it is modeled with API Gateway, Lambda, SQS, DynamoDB, and CloudWatch. That gives quick acknowledgement, buffering, retries, and idempotent processing.

### Q6. Does EC2 weaken the AWS story?

Answer:

> EC2 is intentionally used for the current product API because it reduced migration risk and let us move fast. The AWS-native part is not service count; it is choosing the right service for the right traffic. Static delivery is on S3/CloudFront, and bursty ingest is serverless. The next production step is ECS/Fargate or App Runner for the FastAPI service.

### Q7. How does it scale to 100x or 1000x?

Answer:

> Static frontend traffic scales through CloudFront/S3. Mobile ingest scales through API Gateway, Lambda, SQS, and DynamoDB. SQS absorbs bursts, Lambda processors scale horizontally, and DynamoDB acts as the ingest ledger. Product APIs can scale by adding backend instances or moving FastAPI to ECS/Fargate without changing client contracts.

### Q8. How do you avoid duplicate payment entries?

Answer:

> One payment can generate both app and bank SMS notifications. We use transaction reference/UTR where available, and fallback fingerprints based on amount, direction, merchant, and time window. This prevents double-counting while preserving lower-confidence events for review.

### Q9. How do you handle wrong parsing?

Answer:

> The product stores confidence and exposes review/edit flows. The parser favors not losing events over silently dropping them. Future parser feedback loops let users mark wrong merchant/category/direction and improve rules safely without automatically rewriting regex logic.

### Q10. How do you detect burnout?

Answer:

> We avoid clinical claims. PocketBuddy detects routine risk signals: food gaps, exam window, spending velocity, and late-night patterns. If there is no food transaction for a long period, it asks whether the student ate in mess, cooked, ordered, or skipped. It is a practical check-in, not a diagnosis.

### Q11. How does travel fit the problem statement?

Answer:

> The problem statement asks for affordable travel. For students arriving at a new campus city, local fare uncertainty is a real cost. PocketBuddy compares quoted fares to route ranges and gives a practical negotiation script plus safety note.

### Q12. Who pays for this?

Answer:

> The first wedge is a free student app. Revenue can come from low-cost student premium, campus/hostel licensing for privacy-preserving affordability dashboards, verified cost-saving local offers, and partner integrations for scholarship or allowance workflows. We do not need to sell raw student data.

### Q13. Why will this grow beyond one campus?

Answer:

> The product uses defaults as seeds, not limits. Colleges, hostels, routes, vendors, categories, and menus can become moderated catalog data. Each campus creates its own local intelligence, but the product loop remains the same.

### Q14. What is your moat?

Answer:

> The moat is the campus context graph: payment stream, allowance cycle, hostel/wing context, shared pools, local routes, local vendors, food routines, exam windows, and recurring subscriptions. Generic trackers do not have this campus-specific operating context.

### Q15. What is the biggest technical risk?

Answer:

> Notification formats vary across banks and apps. We handle that by confidence scoring, masking, review/edit flows, dedupe logic, and a parser feedback path. The system is designed to improve safely rather than assuming every message format is perfect.

### Q16. What would you build next with more time?

Answer:

> QR pairing for Android, parser feedback review, campus admin/moderation tools, SQS DLQ/replay, secrets in SSM Parameter Store, CloudWatch alarms, and a stronger multi-campus catalog model.

### Q17. Where should automation live: Android or backend?

Answer:

> Android should stay a companion connector. It captures notification signals, masks sensitive text, and retries failed sends. The backend should own subscriptions, pool matching, parser confidence, dedupe, and financial decisions. That keeps Android simple and avoids shipping app updates whenever business logic changes.

### Q18. How should pool repayment become automatic?

Answer:

> The best signal is the host's incoming credit notification, not the roommate's debit. When the host receives a credit, the backend can match UTR, amount, sender, and pool checkout time against pending roommate splits. If the match is confident, the split becomes auto-verified. If it is missing or ambiguous, the existing UTR workflow remains the fallback.

### Q19. How should subscription detection mature?

Answer:

> Known services are the first layer, but production detection should be behavior-based. The backend should flag same merchant + same amount + recurring interval as a candidate subscription, then ask the user to confirm. Intervals should cover weekly, biweekly, monthly, quarterly, and yearly patterns instead of only a fixed 28-30 day rule.

### Q20. What is the biggest passive-capture hardening item?

Answer:

> Parser review. If a notification looks payment-related but cannot be parsed confidently, PocketBuddy should not silently drop it. It should create a masked `Needs review` item that the user can correct once. That gives us a feedback loop for new bank and UPI formats without automatically changing parser rules unsafely.

## 9. Questions The Team Should Ask Mentor About Business

Ask:

1. Should we sell first to students or to campuses?
2. Does Rs 49-99/month student premium sound believable after free value?
3. Would campus affordability dashboards be attractive to institutions?
4. Should verified offers be in the first business model, or later?
5. Is it risky to mention wellness if we avoid diagnosis?
6. What business metric should we highlight in PRD: savings, time saved, retention, or campus adoption?
7. Should we pitch India as first market or global student housing as larger category?

## 10. Questions The Team Should Ask Mentor About AWS

Ask:

1. Is the hybrid architecture acceptable for a finalist prototype?
2. Should we move FastAPI from EC2 to ECS/Fargate before finals, or keep it stable?
3. Would adding DLQ and CloudWatch alarms improve the architecture story enough?
4. Is SSM Parameter Store enough for secrets at this stage?
5. Should the serverless ingest path be emphasized more than the EC2 backend?
6. What AWS service addition would be most meaningful, not decorative?
7. Should Bedrock be used in more places or kept bounded?

## 11. Questions The Team Should Ask Mentor About Demo Video

Ask:

1. Should the first 30 seconds show problem story or product immediately?
2. Is Android sync worth showing live, or should we use a pre-recorded clean clip?
3. Which feature should be cut if the video exceeds 5 minutes?
4. Should the architecture section be 15 seconds or 30 seconds?
5. Should we show AWS console or only diagram?
6. How much business model should appear in the video versus PRD?
7. Does the demo need an admin/campus buyer angle?

## 12. Questions The Team Should Ask Mentor About PRD

Ask:

1. Does the PRD read like a product or a project report?
2. Is the user flow diagram understandable?
3. Is the architecture diagram too wide/complex?
4. Are the impact numbers credible?
5. Should the revenue model be earlier?
6. Is the novelty clear enough?
7. Does OCR/menu scanner help or distract?
8. Are screenshots enough to prove working prototype?

## 13. Red Flags To Avoid During Mentor Round

Do not say:

- "We are not sure what works."
- "OCR failed."
- "We just used EC2."
- "We used AI for everything."
- "We will show mock because real does not work."
- "We store all SMS."
- "We diagnose burnout."
- "It is only for IIIT Gwalior."

Say instead:

- "The core flow is live; a few expansion paths are staged."
- "OCR is an optional catalog onboarding accelerator."
- "The architecture separates product API and bursty ingest."
- "AI is grounded in selected context."
- "We mask sensitive notification content."
- "Wellness is a check-in signal, not a diagnosis."
- "IIIT Gwalior is the seed campus; the model is campus-configurable."

## 14. If Mentor Criticizes The Product As Too Broad

Respond:

> That is fair. For the final story, we are treating passive money runway as the core product. Food, travel, pools, and subscriptions are not separate apps; they are the main categories where student money leaks. We can present them as action modules around the same payment stream.

Then ask:

> Which module would you keep as the strongest proof point?

## 15. If Mentor Criticizes The Architecture

Respond:

> We agree the production version should move the product API to a managed service like ECS/Fargate or App Runner. For the current prototype, EC2 kept the core API stable, while AWS-native services handle static delivery and event-driven ingest. Our next architecture improvement is DLQ, alarms, SSM config, and then managed container deployment.

Then ask:

> For the finale, would you prefer we harden the current stack or attempt the managed migration?

## 16. If Mentor Asks About Privacy

Answer:

> Notification access is opt-in. We store masked previews and normalized fields instead of raw private messages wherever possible. The student can review/edit events. For institution-level revenue, only aggregate and privacy-preserving indicators should be exposed, not individual payment histories.

## 17. If Mentor Asks About Global Expansion

Answer:

> India is the beachhead because UPI and SMS alerts give strong digital signals. The broader product is not UPI-specific: it is for students living on fixed money in shared campus housing. In other markets, the passive signal can come from bank notifications, email receipts, wallet alerts, or direct integrations.

## 18. If Mentor Asks What Is Most Novel

Answer:

> The novelty is the automation-first campus context loop. The app does not ask a student to maintain a ledger. It observes permitted payment signals and combines them with hostel, food, travel, pool, subscription, and exam context to produce actions.

## 19. If Mentor Asks What You Would Remove

Best answer:

> For the final video, we would remove OCR if unstable and keep the strongest five: passive sync, runway dashboard, pool, travel fare guard, and food/wellness check-in. OCR is useful later for onboarding campus menus, but not necessary to prove the core product.

## 20. Mentor Feedback Capture Template

During the call, fill this live:

```text
Date:
Mentor:

1. Product framing feedback:

2. Feature priority feedback:

3. Demo/video feedback:

4. PRD feedback:

5. AWS architecture feedback:

6. Business model feedback:

7. Risks mentor called out:

8. Must-change before July 5:

9. Can wait until July 16:

10. Exact phrases mentor liked:
```

## 21. After Day 1 Action Plan

Immediately after July 2:

1. Write mentor feedback into a dated note.
2. Decide top 5 changes only.
3. Update PRD outline.
4. Update demo video script.
5. Avoid coding unless the issue is demo-blocking.
6. Prepare Day 2 questions based on feedback.

## 22. After Day 2 Action Plan

Immediately after July 3:

1. Freeze final product story.
2. Freeze video flow.
3. Update final PRD.
4. Export PRD PDF and check size.
5. Record or re-record demo.
6. Upload before July 5, not at the last minute.
7. Keep a list of code polish items for July 16.

## 23. Final Video Recommendation

Keep the final video around 4 minutes.

Suggested timing:

| Time | Segment |
| --- | --- |
| 0:00-0:20 | Problem and product thesis |
| 0:20-0:45 | Onboarding/student context |
| 0:45-1:20 | Dashboard runway |
| 1:20-1:55 | Android sync/companion |
| 1:55-2:25 | History/stats |
| 2:25-3:00 | Pool |
| 3:00-3:30 | Travel + AI coach |
| 3:30-3:50 | Food/wellness |
| 3:50-4:15 | AWS architecture |
| 4:15-4:25 | Close |

If the video gets too long, cut stats first, then detailed onboarding. Do not cut Android sync or architecture.

## 24. Final PRD Recommendation

Keep the PRD crisp:

1. Problem: scattered student money/routine signals.
2. Why now: UPI + student scale.
3. Novelty: passive automation + campus context.
4. Solution: five action modules.
5. Workflow: one clean diagram.
6. Prototype: screenshots + live links.
7. Architecture: diagram + bullets + decision paragraph.
8. Algorithms: concise list.
9. Scaling: 100x/1000x plan.
10. Business: buyer/revenue/impact.
11. Roadmap: July 16 and beyond.

## 25. Final Mentor Ask

End each mentor session with:

> If you were judging us, what one thing would stop you from selecting PocketBuddy?

This is the most useful question. It forces the mentor to reveal the real weakness.
