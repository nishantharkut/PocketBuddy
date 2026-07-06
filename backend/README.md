# PocketBuddy Backend

FastAPI backend for auth, profiles, transactions, subscriptions, check-ins, cart pools, and Android companion ingest.

## First-Time Setup

Run these from the repository root in PowerShell:

```powershell
py -m venv backend\.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env
```

Edit `backend\.env` before running the server:

```env
JWT_SECRET=replace_with_a_local_secret
MONGO_URI=mongodb://localhost:27017
PORT=8000
AWS_REGION=ap-south-1
CAMPUS_FOOD_S3_BUCKET=
CAMPUS_FOOD_S3_KEY=campus_food.json
BEDROCK_ENABLED=false
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
```

`CAMPUS_FOOD_S3_BUCKET` is optional. When it is empty, the backend reads:

```text
data/campus_food.json
```

The RAG endpoint also works without Bedrock credentials by returning a deterministic local campus-food recommendation.

## Run Locally

Because `.env` is loaded relative to the current working directory, start FastAPI from `backend`:

```powershell
Set-Location backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

The API should be available at:

```text
http://127.0.0.1:8000
```

## Android Companion Endpoint

New Android connector builds post sanitized payment events to:

```http
POST /api/ingest/notification-v2
```

The older `/api/ingest/notification` route remains for legacy connector builds, but v2 rejects raw `text`/`body` payloads and accepts only structured transaction facts plus a masked preview.

The companion UI reads sync state from:

```http
GET /api/companion/logs
GET /api/profile
GET /api/transactions
```

Privacy-preserving connector v2 events are parsed on-device and send only structured transaction facts plus a masked `notification_preview`. The backend keeps the legacy ingest endpoint for older connector builds, but new connector payloads do not require raw notification/SMS text to be uploaded or persisted.

For USB testing, keep the backend on port `8000` and run:

```powershell
$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $ADB -s <device-id> reverse tcp:8000 tcp:8000
```

## Account Aggregator Sandbox

AA sandbox support is disabled by default and must be explicitly enabled:

```env
AA_SANDBOX_ENABLED=false
AA_SANDBOX_PROVIDER=local
AA_CALLBACK_SECRET=
```

Set `AA_SANDBOX_ENABLED=true` with `AA_SANDBOX_PROVIDER=local` to use PocketBuddy's built-in dummy-data consent lifecycle for demos. This local sandbox never fetches live bank data and stores dummy AA records separately from real transactions.

Authenticated frontend routes use:

```http
GET  /api/account-aggregator/status
POST /api/account-aggregator/sandbox/consents
POST /api/account-aggregator/sandbox/consents/{consent_id}/simulate
```

Provider callback placeholders are also available for sandbox wiring when `AA_CALLBACK_SECRET` is configured:

```http
POST /api/account-aggregator/Consent/Notification
POST /api/account-aggregator/FI/Notification
```

## Campus Food And RAG

The frontend dashboard reads:

```http
GET /api/campus-food
```

The authenticated recommendation route is:

```http
POST /api/rag/food-rag
```

For AWS deployment instructions, see:

```text
docs/aws-low-cost-setup.md
```
