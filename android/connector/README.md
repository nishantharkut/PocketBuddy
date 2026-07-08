# PocketBuddy Android Connector

Headless Android APK for PocketBuddy's local UPI notification ingestion layer.

## What it does

- Registers a `NotificationListenerService`.
- Reads notification text from supported UPI/payment apps.
- Reads bank/SMS app notification text from supported messaging apps.
- Filters out notifications without a payment signal and INR amount.
- Extracts amount, debit/credit direction, merchant text, and transaction reference where possible.
- Sends low-confidence masked events when a supported payment-like alert is missing direction or merchant, so the web app can show review activity instead of losing the signal.
- Sends structured JSON plus a masked preview to the configured webhook with OkHttp.
- Does not upload full notification/SMS text on the v2 ingest path.

## Provider coverage

The connector is designed to work with UPI/payment notifications that expose readable notification text containing:

- an INR amount such as `Rs.50`, `INR 50`, or `₹50`
- a UPI/payment identifier such as `UPI`, `VPA`, `UTR`, `txn id`, or `ref no`
- a debit/credit word such as `paid`, `sent`, `debited`, `received`, or `credited`, when available

Known payment-app package coverage includes Google Pay, PhonePe, Paytm, BHIM, Amazon Pay through Amazon Shopping, WhatsApp, and common Indian bank/payment package name fragments such as Kotak, Axis, ICICI, HDFC, SBI, PayZapp, CRED, MobiKwik, Freecharge, Airtel, and Jio.

Known SMS notification package coverage includes Google Messages, Vivo/Android Messages, Samsung Messages, and common `messaging`, `mms`, and `sms` package fragments. SMS notifications are intentionally stricter than payment-app notifications: they must include amount, a bank/account signal, and a strong UPI/reference signal. If direction is missing, the connector sends a low-confidence review event. OTP and promotional messages are rejected.

Exact merchant extraction still depends on each app's notification wording. During testing, keep `adb logcat -s PocketBuddyListener PocketBuddyWebhook` open and add real notification samples when a provider is missed.

## Webhook configuration

From `PocketBuddy/android`, copy `local.properties.example` to `local.properties` and change:

```properties
POCKETBUDDY_WEBHOOK_URL=https://your-ngrok-url.ngrok-free.app/api/ingest/notification-v2
```

`local.properties` provides build-time defaults. After the APK is installed, open `PocketBuddy Connector` from the launcher to change the webhook URL, user ID, and token at runtime without rebuilding.

The Android folder includes a local FastAPI test harness at `tools/ingest_test_backend`. The main project backend lives under the repo-level `backend/`; wire Android to that service once its ingest endpoint accepts the connector payload shape shown below.

For an Android emulator, the default host URL is:

```properties
POCKETBUDDY_WEBHOOK_URL=http://10.0.2.2:8000/api/ingest/notification-v2
```

Optional backend binding fields:

```properties
POCKETBUDDY_WEBHOOK_TOKEN=
POCKETBUDDY_USER_ID=
```

When `POCKETBUDDY_WEBHOOK_TOKEN` is set, the connector sends `Authorization: Bearer <token>` and signs the request body with `X-PocketBuddy-Signature`. The production `/notification-v2` endpoint rejects unsigned connector requests. Every webhook includes an installation-scoped `deviceId`; `userId` is included when configured.

The final backend contract is tracked in `docs/mobile-ingest-contract.md` from the repository root.

## Enabling notification access

The app includes a small setup screen. After installing the APK, open `PocketBuddy Connector` from the launcher and enable notification access. For demos, you can also open the settings page with ADB:

```bash
adb shell am start -a android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS
```

Enable `PocketBuddy UPI Listener`.

## Retry behavior

If the webhook is unavailable, failed payloads are stored in an encrypted local retry queue backed by Android Keystore AES/GCM. A `JobScheduler` task retries queued payloads when network is available. The setup screen shows the current queued retry count.

## Debug notification test

Debug builds accept ADB-posted fake UPI notifications. This verifies the full path:

```text
ADB notification -> NotificationListenerService -> webhook -> backend log
```

With the backend running, USB reverse enabled, and notification access enabled:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:8000 tcp:8000
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell am broadcast -n com.pocketbuddy.connector/.debug.DebugNotificationReceiver -a com.pocketbuddy.connector.DEBUG_UPI_NOTIFICATION
```

Then check:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/ingest/recent
```

For de-duplicated transaction output from the local test harness:

```powershell
Invoke-RestMethod 'http://127.0.0.1:8000/api/ingest/transactions?limit=10' | ConvertTo-Json -Depth 10
```

Optional custom payload:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell am broadcast -n com.pocketbuddy.connector/.debug.DebugNotificationReceiver -a com.pocketbuddy.connector.DEBUG_UPI_NOTIFICATION --es amount 75 --es merchant "Campus Canteen" --es transactionId TEST789
```

SMS-style notification test:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell am broadcast -n com.pocketbuddy.connector/.debug.DebugNotificationReceiver -a com.pocketbuddy.connector.DEBUG_UPI_NOTIFICATION --es mode sms --es amount 125 --es merchant "Campus Canteen" --es transactionId UTR123456789
```

Fallback parser + direct webhook test for OEM phones that block app notifications. In SMS mode this parses the text as if it came from Google Messages and sends `captureSource=sms_notification`:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell am broadcast -n com.pocketbuddy.connector/.debug.DebugNotificationReceiver -a com.pocketbuddy.connector.DEBUG_UPI_NOTIFICATION --es mode sms --ez directWebhook true
```

## Payload shape

```json
{
  "packageName": "com.google.android.apps.nbu.paisa.user",
  "timestamp": 1781358622143,
  "sourceApp": "Google Pay",
  "captureSource": "payment_app",
  "deviceId": "installation-scoped-uuid",
  "userId": null,
  "amount": 50.0,
  "currency": "INR",
  "direction": "debit",
  "merchant": "Hostel 3 Night Canteen",
  "transactionId": null,
  "detectedAtDeviceMillis": 1781358622999,
  "maskedPreview": "Paid Rs.50 to Hostel 3 Night Canteen using UPI",
  "parserVersion": "android-upi-v2",
  "confidence": "medium",
  "privacyMode": "on_device_only",
  "rawTextSuppressed": true,
  "schemaVersion": 2,
  "clientEventId": "installation-event-uuid",
  "recurringKeywords": []
}
```
