# PocketBuddy Broad UI Reference Study

Status: planning artifact. This is not production UI.

Purpose: use broad UI references without letting PocketBuddy become a generic fintech dashboard. Every borrowed pattern below must stay inside the current PocketBuddy visual system: Inter, warm neutral surfaces, zinc borders, compact cards, orange/copper primary, green/amber/red status colors, existing sidebar/bottom navigation, and student-first copy.

## Hard Product Filter

PocketBuddy is not a bank dashboard, a spending chart app, a ride booking app, or a health tracker. It is a student companion that turns passive payment signals into practical next actions.

So the UI should not optimize for:

- showing every metric at once;
- large decorative charts;
- glossy portfolio-style gradient cards;
- moralizing spend behavior;
- medical-sounding wellness claims;
- dense “control center” interfaces.

It should optimize for:

- one clear answer per page;
- the next action before secondary analytics;
- evidence labels that explain why the app is saying something;
- calm urgency when money or routine is at risk;
- repeated-use ergonomics over visual drama.

## Reference Set

### Real Products

| Reference | What It Does Well | What PocketBuddy Should Borrow | What To Reject |
| --- | --- | --- | --- |
| YNAB | Puts spending into jobs and targets before analytics. | “Safe to spend” logic, target/progress framing, goal language. | Full budget ledger mental model on the Dashboard. |
| Monzo Pots | Separates money into simple named buckets. | Reserved money for subscriptions, pool dues, travel, and food. | Making students manually manage many pots. |
| Rocket Money | Surfaces subscriptions, spending insights, and alerts clearly. | Upcoming recurring payment awareness and “avoid surprise” copy. | Adult household-bill framing. |
| Copilot Money | Uses polished transaction categorization and recurring detection. | Strong transaction review and recurring commitment cards. | Premium finance-manager tone. |
| Apple Health | Shows highlights and trends without making every screen a chart wall. | “Today’s important signal” and privacy/control cues. | Any diagnosis-like wording. |
| Headspace | Daily check-in tone is calm and optional. | A dismissible wellness nudge that feels supportive. | Blocking, paternalistic check-ins. |
| Uber | Route and time come before price. | Travel page starts with from/to/when before quote check. | Treating PocketBuddy like a booking app. |
| Google Maps | Commute view gives route state and alternatives. | Route trust, stale warnings, and time-window context. | Full map-heavy UI as default. |
| Splitwise | Makes who owes whom understandable. | Net balance, verified/pending settlement status. | Complex group history on Dashboard. |
| PhonePe Split Expenses | Uses chat/group context and tracking for split flows. | Shared pool state and nudges around repayment. | Becoming a full messaging interface. |
| Swiggy/Zomato | Fast item discovery and availability. | Food cards should show venue, price, availability, confidence. | Delivery marketplace density and promo noise. |

### Visual Inspiration: Dribbble, Behance, Pinterest

These are useful for layout mood only, not visual identity.

| Source Type | Observed Useful Pattern | Borrow Carefully | Reject |
| --- | --- | --- | --- |
| Dark fintech mobile dashboards | Strong first-number hierarchy, recent transactions below. | One top answer plus a short activity list. | Neon gradients, card carousel, generic bank balance UI. |
| Budget tracker mobile shots | Budget breakdown cards and category color chips. | Compact category drivers on Runway and Transactions. | Big donut charts on Dashboard. |
| Wellness dashboards | Daily score plus habit/check-in cards. | One “meal gap / late-night activity” signal with careful copy. | Medical dashboards, body diagrams, health diagnosis. |
| Travel booking app shots | Search form first, result second. | Travel should show route, time, intent, then fair fare. | Tourist discovery visuals, destination hero images. |
| Pinterest finance layouts | Dense visual polish and colorful cards. | Some spacing rhythm and card grouping. | Purple/blue finance palettes, visual clutter, generic SaaS stats. |

## Page-Level Direction

### Dashboard

Reference direction: Apple Health highlights + YNAB “what can I spend?” + Rocket Money alerts.

The Dashboard should answer:

> What should I do today?

Recommended structure:

1. Top “Daily Guard” card
   - One status line: safe, tight, meal gap, exam mode.
   - One recommendation.
   - One primary action.
   - No large hero headline.

2. Four compact money facts
   - Remaining.
   - Safe today.
   - Runway.
   - Reserved.

3. Today’s signals
   - Meal signal.
   - Recent sync.
   - Pool balance.
   - Upcoming recurring payment.

4. Secondary cards
   - Recent transactions.
   - Food suggestion.
   - Travel warning only when relevant.

What to remove from current noisy layouts:

- multiple competing cards with equal weight;
- charts on the first viewport;
- repeated badges;
- technical model labels on Dashboard;
- any “AI command center” styling.

### Runway

Reference direction: YNAB targets + Monzo separated money + finance-dashboard first-number hierarchy.

The Runway page should answer:

> Will I make it to reset, and what changes that?

Recommended structure:

1. Forecast summary
   - Expected days.
   - Low case.
   - Shortfall probability.
   - Reset date.

2. Money allocation strip
   - Flexible cash.
   - Reserved recurring.
   - Pending pool recovery.
   - Food pace.

3. Top 3 drivers
   - Food pace.
   - Recurring commitments.
   - Pool dues/travel spike.

4. “Try one change”
   - A small set of scenario actions.
   - Each action explains days recovered or risk reduced.

5. Details collapsed
   - EWMA, weekday factors, confidence, projection table.

What to reject:

- cockpit-like sliders and gauges visible by default;
- showing model internals before the answer;
- huge grade blocks without practical consequence;
- too many “flight protocol” metaphors if they obscure the student action.

### Travel

Reference direction: Uber upfront pricing + Google Maps commute state.

The Travel page should answer:

> What is fair for this route and time?

Recommended structure:

1. Plan ride
   - From.
   - To.
   - When.
   - Intent: cheapest, safer, fastest.

2. Fair range result
   - Fair range.
   - Trust label.
   - Source count and freshness.

3. Quote check
   - Locked to the selected route and time.
   - Result: fair, slightly high, high, avoid.

4. Coach after result
   - Opens only after quote check.
   - Uses only computed fare range and reports.

5. Community proof
   - Recent reports.
   - Candidate reports needing confirmation.

What to reject:

- detached quote checker with no route context;
- hardcoded warnings that appear for every route;
- full map UI if it makes the first decision slower;
- AI text before deterministic fare result.

### Food

Reference direction: Swiggy/Zomato discovery speed + Apple Health highlights + PocketBuddy crowd verification.

The Food section should answer:

> What is the affordable, available, trusted food option right now?

Recommended structure:

1. Now-open shortlist
   - Venue.
   - Item.
   - Price.
   - Availability window.
   - Verification confidence.

2. Meal signal
   - Last food transaction or mess check-in.
   - Optional prompt if gap is high.

3. Repeated vendor insight
   - Ask once when a vendor repeats.
   - “Is this food, tea, snacks, printing, or other?”
   - Do not nag after classification.

4. Menu verification
   - Pending, verified, disputed.
   - Confidence threshold should scale with campus activity, not fixed 1/3 copy.

What to reject:

- delivery-app promo style;
- public marketplace feel;
- too many food cards on Dashboard;
- irritating quiz popups.

### Pool

Reference direction: Splitwise simplified balances + PhonePe split flow.

The Pool page should answer:

> Who owes whom, and what is verified?

Recommended structure:

1. Pool state
   - Open, checkout, completed.
   - Host requirement for passive verification.

2. Participant list
   - Stable user identity.
   - Item total.
   - Verification state.

3. Netting
   - “2 transfers instead of 5.”
   - Show why without making it math-heavy.

4. Settlement
   - Auto-verified if host Android sync catches credit and UTR.
   - Manual UTR fallback.
   - Ambiguous matches go to review.

What to reject:

- exposing private phone/email data in public pool links;
- participant selector for public payment confirmation;
- chat-like UI unless it clearly helps collection.

## Visual System Constraints

Use:

- existing `AppShell`;
- current SVG logo;
- current sidebar and mobile bottom nav;
- `bg-background`, `bg-surface`, `bg-surface-raised`;
- `border-border`;
- `text-primary`, `text-success`, `text-warning`, `text-destructive`;
- `tnum` for all numbers;
- compact cards with 8-16px radii;
- one accent per card.

Avoid:

- new gradient backgrounds;
- purple/blue dashboard palettes;
- glassmorphism;
- huge donut charts on first viewport;
- decorative blobs/orbs;
- marketing hero copy inside authenticated pages;
- all-caps labels everywhere;
- invented icons when lucide exists.

## Strongest Design Direction

The next mockup should be called:

> PocketBuddy Daily Guard

It should feel like the current app became calmer and more decisive, not like a new app.

The page pattern:

1. Page title.
2. One decision card.
3. Four small facts.
4. One row of relevant signals.
5. Secondary details below or in a side rail.

This gives the demo a memorable behavior:

> PocketBuddy does not show students a financial dashboard. It tells them the one decision that protects their month.

