# PocketBuddy AWS E2E Deployment Runbook

Status: live demo deployment documented  
Last updated: 2026-06-14  
Region used: `ap-south-1` / Asia Pacific Mumbai  
Purpose: exact end-to-end record of the AWS setup used for the PocketBuddy demo

This document records the AWS resources, configuration, code, routing, commands,
test evidence, and cleanup steps for the deployed PocketBuddy stack.

Do not paste secrets into this file. The values below intentionally keep tokens,
MongoDB passwords, JWT secrets, and key-pair private keys out of the repo.

## 1. Final Live Architecture

The deployed demo is not just one EC2 VM. The final shape is a hybrid AWS-native
architecture:

```text
Browser
  -> CloudFront
     -> S3 origin for React/Vite static frontend
     -> EC2/Nginx/FastAPI origin for app APIs
     -> API Gateway origin for the exact mobile ingest route

Android Connector
  -> CloudFront /api/ingest/notification
  -> API Gateway HTTP API
  -> Lambda ingest
  -> SQS standard queue
  -> Lambda processor
  -> DynamoDB ingest ledger
  -> EC2 FastAPI / MongoDB app transaction path

EC2 FastAPI
  -> MongoDB Atlas main app database
```

Important design decision:

- Browser app APIs still go to EC2 FastAPI through CloudFront `/api/*`.
- The Android payment-notification webhook goes through the serverless path.
- CloudFront behavior order is critical. The exact mobile ingest behavior must
  be above `/api/*`.

## 2. Verified Public URLs

Frontend:

```text
https://d3g6cg7q9hn7hi.cloudfront.net
```

CloudFront mobile webhook URL used by Android:

```text
https://d3g6cg7q9hn7hi.cloudfront.net/api/ingest/notification
```

Direct API Gateway URL, used only for testing:

```text
https://k2y5e0vvnh.execute-api.ap-south-1.amazonaws.com
```

Direct API Gateway mobile webhook path:

```text
https://k2y5e0vvnh.execute-api.ap-south-1.amazonaws.com/api/ingest/notification
```

EC2 public IP:

```text
3.108.58.80
```

EC2 public DNS:

```text
ec2-3-108-58-80.ap-south-1.compute.amazonaws.com
```

## 3. Cost Safety Setup

These were done before the heavier setup:

1. Root account MFA enabled with Google Authenticator.
2. AWS Budgets created.
3. Free Tier alerts enabled.
4. CloudWatch billing alerts enabled.
5. No NAT Gateway created.
6. No WAF enabled on CloudFront because the console estimated about USD 14/month.
7. No Elastic IP allocated.
8. No RDS created.
9. No ALB created.
10. No KMS customer managed key created for this demo.

Budgets visible in AWS Budgets:

```text
pocketbuddy-zero-spend-alert
pocketbuddy-monthly-5usd-alert
```

The console showed:

```text
Budget amounts:
- USD 1.00 zero/low spend alert
- USD 3.00 or USD 5.00 monthly alert depending on final console edit
```

Before demo work, always confirm:

```text
Billing and Cost Management -> Budgets
Account -> Alert preferences
EC2 -> Instances
VPC -> Elastic IP addresses
```

Expected safety state:

```text
Root MFA: enabled
Budget alerts: present
Free Tier alerts: checked
CloudWatch billing alerts: checked
Elastic IPs: none
Running EC2 instances: only pocketbuddy-demo
```

## 4. AWS Account And Region

AWS account ID used in the live demo:

```text
734705208425
```

Primary region:

```text
ap-south-1
Asia Pacific (Mumbai)
```

CloudFront is a global service, but its origins point to Mumbai resources.

If this guide is shared publicly, the AWS account ID can be redacted. It is not
a password, but it is still unnecessary to expose outside the team.

## 5. MongoDB Atlas

MongoDB Atlas remains the main application database.

Backend variable:

```text
MONGO_URI=mongodb+srv://<db_user>:<password>@cluster0.7xlzz2g.mongodb.net/pocketbuddy?retryWrites=true&w=majority
```

Rules:

- Keep the real MongoDB password only in `backend/.env` on EC2/local machines.
- Do not commit `backend/.env`.
- `backend/.env.example` should contain placeholders only.
- MongoDB stores users, profiles, transactions, companion logs, pools, checkins,
  subscriptions, and other app data.
- DynamoDB does not replace MongoDB. It is only the mobile ingest ledger.

## 6. EC2 Application Origin

Instance:

```text
Name: pocketbuddy-demo
Instance ID: i-0d2b2de6380411151
AMI: Ubuntu Server 24.04 LTS
AMI ID: ami-006f82a1d5a27da54
Instance type: t3.micro
Public IPv4: 3.108.58.80
Private IPv4: 172.31.0.107
Public DNS: ec2-3-108-58-80.ap-south-1.compute.amazonaws.com
Key pair: pocketbuddy-demo-key
Security group: pocketbuddy-demo-sg
Security group ID: sg-05909998927c93c15
```

Credit specification:

```text
Unlimited mode: disabled after launch
```

Security group inbound rules during setup:

```text
HTTP TCP 80 0.0.0.0/0
SSH  TCP 22 <your-current-ip>/32
```

For institute networks where SSH was blocked, browser-based EC2 Instance
Connect was used instead of local SSH.

Do not expose port `8000` publicly. FastAPI runs on localhost behind Nginx.

## 7. EC2 Package Installation

Commands run on EC2:

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip nodejs npm nginx git curl
```

Verified versions:

```text
Python 3.12.3
Node.js v18.19.1 from apt, later replaced/overridden for Vite build
npm 9.2.0 from apt
nginx 1.24.0
git 2.43.0
```

Vite required Node `20.19+` or `22.12+`, so Node 18 failed with:

```text
You are using Node.js 18.19.1. Vite requires Node.js version 20.19+ or 22.12+.
ReferenceError: CustomEvent is not defined
```

Fix used: upgrade/install a newer Node runtime before running the frontend
build. After the upgrade, `npm run build --workspace=frontend` succeeded.

## 8. EC2 Repository Layout

Repo location on EC2:

```text
/home/ubuntu/PocketBuddy
```

Backend location:

```text
/home/ubuntu/PocketBuddy/backend
```

Frontend build output:

```text
/home/ubuntu/PocketBuddy/frontend/dist
```

Nginx static directory:

```text
/var/www/pocketbuddy
```

## 9. Backend Environment On EC2

File:

```text
/home/ubuntu/PocketBuddy/backend/.env
```

Created from:

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Required minimum variables:

```text
JWT_SECRET=<strong-secret>
MONGO_URI=<mongodb-atlas-uri>
PORT=8000
AWS_REGION=ap-south-1
CAMPUS_FOOD_S3_BUCKET=
CAMPUS_FOOD_S3_KEY=campus_food.json
BEDROCK_ENABLED=false
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
```

Important failure that happened:

Running Uvicorn from repo root with the wrong app dir/env location produced:

```text
pydantic_core._pydantic_core.ValidationError:
JWT_SECRET Field required
MONGO_URI Field required
```

Correct command from backend directory:

```bash
cd /home/ubuntu/PocketBuddy/backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## 10. Backend Systemd Service

File:

```text
/etc/systemd/system/pocketbuddy-backend.service
```

Content:

```ini
[Unit]
Description=PocketBuddy FastAPI Backend
After=network.target

[Service]
WorkingDirectory=/home/ubuntu/PocketBuddy/backend
Environment=PYTHONUNBUFFERED=1
ExecStart=/home/ubuntu/PocketBuddy/backend/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
User=ubuntu

[Install]
WantedBy=multi-user.target
```

Commands:

```bash
sudo systemctl daemon-reload
sudo systemctl enable pocketbuddy-backend
sudo systemctl start pocketbuddy-backend
sudo systemctl status pocketbuddy-backend --no-pager
```

Expected:

```text
Active: active (running)
ExecStart: ... uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Useful logs:

```bash
journalctl -u pocketbuddy-backend -n 100 --no-pager
```

## 11. Nginx On EC2

Nginx serves either:

- static frontend from `/var/www/pocketbuddy` for the older EC2-only path, and
- `/api/*` proxy to FastAPI.

After S3/CloudFront was introduced, the frontend static hosting moved to S3,
but EC2/Nginx is still the CloudFront origin for normal app API routes.

Site file:

```text
/etc/nginx/sites-available/pocketbuddy
```

Expected content:

```nginx
server {
    listen 80;
    server_name _;

    root /var/www/pocketbuddy;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable and reload:

```bash
sudo ln -sf /etc/nginx/sites-available/pocketbuddy /etc/nginx/sites-enabled/pocketbuddy
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx --no-pager
```

Verified local EC2 checks:

```bash
curl -i http://127.0.0.1/
curl -i http://127.0.0.1/api/campus-food
```

Expected:

- `/` returns frontend HTML.
- `/api/campus-food` returns JSON.
- `/api/health` returned `404 Not Found` because the backend does not expose
  that route. This is not a deployment failure.

## 12. Frontend Build And S3 Upload

Frontend build command:

```bash
cd /home/ubuntu/PocketBuddy
npm install
npm run build --workspace=frontend
```

Successful build output seen:

```text
dist/index.html
dist/assets/index-*.css
dist/assets/index-*.js
```

S3 bucket:

```text
pocketbuddy-frontend-734705208425-ap-south-1
```

Important upload rule:

- Upload the *contents* of `frontend/dist` to the S3 bucket root.
- Do not upload only the `dist/` folder.

Correct S3 root objects:

```text
assets/
dist/                         # leftover from first upload; harmless but not needed
icon-192.svg
icon-512.svg
index.html
manifest.webmanifest
```

The first upload put everything under `dist/`, causing CloudFront `/` to return:

```xml
<Error>
  <Code>AccessDenied</Code>
  <Message>Access Denied</Message>
</Error>
```

Fix:

- Copy/move `dist/index.html`, `dist/assets/`, icons, and manifest to bucket root.
- Keep S3 bucket private.
- Let CloudFront access S3 through the CloudFront-managed bucket policy.

## 13. S3 Bucket Policy For CloudFront

Bucket:

```text
pocketbuddy-frontend-734705208425-ap-south-1
```

Policy generated by CloudFront private-origin access:

```json
{
  "Version": "2008-10-17",
  "Id": "PolicyForCloudFrontPrivateContent",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::pocketbuddy-frontend-734705208425-ap-south-1/*",
      "Condition": {
        "ArnLike": {
          "AWS:SourceArn": "arn:aws:cloudfront::734705208425:distribution/E39IGIZXM49Y9N"
        }
      }
    }
  ]
}
```

Do not make the bucket public.

## 14. CloudFront Distribution

Distribution:

```text
Name: pocketbuddy-frontend
Distribution ID: E39IGIZXM49Y9N
Domain: d3g6cg7q9hn7hi.cloudfront.net
Type: Standard
Billing: Pay-as-you-go
WAF/security protections: None
Default root object: index.html
```

CloudFront WAF was intentionally not enabled because the console estimated
approximately USD 14/month for the suggested WAF configuration.

## 15. CloudFront Origins

### 15.1 S3 Frontend Origin

Origin domain:

```text
pocketbuddy-frontend-734705208425-ap-south-1.s3.ap-south-1.amazonaws.com
```

Settings:

```text
Origin type: Amazon S3
Grant CloudFront access to origin: Yes
Origin Shield: No
Origin path: empty
```

### 15.2 EC2 API Origin

Origin domain:

```text
ec2-3-108-58-80.ap-south-1.compute.amazonaws.com
```

Purpose:

```text
All normal browser app API routes under /api/*
```

### 15.3 API Gateway Mobile Ingest Origin

Origin name:

```text
api-gateway-mobile-ingest
```

Origin domain:

```text
k2y5e0vvnh.execute-api.ap-south-1.amazonaws.com
```

Settings:

```text
Protocol: HTTPS only
HTTPS port: 443
Minimum origin SSL protocol: TLSv1.2
Origin path: empty
Custom headers: none
Origin Shield: No
```

Important:

- Enter only the domain name.
- Do not include `https://`.
- Do not include a trailing slash.

## 16. CloudFront Behaviors

Final behavior order:

```text
Precedence 0: /api/ingest/notification -> api-gateway-mobile-ingest
Precedence 1: /api/*                   -> EC2 API origin
Precedence 2: Default (*)              -> S3 frontend origin
```

This order is critical. CloudFront uses the first matching behavior.

The first test returned frontend HTML for a POST to
`/api/ingest/notification` because `/api/*` was above the exact behavior.
Moving `/api/ingest/notification` above `/api/*` fixed it.

### 16.1 Mobile Ingest Behavior

Path pattern:

```text
/api/ingest/notification
```

Origin:

```text
api-gateway-mobile-ingest
```

Settings:

```text
Viewer protocol policy: Redirect HTTP to HTTPS
Allowed HTTP methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
Cache policy: CachingDisabled
Origin request policy: AllViewerExceptHostHeader
Response headers policy: empty/default
Compress objects automatically: Yes or No is acceptable
Restrict viewer access: No
```

### 16.2 General API Behavior

Path pattern:

```text
/api/*
```

Origin:

```text
EC2 origin
```

Purpose:

```text
Login, signup, profile, dashboard, transactions, companion logs, pools,
campus food, subscriptions, insights, and other FastAPI routes.
```

Use caching disabled for API routes.

### 16.3 Default Frontend Behavior

Path pattern:

```text
Default (*)
```

Origin:

```text
S3 frontend origin
```

Purpose:

```text
React/Vite static app and SPA routes.
```

## 17. CloudFront Error Pages For SPA Routes

Error pages created:

```text
403 -> /index.html, HTTP 200, minimum TTL 10 seconds
404 -> /index.html, HTTP 200, minimum TTL 10 seconds
```

Purpose:

- `/login`
- authenticated frontend routes
- any client-side route

Without these error responses, S3/CloudFront can return AccessDenied or 404 for
SPA routes.

After behavior or error-page changes, create invalidation:

```text
/*
```

## 18. API Gateway HTTP API

API:

```text
Name: pocketbuddy-mobile-ingest-api
Type: HTTP API
Invoke URL: https://k2y5e0vvnh.execute-api.ap-south-1.amazonaws.com
IP address type: IPv4
Stage: $default
Auto-deploy: enabled
```

Integration:

```text
Type: Lambda
Region: ap-south-1
Function: pocketbuddy-ingest
Payload format version: 2.0
```

Route:

```text
POST /api/ingest/notification -> pocketbuddy-ingest
```

Why HTTP API, not REST API:

- Lower cost.
- Simpler.
- Enough for one Lambda-backed webhook route.

## 19. SQS Queue

Queue:

```text
Name: pocketbuddy-ingest-queue
Type: Standard
URL: https://sqs.ap-south-1.amazonaws.com/734705208425/pocketbuddy-ingest-queue
ARN: arn:aws:sqs:ap-south-1:734705208425:pocketbuddy-ingest-queue
```

Configuration:

```text
Visibility timeout: 60 seconds
Message retention period: 4 days
Delivery delay: 0 seconds
Maximum message size: 1024 KiB
Receive message wait time: 0 seconds
Server-side encryption: Amazon SQS key (SSE-SQS)
Access policy: only queue owner
Dead-letter queue: disabled for current demo
```

DLQ was skipped for speed. For production, add:

```text
pocketbuddy-ingest-dlq
maxReceiveCount: 3 or 5
```

## 20. DynamoDB Ingest Ledger

Table:

```text
Name: pocketbuddy_ingest_events
Region: ap-south-1
Partition key: user_id (String)
Sort key: event_id (String)
```

Purpose:

- Keep a ledger of mobile ingest events.
- Provide idempotency/deduplication for SQS retries.
- Give AWS-native proof that mobile events are landing.

Verified item example:

```json
{
  "user_id": {
    "S": "debug-user"
  },
  "event_id": {
    "S": "7ad2f2ea694deb5257d82121b8f500ff7c11712df0268b95534d10f20d5a369f"
  },
  "amount": {
    "S": "151"
  },
  "currency": {
    "S": "INR"
  },
  "direction": {
    "S": "debit"
  },
  "merchant": {
    "S": "CampusCanteen"
  },
  "processed_at": {
    "S": "2026-06-14T12:31:43.412559+00:00"
  },
  "received_at_ms": {
    "S": "1781438919892"
  },
  "source": {
    "S": "sms_notification"
  },
  "status": {
    "S": "ledgered"
  },
  "transaction_id": {
    "S": "UTR151"
  }
}
```

## 21. Lambda: Ingest Function

Function:

```text
Name: pocketbuddy-ingest
Runtime: Python 3.12
Architecture: x86_64
Role: pocketbuddy-ingest-role-oa0hzydt
```

Environment variables:

```text
QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/734705208425/pocketbuddy-ingest-queue
WEBHOOK_TOKEN=
```

`WEBHOOK_TOKEN` is empty for current demo because backend/server-issued webhook
tokens are not finalized. When token support is ready, set a real value and
configure Android to send:

```http
Authorization: Bearer <token>
```

### 21.1 Ingest Lambda IAM Policy

Inline policy on role `pocketbuddy-ingest-role-oa0hzydt`:

```text
Policy name: pocketbuddy-ingest-sqs-send
```

Policy JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage"
      ],
      "Resource": "arn:aws:sqs:ap-south-1:734705208425:pocketbuddy-ingest-queue"
    }
  ]
}
```

### 21.2 Ingest Lambda Code

File in AWS console:

```text
lambda_function.py
```

Code:

```python
import base64
import hashlib
import json
import os
import time
import uuid

import boto3

sqs = boto3.client("sqs")

QUEUE_URL = os.environ["QUEUE_URL"]
WEBHOOK_TOKEN = os.environ.get("WEBHOOK_TOKEN", "").strip()


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "content-type": "application/json"
        },
        "body": json.dumps(body),
    }


def parse_body(event):
    raw_body = event.get("body") or "{}"

    if event.get("isBase64Encoded"):
        raw_body = base64.b64decode(raw_body).decode("utf-8")

    return json.loads(raw_body)


def stable_event_id(payload):
    user_id = payload.get("userId") or payload.get("user_id") or "unknown"
    device_id = payload.get("deviceId") or payload.get("device_id") or ""
    transaction_id = payload.get("transactionId") or payload.get("transaction_id") or ""
    amount = payload.get("amount")
    direction = payload.get("direction") or ""
    timestamp = payload.get("timestamp") or payload.get("detectedAtDeviceMillis") or ""
    text = payload.get("text") or ""

    if transaction_id:
        dedupe_source = f"txn:{user_id}:{device_id}:{transaction_id}:{amount}:{direction}"
    else:
        dedupe_source = f"text:{user_id}:{device_id}:{amount}:{direction}:{timestamp}:{text[:160]}"

    return hashlib.sha256(dedupe_source.encode("utf-8")).hexdigest()


def lambda_handler(event, context):
    headers = event.get("headers") or {}
    auth = headers.get("authorization") or headers.get("Authorization") or ""

    if WEBHOOK_TOKEN:
        expected = f"Bearer {WEBHOOK_TOKEN}"
        if auth != expected:
            return response(401, {"error": "unauthorized"})

    try:
        payload = parse_body(event)
    except Exception:
        return response(400, {"error": "invalid_json"})

    if not isinstance(payload, dict):
        return response(400, {"error": "invalid_payload"})

    user_id = payload.get("userId") or payload.get("user_id")
    if not user_id:
        user_id = headers.get("x-pocketbuddy-user-id") or headers.get("X-PocketBuddy-User-Id")

    if not user_id:
        return response(400, {"error": "missing_user_id"})

    payload["userId"] = user_id

    event_id = payload.get("eventId") or payload.get("event_id") or stable_event_id(payload)

    envelope = {
        "event_id": event_id,
        "user_id": user_id,
        "received_at_ms": int(time.time() * 1000),
        "headers": {
            "x-pocketbuddy-device-id": headers.get("x-pocketbuddy-device-id") or headers.get("X-PocketBuddy-Device-Id"),
            "x-pocketbuddy-connector": headers.get("x-pocketbuddy-connector") or headers.get("X-PocketBuddy-Connector"),
            "x-pocketbuddy-connector-version": headers.get("x-pocketbuddy-connector-version") or headers.get("X-PocketBuddy-Connector-Version"),
        },
        "payload": payload,
    }

    sqs.send_message(
        QueueUrl=QUEUE_URL,
        MessageBody=json.dumps(envelope),
    )

    return response(202, {"status": "queued", "event_id": event_id})
```

## 22. Lambda: Processor Function

Function:

```text
Name: pocketbuddy-processor
Runtime: Python 3.12
Role: pocketbuddy-processor-role-574dzv1n
```

Environment variables:

```text
DDB_TABLE=pocketbuddy_ingest_events
EC2_INGEST_URL=http://3.108.58.80/api/ingest/notification
FORWARD_TO_EC2=true
```

Why forward to EC2:

- DynamoDB records the AWS-native event ledger.
- EC2/FastAPI still owns the app transaction model and UI sync logs.
- The processor forwards valid real-user events to the existing backend so the
  dashboard and companion page continue to work.

For `debug-user`, FastAPI may return `404 User not found`. That is acceptable
for debug payloads because `debug-user` does not exist in MongoDB. The processor
code treats non-5xx HTTP errors as handled results so SQS does not retry forever.

### 22.1 Processor Lambda IAM Policies

AWS managed policy already attached:

```text
AWSLambdaBasicExecutionRole
```

Inline policy for DynamoDB:

```text
Policy name: pocketbuddy-processor-dynamodb-write
```

Policy JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem"
      ],
      "Resource": "arn:aws:dynamodb:ap-south-1:734705208425:table/pocketbuddy_ingest_events"
    }
  ]
}
```

Inline policy for SQS trigger:

```text
Policy name: pocketbuddy-processor-sqs-read
```

Policy JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:ChangeMessageVisibility"
      ],
      "Resource": "arn:aws:sqs:ap-south-1:734705208425:pocketbuddy-ingest-queue"
    }
  ]
}
```

### 22.2 Processor Lambda SQS Trigger

Event source mapping:

```text
UUID: 10786f2b-10f0-4235-8179-cd846605b49b
Source: SQS
Queue: arn:aws:sqs:ap-south-1:734705208425:pocketbuddy-ingest-queue
State: Enabled
Activate trigger: Yes
Batch size: 1
Batch window: None / 0
On-failure destination: None
Report batch item failures: No
Provisioned mode: Off
EventCount metrics: Off
Maximum concurrency: empty
Filter criteria: empty
```

An earlier trigger already existed but was deactivated:

```text
Error when creating duplicate:
An event source mapping with SQS arn ... and function ("pocketbuddy-processor") already exists.
```

Fix:

- Do not create a second trigger.
- Edit the existing trigger.
- Activate it.

### 22.3 Processor Lambda Code

File in AWS console:

```text
lambda_function.py
```

Code:

```python
import datetime
import json
import os
import urllib.error
import urllib.request

import boto3
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")

DDB_TABLE = os.environ["DDB_TABLE"]
EC2_INGEST_URL = os.environ["EC2_INGEST_URL"]
FORWARD_TO_EC2 = os.environ.get("FORWARD_TO_EC2", "true").lower() == "true"

table = dynamodb.Table(DDB_TABLE)


def utc_now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def forward_to_ec2(payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        EC2_INGEST_URL,
        data=data,
        headers={
            "content-type": "application/json",
            "x-pocketbuddy-user-id": payload.get("userId", ""),
            "x-pocketbuddy-connector": "aws-lambda-processor",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            body = res.read().decode("utf-8", errors="replace")
            return {"ok": True, "status_code": res.status, "body": body[:500]}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        if exc.code >= 500:
            raise
        return {"ok": False, "status_code": exc.code, "body": body[:500]}


def process_envelope(envelope):
    event_id = envelope["event_id"]
    user_id = envelope["user_id"]
    payload = envelope["payload"]

    amount_value = payload.get("amount")
    item = {
        "user_id": user_id,
        "event_id": event_id,
        "status": "ledgered",
        "source": payload.get("captureSource") or payload.get("sourceApp") or "unknown",
        "direction": payload.get("direction") or "unknown",
        "amount": str(amount_value) if amount_value is not None else "unknown",
        "currency": payload.get("currency") or "INR",
        "merchant": payload.get("merchant") or "unknown",
        "transaction_id": payload.get("transactionId") or "unknown",
        "received_at_ms": str(envelope.get("received_at_ms") or ""),
        "processed_at": utc_now_iso(),
    }

    try:
        table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(event_id)",
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code == "ConditionalCheckFailedException":
            print(f"duplicate event_id={event_id}")
            return {"event_id": event_id, "status": "duplicate"}
        raise

    forward_result = None
    if FORWARD_TO_EC2:
        forward_result = forward_to_ec2(payload)

    return {
        "event_id": event_id,
        "status": "processed",
        "forward_result": forward_result,
    }


def lambda_handler(event, context):
    results = []

    for record in event.get("Records", []):
        try:
            envelope = json.loads(record["body"])
            results.append(process_envelope(envelope))
        except Exception as exc:
            print(f"processor_error record={record.get('messageId')} error={exc}")
            raise

    return {"results": results}
```

## 23. Android Connector Config

The Android app should use the CloudFront URL, not the EC2 IP and not direct
API Gateway.

Final config:

```text
POCKETBUDDY_WEBHOOK_URL=https://d3g6cg7q9hn7hi.cloudfront.net/api/ingest/notification
POCKETBUDDY_WEBHOOK_TOKEN=
POCKETBUDDY_USER_ID=<real PocketBuddy user id from web app>
```

Rules:

- Do not use `debug-user` in the Android app.
- Use the real user ID shown in the web app's Companion Device page.
- Leave token empty until backend-issued webhook tokens are implemented.
- Android app should show `Ready to sync` after saving config and enabling
  notification listener access.

Notification listener permission:

```powershell
$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$DEVICE = "10BF821N3M0055M"
& $ADB -s $DEVICE shell settings get secure enabled_notification_listeners
```

Expected to include:

```text
com.pocketbuddy.connector/com.pocketbuddy.connector.PocketBuddyNotificationListener
```

## 24. Local Windows Android Commands

Set Java and ADB for the terminal session:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:LOCALAPPDATA\Android\Sdk\platform-tools;$env:Path"

$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $ADB devices
```

If device shows `unauthorized`:

1. Unlock phone.
2. Accept the USB debugging prompt.
3. Re-run `adb devices`.

Install Android debug build from repo root:

```powershell
cd "C:\Users\nhnis\Desktop\Amazon Hackon\PocketBuddy\PocketBuddy"
.\android\gradlew.bat -p android :connector:installDebug
```

If Java is missing:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
```

## 25. Test Commands And Evidence

### 25.1 Direct API Gateway Test

PowerShell:

```powershell
$body = @{
  userId = "debug-user"
  amount = 152
  currency = "INR"
  direction = "debit"
  merchant = "CampusCanteen"
  transactionId = "UTR152"
  captureSource = "sms_notification"
  text = "PocketBuddy API Gateway test"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://k2y5e0vvnh.execute-api.ap-south-1.amazonaws.com/api/ingest/notification" `
  -ContentType "application/json" `
  -Body $body
```

Observed response:

```text
status event_id
------ --------
queued 49698cee6f78076d1396bf453a24b9e35e7810d52c2b1b7be53f513d784205f9
```

Verified in DynamoDB:

```text
transaction_id: UTR152
amount: 152
merchant: CampusCanteen
status: ledgered
```

### 25.2 CloudFront To API Gateway Test

PowerShell:

```powershell
$body = @{
  userId = "debug-user"
  amount = 154
  currency = "INR"
  direction = "debit"
  merchant = "CampusCanteen"
  transactionId = "UTR154"
  captureSource = "sms_notification"
  text = "PocketBuddy CloudFront to API Gateway test"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://d3g6cg7q9hn7hi.cloudfront.net/api/ingest/notification" `
  -ContentType "application/json" `
  -Body $body
```

Observed response:

```text
status event_id
------ --------
queued 9d12b0fbf5ef8ee94b7cc1d3de7772015122d38f6ce6a2a80504c6720e3218a0
```

Verified in DynamoDB:

```text
transaction_id: UTR154
amount: 154
status: ledgered
```

### 25.3 Android Debug Event Through CloudFront

PowerShell:

```powershell
$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$DEVICE = "10BF821N3M0055M"

& $ADB -s $DEVICE shell am broadcast --receiver-foreground `
  -n com.pocketbuddy.connector/.debug.DebugNotificationReceiver `
  -a com.pocketbuddy.connector.DEBUG_UPI_NOTIFICATION `
  --es mode sms `
  --es amount 155 `
  --es merchant CampusCanteen `
  --es transactionId UTR155 `
  --ez directWebhook true
```

Observed:

```text
Companion recent sync: Tracked
DynamoDB: UTR155 exists
```

This verifies:

```text
Android Connector
  -> CloudFront
  -> API Gateway
  -> Lambda ingest
  -> SQS
  -> Lambda processor
  -> DynamoDB
  -> EC2 FastAPI/UI
```

### 25.4 SQS Processing Verification

After enabling the processor trigger, SQS monitoring showed:

```text
Approximate Number Of Messages Visible:
1 -> 0
```

This means the processor consumed the queued message.

Processor CloudWatch logs showed a clean invocation:

```text
START RequestId: ...
END RequestId: ...
REPORT RequestId: ... Duration: ...
```

No `processor_error` was seen for the verified run.

## 26. Backend Contract Used By Lambda Forwarding

The EC2 FastAPI webhook accepts:

```http
POST /api/ingest/notification
Content-Type: application/json
X-PocketBuddy-User-Id: <user-id>
```

Relevant payload fields:

```json
{
  "packageName": "com.google.android.apps.messaging",
  "text": "Sent Rs.155 from XXXXXX1234 to CampusCanteen. UPI ref no. UTR155.",
  "timestamp": 1781438919892,
  "sourceApp": "com.google.android.apps.messaging",
  "captureSource": "sms_notification",
  "deviceId": "installation-scoped-device-id",
  "userId": "real-user-id",
  "amount": 155,
  "currency": "INR",
  "direction": "debit",
  "merchant": "CampusCanteen",
  "transactionId": "UTR155",
  "detectedAtDeviceMillis": 1781438919892
}
```

Backend behavior:

- Missing user binding -> `401`.
- Unknown user -> `404`.
- Debit -> transaction can be created.
- Credit -> marked as received / possible pool payment verification.
- Duplicate UTR -> duplicate sync log, no duplicate transaction.
- Full raw text is masked before storing preview.

## 27. Troubleshooting

### 27.1 CloudFront POST Returns HTML

Symptom:

```text
Invoke-RestMethod returns index.html instead of queued JSON.
```

Cause:

```text
/api/* behavior is above /api/ingest/notification.
```

Fix:

```text
CloudFront -> Distribution -> Behaviors
Move /api/ingest/notification above /api/*
Save
Wait for deployment
```

### 27.2 CloudFront Root Returns AccessDenied XML

Symptom:

```xml
<Error>
  <Code>AccessDenied</Code>
  <Message>Access Denied</Message>
</Error>
```

Likely causes:

- `index.html` uploaded under `dist/` instead of bucket root.
- Default root object missing.
- CloudFront S3 private access/bucket policy not applied.
- Deployment/invalidation not finished.

Fix:

1. Ensure bucket root contains `index.html`.
2. Ensure bucket root contains `assets/`.
3. Ensure CloudFront default root object is `index.html`.
4. Ensure 403/404 error responses route to `/index.html`.
5. Create invalidation for `/*`.

### 27.3 API Gateway Direct Test Works But CloudFront Fails

Check:

- CloudFront origin domain is exactly:
  `k2y5e0vvnh.execute-api.ap-south-1.amazonaws.com`
- No `https://`.
- No trailing slash.
- Behavior origin is `api-gateway-mobile-ingest`.
- Origin request policy is `AllViewerExceptHostHeader`.
- Cache policy is `CachingDisabled`.
- Distribution finished deploying.

### 27.4 SQS Message Stays Visible

Check processor trigger:

```text
Lambda -> pocketbuddy-processor -> Configuration -> Triggers
State: Enabled
Activate trigger: Yes
Batch size: 1
```

Check processor role has:

- `sqs:ReceiveMessage`
- `sqs:DeleteMessage`
- `sqs:GetQueueAttributes`
- `sqs:ChangeMessageVisibility`
- `dynamodb:PutItem`

Check CloudWatch logs for:

```text
processor_error
AccessDenied
ResourceNotFoundException
```

### 27.5 DynamoDB Missing Event

Check path in order:

1. API Gateway returns `queued`.
2. SQS visible message goes `1 -> 0`.
3. Processor Lambda logs an invocation.
4. Processor IAM role has DynamoDB `PutItem`.
5. Table name env var is exactly:
   `pocketbuddy_ingest_events`.

### 27.6 UI Shows Failed But DynamoDB Has Event

Likely cause:

- Lambda processor wrote ledger but EC2 forwarding failed.
- Wrong `POCKETBUDDY_USER_ID`.
- User ID does not exist in MongoDB.
- Backend profile missing.
- EC2 FastAPI unreachable from Lambda due EC2/security/Nginx issue.

For real Android testing, the user ID must be copied from the web app Companion
Device page.

### 27.7 PowerShell `curl` Weird Error

In Windows PowerShell, `curl` aliases to `Invoke-WebRequest`, so this can fail:

```powershell
curl -i http://127.0.0.1/api/transactions
```

Use:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1/api/transactions"
```

or run `curl` on EC2 Linux.

### 27.8 ADB Shows Unauthorized

Fix:

1. Unlock phone.
2. Revoke USB debugging authorizations if needed.
3. Disconnect/reconnect USB.
4. Accept debugging prompt.
5. Run:

```powershell
& $ADB devices
```

Expected:

```text
10BF821N3M0055M device
```

## 28. Demo Script

Use this story for judges:

1. Student opens PocketBuddy web app via CloudFront.
2. React frontend loads from S3 globally through CloudFront.
3. User logs in; normal app APIs go through CloudFront to EC2 FastAPI.
4. User pairs Android connector from Companion Device screen.
5. Phone receives or simulates a UPI SMS/payment notification.
6. Android posts the normalized event to CloudFront.
7. CloudFront routes only `/api/ingest/notification` to API Gateway.
8. API Gateway invokes Lambda ingest.
9. Lambda returns `202 queued` quickly after putting event on SQS.
10. SQS buffers the event.
11. Lambda processor consumes the event.
12. DynamoDB ledger stores an idempotent record.
13. Processor forwards valid user events to FastAPI.
14. FastAPI writes transaction/companion sync data to MongoDB.
15. Dashboard shows the synced spend.

This shows AWS is used where it matters:

- S3/CloudFront for static frontend delivery.
- API Gateway/Lambda/SQS/DynamoDB for burst-safe mobile ingest.
- EC2/FastAPI for existing app/business APIs.

## 29. Deployment Update Checklist

### 29.1 Update Backend On EC2

```bash
cd /home/ubuntu/PocketBuddy
git pull origin main
cd backend
.venv/bin/pip install -r requirements.txt
sudo systemctl restart pocketbuddy-backend
sudo systemctl status pocketbuddy-backend --no-pager
```

Smoke test:

```bash
curl -i http://127.0.0.1/api/campus-food
```

### 29.2 Update Frontend On S3/CloudFront

On a machine with correct Node version:

```bash
cd /home/ubuntu/PocketBuddy
git pull origin main
npm install
npm run build --workspace=frontend
```

Upload the contents of:

```text
frontend/dist/
```

to S3 bucket root:

```text
s3://pocketbuddy-frontend-734705208425-ap-south-1/
```

Then CloudFront invalidation:

```text
/*
```

### 29.3 Update Lambda Code

For quick demo edits:

1. Lambda -> function.
2. Code tab.
3. Edit `lambda_function.py`.
4. Click `Deploy`.
5. Run the relevant test event.

For production, move Lambda code into the repo and deploy with IaC or CLI.

## 30. Cleanup After Demo

To avoid surprise costs:

1. Stop or terminate EC2 instance `pocketbuddy-demo`.
2. Confirm no Elastic IP is allocated.
3. Delete API Gateway if no longer needed.
4. Delete Lambda functions if no longer needed.
5. Delete SQS queue if no longer needed.
6. Delete DynamoDB table if no longer needed.
7. Delete CloudFront distribution if no longer needed. This takes time because
   CloudFront must be disabled before deletion.
8. Empty and delete S3 bucket if no longer needed.
9. Keep Budgets and MFA.
10. Check Billing -> Bills and Cost Explorer next day because AWS billing data
    can lag.

For demo retention, the cheapest practical state is usually:

```text
Keep:
- S3 bucket
- CloudFront distribution
- DynamoDB table with tiny data
- SQS queue
- Lambda functions
- Budget alerts

Stop:
- EC2 instance when not testing
```

But if EC2 is stopped, normal app APIs and UI login/backend features will not
work until it is started again.

## 31. Current Known Limitations

These are intentional demo tradeoffs:

1. `WEBHOOK_TOKEN` is empty.
2. No custom domain.
3. No HTTPS directly on EC2; HTTPS is provided at CloudFront/API Gateway.
4. No SQS DLQ yet.
5. Lambda code currently lives in AWS console, not repo-managed deployment.
6. EC2 public IP is auto-assigned, not Elastic IP, so it can change after stop/start.
7. CloudFront EC2 origin must be updated if EC2 public DNS changes.
8. DynamoDB is only an ingest ledger, not the main database.
9. MongoDB Atlas remains the main app DB.
10. No WAF to keep costs low.

## 32. Next Hardening Steps

Do these only after the demo path is stable:

1. Add server-issued webhook token and set `WEBHOOK_TOKEN`.
2. Store token in Android config from Companion Device pairing.
3. Add SQS DLQ.
4. Move Lambda code into repo under an `infra/lambda` or `aws/lambda` folder.
5. Add IaC later: AWS SAM, CDK, Terraform, or CloudFormation.
6. Add CloudWatch alarms for Lambda errors and SQS queue age.
7. Add a low-cost custom domain if available.
8. Add an EC2 Elastic IP only if IP churn becomes a real problem and budget
   impact is accepted.
9. Replace direct EC2 public origin with a more controlled origin later if needed.

## 33. Final Verified State

Confirmed working on 2026-06-14:

```text
Frontend:
https://d3g6cg7q9hn7hi.cloudfront.net

Normal API:
CloudFront /api/* -> EC2/Nginx/FastAPI -> MongoDB

Mobile ingest:
Android -> CloudFront /api/ingest/notification
        -> API Gateway HTTP API
        -> Lambda pocketbuddy-ingest
        -> SQS pocketbuddy-ingest-queue
        -> Lambda pocketbuddy-processor
        -> DynamoDB pocketbuddy_ingest_events
        -> EC2 FastAPI/MongoDB UI path
```

Evidence:

```text
UTR152: direct API Gateway test -> DynamoDB ledgered
UTR154: CloudFront to API Gateway test -> DynamoDB ledgered
UTR155: Android debug event -> UI Tracked and DynamoDB ledgered
```

This completes the AWS serverless mobile ingest migration for the demo.
