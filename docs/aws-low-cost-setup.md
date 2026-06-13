# PocketBuddy AWS Low-Cost Setup

This guide is for a fresh AWS account, no custom domain, and a hackathon demo timeline.

## Recommended First Deployment

Use this first:

```text
Android Connector
  -> http://<EC2_PUBLIC_IP>/api/ingest/notification
  -> Nginx on EC2
  -> FastAPI backend on localhost:8000
  -> MongoDB Atlas free cluster
  -> optional private S3 bucket for campus_food.json

Browser
  -> http://<EC2_PUBLIC_IP>
  -> Nginx static frontend
  -> /api/* proxied to FastAPI
```

Do not start with API Gateway, ALB, NAT Gateway, CloudFront, WAF, or RDS. They are useful later, but they add moving parts and possible cost surprises before the demo is stable.

## Account Safety Checklist

1. Use region `ap-south-1` (Asia Pacific Mumbai) for AWS resources.
2. Turn on MFA for the root account.
3. Create an admin IAM user or IAM Identity Center user for daily work. Do not use root for normal setup.
4. Create a budget alert before launching anything:
   - AWS Console -> Billing and Cost Management -> Budgets
   - Start with a monthly cost budget of `5 USD` or lower.
   - Add email alerts at `50%`, `80%`, and `100%`.
5. Keep only one EC2 instance running for the demo.
6. Avoid NAT Gateway. It has an hourly charge.
7. Avoid Elastic IP unless you need a fixed IP. Public IPv4 addresses have hourly charges, including idle Elastic IPs.
8. Stop or terminate the EC2 instance after the judging window if you do not need it online.

Useful official pages:

- AWS Free Tier: https://aws.amazon.com/free/
- AWS Budgets: https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create.html
- EC2 Free Tier tracking: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html
- VPC public IPv4 pricing: https://aws.amazon.com/vpc/pricing/

## MongoDB Atlas

Current local Compass setup is fine for local development. For AWS demo, create a MongoDB Atlas free cluster:

1. MongoDB Atlas -> Build a Database -> Free cluster.
2. Choose AWS as provider.
3. Prefer Mumbai if available. If not, choose the nearest free region.
4. Create a database user with a strong password.
5. Network access:
   - Best for demo: allow only your EC2 public IPv4 after EC2 is created.
   - Temporary fallback: `0.0.0.0/0` only during the demo, then remove it.
6. Copy the connection string and set it in `backend/.env`:

```env
MONGO_URI=mongodb+srv://<user>:<password>@<cluster-host>/pocketbuddy?retryWrites=true&w=majority
```

## EC2 Instance

Launch one EC2 instance:

- AMI: Ubuntu Server 24.04 LTS or 22.04 LTS
- Instance type: pick a Free Tier eligible type shown in your console, preferably `t3.micro`
- Storage: 8-16 GB `gp3`
- Public IP: enabled for the first demo because you do not have a domain yet
- Security group:
  - SSH `22`: your current IP only
  - HTTP `80`: `0.0.0.0/0`
  - Do not expose `8000`; Nginx will proxy to it locally

After SSH:

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip nodejs npm nginx git
```

Clone the repo and install backend dependencies:

```bash
git clone https://github.com/nishantharkut/PocketBuddy.git
cd PocketBuddy
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
JWT_SECRET=<generate_a_long_random_secret>
MONGO_URI=<mongodb_atlas_connection_string>
PORT=8000
AWS_REGION=ap-south-1
CAMPUS_FOOD_S3_BUCKET=
CAMPUS_FOOD_S3_KEY=campus_food.json
BEDROCK_ENABLED=false
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
```

Generate a local JWT secret:

```bash
python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
```

## Backend Systemd Service

Create `/etc/systemd/system/pocketbuddy-backend.service`:

```ini
[Unit]
Description=PocketBuddy FastAPI backend
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

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable pocketbuddy-backend
sudo systemctl start pocketbuddy-backend
sudo systemctl status pocketbuddy-backend
```

Logs:

```bash
journalctl -u pocketbuddy-backend -f
```

## Frontend Build

From repo root on EC2:

```bash
npm install
npm run build --workspace=frontend
sudo mkdir -p /var/www/pocketbuddy
sudo rsync -a --delete frontend/dist/ /var/www/pocketbuddy/
```

Create `/etc/nginx/sites-available/pocketbuddy`:

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

    location /webhook/ {
        proxy_pass http://127.0.0.1:8000/webhook/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

Enable Nginx config:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/pocketbuddy /etc/nginx/sites-enabled/pocketbuddy
sudo nginx -t
sudo systemctl reload nginx
```

Test:

```bash
curl http://127.0.0.1:8000/api/campus-food
curl http://<EC2_PUBLIC_IP>/api/campus-food
```

## Android Connector URL

Because there is no domain yet, use:

```text
http://<EC2_PUBLIC_IP>/api/ingest/notification
```

The Android manifest currently allows cleartext HTTP for demos. For production, switch to HTTPS.

## Optional S3 Campus Food Register

The repo now has a local fallback at:

```text
data/campus_food.json
```

To use S3 later:

1. Create a private S3 bucket in `ap-south-1`.
2. Upload `data/campus_food.json` as `campus_food.json`.
3. Create an IAM role for EC2 with this minimal permission:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::<bucket-name>/campus_food.json"
    }
  ]
}
```

4. Attach the role to the EC2 instance.
5. Set these in `backend/.env`:

```env
CAMPUS_FOOD_S3_BUCKET=<bucket-name>
CAMPUS_FOOD_S3_KEY=campus_food.json
```

Restart backend:

```bash
sudo systemctl restart pocketbuddy-backend
```

## Optional Bedrock

The RAG route works without Bedrock by using deterministic local campus-food fallback. Enable Bedrock only after the base demo is stable:

1. AWS Console -> Amazon Bedrock -> Model access.
2. Request access for the model configured by `BEDROCK_MODEL_ID`.
3. Use EC2 IAM role permissions for Bedrock runtime in production.
4. Set `BEDROCK_ENABLED=true` in `backend/.env`.
5. Keep the local fallback enabled so failed model calls do not break the dashboard.

## Later Production Upgrade

After the hackathon demo is stable:

1. Buy or attach a domain.
2. Add HTTPS with either:
   - Nginx + Let's Encrypt on EC2, or
   - CloudFront + ACM for frontend, plus API Gateway/ALB for backend.
3. Add API Gateway only if you need managed throttling, usage plans, or a cleaner public API edge.
4. If API Gateway is used with private compute, use HTTP API -> VPC Link -> ALB/NLB -> EC2. This is more production-grade but not the lowest-effort first deployment.
