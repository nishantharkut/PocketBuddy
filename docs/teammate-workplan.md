# Teammate Workplan: Wellness Index, Mobile UI, and Demo Narrative

This document is for the teammate working in parallel while Nishant handles AWS deployment.

Primary rule: do not touch AWS deployment, Android setup, or infra files unless Nishant explicitly asks. Your work should improve product/demo value without blocking EC2 deployment.

## Current Situation

PocketBuddy already has the core financial product working:

- Android connector ingests UPI/SMS notifications.
- FastAPI backend stores transactions in MongoDB.
- Dashboard computes spending, runway, food gap, subscriptions, and wing activity.
- Cart Pooler works end to end.
- Subscription Guard works.
- Companion page supports wireless AWS webhook config.

The main remaining product gap is the "wellness" half of the problem statement:

- Detect burnout patterns.
- Encourage healthier routines.
- Provide personalized support for financial and emotional well-being.

The best next feature is not a brand-new module. It is a new layer on top of data the app already has.

## Your Main Objective

Build a demo-ready **Student Wellness Index**.

This should answer:

> Is the student showing signs of financial stress, meal skipping, exam pressure, late-night activity, or social withdrawal?

It should be visible on the dashboard and should use existing backend signals. It must be safe, explainable, and not clinical.

## Branch Setup

Start from latest `main`.

```bash
git switch main
git pull origin main
git checkout -b feat/wellness-index
```

Before pushing, run:

```bash
python -m compileall backend/app
npm.cmd run check --workspace=frontend
npm.cmd run build --workspace=frontend
git diff --check
```

If you are on macOS/Linux, replace `npm.cmd` with `npm`.

## Files You Should Touch

Backend:

- `backend/app/api/insights.py`
- `backend/app/api/checkins.py` only if you need to extend the check-in payload

Frontend:

- `frontend/src/lib/api/db.functions.ts`
- `frontend/src/routes/_authenticated/dashboard.tsx`
- Existing UI components under `frontend/src/components/ui/` only if truly needed

Docs:

- `docs/Initial-PRD.md`
- Optional: create a concise demo script under `docs/demo-script.md`

## Files You Should Avoid

Avoid these unless coordinated with Nishant:

- `docs/aws-low-cost-setup.md`
- `android/**`
- `backend/.env`
- `frontend/vite.config.ts`
- GitHub workflow or deployment files
- Cart pool backend hardening unless a bug directly blocks your UI

## Feature Requirements

### 1. Backend: Wellness Endpoint

Add a new endpoint:

```text
GET /api/insights/wellness
```

Suggested implementation location:

```text
backend/app/api/insights.py
```

The endpoint should:

- Require logged-in user via `Depends(get_current_user)`.
- Read transactions for the last 30 to 60 days.
- Read user profile.
- Read cart pool participation if available.
- Return a score from 0 to 100.
- Return a status bucket:
  - `steady`
  - `watch`
  - `stressed`
- Return a list of contributing signals.
- Return a short personalized message.
- Work even if Bedrock is disabled.

Do not make the endpoint fail if AI/Bedrock is not configured.

### 2. Wellness Score Formula

Use a simple explainable score. Start at `100` and subtract risk points.

Suggested logic:

```python
score = 100

# Late-night activity, proxy for routine disruption
if late_night_txn_count_7d >= 4:
    score -= 18
elif late_night_txn_count_7d >= 2:
    score -= 10

# Food gap, proxy for skipped meals
if food_gap_hours >= 14:
    score -= 22
elif food_gap_hours >= 9:
    score -= 12

# Financial runway
if runway_days < 4:
    score -= 22
elif runway_days < 8:
    score -= 12

# Spending velocity
if velocity_pct >= 40:
    score -= 16
elif velocity_pct >= 20:
    score -= 8

# Exam window
if in_exam_period:
    score -= 12

# Subscription bleed
if monthly_sub_bleed_paise >= 50000:
    score -= 8

# Social signal from cart pools
if days_since_last_pool is not None and days_since_last_pool > 10:
    score -= 6

score = max(0, min(100, score))
```

This is intentionally simple. The judges should understand it in 20 seconds.

### 3. Signal Objects

Return signals in a frontend-friendly shape.

Example:

```json
{
  "score": 62,
  "status": "watch",
  "label": "A few patterns need attention",
  "message": "Your spending and food timing look a little stretched this week. Try one planned meal and one no-spend block today.",
  "signals": [
    {
      "key": "food_gap",
      "label": "Food gap",
      "value": "11.5h",
      "severity": "watch",
      "detail": "Long gap since last food transaction"
    },
    {
      "key": "runway",
      "label": "Runway",
      "value": "5 days",
      "severity": "watch",
      "detail": "Allowance may not last the cycle"
    }
  ],
  "generated_by": "fallback"
}
```

Severity values:

```text
ok
watch
stressed
```

`generated_by` values:

```text
fallback
bedrock
```

### 4. Message Generation

For now, use deterministic fallback text by default.

Examples:

Steady:

```text
Your routine looks steady this week. Keep meals regular and stay within today's safe spend target.
```

Watch:

```text
A few patterns need attention: your food timing, spending pace, or exam pressure is starting to stack up. Pick one small reset today: a proper meal, a low-spend window, or a short break.
```

Stressed:

```text
Your recent pattern suggests you may be stretched thin. You do not need to fix everything today; start with one meal and one planned spend decision, then check in again.
```

Avoid clinical language:

- Do not say "diagnosis".
- Do not say "depression".
- Do not say "mental illness".
- Do not say "medical advice".

This is a student wellness nudge, not healthcare software.

### 5. Optional Bedrock

If you add Bedrock for the wellness message, keep it optional.

Rules:

- Use `BEDROCK_ENABLED`.
- If disabled, return fallback message.
- If Bedrock fails or times out, return fallback message.
- Do not block dashboard rendering on Bedrock.
- Keep the prompt short and cheap.
- Do not send raw notification text to Bedrock.

Prompt shape:

```text
A college student's last 7 days show:
- Late-night payment count: <n>
- Hours since last food transaction: <x>
- Financial runway days: <n>
- In exam period: <true/false>
- Spending velocity change: <n> percent

Write 2 short sentences. Be warm, direct, and non-clinical.
Give one specific action for today.
Do not mention diagnosis or medical advice.
```

This is optional. Do not spend more than 90 minutes on Bedrock if it becomes annoying.

## Frontend Requirements

### 1. API Helper

Add:

```ts
export async function getWellnessInsights() {
  return apiRequest("/api/insights/wellness");
}
```

File:

```text
frontend/src/lib/api/db.functions.ts
```

### 2. Dashboard Card

Add the Wellness Index card near the top of:

```text
frontend/src/routes/_authenticated/dashboard.tsx
```

Recommended placement:

- Below the first top header/summary area.
- Above or beside the runway card.
- On mobile, it should appear before lower-priority charts.

### 3. Mobile-First Design

The dashboard currently has a lot of dense visual content. The Wellness card must be readable on a phone.

Design constraints:

- Minimum touch target: around 44px height.
- Avoid tiny 8px labels except secondary metadata.
- Avoid horizontal overflow.
- Signals should wrap cleanly.
- Use a compact vertical layout on mobile.
- Do not use a huge hero section inside the dashboard.
- Keep it utilitarian and scannable.

Suggested card structure:

```text
Student Wellness
[score] [status label]
Short message

Signals:
- Food gap: 11.5h
- Runway: 5 days
- Late-night activity: 3 txns

[I ate] [I need a break] [I'll plan spending]
```

### 4. Response Buttons

Add 2 or 3 lightweight response buttons:

```text
I ate
I need a break
I'll plan spending
```

On click, post to existing endpoint:

```text
POST /api/checkins
```

Payload example:

```json
{
  "response": "wellness_need_break",
  "stress_note": "User tapped wellness check-in: I need a break",
  "suggestion_given": "wellness_index",
  "food_gap_hours": 11.5
}
```

Use existing `insertCheckinLog` helper unless you need a small extension.

### 5. Empty/Loading/Error States

The card must handle:

- Loading: skeleton or muted placeholder.
- No transactions: say "Add a few spends to build your wellness pattern."
- Backend error: do not break dashboard. Show a small fallback card.
- Score available: show the full card.

## Backend Acceptance Criteria

The backend is acceptable when:

- `python -m compileall backend/app` passes.
- Existing `/api/insights` still works.
- New `/api/insights/wellness` works for logged-in users.
- It does not leak another user's data.
- It returns useful output with no transactions.
- It returns useful output with food/runway/late-night signals.
- Bedrock disabled does not break anything.

Manual test idea:

1. Create a test user.
2. Add a few manual transactions:
   - food transaction
   - late-night transaction if possible by editing DB or using current time if late
   - subscription transaction
3. Call:

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/api/insights/wellness" -Headers @{ Authorization = "Bearer <token>" }
```

## Frontend Acceptance Criteria

The frontend is acceptable when:

- `npm.cmd run check --workspace=frontend` passes.
- `npm.cmd run build --workspace=frontend` passes.
- Dashboard opens on desktop.
- Dashboard opens on mobile width.
- No text overlaps in the Wellness card.
- Buttons are tappable.
- Check-in button posts successfully.
- A backend error does not blank the dashboard.

Use browser responsive mode and test at:

```text
390 x 844
430 x 932
1366 x 768
```

## Product Narrative For Demo

This feature should let us say:

```text
PocketBuddy does not just track money after you spend it. It detects silent stress patterns: late-night payments, skipped meals, exam pressure, and shrinking financial runway. Then it nudges the student with one practical action instead of overwhelming them.
```

Demo script for this card:

1. Show Android transaction ingestion.
2. Show dashboard updating.
3. Point at Wellness Index:

```text
Because this student has a long food gap, exam pressure, and low runway, PocketBuddy moves them into Watch mode. The AI/fallback insight turns the raw pattern into one simple next action.
```

4. Tap "I need a break" or "I ate".
5. Say:

```text
The check-in is logged without turning PocketBuddy into a medical app. It is a lightweight support loop built around campus behavior.
```

## PRD Cleanup Task

If you have time after the feature works, update:

```text
docs/Initial-PRD.md
```

Fix stale stack references:

- Replace Next.js with Vite React 19.
- Replace Supabase with MongoDB Atlas.
- Replace Express with FastAPI + Motor.
- Replace ngrok demo language with EC2 + Nginx deployment.
- Mention Android Kotlin connector.
- Mention optional Bedrock, not mandatory Bedrock.

Add Wellness Index section:

```text
Student Wellness Index combines financial runway, meal gaps, late-night payment activity, exam window, and spending velocity to detect stress patterns. It produces a non-clinical routine nudge and optional Bedrock-generated personalized insight.
```

Keep claims honest:

- Do not add unsourced health improvement percentages.
- Do not claim medical detection.
- Do not claim production security if it is demo-level.

## What Not To Build

Do not build:

- Real OTP.
- JWT refresh token system.
- CloudFront/API Gateway deployment.
- DynamoDB migration.
- Real travel recommender.
- Full therapy chatbot.
- Notification push system.
- New Android behavior.
- New auth provider.

These are not the highest-leverage tasks before submission.

## PR Size Discipline

Keep the PR under control.

Recommended commits:

1. `feat: add wellness insights endpoint`
2. `feat: surface wellness index on dashboard`
3. `docs: align prd with wellness narrative`

Avoid a single huge commit if possible.

If generated files or build artifacts appear, do not commit them.

## Coordination With Nishant

Nishant is responsible for:

- AWS EC2 deployment.
- MongoDB Atlas connection.
- Nginx/systemd setup.
- Android wireless testing against EC2.
- Updating Android webhook to EC2 URL.

You are responsible for:

- Wellness Index.
- Dashboard mobile usability for the new card.
- PRD/demo story.

Before opening PR, tell Nishant:

- What files changed.
- Whether backend env changes are needed.
- Whether Bedrock is required or optional.
- What commands passed.
- Any manual steps needed to demo.

## Final Done Definition

This work is done when all are true:

- `/api/insights/wellness` returns a score and signals.
- Dashboard shows Wellness Index cleanly on mobile.
- Response buttons log check-ins.
- Existing dashboard, transactions, cart pool, and companion pages still open.
- Frontend type check passes.
- Frontend build passes.
- Backend compile passes.
- The PRD no longer contradicts the actual stack.
- Nishant can demo the feature after AWS deployment without extra setup.
