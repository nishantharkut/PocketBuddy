# PocketBuddy Android

This directory contains the native Android connector used by PocketBuddy to capture UPI/payment notifications and send normalized transaction payloads to the backend.

All commands below are intended to be run from the repository root:

```powershell
cd "C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy"
```

The Android Gradle project is isolated inside `android/`, but repo-root commands are supported with:

```powershell
.\android\gradlew.bat -p android <task>
```

## Directory Layout

```text
PocketBuddy/
  android/
    build.gradle.kts
    settings.gradle.kts
    gradlew
    gradlew.bat
    gradle/
    local.properties.example
    local.properties              # local only, ignored by git
    connector/
      build.gradle.kts
      README.md
      src/
        main/
        debug/
        test/
    tools/
      ingest_test_backend/
        app/
        README.md
        requirements.txt
```

The Gradle module is named `:connector`.

## What The Connector Does

- Runs a native Android `NotificationListenerService`.
- Reads UPI/payment app notification text.
- Reads bank SMS notifications surfaced by apps like Google Messages.
- Parses amount, direction, merchant, transaction/reference ID, and capture source.
- Sends JSON payloads to the configured webhook.
- Adds stable installation-level `deviceId`.
- Supports optional `userId` and bearer token binding.
- Stores failed webhook sends in an encrypted Android Keystore retry queue.
- Includes debug-only ADB test broadcasts.

## Prerequisites

Install:

- Android Studio
- Android SDK Platform Tools
- A physical Android phone with Developer Options enabled
- USB debugging enabled on the phone
- Python 3.11+ if using the local FastAPI Android test backend

Use Android Studio's bundled JDK in PowerShell:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
```

If `adb` is not globally available, use:

```powershell
$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
```

## Open In Android Studio

Open this folder in Android Studio:

```text
C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy\android
```

Do not open only `android/connector`; open `android/` because it is the Gradle root.

After sync, Android Studio should show one module:

```text
connector
```

## Configure Local Properties

Create `android/local.properties` from the example:

```powershell
Copy-Item .\android\local.properties.example .\android\local.properties
```

Android Studio normally adds `sdk.dir` automatically. If it does not, add this line manually:

```properties
sdk.dir=C\:\\Users\\<YOUR_USER>\\AppData\\Local\\Android\\Sdk
```

For USB testing with `adb reverse`, use:

```properties
POCKETBUDDY_WEBHOOK_URL=http://127.0.0.1:8000/api/ingest/notification
POCKETBUDDY_WEBHOOK_TOKEN=
POCKETBUDDY_USER_ID=
```

For a LAN/ngrok backend, replace the URL accordingly:

```properties
POCKETBUDDY_WEBHOOK_URL=https://your-ngrok-url.ngrok-free.app/api/ingest/notification
```

`android/local.properties` is ignored by git.

These values are build-time defaults. The installed APK also has a setup screen where you can change the webhook URL, user ID, and bearer token without rebuilding.

The backend payload and companion frontend contract are documented in:

```text
docs/mobile-ingest-contract.md
```

## Build And Test

From the repo root:

```powershell
.\android\gradlew.bat -p android :connector:testDebugUnitTest
.\android\gradlew.bat -p android :connector:assembleDebug
```

Install on the connected phone:

```powershell
.\android\gradlew.bat -p android :connector:installDebug
```

If multiple devices are connected, install through ADB after building:

```powershell
$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$DEVICE = "10BF821N3M0055M"

.\android\gradlew.bat -p android :connector:assembleDebug
& $ADB -s $DEVICE install -r .\android\connector\build\outputs\apk\debug\connector-debug.apk
```

## Enable Required Android Permissions

Open notification listener settings:

```powershell
$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$DEVICE = "10BF821N3M0055M"

& $ADB -s $DEVICE shell am start -a android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS
```

Enable:

```text
PocketBuddy UPI Listener
```

Confirm it is enabled:

```powershell
& $ADB -s $DEVICE shell settings get secure enabled_notification_listeners
```

You should see:

```text
com.pocketbuddy.connector/com.pocketbuddy.connector.PocketBuddyNotificationListener
```

Also open the app once from the launcher:

```text
PocketBuddy Connector
```

In the setup screen, save the connector config shown by the web app's Companion Device page:

```text
Webhook URL
PocketBuddy user ID
Webhook token, if the backend has issued one
```

On Android 13+, allow notification permission if prompted. This is needed for debug notification tests, not for listening to other app notifications.

## Run Local FastAPI Test Backend

This backend is only for Android connector testing. The final project backend can replace it later.

Create and install dependencies:

```powershell
py -m venv .\android\tools\ingest_test_backend\.venv
.\android\tools\ingest_test_backend\.venv\Scripts\Activate.ps1
py -m pip install -r .\android\tools\ingest_test_backend\requirements.txt
```

Run from the repo root:

```powershell
uvicorn android.tools.ingest_test_backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Recent raw events:

```powershell
Invoke-RestMethod 'http://127.0.0.1:8000/api/ingest/recent?limit=10' | ConvertTo-Json -Depth 10
```

Canonical de-duplicated transactions:

```powershell
Invoke-RestMethod 'http://127.0.0.1:8000/api/ingest/transactions?limit=10' | ConvertTo-Json -Depth 10
```

## Wireless Normal Flow

Use this flow after the backend is deployed on AWS EC2 or another public server. This is closer to how a normal user would use the connector.

The phone does not need USB after the APK is installed.

Expected architecture:

```text
Phone Wi-Fi/mobile data
  -> http://<EC2_PUBLIC_IP>/api/ingest/notification
  -> Nginx on EC2
  -> FastAPI backend
  -> MongoDB Atlas
```

On the web app:

1. Open the deployed site:

```text
http://<EC2_PUBLIC_IP>
```

2. Login or signup.
3. Complete onboarding.
4. Open Settings -> Companion Device.
5. Copy the connector config.

It should look like:

```text
POCKETBUDDY_WEBHOOK_URL=http://<EC2_PUBLIC_IP>/api/ingest/notification
POCKETBUDDY_WEBHOOK_TOKEN=
POCKETBUDDY_USER_ID=<your_user_id>
```

On the Android app:

1. Open `PocketBuddy Connector`.
2. Paste the webhook URL.
3. Paste the user ID.
4. Leave webhook token empty unless the backend gives you one.
5. Tap `Save connector config`.
6. Tap `Open notification access`.
7. Enable PocketBuddy Connector.
8. Return to the app and confirm it says `Ready to sync`.

Then test from the web app:

1. Keep the backend running on EC2.
2. Send a real UPI debit/SMS notification, or use a debug build test broadcast.
3. Open Settings -> Companion Device.
4. Tap `Check For Real Sync`.
5. Confirm the event appears in Recent Sync Activity and the transaction appears on the dashboard.

Use USB-only commands like `adb reverse` only for local laptop testing. They are not needed when using the EC2 public URL.

## Connect Phone To Local Backend

For a USB-connected physical phone, reverse device port `8000` to laptop port `8000`:

```powershell
$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$DEVICE = "10BF821N3M0055M"

& $ADB -s $DEVICE reverse tcp:8000 tcp:8000
& $ADB -s $DEVICE reverse --list
```

Expected:

```text
UsbFfs tcp:8000 tcp:8000
```

With `adb reverse`, Android can post to:

```text
http://127.0.0.1:8000/api/ingest/notification
```

## Debug Broadcast Tests

These work only in debug builds.

Direct webhook SMS-style test:

```powershell
$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$DEVICE = "10BF821N3M0055M"

& $ADB -s $DEVICE shell am broadcast --receiver-foreground -n com.pocketbuddy.connector/.debug.DebugNotificationReceiver -a com.pocketbuddy.connector.DEBUG_UPI_NOTIFICATION --es mode sms --es amount 131 --es merchant CampusCanteen --es transactionId UTR131 --ez directWebhook true
```

Check backend:

```powershell
Invoke-RestMethod 'http://127.0.0.1:8000/api/ingest/recent?limit=5' | ConvertTo-Json -Depth 10
```

Notification-listener path test:

```powershell
& $ADB -s $DEVICE shell am broadcast --receiver-foreground -n com.pocketbuddy.connector/.debug.DebugNotificationReceiver -a com.pocketbuddy.connector.DEBUG_UPI_NOTIFICATION --es mode sms --es amount 132 --es merchant CampusCanteen --es transactionId UTR132
```

For this path, app notifications must be enabled because the debug receiver posts a local notification that the listener then observes.

## Real Transaction Test

1. Start the FastAPI test backend.
2. Run `adb reverse`.
3. Install the latest debug APK.
4. Enable notification listener access.
5. Keep logcat open:

```powershell
$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$DEVICE = "10BF821N3M0055M"

& $ADB -s $DEVICE logcat -c
& $ADB -s $DEVICE logcat -s PocketBuddyListener PocketBuddyWebhook PocketBuddyRetry PocketBuddyRetryQueue
```

6. Make a small UPI transaction or wait for a bank SMS.
7. Check backend:

```powershell
Invoke-RestMethod 'http://127.0.0.1:8000/api/ingest/transactions?limit=10' | ConvertTo-Json -Depth 10
```

Expected payload fields:

```json
{
  "packageName": "com.google.android.apps.messaging",
  "captureSource": "sms_notification",
  "deviceId": "installation-scoped-uuid",
  "amount": 2.0,
  "currency": "INR",
  "direction": "credit",
  "merchant": "KANIKA SINGHAL",
  "transactionId": "208403881695"
}
```

## Provider Coverage

Payment-app notifications are parsed when they expose readable notification text containing:

- INR amount, such as `Rs.50`, `INR 50`, or a rupee symbol amount
- debit/credit direction, such as `paid`, `sent`, `debited`, `received`, or `credited`
- UPI/payment signal, such as `UPI`, `VPA`, `UTR`, `txn id`, or `ref no`

Known package coverage includes:

- Google Pay
- PhonePe
- Paytm
- BHIM
- Amazon Pay through Amazon Shopping
- WhatsApp payment notifications
- Kotak, Axis, ICICI, HDFC, SBI, PayZapp, CRED, MobiKwik, Freecharge, Airtel, Jio, and common bank/payment package fragments

SMS notification coverage includes:

- Google Messages
- Vivo/Android Messages
- Samsung Messages
- common `messaging`, `mms`, and `sms` package fragments

OTP and promotional messages are intentionally rejected.

## Troubleshooting

Check connected devices:

```powershell
& $ADB devices -l
```

If device shows `unauthorized`, unlock the phone and approve the USB debugging prompt.

If device shows `offline`:

```powershell
& $ADB reconnect offline
```

If `adb` is not recognized, use:

```powershell
$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
```

If backend is not reachable from phone, run:

```powershell
& $ADB -s $DEVICE reverse tcp:8000 tcp:8000
```

If Gradle cannot find Java, set:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
```

If build output is stale:

```powershell
.\android\gradlew.bat -p android :connector:clean
.\android\gradlew.bat -p android :connector:assembleDebug
```

If no real events appear, verify:

- backend is running on port `8000`
- `adb reverse` is active for the selected device
- notification listener access is enabled
- the latest APK is installed
- the source notification contains amount, direction, and UPI/payment signal

## Important Files

```text
android/connector/src/main/java/com/pocketbuddy/connector/PocketBuddyNotificationListener.kt
android/connector/src/main/java/com/pocketbuddy/connector/config/ConnectorConfigStore.kt
android/connector/src/main/java/com/pocketbuddy/connector/parser/UpiNotificationParser.kt
android/connector/src/main/java/com/pocketbuddy/connector/network/WebhookClient.kt
android/connector/src/main/java/com/pocketbuddy/connector/retry/WebhookRetryQueue.kt
android/connector/src/debug/java/com/pocketbuddy/connector/debug/DebugNotificationReceiver.kt
android/tools/ingest_test_backend/app/main.py
docs/mobile-ingest-contract.md
```
