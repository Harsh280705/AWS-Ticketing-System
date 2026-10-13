# AWS Deployment (Stage B readiness plan — NOT yet executed)

> **Approval-gated.** Nothing below has been run. Each step needs your explicit
> approval immediately before execution, one component at a time, with minimal
> verification requests. Stop on any billing warning, restriction, or surprise.

Current state (verified read-only, account `517374107239`, region `ap-southeast-2`):
READY (reuse) — `Tickets` + `TicketComments`, both ACTIVE, 0 items.
MISSING — Cognito pool/client/groups, S3 bucket, Lambda + execution role, HTTP API + authorizer.

Always pass `--region ap-southeast-2` (CLI default is `ap-south-1`).

## Stage 2 — Cognito User Pool + app client + groups

Why: Hosted UI sign-up/sign-in, email sign-in, JWTs, `Customer`/`Agent` groups.

**Tier decision (verified 2026-10-12 against AWS pricing + feature-plans docs):**
- Console and API default for new pools = **Essentials**. Leave it selected; do NOT pick Plus.
- Essentials + Lite share a 10,000 MAU/month free tier (direct/social sign-in, per
  account/org, indefinite). **Plus has NO free tier** ($0.020/MAU from the first user).
- Lite ($0.0055/MAU) is cheaper per-MAU but drops managed login and token
  customization; at PoC scale (a handful of users) both Lite and Essentials bill $0.
  Keep the **Essentials default** — simplest, modern Hosted UI, $0 at our scale.
- Setting threat protection / AdvancedSecurityMode to AUDIT/ENFORCED **forces PLUS** —
  leave threat protection OFF. MFA = **None** (SMS MFA would incur SNS per-message
  charges). No Lambda triggers, no social/SAML/OIDC providers, no machine-to-machine
  grants (token requests have no free tier), no custom SES/SMS senders, no custom
  domain (use the free `<prefix>.auth.<region>.amazoncognito.com` domain).
- Create the pool in **ap-southeast-2** — check the console region selector first
  (CLI default on this machine is ap-south-1; always pass `--region ap-southeast-2`).

Console path (recommended, least error-prone):
1. Cognito → Create user pool → Application client = **Single-page application (SPA)**,
   **no client secret**, Authentication flows = **Authorization code grant** (+ PKCE),
   sign-in identifiers = **email**.
2. Callback URL `http://localhost:5173/callback`, sign-out URL `http://localhost:5173/`.
3. Create groups `Customer` and `Agent`. Required OAuth scopes: `openid email profile`.
4. Note the User Pool ID, client ID, and Hosted UI domain → frontend `.env.local`.

Then: `aws cognito-idp describe-user-pool --user-pool-id <id> --region ap-southeast-2`
(read-only verify). **Do not create users or change memberships via CLI without approval —
you will do membership in the Console.**

## Stage 4 — S3 attachment bucket (private)

Why: browser-direct uploads via pre-signed URLs, keys namespaced per user.

```powershell
# 1) Create (replace <unique-bucket-name> — S3 names are global):
aws s3api create-bucket --bucket <unique-bucket-name> --region ap-southeast-2 `
  --create-bucket-configuration LocationConstraint=ap-southeast-2
# 2) Block all public access:
aws s3api put-public-access-block --bucket <unique-bucket-name> --region ap-southeast-2 `
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
# 3) CORS for localhost PUT only (payload in AWS_DEPLOYMENT review before running):
#    AllowedOrigins http://localhost:5173, AllowedMethods PUT, AllowedHeaders content-type, MaxAge 300
```

Do NOT enable versioning, replication, or logging. Set `BUCKET_NAME=<name>` on
the functions (Stage 5) only after you approve. No test uploads until you approve the test.

## Stage 3 — DynamoDB `tkt-tickets` (REQUIRES SEPARATE APPROVAL)

Exact required table (nothing created): name `tkt-tickets`, PK `pk` (S) + SK `sk` (S),
STANDARD class, **on-demand (PAY_PER_REQUEST)** per owner instruction for this small
POC — $0 when idle, pay-per-request under smoke load — **no PITR, no GSIs, no streams, no TTL**. Item patterns: ticket
`pk=TICKET#<id>/sk=META` (title, description, priority, category, status, createdBy,
assigneeId, attachmentKeys, createdAt, updatedAt); activity `sk=ACTIVITY#<time>#<uuid>`
(type, actorId, detail, createdAt); comment `sk=COMMENT#<time>#<uuid>` (text, authorId,
authorRole, createdAt). PoC Scan permitted by the plan; no indexes.
Relation to existing tables: **none are touched** — `Tickets` and `TicketComments`
stay byte-identical (0 items, verified); the adapter `src/lib/ticketsSingleTable.js`
is written + tested and the handlers rewire to it only after you approve the table,
followed by suite re-runs + artifact rebuild. Cost: one more minimal provisioned
table ≈ the existing tables' profile; on-demand is the fallback option. Neither is
claimed free — confirm against your account terms at approval time.

## Stage 5 — Seven Lambda functions (REQUIRES SEPARATE APPROVAL)

Why: deploy the PDF-named functions from the local artifact. Least-privilege shared
execution role (`backend/deploy/execution-role.json`):
- `dynamodb:GetItem/PutItem/Scan/Query` on the approved table ARN(s) only
  (`tkt-tickets` after Stage 3; existing-table ARNs only if that deviation is approved).
- `s3:PutObject` on `<bucket>/attachments/*` only (after Stage 4).
- `logs:CreateLogGroup/CreateLogStream/PutLogEvents` scoped to `/aws/lambda/tkt-*`.

Per function (`backend/deploy/functions.json`): runtime `nodejs22.x`, handler
`src/handlers/<name>.handler`, arch x86_64, 512 MB, 30 s timeout, env
`TABLE_NAME=tkt-tickets`, `BUCKET_NAME=<bucket>`, `AWS_REGION=ap-southeast-2`.
All seven share the one zip
`backend/dist/ticketing-handlers.zip` (sha256-recorded, mock code excluded).
Verify with ONE invoke per function (read-only paths first) before wiring API Gateway.
**Nothing created — approval required.**

## Stage 6 — API Gateway HTTP API + JWT authorizer + routes

Why: public HTTPS endpoint with Cognito verification in front of Lambda.

1. Create HTTP API (`create-api`), JWT authorizer with Issuer
   `https://cognito-idp.ap-southeast-2.amazonaws.com/<poolId>` and Audience `<clientId>`.
2. Attach all 7 routes with `--authorization-type JWT` (one Lambda-proxy integration
   per route to its `tkt-*` function):
   `POST /tickets`, `GET /tickets`, `GET /tickets/{ticketId}`, `PUT /tickets/{ticketId}`,
   `POST /tickets/{ticketId}/comments`, `GET /tickets/{ticketId}/comments`,
   `POST /tickets/presigned-url`. No `/health` route on the API (health stays local).
   CORS: allow origin `http://localhost:5173`, methods used, headers
   `authorization,content-type`.
3. Create `$default` stage. Invoke permissions (`lambda:AddPermission`) scoped per
   function to this API's execution ARN (exact ARN at Stage 6).
4. Verify with a single-digit number of manual `Invoke-RestMethod` calls with a real
   Cognito token: 200 paths, 401 without token, 403 customer PUT. Then stop.

## Stage 2 note — discovered pool (read-only assessed, untouched)

Pool `ap-southeast-2_EtwJXz5fb` ("tkt-diagnostic-no-create") appeared 2026-10-12
from an unknown session: Essentials, MFA OFF, no add-ons, Cognito-default email,
self-registration allowed — BUT username-based sign-in (immutable post-creation),
no auto-verification, no domain/clients/groups. Adopt only with owner confirmation;
otherwise create `ticketing-pool` per Stage 2. Never modify it without approval.

## Frontend hosting assessment (no deploy — decision record)

- **Keep local Vite (`http://localhost:5173`): $0, matches the PDF demo, zero new
  resources.** Recommended for acceptance.
- Future option: private S3 + CloudFront OAC (default `*.cloudfront.net`, ACM free,
  no custom domain, no public bucket). Rough order: S3 pennies + CloudFront free-tier
  headroom at PoC scale (small egress), then ~$0.085/GB — not claimed free; needs the
  same SCP clearance as other creates plus Cognito callback updates. Amplify Hosting
  evaluated and rejected (build pipeline heavier than needed).
- If hosting is policy-blocked: local production build (`npm run build`, verified
  green) stands as the deliverable with this section as the missing-step record.

## Rollback

Delete in reverse order (API → Lambda → bucket (empty it first) → pool) ONLY with
approval. Tables are reused, never deleted. Never delete CloudWatch log groups blindly.
