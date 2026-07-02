# PocketBuddy Demo Video Recording Plan

Target duration: 4:15 to 4:40.

Portal requirement: upload a standard MP4 file, not a YouTube/Drive link. Maximum duration is 5 minutes. 1080p is enough.

## Recording Goal

The video should prove one thing clearly:

> PocketBuddy turns real student payment activity into useful campus decisions: runway, food choices, travel fare guardrails, shared cart pools, and AI nudges.

Do not make the video feel like a feature list. Show a student day:

1. A payment happens.
2. PocketBuddy catches it.
3. The dashboard changes.
4. The student makes a better decision.

## Before Recording

### Production Links

Use these in the video:

- Web app: `https://d3g6cg7q9hn7hi.cloudfront.net/`
- APK: `https://d3g6cg7q9hn7hi.cloudfront.net/downloads/PocketBuddy-Connector-v0.1.0.apk`

### Do Not Show

- `.env` files.
- MongoDB connection string.
- JWT secret.
- AWS access keys.
- Personal UPI IDs.
- Real bank balance.
- Friend phone numbers or unmasked SMS content.
- Android Play Protect screens, unless you are specifically explaining sideloading outside the final demo.

### Demo Account Data Checklist

Before recording, make sure the demo account has:

- Profile completed with a realistic monthly allowance.
- One allowance/income entry for the month so Stats does not show income as zero.
- 12-20 realistic expenses across food, stationery, travel, subscriptions, and other.
- Exam start/end dates set so the dashboard can show the exam-period wellness context.
- A visible food gap or wellness state that makes the meal check-in worth showing.
- At least one recent Android-synced transaction visible in Companion Device activity.
- One duplicate sync log, if possible, to prove deduplication.
- One active cart pool with 2-3 items.
- One completed cart pool with at least one roommate payment state.
- Travel route data visible for the selected campus.
- One travel savings log or travel report.
- Bedrock/Nova enabled so the travel AI coach can produce a real response.

If OCR/Textract is still failing in AWS, do not show the menu scanner. It is not worth risking the video.

## Screen Setup

### Desktop

- Browser zoom: 90% or 100%.
- Use one clean browser window for the main host account.
- Keep one incognito window or second browser profile ready for the cart-pool roommate link flow.
- Hide bookmarks if they look messy.
- Keep the app already logged in in one tab.
- Keep AWS console open in another tab only for the architecture proof section.
- Use light mode if text is clearer after the latest UI polish.

### OBS Studio Setup

Use OBS scenes so you do not have to drag windows during the recording.

Create these scenes:

1. `Desktop - Web App`
   - Source: Display Capture or Window Capture for the browser.
   - Browser zoom: 90% or 100%.
   - Crop bookmarks or personal tabs if needed.

2. `Phone - Android`
   - Best option: mirror the phone with a safe tool you already trust, then capture that window.
   - Alternative: record phone separately using Android screen recorder, then place that clip in editing.
   - Do not capture payment apps. Keep the phone on PocketBuddy Connector or home screen.

3. `Architecture`
   - Source: browser tab showing README architecture diagram or AWS console.
   - Keep only CloudFront/S3/API Gateway/Lambda/SQS/DynamoDB/Bedrock visible.

4. `Split - Phone + Web`
   - Browser on the left: Companion Device page.
   - Phone mirror on the right: PocketBuddy Connector.
   - Use this only for the sync proof section.

OBS recording settings:

- Output format: `mkv` while recording, then use OBS `File -> Remux Recordings` to MP4. This protects the recording if OBS crashes.
- Resolution: 1920x1080.
- FPS: 30.
- Audio: one microphone only. Disable desktop audio unless you need it.
- Bitrate: 8000-12000 Kbps is enough for 1080p.
- Do one 20-second test recording and check: text readable, mic clear, no secrets visible.

### Phone

Record the actual Android device screen.

Show only:

- PocketBuddy Connector app.
- Notification access enabled.
- A safe test payment notification or the connector ready state.
- Avoid showing personal chats, names, or bank details.

If real payment notification is risky, show the app configured and then show the result on the web Companion Device page. The backend proof matters more than showing private phone notifications.

## Final Video Structure

| Time | Surface | What To Record | Point Being Proven |
| --- | --- | --- | --- |
| 0:00-0:20 | Desktop, landing page | Product landing page and sign-in entry | This is a working deployed product. |
| 0:20-0:45 | Desktop, onboarding route | `/onboarding` first-run fields: allowance, cycle, campus, hostel/wing, food, UPI apps, companion setup | The product starts from student context, not generic finance setup. |
| 0:45-1:15 | Desktop, dashboard | Runway, safe daily spend, recent spend, wellness/campus card | PocketBuddy understands the student's month. |
| 1:15-2:00 | Phone + desktop | Android connector ready state, real payment notification result, web Companion Device activity | Real phone-to-web payment sync exists. |
| 2:00-2:30 | Desktop, transactions/stats | History, category edit/review, Stats page | The raw stream becomes clean financial context. |
| 2:30-3:12 | Desktop, pool | Host opens active pool, roommate opens shared link, completed pool shows payment/UTR state | Shared purchases work as a real two-sided flow. |
| 3:12-3:48 | Desktop, travel | Route fare range, driver quote, AI negotiation coach | The app helps with affordable travel decisions. |
| 3:48-4:13 | Desktop, dashboard/food/wellness | Campus intel, food gap, exam check-in, Bedrock message | Financial support connects to everyday routines. |
| 4:13-4:42 | Desktop, README/AWS console | Architecture diagram and AWS services | The demo is cloud-backed and scalable. |
| 4:42-4:55 | Desktop, app | Close on dashboard or landing page | Clear final value statement. |

## Full Spoken Script

Use this as the actual recording script. Do not read it like a corporate pitch. Speak it like you are explaining the product to a judge sitting next to you.

### 0:00-0:20 - Opening

Desktop shot: live landing page.

Say:

> Students do not usually run out of money because of one big purchase. It is the small daily decisions: food, travel, subscriptions, shared room orders, and late-night spending. PocketBuddy watches those signals and turns them into decisions before the month goes wrong.

Action:

- Open the live URL.
- Click sign in or enter the app if already logged in.

### 0:20-0:45 - Onboarding

Desktop shot: after signing in with the seeded account, manually open:

`https://d3g6cg7q9hn7hi.cloudfront.net/onboarding`

Important: do not complete the final onboarding finish step if it risks resetting companion state. Show the screens quickly, then move back to Dashboard.

Say:

> PocketBuddy starts by asking for student context, not bank-style categories. The onboarding captures monthly allowance, cycle date, campus, hostel or wing, meal routine, and the payment apps the student uses. This is what makes the later insights campus-aware instead of generic.

Action:

- Show the monthly allowance field.
- Show cycle date.
- Show college/campus selector.
- Show hostel, wing, and room fields.
- If step 2 is reachable without disrupting data, show meal routine and UPI app options.
- Say that the next step sends the user to Companion Device setup.

Avoid:

- Spending more than 25 seconds here.
- Clicking final finish if it resets companion status.
- Typing private data live.

### 0:45-1:15 - Dashboard

Desktop shot: Dashboard.

Say:

> After setup, the dashboard answers the question students actually have: how long can I continue like this? It shows the current cycle, safe daily spend, recent payments, and wellness signals from the student's spending rhythm.

Action:

- Point to remaining allowance/runway.
- Point to recent transaction.
- Point to wellness or campus intelligence card.

Avoid:

- Reading every number.
- Overexplaining every card.

### 1:15-2:00 - Real Android Companion Sync

Phone shot: PocketBuddy Connector app.

Say:

> The important part is that the student does not need to manually enter every expense. The Android connector is paired once, then supported payment and SMS notifications can sync into PocketBuddy in the background.

Action on phone:

- Open PocketBuddy Connector.
- Show "ready to sync" or saved config.
- Show notification access is enabled if it is clean.

Real payment proof:

- Ask the other phone/person to send a tiny amount, such as Rs. 1 or Rs. 2.
- Do not record inside the payment app.
- Keep the screen recording on PocketBuddy Connector or the phone home screen.
- Wait for the bank/payment notification to arrive.
- If the notification drawer shows private details, blur/cut that part in editing.

Switch to desktop: Companion Device page.

Say:

> Now the same payment appears in PocketBuddy's companion activity. This is the proof that the app is using the phone's real notification stream, not a manual expense form.

Action:

- Open Companion Device.
- Show APK download button.
- Show recent sync activity.
- Open one activity detail if available.
- Then open History or Dashboard and show the new transaction if it appears there.

Do not show:

- Play Protect bypass as a main product flow.
- Any real unmasked bank SMS.

Fallback if the live bank notification is delayed:

- Keep the payment attempt in the video, but cut to Companion Device recent activity from a previous real sync.
- Say: "For the recorded demo, this is the latest synced payment event from the connected phone."
- Do not use ADB debug broadcast in the final video unless no real sync is available.

### 2:00-2:30 - Transactions And Stats

Desktop shot: History and Stats pages.

Say:

> Once payments are normalized, the student can review and correct the history. Categories are editable, and the monthly stats separate income, expenses, trends, and category breakdowns.

Action:

- Open History.
- Show a payment row.
- If a category can be edited safely, show the edit control without spending too much time.
- Open Stats.
- Show income, expense, category chart, and export button.

### 2:30-3:12 - Wing Cart Pool, Two-Screen Flow

Desktop shot: host browser first, then incognito/second browser for the roommate link, then back to host browser.

Say:

> A lot of campus spending is shared: snacks, quick-commerce, supplies, or room essentials. PocketBuddy has wing cart pools so one student can start a pool, roommates can add items, and the host can track repayment.

Host action:

- Open Pool.
- Show the active Zepto pool.
- Open the pool detail.
- Show items already added by multiple roommates.
- Show the cart progress and share/join area.

Say:

> This is the host view. The host creates the pool once, and the link carries the room or wing purchase context to everyone else.

Roommate-link action:

- Copy or open the pool share link.
- Switch to incognito or a second browser profile.
- Open the same pool link.
- If the app allows it cleanly, add one small item as a roommate name like "Aditi" or "Rohan".
- If login blocks the flow or looks messy, do not force it. Just show that the link opens the shared pool and move back to the host view.

Say:

> This is the roommate side. They join from the shared link, add their item, and later repay the host.

Payment verification action:

- Switch back to the host browser.
- Open the completed Blinkit pool.
- Show verified and pending payment states.

Say:

> The manual UTR flow is there for trust, and the backend can also match incoming credit notifications against pending UTRs when the host receives repayment.

Fallback:

- If the shared-link flow is not smooth during the test run, do not record it live.
- Record only: active pool -> share link -> completed pool payment state.
- Say: "The link is what roommates use to join; for time, I am switching directly to the host's completed pool view."

### 3:12-3:48 - Travel Fare Guard

Desktop shot: Travel page.

Say:

> The problem statement also talks about affordable travel. This matters most when a student reaches a new campus or city and does not know the normal fare. PocketBuddy shows expected route fares and compares a quoted amount with the community median.

Action:

- Open Travel.
- Select a route.
- Enter a driver quote or app quote.
- Show overcharge/surge result.
- Trigger or show AI coach result.

Say:

> The AI coach does not just say "spend less." It gives a practical script, tactics, and safety note based on the route and quote.

### 3:48-4:13 - Food, Wellness, And Bedrock

Desktop shot: Dashboard food/campus insight, wellness card, and check-in dialog if it appears.

Say:

> Food is another daily decision. PocketBuddy tracks meal patterns from food transactions. If there has been no food transaction for a long gap, especially during exam period, it checks in: did you eat at mess, did you skip, or do you need a reset? This is not a medical diagnosis. It is a practical wellness nudge based on spending rhythm, meal gaps, and exam context.

Then say:

> The Bedrock-backed campus intelligence takes the same context and turns it into a short action: what to eat, what to avoid, or what to do next while the monthly runway is tight.

Action:

- Show campus food recommendation or campus intelligence text.
- Show wellness card if visible.
- If the meal check-in dialog appears, show it and click "I ate at mess / cooked / ordered in" only if it is safe for the demo.
- If it does not appear naturally, show the wellness card signals instead: food gap, runway, exam, late night, and spend velocity.
- Point out the `Bedrock` label on the campus intelligence card if visible.

Avoid:

- Claiming therapy.
- Claiming medical burnout diagnosis.
- Saying "push notification" unless you are actually showing one. Say "check-in" or "in-app nudge."

### 4:13-4:42 - AWS Architecture

Desktop shot: README architecture diagram or AWS console.

Say:

> The prototype is deployed on AWS. The frontend is served from S3 through CloudFront. Product APIs run on FastAPI behind Nginx on EC2. Mobile notification ingest is separated into API Gateway, Lambda, SQS, and DynamoDB, so phone events do not depend on one web server. Amazon Bedrock with Nova Lite powers the AI text where enabled.

Action:

- Show README architecture diagram first.
- If showing AWS console, only show CloudFront/S3/Lambda/SQS/DynamoDB names.
- Do not open IAM policies or secrets.

### 4:42-4:55 - Close

Desktop shot: dashboard or landing page.

Say:

> PocketBuddy is not just a tracker after money is gone. It is a campus money guard: it catches spend passively, explains runway, helps with food and travel decisions, and reduces friction in shared student life.

End on:

- Dashboard with real data, or landing page with sign-in.

## Optional One-Line Backup Pitch

If you need a shorter closing line:

> PocketBuddy helps students spend with context, not regret.

## Exact Desktop Recording Order

Use this order if you want the least editing work:

1. Open `https://d3g6cg7q9hn7hi.cloudfront.net/`.
2. Sign in to `harkutnishant27@gmail.com` off-camera or cut the password entry.
3. Open `/onboarding` manually from the address bar.
4. Show Step 1 student context.
5. If safe, continue to Step 2 and show meals/payment apps.
6. Navigate to `/dashboard`.
7. Show dashboard.
8. Open `/companion`.
9. Record the real payment sync proof.
10. Open `/transactions`.
11. Open `/stats`.
12. Open `/pool`.
13. Open the active Zepto pool as the host.
14. Copy/open the pool link in incognito or a second browser profile.
15. If the roommate-side page is clean, show the shared pool and add one item.
16. Return to the host browser and open the completed Blinkit pool.
17. Show verified and pending UTR/payment states.
18. Open `/travel`.
19. Run or show the AI coach.
20. Return to `/dashboard`.
21. Show wellness, food gap, exam-period card, and campus intelligence.
22. Open README architecture diagram or AWS console.
23. Return to dashboard for the closing line.

## Pool Segment Test Before Recording

Do this once before OBS recording:

1. Open `/pool` in the normal browser.
2. Open the active Zepto pool.
3. Confirm it has 2-3 items and expires in the future.
4. Find the share/join link or browser URL for the pool detail.
5. Open that link in incognito.
6. Confirm what the roommate sees.
7. If the roommate can add an item without breaking the flow, use it in the video.
8. If login or onboarding interrupts the flow, skip the live roommate add and only show the link plus completed pool verification.

The goal is not to prove public anonymous access. The goal is to show that the pool is a shared object with host and roommate states.

## Exact Phone Recording Order

Use this phone flow:

1. Start screen recording on the Android phone.
2. Open PocketBuddy Connector.
3. Show the config/status screen only.
4. Open Android notification listener settings only if it is clean and does not reveal private apps.
5. Return to PocketBuddy Connector.
6. Ask the second phone/person to send Rs. 1 or Rs. 2.
7. Wait for the notification.
8. Do not open the payment app.
9. Stop recording after the notification arrives or after 20 seconds.
10. In desktop recording, show Companion Device recent activity and the transaction result.

## What Not To Include

Do not include these in the final video:

- Long setup commands.
- ADB debug commands, unless absolutely necessary.
- Textract/OCR failure.
- Raw AWS IAM role editing.
- Terminal showing secrets.
- More than 20 seconds of architecture.
- A long generic problem explanation.

## Final Export Checklist

- MP4 file.
- 1080p.
- Under 5 minutes.
- Audio understandable.
- No secrets visible.
- Product URL visible at least once.
- Android connector shown at least once.
- AWS architecture shown at least once.
- Final PRD PDF exported separately and under 4.5 MB.
