# PocketBuddy Travel Guard Context

Last updated: 2026-07-08

This document is the single handoff note for PocketBuddy's Travel Guard feature. It explains what the feature is, what is implemented, what to show in the demo, what not to claim, and how the routing/geocoding layer should be hardened after the hackathon version.

## One-Line Positioning

Travel Guard helps a student answer one practical question before getting into a cab, auto, bike, or shared ride:

> "Is this fare fair for this route, right now, with my campus context?"

It is not a generic maps feature. It is a student affordability and safety feature connected to monthly runway, local campus routes, community fare memory, and AI negotiation help.

## Finals Product Lens

This section exists because passing tests is not enough for the Amazon finals. The feature must also survive product, AWS architecture, trust, safety, and business scrutiny.

### What The Jury Should Understand In 20 Seconds

Travel Guard is a campus fare trust layer, not a ride-hailing clone.

It gives a student:

- expected local fare range before accepting a ride;
- source label for why that range is trusted;
- quote comparison when a driver or app quote looks high;
- user-selected timing context for morning, off-peak, evening, or late-night fare checks;
- safer route/ride-pool suggestion when sharing is practical;
- Bedrock-generated negotiation help grounded only on deterministic fare context.

The strongest sentence:

> PocketBuddy does not claim to know every live ride-app price. It gives students a defensible campus fare guardrail using mapped distance, local fare rules, trusted student reports, and grounded AI guidance.

### Why This Is Relevant To The Original Problem Statement

The original problem statement was not "build a maps app." It asked for an AI financial and wellness assistant for students who struggle with budgeting, food expenses, stress, irregular routines, and campus living decisions.

Travel fits because:

- transport is a repeated student expense, especially for railway stations, bus stands, airports, internships, exams, and late-night returns;
- new students often lack local price memory and are easy to overcharge;
- overspending on travel directly reduces monthly runway;
- stressful or unsafe travel moments are exactly where students need short, practical support, not a spreadsheet.

### What Makes This Strong

- The feature is decision-oriented. It answers "should I accept this quote?"
- The trust model is explicit. It separates model estimates, learning signals, and student-verified fares.
- Student reports are not blindly trusted. They are deduped, filtered, thresholded, and made stale over time.
- Bedrock is not the source of truth. It only turns computed fare facts into a script and tactics.
- The routing/geocoding dependency is now swappable and cached. Public providers are no longer hidden hardcoded assumptions.
- Split-route advice is framed as a curated public-transfer suggestion, not a universal instruction. Late-night and luggage contexts suppress the recommendation.

### What Would Weaken The Feature In A Demo

Avoid these mistakes:

- showing random place searches live without pretesting them;
- saying "live Ola/Uber/Rapido price comparison";
- showing OSRM/Nominatim as the main value;
- using developer-first labels like "OSRM cached" as the headline;
- showing a split-route idea as safe for every route or every time of day;
- spending too long on route internals before the student pain is clear;
- letting AI output invent fare numbers;
- claiming physical safety guarantee.

The route-source row should be support text, not the main story. The main story is fare confidence and student decision support.

### User-Facing Wording Rule

Do not expose implementation plumbing as product copy.

Prefer:

- `Route source: Mapped road route`
- `Mapped road route from an OSRM-compatible provider, cached by PocketBuddy. Not live ride-app pricing.`
- `ETA confidence: Medium`
- `Curated public transfer via <landmark>. Use it only when the area is busy and boarding the next vehicle is easy.`

Avoid:

- `Route source: OSRM`
- `Demo uses public OSRM`
- `Nominatim fallback`
- `Haversine estimate` as the primary user-facing label
- `Split near <landmark>` as a standalone instruction

Those technical terms can be explained in architecture or Q&A, not as the first thing a student sees.

### Judge-Safe Architecture Framing

Say:

> Travel uses a provider abstraction style: OSRM-compatible routing, Nominatim-compatible geocoding, backend caching, and deterministic fallbacks. Public providers are acceptable for prototype traffic; production swaps those URLs to self-hosted AWS services or managed mapping providers without changing the product flow.

Do not say:

> We depend on public OSRM/Nominatim for production.

### Judge-Safe AI Framing

Say:

> The deterministic engine computes fare range, confidence, source, report count, and quote delta first. Bedrock Nova Lite receives those facts and generates a short negotiation script and safety note. The prompt explicitly forbids invented fare numbers or live ride-app claims.

Do not say:

> AI calculates the fare.

### Current Merge Readiness View

Current strengths:

- backend route/geocode provider URLs are configurable;
- backend cache reduces repeated public-provider calls;
- route calculation has fallback behavior;
- source metadata is returned to the frontend;
- route trust lifecycle matches Food Guard's broader "signals first, trust later" philosophy;
- quote checking and AI coach now use a selected travel-time context instead of only the device's current clock;
- split suggestions include source and time context, are backend-owned, and are suppressed for late-night/luggage scenarios;
- the UI now shows a compact "Why this fare?" panel with route source, fare source, report status, timing context, and runway impact;
- recent synced travel-like payments can be confirmed into fare reports, so reporting is not only a manual form;
- ride-pool creation is backend-blocked when the host has no verified contact or when the departure context is unsafe;
- tests cover helper behavior and cached OSRM route reuse.

Current risks to manually test:

- place suggestion UX with the demo campus;
- route estimate for 2 or 3 seeded or known routes;
- source row wording and wrapping on desktop and mobile;
- synced payment candidate rendering with a seeded travel-like transaction;
- AI coach after route estimation;
- fallback behavior when a weird/unresolved place is typed.

Recommended demo rule:

> Use known, seeded, or pretested routes during the finals demo. Do not improvise random geocoding queries in front of judges.

## Customer Pain

The pain is strongest for:

- first-year students reaching a new campus city;
- students returning late from railway stations, bus stands, airports, exams, or internships;
- students with luggage who cannot easily bargain or compare routes;
- students with limited monthly allowance who do not know whether a driver quote is normal;
- students in smaller cities where local travel prices are informal, negotiated, and inconsistent.

The product value is not "show a map." The value is "reduce uncertainty before a student overpays or takes an unsafe route."

## What Is Implemented

### 1. Route And Fare Surface

The Travel page shows campus routes, estimated distance, duration, mode options, expected fare range, and a suggested anchor fare.

Mode examples:

- Auto
- Cab
- Bike
- Shared Auto / Tempo

For each mode, PocketBuddy exposes:

- `min_fare`
- `max_fare`
- `median_fare`
- `fare_source`
- `fare_basis`
- `report_sample_size`
- `report_threshold`
- trust metadata

### 2. Distance Model Fallback

When there are not enough trusted student fare reports, PocketBuddy uses a distance and city/campus fare model.

This is intentionally labelled as:

- `Model estimate`

This prevents overclaiming. It tells the user and judges that the fare is useful but not yet community-verified.

### 3. Crowdsourced Fare Reports

Students can report what they actually paid after a ride. Reports are treated as signals first, not truth.

The backend filters reports before they influence fare windows:

- invalid or non-positive fares are ignored;
- stale reports outside the trust window are ignored;
- disputed reports are ignored;
- repeated reports from the same reporter identity are deduplicated;
- only the latest report per reporter counts;
- route/mode fare windows update only after the adaptive threshold is reached.

### 4. Shared Trust Lifecycle With Food Guard

Food Guard and Travel Guard now tell the same trust story:

| Trust Stage | Food Meaning | Travel Meaning |
| --- | --- | --- |
| `Model estimate` / baseline | Curated or model-backed item data | Distance and campus-local fare model |
| `Learning` | Student/menu signals exist but are not enough yet | Some trusted fare reports exist, but not enough to anchor recommendations |
| `Student verified` | Enough independent confirmations exist | Enough independent fare reports exist for the route/mode |
| `Disputed` | Item/price has enough negative signals | Fare report is excluded from model influence |
| `Stale` | Old data should not be trusted blindly | Old fare reports reduce confidence |

Judge-safe phrasing:

> Food and Travel use the same trust lifecycle, but different domain logic. Food verifies item prices. Travel verifies route-mode fare ranges. Student submissions are signals first, not truth.

### 5. Adaptive Verification Threshold

Travel no longer uses a tiny fixed "3 reports" rule.

The current backend uses:

- floor: 5 independent trusted reports;
- ceiling: 25 reports;
- sub-linear scaling as the route reporter base grows.

Why this matters:

- 3 reports is too easy to game.
- 3 reports is too weak for campuses with thousands of students.
- The threshold should scale without requiring hundreds of reports for every route.

Current rule:

```text
threshold = max(5, min(25, ceil(1.25 * sqrt(max(active_reporters, 10)))))
```

This is not a perfect production reputation system, but it is defensible for the hackathon version because it avoids both extremes: blind trust after 3 votes and impossible thresholds for cold-start campuses.

### 6. Robust Fare Range

When enough reports exist, PocketBuddy calculates a robust fare range instead of using a simple average.

The current logic:

- sorts positive fare values;
- computes quartiles;
- applies IQR-based outlier filtering;
- falls back to the full set if filtering would remove too much evidence;
- uses percentiles for min, max, and median:
  - 15th percentile for lower range;
  - 85th percentile for upper range;
  - 50th percentile for median.

This reduces damage from one fake or extreme fare report.

### 7. Quote Comparison

Students can enter:

- driver quote;
- paid fare;
- final negotiated fare;
- optional app quote entered manually.

PocketBuddy compares these against the current fare anchor and labels the situation.

Important: the app quote is user-entered. It is not live Ola/Uber/Rapido pricing.

Judge-safe wording:

> We do not claim live ride-hailing price integration. We let the student compare a quote they see with PocketBuddy's route fare guardrail.

### 8. Runway-Aware Fare Evidence

Every mode can now carry decision metadata that explains the fare in product language:

- route source, such as mapped road route or fallback estimate;
- fare source, such as model estimate, learning, or student verified;
- report count and adaptive threshold;
- timing context;
- pricing disclaimer;
- runway impact after the ride.

This matters because Travel Guard is not just a route tool. A fare decision should show whether the ride fits the student's current allowance runway.

### 9. Payment-Sync Fare Report Candidates

Travel Guard can suggest one-tap fare reports from recent synced transactions.

Flow:

1. Android companion or webhook sync records a debit transaction.
2. Backend checks whether the merchant/category looks travel-like.
3. Backend matches the amount against the selected route's trusted fare band.
4. UI asks the student to confirm the synced payment as a fare report.
5. Confirmed candidates enter the same fare-report trust lifecycle as manual reports.

This keeps the automation story honest:

- PocketBuddy does not silently publish every transaction as a public fare.
- The user confirms the route/mode.
- A synced payment is still a signal until enough independent reports exist.

### 10. Travel Pool Safety Guardrails

Ride-pool APIs now treat travel sharing as a safety-sensitive action, not just a cost split.

Backend rules:

- host must have a verified contact number on profile/user data;
- departure time must be valid and not in the past;
- pool size must stay within 2 to 6 seats;
- route must belong to the user's campus;
- mode must exist for that route;
- late-night shared modes are blocked instead of merely warned.

Why this matters:

- a ride pool without host contact is not accountable;
- late-night shared travel is not the right place to optimize only for cost;
- future UI can show these blocks clearly without relying on frontend-only checks.

### 11. Bedrock Nova Lite Negotiation Coach

The AI coach receives only deterministic context:

- college;
- city/region;
- route name;
- distance;
- selected mode;
- min/max/median fare;
- fare anchor and source;
- trusted report count;
- user situation;
- optional user-entered app quote.

The prompt explicitly forbids:

- inventing fare numbers;
- inventing live traffic;
- inventing route distance;
- inventing live Ola/Uber/Rapido prices;
- inventing report counts;
- inventing safety claims.

The AI output is meant to be a short script, tactics, and safety note. It is not the source of fare truth. The deterministic fare engine is the source of fare truth.

### 12. Routing And Geocoding Provider Hardening

The travel stack no longer treats public OSRM/Nominatim as hidden hardcoded dependencies.

Current implementation:

- Nominatim endpoint is configurable through `NOMINATIM_GEOCODER_URL`.
- OSRM endpoint is configurable through `OSRM_ROUTE_URL`.
- Geo requests use an identifying PocketBuddy `User-Agent`.
- Nominatim suggestions are cached in `travel_geo_cache`.
- Deliberate Nominatim geocode resolutions are cached in `travel_geo_cache`.
- OSRM route geometry and ETA are cached in `travel_geo_cache`.
- The route estimate response exposes `routing_provider`, `routing_cache_hit`, and `routing_source_note`.
- The UI shows a compact route-source row after estimation.

Why this matters:

- the demo avoids repeated public-provider calls for the same campus query or route;
- production can swap public demo providers for self-hosted or managed providers without changing the product flow;
- judges can see that routing source and confidence are not hidden.

## What To Show In The Demo

Use Travel Guard as a short, high-impact segment. Do not spend too much time explaining routing internals.

### Demo Flow

1. Open Travel.
2. Select or search a campus route.
3. Show mode cards:
   - Auto;
   - Cab;
   - Shared Auto / Tempo.
4. Point to trust label:
   - `Model estimate`, or
   - `Learning`, or
   - `Student verified`.
5. Enter a driver quote that is above the fair range.
6. Show overcharge/guardrail result.
7. Open AI coach.
8. Show the negotiation script and safety note.
9. Optional: open fare reports and show that one report is signal, not truth.

### Suggested Voiceover

> Travel is where new students overpay because they do not know the local fare. PocketBuddy does not pretend one report is truth. It starts with a distance model, learns from actual student-paid fares, and only marks a route as student verified after enough independent confirmations. The AI coach then turns that verified range into a practical negotiation script and safety note.

### What To Avoid In The Demo

Do not say:

- "We fetch live Ola/Uber/Rapido fares."
- "This is a guaranteed fare."
- "This route is always safe."
- "The AI decides the fare."
- "One student report updates the price."

Say instead:

- "This is a fare guardrail."
- "The source is shown clearly."
- "Student reports are signals until enough independent confirmations exist."
- "The AI is grounded on deterministic fare context."

## Judge Questions And Strong Answers

### Q1. Where do the fare numbers come from?

Answer:

> The fare number starts from a distance and campus-local fare model. As students report actual paid fares, those reports enter a trust lifecycle. Only enough independent, recent, non-disputed reports can replace the model as the student-verified anchor.

### Q2. Why should we trust student reports?

Answer:

> We do not trust a single report. We dedupe reporter identity, filter stale and disputed reports, reject invalid amounts, and require an adaptive threshold before reports influence recommendations. Until then, the UI says Learning or Model estimate.

### Q3. Can one student manipulate a route fare?

Answer:

> Not easily. Multiple submissions from the same reporter identity count once. Disputed reports are excluded. The route needs enough independent confirmations before the fare model changes.

### Q4. Why not integrate Ola/Uber/Rapido live prices?

Answer:

> Live ride-hailing prices are not reliably available as public APIs for this use case. We chose a more defensible route: compare user-visible quotes against official/community fare bands and actual student-paid reports. The product still helps at the decision moment without depending on brittle unofficial scraping.

### Q5. What is the role of Bedrock?

Answer:

> Bedrock does not invent the fare. PocketBuddy computes the fare window first, then Bedrock converts that context into a short negotiation script, tactics, and safety note. The prompt explicitly forbids invented numbers or live ride-hailing claims.

### Q6. How does this scale beyond one campus?

Answer:

> The route model is campus-scoped. Each campus builds its own local fare memory. Sparse routes stay on model estimates; busy routes become student verified. Production routing and geocoding would move from public demo services to either self-hosted open-source services on AWS or managed commercial providers.

## Current Technical Limitations

### 1. No Live Ride-Hailing Pricing

Travel Guard does not fetch live fares from Ola, Uber, Rapido, or other ride-hailing platforms.

Reason:

- public, stable, production-appropriate fare APIs are not generally available for all these platforms;
- unofficial scraping would be brittle and risky;
- live price changes are volatile and can distract from the core value: fair-fare guardrails.

Current design:

- user may manually enter an app quote;
- PocketBuddy compares it against model/community fare anchors;
- AI coach mentions app quote only when supplied.

### 2. Public OSRM / Nominatim Are Not Production Infrastructure

The current prototype can use public OSRM/Nominatim endpoints for demo-scale routing/geocoding with backend caching and an identifying user-agent. That is acceptable for a hackathon prototype, but not the final production dependency.

Official constraints:

- Nominatim public API has an absolute maximum of 1 request per second per application and requires a valid User-Agent or Referer.
- Nominatim public API discourages bulk geocoding and requires caching.
- Nominatim public API forbids autocomplete-style client-side use, systematic queries, and reselling/geocoding-as-a-service behavior.
- OSRM public demo servers are for demonstration and do not provide production uptime, latency, or data freshness guarantees.

Sources:

- Nominatim Usage Policy: https://operations.osmfoundation.org/policies/nominatim/
- Nominatim project overview: https://nominatim.org/
- OSRM project: https://project-osrm.org/
- OSRM backend repository: https://github.com/Project-OSRM/osrm-backend

### 3. Data Freshness

Fare reports can become outdated because:

- fuel prices change;
- campus gates and routes change;
- admission season and exam season affect prices;
- local driver behavior changes.

Mitigation currently:

- provider URLs are configurable;
- backend cache avoids repeated identical calls;
- public providers are never called from browser code directly;
- stale reports reduce confidence;
- old reports are filtered from trusted fare calculation;
- UI exposes source and trust level.

Future:

- route-level freshness badge;
- seasonal fare windows;
- report expiry by route volatility.

### 4. Trust Is Still Lightweight

The current trust model is stronger than fixed votes but not a full reputation system.

Missing production-grade pieces:

- reporter reputation over time;
- cross-checking fare reports against real transaction notifications;
- route-specific abuse detection;
- campus moderator review;
- device/account age weighting.

### 5. Safety Is Advisory

Travel Guard can show safety notes and safer alternatives, but it is not a guarantee of physical safety.

Do not claim:

- "safe route guarantee";
- "driver safety verification";
- "emergency response."

## OSRM And Nominatim Improvement Path

### What Has Been Improved Immediately

These changes are now implemented in the branch:

1. **Provider abstraction**
   - OSRM and Nominatim are configured through settings, not fixed inline URLs.
   - This is not a full class-based provider adapter yet, but it removes the risky hardcoded provider dependency.

2. **Server-side proxy only**
   - Browser calls PocketBuddy backend only.
   - Backend enforces campus context, headers, caching, and fallback behavior.

3. **Cache every lookup**
   - Nominatim suggestions are cached by normalized campus query and viewbox.
   - Nominatim geocode results are cached by campus and normalized query.
   - OSRM route geometry and ETA are cached by origin/destination coordinate pair.
   - MongoDB is used now; Redis/DynamoDB can replace it later if traffic grows.

4. **No autocomplete abuse**
   - Do not call Nominatim on every keypress.
   - Use debounce and minimum query length.
   - Prefer campus-bounded suggestions and saved landmarks.

5. **Campus viewbox**
   - Continue bounding geocoding to the selected campus city.
   - This avoids irrelevant places and reduces API calls.

6. **Graceful fallback**
   - If OSRM fails, use Haversine + urban road factor.
   - UI should say "route estimate" instead of pretending road geometry is live.

7. **Attribution**
   - Show OpenStreetMap attribution wherever map/routing/geocoding data is visible.

### Production Option A: Self-Host OSRM + Nominatim On AWS

Best when:

- PocketBuddy needs predictable routing/geocoding cost;
- usage becomes high;
- the team wants control over caching and SLA;
- campus regions are mostly inside India.

Architecture:

```text
Travel API
  -> Geo Provider Adapter
      -> Amazon ECS / EC2 OSRM service
      -> Amazon ECS / EC2 Nominatim service
      -> Redis/DynamoDB cache
      -> CloudWatch metrics and alarms
```

How to keep it affordable:

- start with India or state-level OpenStreetMap extracts instead of planet-wide import;
- precompute common campus-to-hub routes;
- run one warm service for demo/finals, not continuous overprovisioning;
- use cache-first lookup;
- scale read replicas only when usage grows.

Risks:

- Nominatim imports need disk/RAM and operational care;
- OSRM preprocessing can be memory-heavy for large extracts;
- map updates need a refresh process;
- operational ownership increases.

Judge-safe answer:

> Today, public OSRM/Nominatim are prototype providers. Production would move to a provider adapter with cached, server-side calls and self-hosted OSRM/Nominatim on AWS for high-volume campus clusters.

### Production Option B: Managed Routing/Places Provider

Best when:

- team wants faster production readiness;
- SLA matters more than infrastructure cost;
- geocoding quality and POI coverage are important;
- route usage is moderate.

Possible provider categories:

- Google Routes / Places;
- Mappls / MapmyIndia for India-focused coverage;
- HERE / TomTom;
- Amazon Location Service where coverage and pricing fit.

Risks:

- recurring API cost;
- vendor limits;
- terms may restrict caching/storage;
- fare estimates may still need PocketBuddy's own community layer.

Judge-safe answer:

> Routing is swappable. The product moat is not OSRM itself; it is the campus fare trust layer and the decision engine on top.

### Production Option C: Hybrid

Recommended long-term path.

Use:

- self-hosted OSRM for routing geometry and distance;
- managed places/geocoding provider for high-quality place search;
- PocketBuddy community fare layer for local affordability truth;
- deterministic fallback model when external providers fail.

Why this is strongest:

- avoids public demo server dependency;
- preserves cost control for frequent route calculations;
- uses managed providers where data quality matters;
- keeps PocketBuddy's own trust layer as the differentiator.

## What To Improve After This PR

### Priority 1: Route Provider Adapter

Current branch has config-level provider switching. Next hardening step is a small class/function abstraction so the backend can switch between:

- `PublicOsmProvider`
- `SelfHostedOsmProvider`
- `ManagedMapsProvider`
- `FallbackDistanceProvider`

This makes the production story credible without rewriting the feature later.

### Priority 2: Cache Layer

Current branch uses one collection:

- `travel_geo_cache`

This keeps the implementation simple while still separating provider payloads by cache key.

Future production split:

- `travel_geocode_cache`
- `travel_route_cache`
- Redis or DynamoDB for hot route results if MongoDB becomes a bottleneck.

Suggested cache keys:

```text
geocode:{campus_slug}:{normalized_query}
route:{provider}:{origin_lat}:{origin_lon}:{dest_lat}:{dest_lon}:{mode}
```

### Priority 3: Route/Fare Evidence Panel

Current branch shows a compact "Why this fare?" panel for calculated and saved routes.

It should remain short and judge-safe:

- source: model estimate, learning, or student verified;
- report count/threshold where available;
- route source;
- selected timing context;
- runway impact.

Do not turn this panel into a technical log. It should answer trust questions without making the screen noisy.

### Priority 4: Stronger Reporter Reputation

Report weight should eventually consider:

- account age;
- connector verified payment signal;
- history of accepted reports;
- dispute rate;
- campus affiliation confidence.

### Priority 5: Travel Report From Payment Sync

This is now implemented as report candidates.

Next hardening:

- widen travel merchant detection carefully without catching food or subscriptions;
- add a "wrong route" correction action;
- add a review inbox item when the payment amount is close but not strong enough to auto-suggest;
- show the confirmed synced-payment source on the fare report row.

## Final Pitch Framing

Use this exact idea:

> Travel Guard is not a maps clone. It is a campus fare trust layer. It starts with model estimates, learns from actual student-paid fares, waits for enough independent confirmations, and then turns that context into a negotiation script and safer route decision.

Avoid this:

> We built live ride-hailing fare comparison.

The second line creates risk. The first line is accurate and stronger.

## Demo Readiness Checklist

Before recording or presenting:

- [ ] Seed at least one route with `Student verified` reports.
- [ ] Keep one sparse route showing `Learning`.
- [ ] Keep one route showing `Model estimate`.
- [ ] Enter an overquoted driver fare and show guardrail.
- [ ] Change fare timing from Now to Evening or Night and show the quote window changing.
- [ ] Show "Why this fare?" once so route source, trust, and runway impact are visible.
- [ ] Show split suggestion only as a curated option, not as a safety guarantee.
- [ ] If seeded, confirm one synced travel-like payment into a fare report.
- [ ] Trigger AI coach once and confirm it does not invent fare numbers.
- [ ] Show report list only briefly.
- [ ] Do not open raw API provider logs.
- [ ] Do not claim live ride-hailing API integration.
- [ ] Mention source/freshness if asked.

## Implementation Maintenance Rules

Keep this section updated whenever Travel Guard changes. This prevents future agents or teammates from accidentally weakening the feature.

### Product Rules

- Every fare range must have a clear source:
  - model estimate;
  - learning from student reports;
  - student verified;
  - fallback estimate.
- Never let AI be the source of fare truth.
- Never let one student report update a public fare range by itself.
- Never claim live ride-app prices unless a real licensed/provider-supported API is integrated.
- Never show technical provider names as the main user-facing value.
- Never show split-route suggestions as blanket advice; they must be gated by timing, luggage, and public-transfer confidence.
- Keep Travel tied to monthly runway and student safety, not just route mapping.

### Trust Rules

- Student fare reports are signals first, not truth.
- Repeated reports from the same reporter identity count once for fare anchoring.
- Stale reports should reduce confidence or fall out of trusted calculation.
- Disputed reports should not influence fare recommendations.
- Sparse routes should remain `Model estimate` or `Learning`, not `Student verified`.
- Thresholds should scale with route/campus usage and should not fall back to a fixed tiny number like 3.

### Routing And Geocoding Rules

- Browser must never call Nominatim directly.
- Backend must apply campus/city context before geocoding.
- Backend must use an identifying User-Agent for public-compatible providers.
- Backend should cache geocode, suggestion, and route results.
- Cache failures must not break route estimation.
- OSRM/TomTom/Nominatim failures must degrade gracefully.
- The production path is provider swapping:
  - self-host OSRM/Nominatim/Photon on AWS for cost control;
  - or use Mappls, Google, HERE, TomTom, or another managed provider where SLA/data quality matters.

### Demo Rules

- Pretest origin and destination queries before recording or presenting.
- Keep a route ready that shows `Student verified`.
- Keep one route ready that shows `Learning`.
- Keep one route ready that shows `Model estimate`.
- Use one overquoted driver fare to show the value instantly.
- Show the AI coach only after the deterministic fare context is visible.
- Do not spend more than 45 to 60 seconds on Travel in the final demo unless the whole presentation is centered on it.

### Q&A Rules

If asked why no live Ola/Uber/Rapido:

> We avoid unofficial scraping and unreliable price APIs. PocketBuddy's core value is a campus fare guardrail: mapped distance, local fare rules, and trusted student-paid reports. If a student has an app quote, they can enter it and compare it against the guardrail.

If asked about public OSRM/Nominatim:

> They are prototype-compatible providers behind backend caching and configurable URLs. Production swaps them to self-hosted AWS services or managed providers without changing the product flow.

If asked whether reports can be manipulated:

> A single report cannot update the fare anchor. Reports are deduped by reporter identity, stale/disputed reports are excluded, and enough independent confirmations are needed before a route becomes student verified.

If asked what Amazon/AWS value exists:

> Travel Guard shows how PocketBuddy can become a student decision layer around payments and everyday campus commerce. AWS supports the scalable backend and Bedrock turns deterministic context into useful, personalized guidance. The feature can later connect to Amazon Pay or campus commerce flows without becoming a generic expense tracker.

### Remaining Travel Polish Before Finals

These are not blockers for the backend logic, but they matter for judges:

1. Seeded demo routes
   - Ensure at least one Gwalior route has enough trusted reports for `Student verified`.
   - Keep another route below threshold for `Learning`.

2. Source attribution
   - If map tiles or OSM-derived geometry are visible, include appropriate OpenStreetMap attribution.

3. Provider abstraction cleanup
   - Current code has config-level provider switching and cache helpers.
   - Later, extract class/function providers only if it reduces complexity. Do not refactor just for architecture theatre.

4. Synced candidate empty state
   - Keep the empty state quiet in the UI.
   - For demo, seed one recent travel-like transaction if you want to show payment-sync reporting.

## Bottom Line

Travel Guard is now strong enough to present as a serious product feature because it has:

- a real student pain point;
- campus-specific decision context;
- explicit source labels;
- adaptive crowdsourced trust;
- outlier resistance;
- fallback model behavior;
- grounded AI output;
- a clear production path for OSRM/Nominatim.

The next improvement is not more UI decoration. The next improvement is making provider switching and caching explicit, so the routing layer looks production-grade to AWS judges.
