# PocketBuddy AWS Low-Cost Setup

This guide assumes:

- You have a fresh AWS account.
- You do not have a domain yet.
- You want the cheapest practical HackOn demo deployment.
- You are new to AWS and want exact steps.

The first goal is not a perfect production cloud architecture. The first goal is:

```text
Web browser -> http://<EC2_PUBLIC_IP> -> PocketBuddy frontend
Android app -> http://<EC2_PUBLIC_IP>/api/ingest/notification -> PocketBuddy backend
Backend -> MongoDB Atlas
```

After that works, optional AWS services like S3 and Bedrock can be enabled safely.

## 1. Architecture We Are Deploying

Use this for the first demo:

```text
Android Connector
  -> http://<EC2_PUBLIC_IP>/api/ingest/notification
  -> Nginx on EC2 port 80
  -> FastAPI backend on EC2 localhost:8000
  -> MongoDB Atlas free cluster

Browser
  -> http://<EC2_PUBLIC_IP>
  -> Nginx static frontend
  -> /api/* proxied to FastAPI

Optional later
  -> private S3 bucket for campus_food.json
  -> Amazon Bedrock for AI/RAG responses
```

Use these AWS services:

- AWS Budgets: cost alerts.
- EC2: one Ubuntu server for frontend + backend.
- EBS: disk attached to EC2.
- Security Group: firewall for the EC2 instance.
- IAM: non-root account and optional EC2 role.
- S3: optional campus-food file storage.
- Amazon Bedrock: optional AI model calls.

Do not use these for the first demo:

- NAT Gateway
- Application Load Balancer
- API Gateway
- CloudFront
- WAF
- RDS
- Elastic IP, unless you need a fixed IP

Those are valid production tools, but they add setup time and possible cost surprises.

Official references:

- AWS Budgets: https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create.html
- EC2 Free Tier tracking: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html
- EC2 getting started: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EC2_GetStarted.html
- VPC public IPv4 and NAT Gateway pricing: https://aws.amazon.com/vpc/pricing/
- Bedrock model access: https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html

## 2. Cost Safety Before Creating Anything

Do this first.

### 2.1 Choose Region

Use:

```text
ap-south-1 - Asia Pacific Mumbai
```

In the AWS Console, check the top-right region dropdown and select Mumbai.

### 2.2 Secure Root Account

1. Sign in to AWS Console as root.
2. Open account menu in top-right.
3. Go to Security credentials.
4. Enable MFA for root.
5. Do not use root for normal development after this.

### 2.3 Create Budget Alert

1. Search for `Budgets` in AWS Console.
2. Open AWS Budgets.
3. Choose `Create budget`.
4. Choose a cost budget template if shown, otherwise choose custom cost budget.
5. Set:

```text
Budget name: pocketbuddy-demo-budget
Period: Monthly
Budgeted amount: 5 USD
```

6. Add email alerts:

```text
50 percent
80 percent
100 percent
```

7. Save the budget.

Important: AWS usage numbers can be delayed. Do not wait for the bill to check costs.

### 2.4 Avoid These Cost Traps

- Do not create NAT Gateway.
- Do not expose RDS.
- Do not create ALB for first demo.
- Do not keep multiple EC2 instances running.
- Do not leave test resources running after the demo.
- Public IPv4 addresses can cost money, so stop or terminate the EC2 instance when not needed.

## 3. Create MongoDB Atlas Database

Use MongoDB Atlas for the database instead of running MongoDB on EC2. It is easier and safer for the demo.

### 3.1 Create Free Cluster

1. Go to MongoDB Atlas.
2. Create a project named:

```text
PocketBuddy
```

3. Build a database.
4. Choose free/shared cluster if available.
5. Choose AWS provider.
6. Choose Mumbai if free tier is available there. If not, choose the nearest available free region.
7. Name the cluster:

```text
pocketbuddy-demo
```

### 3.2 Create Database User

1. In Atlas, open Database Access.
2. Add new database user.
3. Use password authentication.
4. Username example:

```text
pocketbuddy_app
```

5. Generate a strong password and store it safely.

### 3.3 Network Access

For initial local testing:

```text
0.0.0.0/0
```

This allows access from anywhere. It is easiest for demo setup, but remove it after the demo.

Better after EC2 is created:

```text
Allow only the EC2 public IPv4 address
```

### 3.4 Copy Connection String

Atlas will give a connection string like:

```text
mongodb+srv://pocketbuddy_app:<password>@<cluster-host>/pocketbuddy?retryWrites=true&w=majority
```

Save it. You will put it into `backend/.env` on EC2 as `MONGO_URI`.

## 4. Launch One EC2 Instance

### 4.1 Start Launch Flow

1. AWS Console -> search `EC2`.
2. Open EC2.
3. Choose `Launch instance`.

### 4.2 Name

```text
pocketbuddy-demo
```

### 4.3 AMI

Choose one of:

```text
Ubuntu Server 24.04 LTS
Ubuntu Server 22.04 LTS
```

Prefer an AMI marked free-tier eligible in your console.

### 4.4 Instance Type

Choose a free-tier eligible instance type shown in your console.

Good default:

```text
t3.micro
```

If your fresh account shows `t3.small` or `t4g.micro` as free-tier eligible, do not switch unless you are comfortable with architecture differences. `t3.micro` on Ubuntu x86_64 is the least confusing.

### 4.5 Key Pair

Create a new key pair:

```text
pocketbuddy-demo-key
```

Type:

```text
RSA
```

Format:

```text
.pem
```

Download it and keep it safe. You need it for SSH.

On Windows, store it somewhere like:

```text
C:\Users\<YOUR_USER>\.ssh\pocketbuddy-demo-key.pem
```

### 4.6 Network Settings

Create a security group named:

```text
pocketbuddy-demo-sg
```

Inbound rules:

```text
SSH   TCP 22   My IP only
HTTP  TCP 80   Anywhere 0.0.0.0/0
```

Do not add port `8000` publicly. FastAPI should only listen behind Nginx.

### 4.7 Storage

Use:

```text
8 GB or 16 GB gp3
```

### 4.8 Launch

Click `Launch instance`.

After it starts, copy:

```text
Public IPv4 address
```

You will use it as:

```text
http://<EC2_PUBLIC_IP>
```

## 5. Connect To EC2 From Windows

Open PowerShell.

Set variables:

```powershell
$KEY = "$env:USERPROFILE\.ssh\pocketbuddy-demo-key.pem"
$EC2 = "ubuntu@<EC2_PUBLIC_IP>"
```

SSH:

```powershell
ssh -i $KEY $EC2
```

If SSH complains about file permissions on Windows, use this from PowerShell:

```powershell
icacls $KEY /inheritance:r
icacls $KEY /grant:r "$env:USERNAME:R"
```

Then retry:

```powershell
ssh -i $KEY $EC2
```

## 6. Install Server Packages On EC2

After SSH succeeds, run:

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip nodejs npm nginx git curl
```

Check versions:

```bash
python3 --version
node --version
npm --version
nginx -v
```

## 7. Clone PocketBuddy On EC2

Run:

```bash
cd /home/ubuntu
git clone https://github.com/nishantharkut/PocketBuddy.git
cd PocketBuddy
```

If the repo is private, configure GitHub access first or upload the project manually.

## 8. Configure Backend Environment

Create Python virtual environment:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/requirements.txt
```

Create env file:

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Set values:

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

Generate `JWT_SECRET`:

```bash
python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
```

Paste the generated value into `backend/.env`.

## 9. Test Backend Manually

From repo root on EC2:

```bash
cd /home/ubuntu/PocketBuddy
backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Open a second SSH session and test:

```bash
curl http://127.0.0.1:8000/api/campus-food
```

Expected:

```text
JSON response, not connection refused
```

Stop the manual backend with `Ctrl+C` in the first SSH session.

## 10. Create Backend Systemd Service

Create service file:

```bash
sudo nano /etc/systemd/system/pocketbuddy-backend.service
```

Paste:

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

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable pocketbuddy-backend
sudo systemctl start pocketbuddy-backend
sudo systemctl status pocketbuddy-backend
```

View logs:

```bash
journalctl -u pocketbuddy-backend -f
```

If you edit `backend/.env`, restart:

```bash
sudo systemctl restart pocketbuddy-backend
```

## 11. Build Frontend On EC2

From repo root:

```bash
cd /home/ubuntu/PocketBuddy
npm install
npm run build --workspace=frontend
```

Copy built files to Nginx directory:

```bash
sudo mkdir -p /var/www/pocketbuddy
sudo rsync -a --delete frontend/dist/ /var/www/pocketbuddy/
```

## 12. Configure Nginx

Create Nginx site:

```bash
sudo nano /etc/nginx/sites-available/pocketbuddy
```

Paste:

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

Enable:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/pocketbuddy /etc/nginx/sites-enabled/pocketbuddy
sudo nginx -t
sudo systemctl reload nginx
```

## 13. Smoke Test Public URL

From your laptop browser:

```text
http://<EC2_PUBLIC_IP>
```

From your laptop PowerShell:

```powershell
Invoke-RestMethod "http://<EC2_PUBLIC_IP>/api/campus-food"
```

From EC2:

```bash
curl http://127.0.0.1:8000/api/campus-food
curl http://localhost/api/campus-food
```

If browser works but API fails, check Nginx.

If local API works but public API fails, check security group and Nginx.

If API says database/auth error, check `backend/.env` and MongoDB Atlas network access.

## 14. Configure Android For Wireless Normal Flow

Once EC2 works, USB reverse is no longer needed.

On the web app:

1. Open:

```text
http://<EC2_PUBLIC_IP>
```

2. Login or signup.
3. Complete onboarding.
4. Go to Settings -> Companion Device.
5. Copy connector config.

It should show:

```text
POCKETBUDDY_WEBHOOK_URL=http://<EC2_PUBLIC_IP>/api/ingest/notification
POCKETBUDDY_WEBHOOK_TOKEN=
POCKETBUDDY_USER_ID=<your_user_id>
```

On Android:

1. Install/open PocketBuddy Connector.
2. Paste the webhook URL.
3. Paste the user ID.
4. Leave token empty unless backend has issued one.
5. Tap `Save connector config`.
6. Tap `Open notification access`.
7. Enable PocketBuddy Connector.
8. Return to the app. It should say `Ready to sync`.

Now any internet connection should work:

```text
Phone mobile data/Wi-Fi -> EC2 public IP -> backend
```

No USB cable is needed after APK installation.

## 15. Optional: S3 Campus Food File

The app works without S3 because it has local fallback:

```text
data/campus_food.json
```

Use S3 only after the base EC2 demo works.

### 15.1 Create Bucket

1. AWS Console -> S3.
2. Create bucket.
3. Region: `ap-south-1`.
4. Bucket name example:

```text
pocketbuddy-campus-food-<unique-suffix>
```

5. Keep public access blocked.

### 15.2 Upload File

Upload:

```text
data/campus_food.json
```

Object key:

```text
campus_food.json
```

### 15.3 Create IAM Role For EC2

1. AWS Console -> IAM -> Roles.
2. Create role.
3. Trusted entity: AWS service.
4. Use case: EC2.
5. Add inline policy:

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

6. Name role:

```text
pocketbuddy-ec2-role
```

7. Attach it to the EC2 instance:

```text
EC2 -> Instances -> select instance -> Actions -> Security -> Modify IAM role
```

### 15.4 Enable In Backend

Edit `backend/.env` on EC2:

```env
CAMPUS_FOOD_S3_BUCKET=<bucket-name>
CAMPUS_FOOD_S3_KEY=campus_food.json
```

Restart backend:

```bash
sudo systemctl restart pocketbuddy-backend
```

Test:

```bash
curl http://localhost/api/campus-food
```

## 16. Optional: Amazon Bedrock

Keep Bedrock disabled until the base demo is working.

Current default:

```env
BEDROCK_ENABLED=false
```

When ready:

1. AWS Console -> Amazon Bedrock.
2. Make sure region is one where your selected model is available.
3. Open Model access.
4. Enable access for the model configured in `BEDROCK_MODEL_ID`.
5. For Anthropic models, fill the first-time use case form if AWS asks.
6. Add Bedrock permissions to the EC2 IAM role.

Minimal EC2 role policy for model invocation:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "*"
    }
  ]
}
```

Then edit `backend/.env`:

```env
BEDROCK_ENABLED=true
AWS_REGION=ap-south-1
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
```

Restart:

```bash
sudo systemctl restart pocketbuddy-backend
```

If Bedrock fails, set `BEDROCK_ENABLED=false` again. The app has deterministic local fallback.

## 17. Updating Deployment After New Code Is Merged

SSH into EC2:

```powershell
ssh -i $KEY ubuntu@<EC2_PUBLIC_IP>
```

On EC2:

```bash
cd /home/ubuntu/PocketBuddy
git pull origin main
backend/.venv/bin/python -m pip install -r backend/requirements.txt
npm install
npm run build --workspace=frontend
sudo rsync -a --delete frontend/dist/ /var/www/pocketbuddy/
sudo systemctl restart pocketbuddy-backend
sudo systemctl reload nginx
```

Smoke test:

```bash
curl http://localhost/api/campus-food
```

Then open:

```text
http://<EC2_PUBLIC_IP>
```

## 18. Troubleshooting

### Site Does Not Open

Check EC2 security group:

```text
HTTP 80 must allow 0.0.0.0/0
```

Check Nginx:

```bash
sudo systemctl status nginx
sudo nginx -t
```

### API Returns 502

FastAPI service is likely down:

```bash
sudo systemctl status pocketbuddy-backend
journalctl -u pocketbuddy-backend -n 100 --no-pager
```

### Backend Cannot Connect To MongoDB

Check:

- `MONGO_URI` in `backend/.env`
- Atlas username/password
- Atlas Network Access
- EC2 public IPv4 allowed in Atlas

Restart:

```bash
sudo systemctl restart pocketbuddy-backend
```

### Android Does Not Sync

Check Android connector screen:

- Webhook URL must be `http://<EC2_PUBLIC_IP>/api/ingest/notification`
- User ID must be filled
- Notification Access must be enabled
- Queued retries should not grow forever

Check backend logs:

```bash
journalctl -u pocketbuddy-backend -f
```

Check public endpoint from laptop:

```powershell
Invoke-RestMethod "http://<EC2_PUBLIC_IP>/api/campus-food"
```

### Frontend Old Version Still Showing

Rebuild and recopy:

```bash
cd /home/ubuntu/PocketBuddy
npm run build --workspace=frontend
sudo rsync -a --delete frontend/dist/ /var/www/pocketbuddy/
sudo systemctl reload nginx
```

Hard refresh browser:

```text
Ctrl + Shift + R
```

## 19. Shutdown After Demo

To avoid charges:

1. EC2 -> Instances.
2. Select `pocketbuddy-demo`.
3. Choose Instance state -> Stop or Terminate.

Use:

- Stop if you may demo again soon.
- Terminate if the hackathon is done.

Also remove:

- Unused Elastic IPs, if any.
- Unused NAT Gateways, if accidentally created.
- Test S3 buckets, if no longer needed.
- Atlas `0.0.0.0/0` network rule.

## 20. Final Demo Checklist

Before judging:

- `http://<EC2_PUBLIC_IP>` opens.
- Signup/login works.
- Onboarding works.
- Dashboard opens.
- `/api/campus-food` returns JSON.
- Android connector says `Ready to sync`.
- Companion page shows the EC2 webhook URL.
- A test Android UPI/SMS event appears in Recent Sync Activity.
- A transaction appears in dashboard/transactions.
- Cart pool create/share/finalize/payment flow works.
- Subscription warning demo works.
- Budget alert exists in AWS.
