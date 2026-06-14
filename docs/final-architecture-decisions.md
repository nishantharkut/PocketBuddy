# PocketBuddy Final Architecture Decisions

Status: Accepted for hackathon demo  
Date: 2026-06-14  
Scope: AWS deployment and production-style architecture narrative for PocketBuddy

## Decision Summary

PocketBuddy will use a hybrid AWS-native architecture.

We will not present the system as "one VM running the app". EC2 remains part of the stack, but only as the application API layer. The mobile payment-notification path becomes an event-driven serverless ingest pipeline because that path has bursty traffic, retry behavior, and strict acknowledgement needs.

Final high-level flow:

```text
Android Connector
  -> API Gateway HTTP API
  -> Lambda ingest
  -> SQS queue
  -> Lambda processor
  -> DynamoDB ingest ledger
  -> MongoDB Atlas / existing FastAPI transaction model

Browser
  -> CloudFront
     -> S3 origin for React static files
     -> EC2/Nginx origin for /api/* FastAPI routes

FastAPI on EC2
  -> MongoDB Atlas main app DB
  -> Amazon Bedrock for wellness / AI insight generation
  -> Amazon SES for selected alert emails
  -> SSM Parameter Store for runtime secrets
  -> CloudWatch logs and alarms
```

## Core Architecture Principle

Use AWS services where they solve a real product problem, not just to increase the service count.

The Android ingest path is the best place for serverless AWS because:

- Payment notifications arrive in bursts.
- Android should receive a fast HTTP response even if downstream processing is slow.
- Failed mobile delivery can retry, so server-side idempotency matters.
- SQS gives buffering and retry semantics.
- DynamoDB conditional writes give clean event deduplication.

The existing FastAPI app should remain on EC2 for now because:

- It already works.
- It contains app-level routes and business logic.
- Migrating every route to Lambda adds high risk and limited demo value.
- The main architecture weakness is not EC2 itself; it is using EC2 for everything.

## Final AWS Service Decisions

### 1. Frontend Hosting

Decision: use S3 and CloudFront for the Vite React frontend.

Reason:

- The frontend is static after `npm run build`.
- S3 plus CloudFront is a standard AWS-native static hosting path.
- It removes frontend traffic from EC2.
- It gives a better demo story than Nginx serving everything from a VM.

Implementation target:

```text
frontend/dist -> S3 bucket -> CloudFront distribution
```

CloudFront should have:

- One origin for S3 static assets.
- One origin for EC2/Nginx/FastAPI API routes.
- Behavior `/api/*` routed to EC2.
- Default behavior routed to S3.

This avoids mixed-content issues and gives one stable frontend URL.

### 2. Application API

Decision: keep FastAPI on EC2 for app APIs.

FastAPI continues to own:

- Authentication and signup/login.
- User profile.
- Dashboard.
- Transactions.
- Companion sync views.
- Campus food.
- Wellness.
- Subscriptions.
- Wing Cart-Pooler.
- Seed/demo utilities.

Reason:

- This is the stable working app layer.
- Rewriting to Lambda now is too risky.
- Judges care more that the architecture isolates the right high-throughput path.

### 3. Android Mobile Ingest

Decision: move Android webhook ingestion to an AWS serverless pipeline.

Target flow:

```text
Android Connector
  -> POST /api/ingest/notification on API Gateway HTTP API
  -> Lambda ingest
  -> SQS standard queue
  -> Lambda processor
  -> DynamoDB event ledger
  -> MongoDB Atlas / existing transaction model
```

Lambda ingest responsibilities:

- Accept Android connector webhook payload.
- Validate payload shape.
- Validate webhook token if configured.
- Generate or preserve a stable `event_id`.
- Send event to SQS.
- Return `202 Accepted` quickly.

Lambda processor responsibilities:

- Read events from SQS.
- Normalize source payload.
- Use DynamoDB conditional write for idempotency.
- If not duplicate, write canonical transaction to the existing app data path.
- Log processing result.

SQS queue:

- Use a Standard Queue first.
- Do app-level deduplication in DynamoDB.
- Add DLQ only if time permits.

DynamoDB table:

```text
Table: pocketbuddy_ingest_events
Partition key: user_id
Sort key: event_id
```

Recommended stored fields:

```text
user_id
event_id
source
source_app
direction
amount
currency
merchant
transaction_id
raw_text_redacted
received_at
processed_at
status
dedupe_key
```

### 4. Main Database

Decision: keep MongoDB Atlas as the main app database.

MongoDB remains the source for:

- Users.
- Profiles.
- Transactions.
- Subscriptions.
- Check-ins.
- Pools.
- Cart members and settlements.
- Campus/user-added catalog data.

DynamoDB is not replacing MongoDB now.

Reason:

- Current backend already uses MongoDB.
- Full migration is unnecessary for demo.
- DynamoDB is best used as the ingest ledger and idempotency layer.

### 5. AI Layer

Decision: use Amazon Bedrock only where it adds clear value.

Use Bedrock for:

- Wellness insight generation.
- Optional food recommendation explanation if the deterministic result needs a natural-language explanation.

Do not use Bedrock for:

- Every transaction parse.
- Basic category matching.
- Every dashboard card.

Reason:

- Bedrock is paid usage, not a normal free-tier service.
- Demo usage should stay very small.
- Deterministic fallback must exist so the demo still works if Bedrock fails or access is delayed.

### 6. Secrets And Configuration

Decision: use SSM Parameter Store standard parameters.

Store:

- MongoDB Atlas URI.
- JWT secret.
- Android webhook token.
- Bedrock model ID and region.
- SES sender email.

Do not use Secrets Manager now.

Reason:

- SSM standard parameters are sufficient for demo.
- Secrets Manager adds cost and setup overhead.

### 7. Monitoring

Decision: use CloudWatch for logs and one or two meaningful alarms.

Minimum alarms:

- SQS `ApproximateAgeOfOldestMessage` greater than 300 seconds.
- Lambda processor error count greater than 0 over a short window, if time permits.

Reason:

- Shows operational discipline.
- Directly monitors the event-driven pipeline.
- Avoids over-hardening the platform.

### 8. Email Alerts

Decision: use SES only for one concrete demo alert.

Recommended alert:

- Runway warning email when remaining runway drops below a configured threshold.

Reason:

- It is visible in the demo.
- It maps to PocketBuddy's student money-safety goal.
- It adds an AWS communication service without turning the app into an email system.

## What We Are Not Doing Now

Do not build these during the hackathon unless everything else is already stable:

- Full FastAPI-to-Lambda migration.
- Cognito auth migration.
- ECS, EKS, RDS, OpenSearch, NAT Gateway, or VPC-heavy architecture.
- Full custom domain and HTTPS certificate setup.
- Complex multi-account AWS setup.
- Full DLQ replay dashboard.
- Full admin dashboard for catalogs.
- Moving all MongoDB data to DynamoDB.

These can be described as future production hardening, not demo implementation.

## Cost Guardrails

Use low-cost/free-tier-friendly choices:

- One EC2 instance only.
- No Elastic IP unless absolutely needed.
- No NAT Gateway.
- No Secrets Manager.
- No RDS.
- No OpenSearch.
- No provisioned DynamoDB capacity unless specifically required.
- Keep Bedrock usage behind feature flag and fallback.
- Keep CloudWatch logs retention short for demo.

Known paid/limited items:

- Bedrock is pay-per-use.
- MongoDB Atlas is outside AWS, but current free cluster can remain.
- AWS free-tier limits change by account plan and time; verify before final submission.

## Demo Narrative

Use this wording in pitch/demo:

PocketBuddy uses an AWS-native hybrid architecture. The web app is distributed through CloudFront and S3, while FastAPI on EC2 serves the application API. The most sensitive path, mobile financial notification ingest, is isolated into a serverless event pipeline: API Gateway receives Android UPI/SMS events, Lambda quickly validates and queues them, SQS buffers bursts, another Lambda processes them asynchronously, and DynamoDB provides an idempotent event ledger before the transaction reaches the main app database. Bedrock powers targeted wellness insights, SSM stores configuration, SES sends runway alerts, and CloudWatch monitors failures.

## Implementation Priority

Priority 1: keep current EC2 deployment stable.

Priority 2: move frontend to S3 + CloudFront.

Priority 3: implement serverless mobile ingest path.

Priority 4: add CloudWatch alarm for ingest queue.

Priority 5: add Bedrock wellness insight with fallback.

Priority 6: add SES runway warning if time remains.

## Validation Checklist

Before claiming architecture is implemented, verify:

- Frontend opens from CloudFront URL.
- `/api/*` works through CloudFront or the EC2 API URL.
- Android connector can post to API Gateway URL.
- Lambda ingest logs one received event.
- SQS receives the event.
- Lambda processor consumes the event.
- DynamoDB stores exactly one event for duplicate retries.
- MongoDB/app dashboard reflects the canonical transaction.
- CloudWatch alarm exists for stuck SQS messages.
- Bedrock feature works or fallback path is visibly used.

## Source Notes

Architecture assumptions are based on current AWS pricing/free-tier pages checked on 2026-06-14:

- AWS Free Tier: https://aws.amazon.com/free/
- AWS Lambda pricing: https://aws.amazon.com/lambda/pricing/
- Amazon API Gateway pricing: https://aws.amazon.com/api-gateway/pricing/
- Amazon SQS pricing: https://aws.amazon.com/sqs/pricing/
- Amazon DynamoDB pricing: https://aws.amazon.com/dynamodb/pricing/
- Amazon S3 pricing: https://aws.amazon.com/s3/pricing/
- Amazon CloudFront pricing: https://aws.amazon.com/cloudfront/pricing/
- Amazon Bedrock pricing: https://aws.amazon.com/bedrock/pricing/

