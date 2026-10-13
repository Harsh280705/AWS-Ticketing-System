# Console runbook + administrator request (NO action taken — approval gates apply)

Current CLI session (`AccountFullAccessRole` assumed role) is SCP-denied for all
create actions (verified by simulation + live `sns:ListTopics` / `s3:ListAllMyBuckets`
denies). Until an administrator grants an exception, every create below must run in
the **AWS Console under your login** (different rights possible) or via an admin
identity. Region for everything: **ap-southeast-2**. Never switch regions to dodge a denial.

## Stage 2 — Cognito (console, by you)

1. Cognito → Create user pool → name `ticketing-pool` → app type **Single-page
   application** → name client `ticketing-spa` (no secret auto) → check ONLY
   **Authorization code grant** → scopes `openid email profile` → callback
   `http://localhost:5173/callback` → sign-out `http://localhost:5173/`.
2. Sign-up: email identifier, self-registration ON, email verification (Cognito
   default sender), required = email only, recovery = email, MFA = **No MFA**.
3. Review screen: confirm tier **Essentials** (default — do not touch), threat
   protection OFF, no triggers/federation/SES/custom domain.
4. Domain menu → prefix domain `<unique>.auth.ap-southeast-2.amazoncognito.com`.
5. Groups → create `Customer`, `Agent` (leave IAM role empty).
6. Users (only after the pool is verified — never before authorization). For each of
   `customer-a`, `customer-b`, `agent-1`: Users → Create user → invitation message
   via email → set a temporary password YOU invent on the spot (never write it in
   chat, docs, tickets, or `.env` files; never reuse a real password) → create →
   confirm the user (or have them confirm via email link) → add `agent-1` to the
   `Agent` group only. Then `agent-1` signs in again so the new `cognito:groups`
   claim is issued (group changes apply to new tokens, not existing sessions).
   Verify: `AdminGetUser` per user + `ListGroups`-equivalent in console; `agent-1`
   shows `Agent`, the customers show no groups.
7. Record: Pool ID, client ID, domain URL → `frontend/.env.local` (git-ignored).

Admin CLI alternative (admin identity only — current session is denied):
`create-user-pool` (email config, `UserPoolTier=ESSENTIALS`, no `AdvancedSecurityMode`),
`create-user-pool-client` (`GenerateSecret=false`, `AllowedOAuthFlows=code`,
`AllowedOAuthScopes=openid email profile`, callback/logout URLs),
`create-group` × 2, `admin-create-user` + `admin-set-user-password` + `admin-add-user-to-group`.

## Stage 3 — DynamoDB `tkt-tickets` (separate approval first)

Console: DynamoDB → Create table → name `tkt-tickets`, PK `pk` (String), SK `sk`
(String), table class Standard, capacity **Provisioned 1 RCU / 1 WCU**, no PITR, no
GSI, no streams. Leave `Tickets`/`TicketComments` untouched. Verify: status ACTIVE.
Admin CLI alternative: `create-table` with `--billing-mode PROVISIONED
--provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 --table-class STANDARD`.

## Stage 4 — S3 bucket (separate approval first)

Console: S3 → Create bucket → name like `ticketing-attachments-<accountid>-syd`
(if taken, append `-2`, once — no blind retries) → region ap-southeast-2 →
**all 4 Block Public Access ON** → no versioning → create → Permissions/CORS paste
`backend/deploy/s3-cors.json`. Verify BPA + CORS in console. No uploads yet.

## Stage 5 — Seven Lambdas (separate approval first)

Console ×7 is error-prone; preferred path is the admin CLI bundle below (admin
identity only). For each of the 7 names in `backend/deploy/functions.json`:
runtime `nodejs22.x`, arch x86_64, handler as listed, 512 MB, 30 s, role from the
approved execution role (`backend/deploy/execution-role.json`), env
`TABLE_NAME=tkt-tickets`, `BUCKET_NAME=<stage-4 bucket>`,
`AWS_REGION=ap-southeast-2`, code `backend/dist/ticketing-handlers.zip`
(verify sha256 against `backend/deploy/packaging-manifest.txt` before upload). Verify each: state Active,
runtime, handler, env (no secret values shown). ONE test invoke per function on a
read path first (invokes that would write data need separate approval).

## Stage 6 — HTTP API (separate approval first)

Console: API Gateway → Create HTTP API → JWT authorizer (issuer
`https://cognito-idp.ap-southeast-2.amazonaws.com/<poolId>`, audience `<clientId>`)
→ 7 routes per `backend/deploy/api-routes.json` (integrations to matching
functions) → CORS `http://localhost:5173`, headers `authorization,content-type` →
`$default` stage. Verify authorizer/audience/issuer/routes/invoke URL. Set
`VITE_API_URL` to the invoke URL in `frontend/.env.local`.

## Stage 7 — Live tests (separate approval first)

Nine PDF scenarios, single-digit requests: sign-in/redirect, A creates (Open),
B isolation 404, agent sees all, filters, agent update + activity, chronological
comments, one tiny S3 upload, 401/403 negatives. Stop on any surprise.

## Administrator request (minimum to unblock programmatic deploy)

Ask the account/org administrator for ONE of: (a) permission to run Stages 2–6
yourself in ap-southeast-2, or (b) execution of the admin CLI alternatives above
by an admin identity, or (c) scoped SCP exception for `cognito-idp:Create*`,
`dynamodb:CreateTable`, `s3:CreateBucket/Put*`, `lambda:CreateFunction`,
`apigatewayv2:Create*`, `iam:CreateRole/PassRole` in account `517374107239`.
Do not request broad/admin rights; least privilege per `execution-role.json`.
