# Mobile Ingest Contract

This is the backend contract for the PocketBuddy Android connector and companion frontend.

The Android connector posts normalized payment events after reading UPI app and SMS notifications. The frontend companion screen reads profile and sync-log state to show whether a real phone sync has happened.

## Android Webhook

Target endpoint for the Python backend:

```http
POST /api/ingest/notification
Content-Type: application/json
Authorization: Bearer <optional server-issued-token>
X-PocketBuddy-Connector: com.pocketbuddy.connector
X-PocketBuddy-Connector-Version: 0.1.0
X-PocketBuddy-Device-Id: <installation-scoped-device-id>
X-PocketBuddy-User-Id: <optional-user-id>
```

During local USB testing with `adb reverse`, the Android app should use:

```text
http://127.0.0.1:8000/api/ingest/notification
```

## Request Body

```json
{
  "packageName": "com.google.android.apps.messaging",
  "text": "Sent Rs.1.00 from XXXXXX6243 to CAMPUS CANTEEN on 13/06/2026. UPI ref no. 653029277807.",
  "timestamp": 1781379188000,
  "sourceApp": "com.google.android.apps.messaging",
  "captureSource": "sms_notification",
  "deviceId": "installation-scoped-uuid",
  "userId": "user-id-if-configured",
  "amount": 1.0,
  "currency": "INR",
  "direction": "debit",
  "merchant": "CAMPUS CANTEEN",
  "transactionId": "653029277807",
  "detectedAtDeviceMillis": 1781379188000
}
```

Required fields:

- `packageName`
- `text`
- `timestamp`
- `sourceApp`
- `captureSource`
- `deviceId`
- `amount`
- `currency`
- `direction`
- `merchant`
- `detectedAtDeviceMillis`

Optional fields:

- `userId`
- `transactionId`

Valid `captureSource` values:

- `payment_app_notification`
- `sms_notification`

Valid `direction` values:

- `debit`
- `credit`

## Backend Responsibilities

The webhook should:

1. Validate the payload structure and reject non-payment events.
2. Bind the event to a user from `userId`, `X-PocketBuddy-User-Id`, bearer token, or a future pairing flow.
3. Store a masked `companion_sync_log` row for observability.
4. De-duplicate app notification and SMS pairs for the same payment.
5. Create or update one canonical `transactions` row.
6. Update the user's profile with companion status.

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
  "created_at": "2026-06-13T17:12:08.232975Z"
}
```

Valid `processing_status` values:

- `pending`
- `parsed`
- `duplicate`
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

## Privacy Rule

The Android request body includes `text` because older payloads and fallback parsers need it. The backend should use that value only in-memory during request processing. New database rows should persist parsed fields plus `notification_preview`; they should not persist full raw notification or SMS text.

## Compatibility Note

The current Express backend has a legacy public webhook route with a different payload shape. The Python backend should implement the contract above. If the legacy route must remain temporarily, add it as an alias or adapter rather than changing the Android payload.
