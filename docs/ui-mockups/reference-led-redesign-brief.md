# PocketBuddy UI Redesign Brief

Status: planning artifact, not implementation.

This brief supersedes the earlier generic dashboard direction. The next UI pass must preserve PocketBuddy's current product system and improve hierarchy only. Do not redesign the brand, palette, shell, or tone.

## Reference Inputs

Read with this brief:

- `docs/ui-mockups/broad-reference-ui-study.md`
- `output/ui-references/ynab-features.png`
- `output/ui-references/monzo-pots.png`
- `output/ui-references/rocket-money-home.png`
- `output/ui-references/copilot-money-home.png`
- `output/ui-references/apple-health.png`
- `output/ui-references/apple-health-support-highlights.png`
- `output/ui-references/uber-price-estimate.png`
- `output/ui-references/google-maps-commute-help.png`
- `output/ui-references/splitwise-home.png`
- `output/ui-references/phonepe-split-expenses.png`
- `output/ui-references/swiggy-play-store.png`
- Dribbble, Behance, and Pinterest inspiration searches for finance, wellness, route planning, and expense splitting.

## Non-Negotiable Theme Lock

PocketBuddy already has a visual identity. Keep it.

Use:

- current `AppShell` sidebar and mobile bottom nav;
- current PocketBuddy logo SVG, not a new text or coin mark;
- `#111113`, `#18181b`, `#1f1f23`, `#27272a` in dark mode;
- `#f8f8f9`, `#ffffff`, `#f1f1f3`, `#e4e4e7` in light mode;
- primary `#e86f51` / dark `#f08a68`;
- status colors only for meaning: green, amber, red;
- Inter, tabular numbers, compact cards, low visual noise.

Reject:

- neon fintech palettes;
- purple/blue gradients;
- decorative blobs, glassmorphism, glowing rings;
- marketing hero typography in authenticated pages;
- generic SaaS KPI grids;
- copying Dribbble/Behance shots directly.

## Product Direction

The product concept for the UI is:

> PocketBuddy Daily Guard

Meaning: each main screen should lead with the single decision a student needs, then expose evidence and details.

The screen should not feel like "analytics first." It should feel like "what should I do next, and why?"

## Dashboard

Primary question:

> What should I do today?

Use the pattern:

1. Daily Guard card
   - One state: safe, tight, meal gap, exam mode.
   - One recommendation.
   - One primary action.
   - One evidence line.

2. Money facts
   - Remaining.
   - Safe today.
   - Runway.
   - Reserved.

3. Signals
   - Meal signal.
   - Recent sync.
   - Pool balance.
   - Recurring payment.

4. Secondary detail
   - Recent transactions.
   - Food suggestion.
   - Travel warning only if relevant.

Do not place charts, model details, or many equal-weight cards in the first viewport.

## Runway

Primary question:

> Will I make it to reset, and what changes that?

Use the pattern:

1. Forecast answer
   - Expected days.
   - Low case.
   - Shortfall probability.
   - Reset date.

2. Allocation strip
   - Flexible cash.
   - Reserved recurring.
   - Pending pool recovery.
   - Food pace.

3. Top 3 drivers
   - No long explanation.
   - Each driver gets impact and one sentence.

4. Try one change
   - Show days recovered or risk reduced.
   - Keep sliders and model details behind Details.

Do not make the first view a cockpit. The math can exist, but the first screen must be a decision summary.

## Travel

Primary question:

> What is fair for this route and time?

Use the pattern:

1. Plan ride
   - From.
   - To.
   - When.
   - Intent: cheapest, safer, fastest.

2. Fair range
   - Fare range.
   - Trust label.
   - Source count and freshness.

3. Quote check
   - Route and time visible above quote input.
   - Result: fair, slightly high, high, avoid.

4. Coach
   - Only after quote result.
   - Must cite computed fare range, not invented numbers.

Do not show detached warnings or hardcoded route notes.

## Food

Primary question:

> What affordable, available, trusted food option works right now?

Use the pattern:

1. Now-open shortlist.
2. Meal signal.
3. Repeated vendor ask-once insight.
4. Menu verification state.

Do not copy delivery marketplace density. PocketBuddy recommends, it does not sell food.

## Pool

Primary question:

> Who owes whom, and what is verified?

Use the pattern:

1. Pool state.
2. Participant payment state.
3. Netting result.
4. Verification path: auto if Android sync sees credit, manual UTR fallback if not.

Do not expose private data in public join views.

## Mockup Requirements

The next mockup must include:

- Dashboard normal.
- Dashboard risk.
- Dashboard meal/exam state.
- Runway summary.
- Travel route and quote.
- Mobile versions for Dashboard, Runway, Travel.

Each mockup must:

- use the existing shell proportions;
- avoid oversized hero cards;
- keep all copy student-practical and non-shaming;
- keep visible data realistic for PocketBuddy;
- avoid adding new product features just to make the UI look fuller.

## Approval Gate

Before production UI changes, inspect the screenshots and answer:

1. Does it still look like PocketBuddy?
2. Can a student understand the first action in 3 seconds?
3. Is there one clear visual focal point?
4. Are Dashboard, Runway, and Travel clearly different jobs?
5. Is anything decorative without helping the decision?

If any answer is weak, do not implement production UI yet.

