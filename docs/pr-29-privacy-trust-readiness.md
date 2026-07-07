# PR #29 Privacy And Trust Readiness Note

Date: 2026-07-08  
Scope: PR #29, privacy hardening, consent sandbox, connector trust, transaction provenance, and pool settlement safety.

This document is for the team before merge, demo recording, AWS deployment, and finals preparation. It explains what the PR changes, what is safe to claim, what must not be claimed, what limitations remain, and what should be tested.

## Executive Summary

PR #29 strengthens PocketBuddy's trust story. It makes the product safer to demo by separating the real Android notification-sync path from the Account Aggregator style consent sandbox. It also improves transaction provenance, connector pairing safety, account deletion scope, and pool settlement checks.

The most important outcome:

- Android auto-sync remains the primary live path for passive expense tracking.
- Consent Sandbox is now explicitly local demo data, not a live bank or real Account Aggregator integration.
- Amazon Pay related pool flows are framed as sandbox contract simulation, not live Amazon Pay rails.
- Privacy Center now gives a clearer data-control story: what data source is active, what records exist, what can be paused, revoked, reviewed, or deleted.

Merge recommendation: this PR is suitable to merge after UI smoke testing. It is not a production banking or payment integration. It is a demo-safe trust layer that improves finals presentation quality.

## What This PR Improves

### 1. Consent Sandbox Is Honest And Demo-Ready

Before this PR, the account-consent path could look like a broken real bank feature. It could be greyed out, blocked by environment flags, or show wording like bank connection/verification.

After this PR:

- The flow is clearly named `Consent Sandbox`.
- The UI explains that no live bank account is connected.
- The sandbox uses masked demo accounts.
- The backend keeps generated AA-style records separate from live transactions.
- The flow can be shown reliably in onboarding and Privacy Center.
- Old `.env` settings no longer make the local demo flow unusable.

Safe claim:

> PocketBuddy includes a local Account Aggregator style consent sandbox to demonstrate how regulated read-only bank consent would work.

Do not claim:

> PocketBuddy is integrated with a live RBI Account Aggregator provider.

### 2. Android Auto-Sync Remains The Real Passive Capture Path

The product still correctly positions Android notification sync as the live implementation path.

The connector:

- Parses supported UPI/SMS/payment notifications on device.
- Sends structured transaction fields.
- Stores masked preview text instead of raw notification payloads.
- Can be paused or unpaired.
- Shows recent sync activity and review states.

Safe claim:

> Android sync is the working passive-capture path in the current prototype.

Known limitation:

> Parser coverage depends on notification formats from payment apps and banks. Low-confidence or incomplete events need review.

### 3. Privacy Center Is Stronger

Privacy Center now gives the user a cleaner trust dashboard:

- Phone auto-sync state.
- Consent sandbox state.
- Raw alert text policy.
- Consent ledger/activity.
- Reviewable sync/transaction provenance.
- Delete account controls.

This directly addresses judge concerns around:

- Sensitive notification access.
- What data is stored.
- Whether raw SMS is retained.
- Whether bank data is real or mocked.
- Whether the user can revoke or delete data.

### 4. Transaction Provenance Is Clearer

Transactions now show trust/source language more carefully:

- `Phone sync` for connector-origin events.
- `Needs review` for low-confidence/incomplete events.
- `Sandbox source` for consent-sandbox matched data.
- `Manual entry` for user-entered records.

This avoids overclaiming "bank verified" when the source is sandbox data.

### 5. Pool Settlement Safety Is Improved

Pool settlement logic is less risky now:

- Amazon Pay wording is moved to sandbox contract simulation.
- Checkout can only start while the pool is open.
- Checkout completion is host-only.
- Roommate settlement is allowed only after checkout is finalized.
- Host cannot settle their own pool as a roommate.
- Logged-in roommate name must match the split being settled.
- Settlement amount must match the finalized split.
- Already-settled splits are blocked.

Safe claim:

> PocketBuddy models an Amazon Pay V2 style checkout and settlement contract in a local sandbox.

Do not claim:

> PocketBuddy currently charges roommates through live Amazon Pay, Amazon Pay Later, UPI AutoPay, or a real mandate rail.

### 6. Account Deletion Is Safer

The delete-account flow now avoids deleting unrelated cross-pool records only by matching display names. This matters because names can collide between unrelated students.

The deletion flow still removes account-owned data:

- Profile.
- Transactions.
- Subscriptions.
- Consent records.
- Companion logs.
- AA sandbox events/snapshots.
- Hosted pools and hosted pool items.

Known limitation:

> Legacy guest participation in pools can be display-name based. Deleting another user's pool items only by name is intentionally avoided because it can delete unrelated records.

## Files Changed By Area

### Backend

- `backend/app/api/account_aggregator.py`
  - Reframes AA flow as local consent sandbox.
  - Makes local sandbox demo flow available.
  - Returns reference-only institution registry when no external registry is configured.
  - Generates masked local sandbox accounts and records.
  - Keeps sandbox records separate from live transactions.

- `backend/app/core/config.py`
  - Makes local consent sandbox enabled by default because it uses demo data only.

- `backend/app/api/webhook.py`
  - Adds connector device binding protection.
  - Blocks stale rebind attempts unless pairing was refreshed.

- `backend/app/api/pools.py`
  - Renames Amazon Pay flow as sandbox contract simulation.
  - Adds host/status/roommate/amount checks.
  - Avoids claiming live Amazon Pay or live mandate behavior.

- `backend/app/api/profile.py`
  - Refines account deletion to avoid unsafe display-name cleanup across unrelated pools.

- `backend/tests/test_privacy_contracts.py`
  - Adds/updates privacy tests for consent sandbox, connector tokens, device binding, and source separation.

- `backend/.env.example`
  - Documents sandbox defaults consistently.

- `backend/README.md`
  - Updates AA sandbox instructions to match actual local demo behavior.

### Frontend

- `frontend/src/components/privacy/BankConsentDialog.tsx`
  - Adds sandbox identity step.
  - Uses masked demo accounts.
  - Explains real AA discovery concept without claiming live connection.
  - Adds fallback local accounts so demo flow does not dead-end.

- `frontend/src/routes/_authenticated/onboarding.tsx`
  - Adds selectable connection paths:
    - Android Auto-Sync.
    - Consent Sandbox.
  - Keeps Android as the recommended live path.
  - Positions consent sandbox as privacy-safe and useful for iOS positioning.

- `frontend/src/routes/_authenticated/privacy.lazy.tsx`
  - Makes Consent Sandbox usable from Privacy Center.
  - Removes misleading live-bank wording.
  - Adds clearer data-source cards and consent controls.

- `frontend/src/routes/_authenticated/transactions.lazy.tsx`
  - Replaces risky `Bank verified` wording with `Sandbox source`.
  - Clarifies transaction trust path.

- `frontend/src/routes/_authenticated/companion.lazy.tsx`
  - Softens Play Protect wording and avoids telling users to broadly disable scanning as a main product step.

- `frontend/src/routes/pool.$id.lazy.tsx`
  - Supports safer pool settlement/demo wording and related UI changes.

- `frontend/src/routes/_authenticated/dashboard.lazy.tsx`
  - Minor trust/provenance related integration.

## What Is Safe To Show In Demo

Show these confidently:

1. Onboarding Step 3
   - Android Auto-Sync as primary path.
   - Consent Sandbox as alternate privacy/control-flow preview.

2. Privacy Center
   - Start sandbox.
   - Enter sandbox identity.
   - Select institution.
   - Select masked account.
   - Approve consent.
   - Refresh sandbox data.
   - Revoke consent.

3. Companion Device
   - Android setup instructions.
   - Recent sync activity.
   - Masked notification preview.
   - Pause/unpair controls.

4. Transactions
   - Trust/source labels.
   - Needs-review state.
   - Manual review/category correction.

5. Pool
   - Active pool.
   - Completed pool.
   - UTR fallback.
   - Amazon Pay sandbox contract flow only if the wording stays clearly sandbox.

## What Not To Show Or Claim

Do not claim:

- Live RBI Account Aggregator provider integration.
- Real AA consent against actual bank accounts.
- Live Amazon Pay V2 API integration.
- Amazon Pay Later production integration.
- UPI AutoPay or real roommate mandate.
- That iOS can passively read notifications like Android.
- That all bank/payment notifications parse automatically.
- That OCR/Textract is part of the stable current production demo if it is not reliable.

Do not show:

- `.env` files.
- JWT secrets.
- MongoDB URI.
- AWS IAM policies.
- Raw bank/SMS messages.
- Play Protect bypass as the main product flow.
- Account deletion execution on a real demo account.

## Known Limitations

These are acceptable if framed correctly.

### 1. Consent Sandbox Is Not Live AA

The flow is a local sandbox. It shows the user journey and data-control model, not a licensed Account Aggregator connection.

How to answer:

> We built the consent journey as a local sandbox because a real AA integration requires provider onboarding and certification. The product design is ready for that path, but the prototype keeps it local and clearly separated from live data.

### 2. Android Is The Only Real Passive Capture Path

Android notification access enables passive capture. iOS does not allow third-party apps to read other apps' notifications.

How to answer:

> Android gives us the strongest zero-entry experience today. For iOS, the consent-based read-only path is the long-term scalable direction, and manual entry remains fallback.

### 3. Parser Coverage Is Still A Risk

Different banks and UPI apps format notifications differently.

How to answer:

> The connector stores confidence and review states. Low-confidence events are not blindly trusted; they go into review. The next hardening layer is a parser feedback loop and broader template coverage.

### 4. Amazon Pay Flow Is Simulated

The pool checkout and settlement flow models Amazon Pay-style contract states but does not call live Amazon Pay credentials.

How to answer:

> We modelled the Amazon Pay V2 style contract locally to prove the product interaction. PocketBuddy does not hold funds or operate as a payment aggregator in this prototype.

### 5. Pool Settlement Still Needs Real Payment Rail Hardening

Manual UTR and passive host-credit detection are practical fallback paths. Real payment confirmation would need reconciliation against a trusted payment or bank feed.

How to answer:

> Today, settlement can be marked through fallback UTR or sandbox flow. In production, optimistic notifications would be reconciled against a trusted payment ledger.

### 6. Account Deletion Avoids Unsafe Name-Based Cleanup

Hosted pool records are removed. Cross-pool guest rows are not deleted purely by display name because names can collide.

How to answer:

> This is a privacy-safe tradeoff. We avoid deleting another user's data just because two students share the same name. The production fix is participant IDs for every pool member.

## Demo-Break Risk Checklist

Before recording or live presentation:

- Hard refresh browser after deployment.
- Use a clean seeded demo account or revoke existing sandbox consent before showing the full start flow.
- Use `9876543210` or `student@aa` as the sandbox identifier.
- Select a common sandbox institution.
- Confirm masked accounts appear.
- Approve consent before trying to refresh data.
- Do not use random real bank/payment notifications for Android demo unless already tested.
- Use a known pool where roommate names match logged-in test accounts.
- Do not click final account delete.
- Do not show docs that still contain old strategy notes unless reviewed.

## UI Smoke Test Plan

### Onboarding

1. Open `/onboarding`.
2. Complete Step 1 and Step 2.
3. On Step 3, confirm Android Auto-Sync is selected by default.
4. Select Consent Sandbox.
5. Confirm Android instructions disappear.
6. Open Consent Sandbox.
7. Complete identity, institution, account, confirm flow.

Expected:

- No overflow on desktop.
- No greyed sandbox controls.
- No real-bank wording.
- Dialog does not show `Account discovery unavailable` in normal path.

### Privacy Center

1. Open `/privacy`.
2. Start sandbox if no consent exists.
3. If pending, approve consent.
4. If active, refresh sandbox data.
5. Verify sandbox records appear.
6. Revoke if testing reset.

Expected:

- Consent Sandbox buttons work.
- Status changes are clear.
- Data receipt shows sandbox and phone sync separately.
- Delete account requires exact confirmation text.

### Transactions

1. Open `/transactions`.
2. Inspect source/trust badges.
3. Open a transaction row.
4. Edit category for a safe test transaction.

Expected:

- `Sandbox source` does not look like real bank verification.
- `Needs review` is visible for low-confidence/incomplete items.
- Manual entries are not misrepresented.

### Companion

1. Open `/companion`.
2. Confirm Android config/install flow is present.
3. Open recent sync details.
4. Confirm masked preview and confidence/source fields are visible.

Expected:

- Android path remains first-class.
- Pairing/unpairing controls remain clear.
- No raw full SMS is exposed.

### Pool

1. Open `/pool`.
2. Open an active pool.
3. Test add item.
4. Open a completed or checkout-ready pool.
5. Check UTR/manual fallback and sandbox settlement copy.

Expected:

- Host-only actions are not shown as roommate actions.
- Roommate settlement copy does not imply live Amazon Pay charge.
- Pending/verified states are understandable.

## Verification Already Run

These checks passed after the final fixes:

```powershell
$env:PYTHONPATH='backend'
.\.venv\Scripts\python.exe -m unittest backend.tests.test_privacy_contracts
```

Result:

```text
Ran 18 tests
OK
```

```powershell
npm.cmd run check --workspace=frontend
```

Result:

```text
tsc --noEmit
```

No type errors.

```powershell
npm.cmd run build --workspace=frontend
```

Result:

```text
vite build
built successfully
```

```powershell
git diff --check
```

Result:

No whitespace errors. Only Windows LF to CRLF warnings were printed.

## Merge Recommendation

Merge recommendation: yes, after the team signs off on the UI smoke test.

Reason:

- The PR strengthens trust, privacy, and demo safety.
- It removes overclaiming around bank verification.
- It keeps Android as the live path.
- It makes Consent Sandbox reliable enough to show.
- It reduces pool settlement and account-deletion risk.

Remaining work after merge should focus on final UI polish, seed data, and a scripted demo path rather than adding new scope.

