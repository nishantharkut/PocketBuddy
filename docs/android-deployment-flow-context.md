# Android Connector Deployment Flow Context

Last updated: 2026-07-09
Branch at time of writing: `feature/android-v2-sync-hardening`

This document is the deployment handoff for the PocketBuddy Android connector flow. It records what has been implemented, what has already been tested locally, what still has to be verified after deployment, and how to explain the flow without overclaiming.

Do not paste live secrets, pairing tokens, MongoDB URIs, JWT secrets, or personal payment data into this file.

## One-Line Product Claim

PocketBuddy's Android connector reads supported UPI and bank/SMS payment alerts on-device, extracts only structured transaction fields, suppresses raw notification text, signs each event, and syncs it into the web app for runway, transactions, food, subscriptions, pools, and review workflows.

Safe wording:

> The connector supports common UPI/payment and bank/SMS alerts today. Unknown or incomplete formats are routed to review instead of being silently accepted.

Avoid saying:

> The app reads every bank message perfectly.

## Complete Flow

1. The user signs in to PocketBuddy web.
2. The user opens Companion or Onboarding setup.
3. Web generates Android connector config:
   - webhook URL
   - user ID
   - pairing token
   - account email/device context
4. Android app receives config through either:
   - one-tap `pocketbuddy://configure` deep link, or
   - manual copy/paste config.
5. Android user grants Notification Access.
6. Connector listens to supported payment/SMS notifications.
7. Connector parses on-device:
   - amount
   - direction
   - merchant
   - transaction/reference ID when available
   - confidence
   - recurring/mandate hints
8. Connector suppresses raw notification text and sends only structured fields plus masked preview.
9. Connector signs the payload with HMAC headers.
10. Backend `/api/ingest/notification-v2` verifies pairing, signature, consent/device state, and idempotency.
11. Backend writes:
   - `companion_sync_log`
   - canonical transaction when fields are sufficient
   - incomplete/review item when fields are missing or low-confidence
12. Web Companion, Transactions, Runway, Food, Subscription, and Pool flows use the normalized data.

## What Is Implemented

### Android App

Implemented areas:

- One-tap config through `pocketbuddy://configure`.
- Runtime config screen for webhook URL, user ID, token, and account email.
- Notification listener for supported payment apps and SMS apps.
- On-device UPI/SMS parser.
- OTP and promotional notification rejection.
- Low-confidence review payloads for payment-like alerts with missing fields.
- Raw notification suppression on v2 payloads.
- Masked preview generation.
- HMAC request signing.
- Encrypted retry queue using Android Keystore AES/GCM.
- JobScheduler retry dispatcher.
- Sync status display.
- Reset config flow.
- Transparency screen explaining what the app reads, sends, and does not send.
- Debug-only notification receiver for repeatable local testing.

Important files:

- `android/connector/src/main/java/com/pocketbuddy/connector/ui/SetupActivity.kt`
- `android/connector/src/main/java/com/pocketbuddy/connector/ui/ConnectorTransparencyActivity.kt`
- `android/connector/src/main/java/com/pocketbuddy/connector/PocketBuddyNotificationListener.kt`
- `android/connector/src/main/java/com/pocketbuddy/connector/parser/UpiNotificationParser.kt`
- `android/connector/src/main/java/com/pocketbuddy/connector/model/TransactionNotificationPayload.kt`
- `android/connector/src/main/java/com/pocketbuddy/connector/network/WebhookClient.kt`
- `android/connector/src/main/java/com/pocketbuddy/connector/network/WebhookRequestSigner.kt`
- `android/connector/src/main/java/com/pocketbuddy/connector/retry/WebhookRetryQueue.kt`
- `android/connector/src/main/java/com/pocketbuddy/connector/retry/WebhookRetryDispatcher.kt`
- `android/connector/src/main/java/com/pocketbuddy/connector/sync/SyncStatusFormatter.kt`
- `android/connector/src/main/java/com/pocketbuddy/connector/privacy/NotificationTextMasker.kt`

### Backend

Implemented areas:

- Strict v2 route: `POST /api/ingest/notification-v2`.
- Legacy route remains present for older connector builds: `POST /api/ingest/notification`.
- v2 rejects raw notification text.
- v2 verifies HMAC signature headers.
- v2 verifies pairing token against the user profile.
- v2 uses connector/device consent and binding checks.
- Low-confidence/incomplete events are stored instead of dropped.
- Companion sync log records masked observability details.
- Canonical transactions are created only when enough transaction fields are present.

Important files:

- `backend/app/api/webhook.py`
- `backend/app/core/config.py`
- `backend/app/core/privacy.py`
- `backend/tests/test_privacy_contracts.py`
- `docs/mobile-ingest-contract.md`

Backend settings to understand:

```text
CONNECTOR_LEGACY_RAW_INGEST_ENABLED=false
CONNECTOR_SIGNATURE_REQUIRED=false
CONNECTOR_SIGNATURE_TOLERANCE_SECONDS=300
```

Note: `/api/ingest/notification-v2` still requires a valid signature because the route treats v2 as strict. The global `CONNECTOR_SIGNATURE_REQUIRED` setting is migration-friendly, but v2 itself is not an unsigned route.

## Verified Locally

These checks were completed on 2026-07-09 against a physical Android device.

Device facts:

- Physical Android device connected over ADB.
- Notification Access enabled for PocketBuddy Connector.
- Debug APK installed.
- `POST_NOTIFICATIONS` was temporarily granted only for debug notification posting and then restored.

Automated checks:

```powershell
.\android\gradlew.bat -p android :connector:testDebugUnitTest :connector:lintDebug :connector:assembleDebug
.\android\gradlew.bat -p android :connector:testDebugUnitTest --rerun-tasks
```

Result:

- Unit tests passed.
- Lint passed after moving version-specific window attributes into:
  - `android/connector/src/main/res/values-v27/styles.xml`
  - `android/connector/src/main/res/values-v29/styles.xml`
- Debug APK assembled.

Unit test coverage includes:

- Payment app debit parsing.
- Bank/SMS debit parsing.
- Bank/SMS credit parsing.
- Amazon Pay notification parsing.
- OTP rejection.
- Promotional SMS rejection.
- Chat message rejection.
- Low-confidence review event behavior.
- Recurring/mandate keyword detection without deciding subscription status.
- Masked preview generation.
- HMAC signature generation.
- Sync status copy.
- v2 payload serialization without raw text.

Manual/device checks completed:

- Main connector screen opens.
- Transparency screen opens.
- One-tap deep link config works.
- Config is saved into app storage.
- Success webhook path works through local mock server and `adb reverse`.
- Payload includes signed headers and structured body.
- Retry queue stores failed payloads encrypted.
- Forced retry job replays queued payload when backend becomes available.
- Reset config clears connector state.

## Not Yet Fully Verified

These are the remaining deployment blockers or manual demo checks.

### 1. Real Payment Notification

Still required:

- Send or receive a small real UPI payment.
- Do not record inside the payment app.
- Confirm the notification is captured by Android.
- Confirm it appears in:
  - Android connector status
  - Web Companion recent sync activity
  - Transactions page
  - affected downstream pages if applicable

Minimum useful coverage:

- one payment app notification, such as PhonePe, Google Pay, Paytm, or Amazon Pay
- one bank/SMS notification if available
- one unknown/incomplete payment-like alert to confirm review behavior

If a real provider is missed:

- capture the masked notification pattern safely
- add a parser unit test
- update parser rules without weakening OTP/promotional filtering

### 2. Manual Clipboard Paste

One-tap config was verified. Manual clipboard paste still needs human testing because the connected device shell did not expose a reliable `cmd clipboard` command.

Manual test:

1. Open web Companion setup.
2. Click Copy Android config.
3. Open Android connector app.
4. Tap Paste config.
5. Confirm fields populate.
6. Save.
7. Confirm pairing/status message.

### 3. Release APK

Do not treat the debug APK as the final public artifact.

Release verification still needed:

1. Build release APK.
2. Confirm debug receiver is absent from release build.
3. Install release APK on the phone.
4. Open app.
5. Apply one-tap config.
6. Enable Notification Access.
7. Trigger one real or controlled notification.
8. Confirm sync reaches production backend.

Release risk to avoid:

- shipping an exported debug broadcast receiver in the public APK
- shipping a debug-signed APK as the final artifact
- shipping an APK that points to localhost or stale backend URL

### 4. Production Backend URL

After backend deploy, the Android webhook URL should point to:

```text
https://d3g6cg7q9hn7hi.cloudfront.net/api/ingest/notification-v2
```

The older endpoint should not be used by new builds:

```text
https://d3g6cg7q9hn7hi.cloudfront.net/api/ingest/notification
```

Use the legacy route only for old connector migration tests.

### 5. Web Review Flow

Android can send low-confidence/incomplete events. The web app must make that state visible.

Expected product behavior:

- complete transaction: appears as normal transaction
- duplicate app/SMS pair: marked duplicate
- missing merchant/direction/amount: appears as review item
- unknown provider: does not silently pollute transactions

## Deployment Checklist

### Before Merge

Run from repo root:

```powershell
.\android\gradlew.bat -p android :connector:testDebugUnitTest :connector:lintDebug :connector:assembleDebug
npm.cmd run check --workspace=frontend
cd backend
python -m pytest tests/test_privacy_contracts.py
cd ..
git diff --check
```

If backend tests require env values locally, use test-safe values only.

### After Merge To Main

On the EC2/backend deployment:

1. Pull latest `main`.
2. Install backend dependencies if changed.
3. Restart backend service.
4. Confirm route is registered:

```bash
curl -i https://d3g6cg7q9hn7hi.cloudfront.net/api/campus-food
```

5. Do not test connector v2 with browser GET. It is a POST endpoint.
6. Test v2 with a signed Android request, not with a raw manual unsigned request.

### Frontend/S3/CloudFront

If web Companion or Onboarding UI changed:

1. Build frontend locally or on EC2:

```powershell
npm.cmd run build --workspace=frontend
```

2. Upload `frontend/dist/` to the frontend S3 bucket.
3. Invalidate CloudFront:

```text
/*
```

4. Hard refresh browser and verify the new companion/onboarding flow is visible.

### Android APK

For internal demo:

- Debug APK is acceptable only when the team controls the device and needs debug receiver testing.

For public/finals download:

- Use release APK.
- Keep the APK download link current in the web Companion page and README.
- Confirm the APK uses the production CloudFront webhook in generated config, not a hardcoded local URL.

## Production Smoke Test

Use this order after deployment:

1. Start backend.
2. Deploy frontend.
3. Invalidate CloudFront.
4. Install latest APK.
5. Open PocketBuddy web as a test user.
6. Open Companion page.
7. Apply Android config using one-tap.
8. Open Android app and verify linked account.
9. Enable Notification Access.
10. Send a small real payment.
11. Wait for Android connector status to update.
12. Open web Companion page.
13. Confirm recent activity appears.
14. Open Transactions.
15. Confirm transaction exists or review item appears.
16. Confirm raw notification text is not shown.
17. If sync fails, check Android queued retry count and backend logs.

## Common Failure Modes

### CloudFront Returns HTML For `/api/ingest/...`

Meaning:

- CloudFront behavior is routing `/api/ingest/...` to the S3 frontend instead of the backend/API origin.

Fix:

- Ensure CloudFront behavior `/api/*` points to backend origin.
- Allowed methods must include `POST`.
- Cache policy should be `CachingDisabled`.
- Origin request policy should forward needed headers.
- Invalidate `/api/*` or `/*` after behavior changes.

### Android Says Config Saved But Web Shows Nothing

Check:

- Webhook URL is production v2 endpoint.
- User ID belongs to the signed-in web account.
- Pairing token is current.
- Backend has latest code.
- CloudFront `/api/*` routes to backend.
- Notification Access is enabled.
- Notification is from supported app/SMS format.
- Android retry queue count is not increasing.

### Invalid Pairing Code

Possible causes:

- stale config copied from a different account
- token rotated after reset/revocation
- wrong user ID/token pair
- Android still has old config

Fix:

- reset connector config
- generate fresh config from web Companion page
- apply one-tap config again

### Signature Failure

Possible causes:

- Android request body modified after signing
- timestamp too old
- wrong pairing token
- backend time skew
- request sent manually without HMAC headers

Fix:

- test using Android app, not raw PowerShell unless using a proper signing script
- check backend clock
- regenerate pairing config

### Provider Notification Not Captured

Possible causes:

- payment app hides notification text
- OEM notification format differs
- notification did not include INR amount
- SMS app package not recognized
- parser rules too strict

Fix:

- record safe masked example
- add parser test
- extend provider/package rule carefully
- keep OTP/promotional rejection strict

## Judge-Safe Explanation

Use this if asked how the Android connector works:

> We do not ask students to manually log every spend. On Android, PocketBuddy uses Notification Access to read supported payment and SMS alerts locally. The parser runs on the phone, extracts amount, merchant, direction, reference ID and confidence, masks the preview, suppresses raw text, signs the payload, and sends only structured fields to the backend. If the parser is not confident, we put the event into review instead of pretending it is correct.

Use this if asked about privacy:

> The v2 connector path is designed around data minimization. Full SMS or notification text is not sent to the backend. The backend receives structured payment fields, a masked preview, device ID, event ID, and signature metadata. OTPs and promotional messages are rejected on-device.

Use this if asked about trust:

> The app requires explicit Android Notification Access, shows what it reads and does not read, allows reset/revoke, signs each event, and keeps retry payloads encrypted locally.

Use this if asked about iOS:

> iOS does not expose the same notification-listener capability, so passive capture is Android-first. For iOS, the correct product path is consent-based account data, email/statement import, or manual review fallback. We do not claim the Android notification model works on iOS.

Use this if asked about parser coverage:

> Parser coverage is the biggest real-world hardening area. Banks and payment apps change notification formats. Our design handles this by sending low-confidence events to review, collecting masked corrections, and expanding parser tests from real safe samples.

## What Not To Show In Demo

Do not show:

- `.env`
- JWT secret
- MongoDB URI
- pairing token value
- real bank account balance
- raw bank SMS text
- payment app screen with personal UPI details
- debug receiver commands as the main product flow

It is fine to show:

- Android connector status screen
- transparency screen
- notification access settings if no private app data is visible
- web Companion recent activity
- Transactions review state

## Final Remaining Work

Priority order:

1. Real payment notification validation.
2. Manual clipboard paste test.
3. Release APK build/signing/install test.
4. Production CloudFront/backend v2 endpoint test.
5. Web review flow confirmation.
6. Subscription candidate flow confirmation.
7. Final APK upload and README/Companion download link check.

Current assessment:

- Android core flow is strong enough for demo after real-notification validation.
- The largest remaining risk is not the app architecture. It is real provider notification coverage.
- The second largest risk is accidentally demoing a stale APK or stale CloudFront behavior.
