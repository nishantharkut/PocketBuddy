# Product Clarity Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework Dashboard, Runway, and Travel so PocketBuddy feels like one clear daily decision product instead of a dense collection of unrelated cards.

**Architecture:** Keep the current React route files and API contracts. Do not remove backend-backed features. Change the information hierarchy, responsive layout, and default disclosure so the first viewport answers one user question: "What can I safely do today?"

**Tech Stack:** React, TanStack Router, TanStack Query, existing shadcn-style UI primitives, Tailwind utility classes, existing FastAPI/Mongo-backed data contracts.

---

## Scope Rules

- Do not redesign Food. Dashboard may keep existing food modules lower on the page, but do not rewrite the food feature itself.
- Do not change product colors, logo, fonts, or route names.
- Do not remove functionality. Dense modules can move lower, into tabs, or into compact sections.
- Do not create a landing-page style dashboard. This is an authenticated operational product.
- Preserve the current mobile bottom nav and desktop sidebar.
- Verify with authenticated screenshots on desktop and mobile.

## File Structure

- Modify `frontend/src/routes/_authenticated/dashboard.lazy.tsx`
  - Add daily-decision framing.
  - Reorder sections so one primary action leads.
  - Reduce equal-weight card clutter.
  - Remove forced empty bottom feel by using natural layout flow.
- Modify `frontend/src/routes/_authenticated/runway.lazy.tsx`
  - Split the visible content into feature tabs: Overview, Simulator, Commitments, Breakdown.
  - Keep existing calculations and controls.
  - Move secondary explanation tables out of the first viewport.
- Modify `frontend/src/routes/_authenticated/travel.lazy.tsx`
  - Make route/time/fair fare/quote check the core flow.
  - Move reports and coach behind clearer secondary tabs.
  - Keep the fare range fallback helper added during responsive work.
- Modify `frontend/src/styles.css`
  - Add small reusable layout utilities only if they reduce repeated responsive class noise.

## Task 1: Dashboard Daily Decision Structure

**Files:**
- Modify: `frontend/src/routes/_authenticated/dashboard.lazy.tsx`
- Optional shared utility classes: `frontend/src/styles.css`

- [ ] **Step 1: Identify the current dashboard section boundaries**

Run:

```powershell
rg "Routine signal|Runway status|Meal check|Active pools|Campus intelligence|Recent ledger|Food & Routine|Campus fare guard|Wing activity|Exam window|Runway action" frontend/src/routes/_authenticated/dashboard.lazy.tsx -n
```

Expected: exact section locations for the cards that need reordering.

- [ ] **Step 2: Build one top Daily Guard card**

Use existing values:

- `runwayView.safeDailyPaise`
- `runwayView.expectedRunwayDays`
- `runwayView.dailySpendPaise`
- `wellness`
- `bestAction`
- `bestFood`
- `visibleNudges`

The first card should show:

- primary number: safe daily spend or pause signal
- runway days
- main risk
- one primary CTA

Do not add new API calls.

- [ ] **Step 3: Convert top alerts into compact dismissible signal chips**

Existing nudges should not dominate the page. Keep the information, but place at most two compact alert chips below Daily Guard.

- [ ] **Step 4: Move supporting modules into a clean two-column layout**

Desktop:

- left column: Daily Guard, Next Best Action, Recent Activity, Food & Routine
- right column: Signal Snapshot, Campus Fare Guard, Active Pools, Campus Intel

Mobile:

- one column in the same priority order

- [ ] **Step 5: Fix dashboard bottom whitespace**

Remove any class or layout that forces large empty height. The page should end after the last meaningful section.

- [ ] **Step 6: Verify dashboard**

Capture:

```powershell
npx.cmd --yes playwright screenshot --load-storage output/playwright/auth-storage.json --viewport-size 1440,900 --wait-for-timeout 2500 --full-page "http://127.0.0.1:5173/dashboard" "output/playwright/dashboard-clarity-desktop.png"
npx.cmd --yes playwright screenshot --load-storage output/playwright/auth-storage.json --viewport-size 390,844 --wait-for-timeout 2500 --full-page "http://127.0.0.1:5173/dashboard" "output/playwright/dashboard-clarity-mobile.png"
```

Expected:

- first viewport has one clear daily decision
- no text overflow
- no long empty tail after content

## Task 2: Runway Feature Tabs

**Files:**
- Modify: `frontend/src/routes/_authenticated/runway.lazy.tsx`

- [ ] **Step 1: Keep existing tab state and add feature tabs if needed**

The page already has tab-like concepts. The final visible tabs should be:

- Overview
- Simulator
- Commitments
- Breakdown

Existing "Fixed commitments" can become "Commitments". Existing projection detail can move into Breakdown.

- [ ] **Step 2: Make Overview a summary only**

Overview first viewport should contain:

- runway days
- safe/day or pause state
- main reason
- next recommendation
- compact "what changed" top three drivers

Do not show the calculator, full commitment list, and breakdown table in Overview.

- [ ] **Step 3: Move simulator controls into Simulator tab**

Keep:

- "Can I afford this?"
- daily spend check
- quick presets
- plan intensity
- runway simulator result

- [ ] **Step 4: Move commitments into Commitments tab**

Keep:

- confirmed recurring
- suspected recurring
- track / not recurring / hide actions

- [ ] **Step 5: Move accounting detail into Breakdown tab**

Keep:

- allowance cycle
- reserved vs flexible
- reserved costs
- flexible forecast

- [ ] **Step 6: Verify Runway**

Capture:

```powershell
npx.cmd --yes playwright screenshot --load-storage output/playwright/auth-storage.json --viewport-size 1440,900 --wait-for-timeout 2500 --full-page "http://127.0.0.1:5173/runway" "output/playwright/runway-clarity-desktop.png"
npx.cmd --yes playwright screenshot --load-storage output/playwright/auth-storage.json --viewport-size 390,844 --wait-for-timeout 2500 --full-page "http://127.0.0.1:5173/runway" "output/playwright/runway-clarity-mobile.png"
```

Expected:

- Overview is not a wall of all runway features
- tabs are clear and responsive
- no overflow

## Task 3: Travel Fare Decision Flow

**Files:**
- Modify: `frontend/src/routes/_authenticated/travel.lazy.tsx`

- [ ] **Step 1: Keep the top route planner but simplify the result hierarchy**

The order should be:

1. Plan ride
2. Selected route summary
3. Fair fare answer
4. Quote input
5. Coach / Split / Reports as secondary details

- [ ] **Step 2: Convert fare timing into a compact selector**

Keep selectable timing, but do not let timing cards dominate the screen. Show timing as a compact row or segmented control above the quote card.

- [ ] **Step 3: Make quote check the main interaction**

The "Check a driver quote" block should show:

- route context
- active mode
- fair range
- quote input
- result state

Move detailed fare distribution lower.

- [ ] **Step 4: Reduce AI-looking copy**

Replace generic paragraphs with concrete fare guard language:

- "Fair range"
- "Walk away above"
- "Use app quote as comparison"
- "Avoid station gate flat rate"

- [ ] **Step 5: Verify Travel**

Capture:

```powershell
npx.cmd --yes playwright screenshot --load-storage output/playwright/auth-storage.json --viewport-size 1440,900 --wait-for-timeout 2500 --full-page "http://127.0.0.1:5173/travel" "output/playwright/travel-clarity-desktop.png"
npx.cmd --yes playwright screenshot --load-storage output/playwright/auth-storage.json --viewport-size 390,844 --wait-for-timeout 2500 --full-page "http://127.0.0.1:5173/travel" "output/playwright/travel-clarity-mobile.png"
```

Expected:

- first visible result answers whether a fare is fair
- no NaN range
- no overwhelming technical dashboard feel

## Task 4: Final Verification

**Files:**
- All modified frontend files

- [ ] **Step 1: Run TypeScript**

```powershell
npm.cmd run check --workspace=frontend
```

Expected: `tsc --noEmit` exits 0.

- [ ] **Step 2: Run production build**

```powershell
npm.cmd run build --workspace=frontend
```

Expected: Vite build exits 0.

- [ ] **Step 3: Diff audit**

```powershell
git diff --stat
git diff --check
```

Expected:

- only intended files changed
- no whitespace errors

- [ ] **Step 4: Screenshot audit**

Inspect:

- `output/playwright/dashboard-clarity-desktop.png`
- `output/playwright/dashboard-clarity-mobile.png`
- `output/playwright/runway-clarity-desktop.png`
- `output/playwright/runway-clarity-mobile.png`
- `output/playwright/travel-clarity-desktop.png`
- `output/playwright/travel-clarity-mobile.png`

Expected:

- clear hierarchy
- no overflowing text
- no missing primary product actions
- food feature still visible but not redesigned
