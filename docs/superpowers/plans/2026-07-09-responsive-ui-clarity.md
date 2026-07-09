# Responsive UI Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Dashboard, Runway, and Travel visually calmer and fully responsive without removing or burying existing product features.

**Architecture:** Keep the current React/TanStack route structure and Tailwind token system. Add small reusable layout primitives and apply them to high-noise sections so the first screen becomes decision-first, while all existing controls remain reachable within the same page or current tabs/dialogs.

**Tech Stack:** React, TypeScript, TanStack Router, Tailwind CSS v4 tokens, existing shadcn-style UI components, Playwright screenshots.

---

## Non-Negotiables

- Do not remove features from Dashboard, Runway, or Travel.
- Do not replace the current PocketBuddy brand, colors, typography, AppShell, sidebar, or mobile nav.
- Do not introduce new large gradients, glassmorphism, decorative blobs, or external UI libraries.
- Do not solve clutter by shrinking text until it becomes unreadable.
- Do not allow horizontal overflow at mobile widths.
- All long labels, amounts, route names, merchant names, and hints must wrap or truncate intentionally.
- Keep Transactions as the quality benchmark; it already feels closest to the desired clarity.

## File Structure

- Modify: `frontend/src/styles.css`
  - Add route-agnostic utility classes for safe wrapping, decision cards, compact fact grids, mobile-safe overflow, and horizontal snap strips.
- Modify: `frontend/src/routes/_authenticated/dashboard.lazy.tsx`
  - Preserve all Dashboard features, but reorganize the top visible hierarchy around one daily decision, compact metrics, and grouped action sections.
- Modify: `frontend/src/routes/_authenticated/runway.lazy.tsx`
  - Preserve forecast, scenarios, commitments, horizons, guide modal, affordability calculator, AI/intel, and simulation controls. Improve grouping and reduce competing headers.
- Modify: `frontend/src/routes/_authenticated/travel.lazy.tsx`
  - Preserve route planning, quote check, time selection, report flow, community trust, AI coach, candidates, map/route evidence, and safety notes. Make route context explicit for every quote check.
- Test: `npm.cmd run check --workspace=frontend`
- Verify: Playwright screenshots for Dashboard, Runway, and Travel at desktop and mobile widths.

---

## Task 1: Add Safe Layout Utilities

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Add reusable classes**

Add utility classes under `@layer base` or a new `@layer components` block:

```css
@layer components {
  .pb-page-stack {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1rem;
  }

  .pb-section-card {
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 1rem;
    background: color-mix(in srgb, var(--card) 86%, transparent);
  }

  .pb-wrap-anywhere {
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: normal;
  }

  .pb-truncate-soft {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pb-fact-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
    gap: 0.75rem;
  }

  .pb-action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
    gap: 0.875rem;
  }

  .pb-mobile-scroll-strip {
    display: flex;
    min-width: 0;
    gap: 0.5rem;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scroll-snap-type: x proximity;
  }

  .pb-mobile-scroll-strip > * {
    scroll-snap-align: start;
  }
}
```

- [ ] **Step 2: Run type check**

Run:

```powershell
npm.cmd run check --workspace=frontend
```

Expected: TypeScript passes. CSS-only changes should not affect TypeScript.

---

## Task 2: Dashboard Decision-First Pass

**Files:**
- Modify: `frontend/src/routes/_authenticated/dashboard.lazy.tsx`

- [ ] **Step 1: Identify existing Dashboard feature groups**

Keep these groups present:

- daily allowance/runway/safe spend
- recent transactions and companion sync
- wellness/meal gap/exam check-in
- campus food intelligence and food review
- recurring commitments
- shared pools and recoveries
- travel warnings/savings
- merchant identification and manual transaction dialogs
- parser/review flows

- [ ] **Step 2: Reorder top hierarchy**

The first viewport should follow:

1. One decision/action card.
2. Compact facts grid.
3. Feature groups below.

The decision card should use existing calculated data. Do not invent new backend fields.

- [ ] **Step 3: Apply safe wrapping**

Use existing Tailwind plus `.pb-wrap-anywhere` and `.pb-truncate-soft` on:

- merchant names
- food item names
- pool names
- travel route names
- warning copy
- action labels

- [ ] **Step 4: Verify no feature disappearance**

Search the file for the existing major feature anchors before and after edits:

```powershell
Select-String -Path frontend\src\routes\_authenticated\dashboard.lazy.tsx -Pattern "Campus|Food|Pool|Travel|Recurring|Check|Companion|Identify|transaction|review" -CaseSensitive:$false
```

Expected: all groups still exist in the file and visible render paths.

---

## Task 3: Runway Clarity Pass

**Files:**
- Modify: `frontend/src/routes/_authenticated/runway.lazy.tsx`

- [ ] **Step 1: Preserve all runway features**

Keep:

- overview, commitments, horizons tabs
- safety grade and shortfall probability
- flight protocols and simulator toggles
- affordability calculator
- commitments summary
- forecast inputs modal
- guide modal
- charts and horizon cards
- copy runway brief
- AI/intel panel if present

- [ ] **Step 2: Make top answer explicit**

The first viewport should answer:

- expected days left
- safe/day
- shortfall probability
- one next action

Everything else stays available below or inside existing tabs.

- [ ] **Step 3: Prevent text/metric collisions**

Use two-column responsive grids only where each cell has a minimum width. On mobile, collapse to one column or horizontal strips.

- [ ] **Step 4: Verify with seeded data and empty/setup states**

Run local app and inspect:

- account with transactions
- setup-required state, if easy to trigger
- mobile width

---

## Task 4: Travel Clarity Pass

**Files:**
- Modify: `frontend/src/routes/_authenticated/travel.lazy.tsx`

- [ ] **Step 1: Preserve all travel features**

Keep:

- campus selection
- place suggestions
- route estimate
- time selection
- intent selection
- quote check
- split route suggestion
- community report candidates
- report submission
- vote/report ledger
- AI travel coach
- route evidence/source badges
- safety warnings

- [ ] **Step 2: Make route context explicit**

Every quote check area must show the selected route and selected time window near the quote input.

- [ ] **Step 3: Reduce visual competition**

Use one primary panel for “Plan a campus ride”, one panel for “Check a driver quote”, and one grouped panel for “Community evidence / reports”. Keep the rest in existing tabs or below.

- [ ] **Step 4: Verify route names wrap**

Long campus/place names must not overflow cards or buttons at 390px width.

---

## Task 5: Screenshot Verification

**Files:**
- No source files unless visual issues are found.

- [ ] **Step 1: Run frontend check**

```powershell
npm.cmd run check --workspace=frontend
```

- [ ] **Step 2: Start frontend**

```powershell
npm.cmd run dev --workspace=frontend -- --host 127.0.0.1
```

- [ ] **Step 3: Capture screenshots**

Use Playwright at:

- desktop: 1440x900
- mobile: 390x844

Pages:

- `/dashboard`
- `/runway`
- `/travel`

- [ ] **Step 4: Inspect screenshots**

Pass criteria:

- no horizontal overflow
- no clipped button text
- no overlapping metric cards
- mobile nav does not hide primary controls
- all current feature entry points remain visible or reachable

---

## Implementation Notes

The mockup at `docs/ui-mockups/pocketbuddy-daily-guard-mockups.html` is a visual hierarchy reference, not a feature-reduction spec. Production implementation must keep the existing product breadth and apply the mockup’s calmer hierarchy only where it improves scannability.
