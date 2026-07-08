# Mobile Ingest Contract

This is the backend contract for the PocketBuddy Android connector and companion frontend.

The Android connector posts normalized payment events after reading UPI app and SMS notifications. The frontend companion screen reads profile and sync-log state to show whether a real phone sync has happened.

## Android Webhook

Target endpoint for new Android connector builds:

```http
POST /api/ingest/notification-v2
Content-Type: application/json
Authorization: Bearer <pairing-token>
X-PocketBuddy-Connector: com.pocketbuddy.connector
X-PocketBuddy-Connector-Version: 0.1.0
X-PocketBuddy-Device-Id: <installation-scoped-device-id>
X-PocketBuddy-User-Id: <optional-user-id>
X-PocketBuddy-Timestamp: <unix-ms>
X-PocketBuddy-Event-Id: <client-event-id>
X-PocketBuddy-Signature: sha256=<hmac>
```

During local USB testing with `adb reverse`, the Android app should use:

```text
http://127.0.0.1:8000/api/ingest/notification-v2
```

## Request Body

```json
{
  "packageName": "com.google.android.apps.messaging",
  "timestamp": 1781379188000,
  "sourceApp": "Google Messages",
  "captureSource": "sms_notification",
  "deviceId": "installation-scoped-uuid",
  "userId": "user-id-if-configured",
  "amount": 1.0,
  "currency": "INR",
  "direction": "debit",
  "merchant": "CAMPUS CANTEEN",
  "transactionId": "653029277807",
  "detectedAtDeviceMillis": 1781379188000,
  "maskedPreview": "Sent Rs.1.00 from XXXXXX[digits] to CAMPUS CANTEEN. UPI ref no. [ref].",
  "parserVersion": "android-upi-v2",
  "confidence": "high",
  "privacyMode": "on_device_only",
  "rawTextSuppressed": true,
  "schemaVersion": 2,
  "clientEventId": "installation-event-uuid",
  "recurringKeywords": []
}
```

Required fields:

- `packageName`
- `timestamp`
- `sourceApp`
- `captureSource`
- `deviceId`
- `currency`
- `detectedAtDeviceMillis`
- `maskedPreview`
- `parserVersion`
- `confidence`
- `privacyMode`
- `rawTextSuppressed`
- `schemaVersion`
- `clientEventId`

Optional fields:

- `userId`
- `amount`
- `direction`
- `merchant`
- `transactionId`
- `recurringKeywords`

Valid `captureSource` values:

- `payment_app`
- `sms_notification`
- `debug`

Valid `direction` values:

- `debit`
- `credit`

## Backend Responsibilities

The webhook should:

1. Validate the payload structure and reject raw `text`/`body` on `/notification-v2`.
2. Require a valid connector HMAC signature on `/notification-v2`.
3. Bind the event to a user from `userId`, `X-PocketBuddy-User-Id`, bearer token, or a future pairing flow.
4. Store a masked `companion_sync_log` row for observability.
5. Mark payment-like events with missing amount, merchant, or direction as `incomplete` rather than silently dropping them.
6. De-duplicate app notification and SMS pairs for the same payment.
7. Create or update one canonical `transactions` row when the core transaction fields are present.
8. Update the user's profile with companion status.

Suggested profile fields:

```json
{
  "companion_paired": true,
  "companion_device_name": "PocketBuddy Android Connector",
  "companion_last_sync": "2026-06-13T17:12:08.232975Z"
}
```

Suggested sync-log fields:

```json
{
  "id": "log-id",
  "user_id": "user-id",
  "device_id": "installation-scoped-uuid",
  "device_name": "PocketBuddy Android Connector",
  "notification_source": "sms_notification",
  "notification_preview": "Sent Rs.1.00 from XXXXXX[digits] to CAMPUS CANTEEN...",
  "processing_status": "parsed",
  "parsed_amount": 1.0,
  "parsed_merchant": "CAMPUS CANTEEN",
  "source_confidence": "high",
  "raw_payload_received": false,
  "recurring_keywords": [],
  "created_at": "2026-06-13T17:12:08.232975Z"
}
```

Valid `processing_status` values:

- `pending`
- `parsed`
- `duplicate`
- `incomplete`
- `needs_review`
- `failed`

## Frontend Companion Reads

The companion page expects these authenticated routes:

```http
GET /api/profile
GET /api/companion/logs
GET /api/transactions
```

`GET /api/companion/logs` should return an array sorted newest first:

```json
[
  {
    "id": "log-id",
    "notification_source": "sms_notification",
    "notification_preview": "Sent Rs.1.00 from XXXXXX[digits] to CAMPUS CANTEEN...",
    "processing_status": "parsed",
    "created_at": "2026-06-13T17:12:08.232975Z"
  }
]
```

The frontend treats the Android connector as connected only when at least one of these is true:

- `profile.companion_paired` is true
- `profile.companion_last_sync` exists
- `/api/companion/logs` returns at least one row

The frontend does not mark the device connected by itself. Real connection state must come from backend ingest.

## Signature Rule

When a pairing token is configured, Android signs the exact JSON request body with:

```text
HMAC_SHA256(pairing_token, "<timestamp-ms>.<client-event-id>.<raw-json-body>")
```

The backend verifies this using `X-PocketBuddy-Timestamp`, `X-PocketBuddy-Event-Id`, and `X-PocketBuddy-Signature`.
Unsigned events are rejected on `/api/ingest/notification-v2`. The legacy `/api/ingest/notification` route can remain temporarily migration-friendly, but new connector builds should use signed v2 requests only.

## Privacy Rule

The v2 Android request body must not include full notification or SMS text. Android parses the alert on-device and sends structured fields plus `maskedPreview`. The legacy `/api/ingest/notification` route exists only for older connector builds and is disabled by default for raw text.

## Compatibility Note

The Python backend still exposes `/api/ingest/notification` for older connector builds, but new Android builds should use `/api/ingest/notification-v2`. Keep any legacy adapter isolated so the v2 privacy contract stays stable.
