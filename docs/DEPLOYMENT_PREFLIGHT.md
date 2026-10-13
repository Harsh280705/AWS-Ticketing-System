# Deployment Preflight — seven-function plan per PDF (read-only, nothing created)

Date (UTC): 2026-10-12 · Account `517374107239`
Session: `arn:aws:sts::517374107239:assumed-role/AccountFullAccessRole/<session>`
Region for ALL resources: **`ap-southeast-2`** (CLI default on this machine is still
`ap-south-1` — every command below pins `--region ap-southeast-2`).

> No resource was created, deleted, or modified for this preflight. No upgrades, no
> paid features, no region changes. All mutate actions remain approval-gated.

## 1. Identity & existing-resource re-verification (fresh evidence)

| Check | Result |
|---|---|
| `sts get-caller-identity` | Same account `517374107239`, same assumed role (new session id) |
| `cognito-idp list-user-pools` (ap-southeast-2) | One pool `ap-southeast-2_EtwJXz5fb` ("tkt-diagnostic-no-create", created 2026-10-12T18:27 IST by an unknown session — NOT this agent). Essentials/MFA-off/no-add-ons ✓ but username-based, no clients/groups/domain — partially suitable, owner decision pending, untouched |
| `lambda list-functions` | `[]` — no function |
| `apigatewayv2 get-apis` | `[]` — no HTTP API |
| `s3api list-buckets` | SCP-denied (`ListAllMyBuckets` explicit deny) — absence unconfirmable; creation must tolerate name collision; no retries |
| DynamoDB `Tickets` / `TicketComments` | ACTIVE, 0 items, provisioned 1 RCU/1 WCU, STANDARD class (schemas: `ticketId` / `ticketId+commentId`) |
| `describe-continuous-backups` both tables | `ContinuousBackupsStatus: ENABLED` (default envelope), **`PointInTimeRecoveryStatus: DISABLED`** — no backup charges |
| Cost Explorer Oct 1–12 `UnblendedCost` | **$0.00 USD** (estimated, prior check — not re-queried this pass) |
| Local tests + builds (final-assignment Stage 1) | backend **75/75**, frontend **9/9**, `vite build` 33 modules — all green |

## 2. Reuse vs create

| Resource | Decision | Detail |
|---|---|---|
| DynamoDB `Tickets` + `TicketComments` | **LEAVE byte-identical** | No migration/reconfig without separate approval; required `tkt-tickets` is a gated Stage 3 creation |
| Cognito User Pool + SPA client + `Customer`/`Agent` groups | CREATE (console, by you) | §4 |
| Seven `tkt-*` Lambdas + execution role | CREATE (after table decision) | §5, artifact `backend/dist/ticketing-handlers.zip` |
| API Gateway HTTP API + JWT authorizer + 7 JWT routes (no health route) | CREATE (after Lambdas) | §6 |
| Private S3 bucket + CORS + BPA | CREATE (after pool) | §7 |

## 3. Permission reality check (read-only simulation + live evidence)

`iam simulate-principal-policy` on this CLI session returns **`explicitDeny` for every
create action**: `CreateUserPool`, `CreateUserPoolClient`, `CreateGroup`,
`CreateFunction`, `CreateApi`, `CreateAuthorizer`, `CreateRoute`, `CreateIntegration`,
`AddPermission`, `CreateBucket`, `PutBucketCORS`, `PutBucketPublicAccessBlock`
(and live: `sns:ListTopics` in us-east-1 denied by Service Control Policy
`o-mpoi6ieonm`). `iam:CreateRole`/`iam:PassRole` and `budgets:CreateBudget` simulate
as allowed — but simulation disagrees with live evidence on reads (live
`describe-table` succeeds while simulation says deny), so treat it as a **warning
flag, not ground truth**: this training account's SCPs likely block programmatic
provisioning from this session. **Implication: resources must be created in the
Console under your login (different rights possible), one step at a time, with live
verification — never via unapproved CLI creates, and never "tested" by creating.**

## 4. Cognito — exact settings + tier/free-tier verification

**Tier verification (this account):** no pool exists, so no MAU is being consumed by
this account's own pools; region is commercial `ap-southeast-2` (free tier valid —
it is excluded only in GovCloud); MTD spend $0. API default for new pools is
**Essentials** (verified in AWS docs + API reference). **What CLI cannot prove:**
org-level sharing of the 10,000 MAU allowance (this account sits in an org — SCP
present — and sibling accounts could consume the shared allowance), and future
overage. So: the 10,000-MAU allowance does **not** guarantee $0 by itself.
**Manual evidence needed before pool creation:** Billing console → *Free Tier* page →
confirm an unused/largely-unused "Amazon Cognito 10,000 MAU" offer. With 2–3 test
users the expected bill is $0 on Essentials; above 10,000 MAU it is $0.015/MAU; Plus
is forbidden for this project (no free tier).

**Exact pool settings:** name `ticketing-pool`; sign-in identifier email; self-registration
ON; verify email via Cognito default sender; required attributes email only (no phone);
MFA **None**; recovery email-only; tier **Essentials** (verify on review screen);
threat protection OFF; no Lambda triggers; no social/SAML/OIDC providers; no
machine-to-machine grants; no SES/custom senders; no custom domain.
**App client:** type SPA, **no secret**, flows = **authorization code grant only**,
scopes `openid email profile` only, callback `http://localhost:5173/callback`,
sign-out `http://localhost:5173/`. **Domain:** prefix domain
`<unique>.auth.ap-southeast-2.amazoncognito.com` (never custom domain).
**Groups:** `Customer`, `Agent`, no IAM roles. **Users:** you create/confirm test users
and group membership in the Console (never me).

**Environment template** (`frontend/.env.local`, git-ignored — values only after creation):

```text
VITE_API_URL=http://localhost:3000
VITE_COGNITO_AUTHORITY=https://<prefix>.auth.ap-southeast-2.amazoncognito.com
VITE_COGNITO_CLIENT_ID=<app-client-id>
VITE_REDIRECT_URI=http://localhost:5173/callback
VITE_COGNITO_LOGOUT_URI=http://localhost:5173/
VITE_COGNITO_SCOPE=openid email profile
```

(`VITE_API_URL` switches to the API invoke URL after §6.)

## 5. Seven Lambda functions `tkt-*` — deployment configuration (not applied)

- Runtime **`nodejs22.x`**, handlers `src/handlers/<name>.handler`, arch x86_64,
  memory **512 MB**, timeout **30 s** (API Gateway caps at 30 s).
- One shared artifact `backend/dist/ticketing-handlers.zip` (4.8 MB, sha256-recorded,
  mock code excluded); only the Handler string differs per function.
  Full per-function config: `backend/deploy/functions.json`.
- Env: `TABLE_NAME=tkt-tickets`, `BUCKET_NAME=<§7 bucket>` (aliases accepted),
  `AWS_REGION=ap-southeast-2`. Handlers already rewired + tested (76/76); artifact
  rebuilt (`B704648F…`, packaging re-verified). Table itself still needs Stage 3
  approval — no further rewire expected.
- Shared execution role (least privilege, `backend/deploy/execution-role.json`):
  DynamoDB Get/Put/Scan/Query on approved table ARN(s); `s3:PutObject` on
  `<bucket>/attachments/*`; scoped CloudWatch logs. No admin rights.
- Verify with ONE invoke per function (read-only paths first) before wiring API Gateway.

## 6. API Gateway HTTP API — routes, authorizer, CORS (not applied)

- JWT authorizer: issuer `https://cognito-idp.ap-southeast-2.amazonaws.com/<poolId>`,
  audience `[<clientId>]`.
- Routes (all JWT except health):

| # | Method + path | Lambda target | Backend check (already coded + tested) |
|---|---|---|---|
| 1 | `POST /tickets` | `tkt-createTicket` | 401 → validate → `createdBy=sub`, status `Open` |
| 2 | `GET /tickets` (+`status,priority,q`) | `tkt-listTickets` | 401 → Agent: all; Customer: own only |
| 3 | `GET /tickets/{ticketId}` | `tkt-getTicket` | 401 → owner/Agent else documented **404** |
| 4 | `PUT /tickets/{ticketId}` | `tkt-updateTicket` | 401 → **Agent-only** else **403** → validate → activity+actorId |
| 5 | `POST /tickets/{ticketId}/comments` | `tkt-addComment` | 401 → owner/Agent else **404** |
| 6 | `GET /tickets/{ticketId}/comments` | `tkt-listComments` | 401 → owner/Agent else **404**, oldest-first |
| 7 | `POST /tickets/presigned-url` | `tkt-presignedUrl` | 401 → validate (400) → 501 until bucket; then 300 s URL, `attachments/<sub>/…` |

No `/health` route on the API (no handler serves it; health stays local).
Per-route Lambda-proxy integrations (`backend/deploy/api-routes.json`).

- CORS: origin `http://localhost:5173`, methods used, headers
  `authorization,content-type`, maxAge 300. `$default` stage, one proxy integration
  (+ `lambda:AddPermission` for API GW → Lambda at execution time).
- Verify with single-digit manual calls: 200s, 401 without token, 404 cross-customer,
  403 customer PUT. Then stop.

## 7. DynamoDB + S3 (existing tables untouched; `tkt-tickets` pending approval)

- Existing tables: reuse-or-leave-as-is; no PITR/backups/GSI/billing-mode changes
  (PITR-off confirmed above). Required `tkt-tickets` (pk+sk, 1 RCU/1 WCU, no extras)
  is a Stage 3 gated creation — see `RESOURCE_INVENTORY.md` schema comparison.
- Bucket (name TBD, globally unique): BPA all-on, **no versioning/replication/logging**;
  CORS PUT-only from `http://localhost:5173`:

```json
[{"AllowedHeaders":["content-type"],"AllowedMethods":["PUT"],"AllowedOrigins":["http://localhost:5173"],"MaxAgeSeconds":300}]
```

- No test uploads until you approve the test (tiny files only, deleted after).

## 8. Billing alert / budget options (nothing created)

- **Option A — CloudWatch billing alarm** (us-east-1 `EstimatedCharges`): **currently
  BLOCKED** — `PutMetricAlarm` simulates explicitDeny and the SCP denies SNS reads;
  needs an org-level exception. Do not attempt.
- **Option B — AWS zero-spend Budget with email recipients** (forecasted + actual,
  $1 threshold): `CreateBudget` simulates allowed, but creation may still need Billing
  permissions and an SNS/email channel that SCPs may block. **Exact proposed action
  (pending your approval):** one monthly cost budget, $1 limit, email to an address
  you supply, no SNS topic, no auto-actions. I will not create it until you approve
  that exact action.
- **Option C — immediate, zero-permission:** you open Billing console → *Free Tier*
  page (Cognito 10,000 MAU status) and *Bills* (confirm $0). Do this before pool creation.

## 9. Stage-gate checklist

**Complete locally (evidence above + TEST_CHECKLIST.md):** shared libs, JWT enforcement,
ownership/agent gating, 404 policy, 7 handlers + single-table adapter + recorded
artifact, frontend auth/router/roles/attachments UI, backend 83 + frontend 9 tests
green, builds green, all docs + handover (`DEPLOYMENT_STATUS.md`).
**Pending AWS (each needs your explicit go-ahead):** Cognito pool/client/groups/users →
`tkt-tickets` table decision → S3 bucket → 7 Lambdas + role → HTTP API/authorizer/routes
→ single-digit live verification → `VITE_API_URL` + `.env.local` wiring → live
checklist M1–M10 → budget/alert decision → test-data cleanup.

## 10. Remaining manual actions + evidence needed to proceed safely

1. You: Billing console → Free Tier page — **evidence:** Cognito 10,000 MAU offer unused
   (screenshot or written confirm). Also confirm $0 MTD.
2. You: create pool/client/groups/users per §4 in **ap-southeast-2** — **evidence:**
   Pool ID, client ID, domain URL (+ tier shows Essentials on review screen).
3. Me (after 1–2): wire `.env.local`, read-only verify
   (`describe-user-pool` → `UserPoolTier: ESSENTIALS`, list clients/groups), report.
4. You: approve each of S3 → Lambda → API steps from the exact commands in
   `AWS_DEPLOYMENT.md` (+ §5–§7 above); I execute nothing without that per-step approval.
5. You: approve the exact budget action in §8 (or decline and rely on manual Billing checks).
