# Deployment Status — handover (2026-10-12, zero mutations by this agent)

Account `517374107239` · Region `ap-southeast-2` (CLI default `ap-south-1`; all
operations pin `--region ap-southeast-2`). Local suites green: backend **76/76**,
frontend **9/9**, `vite build` green. Artifact `backend/dist/ticketing-handlers.zip`
(4.8 MB, sha256 `0243253E6A9C90BDA721FEAAC23124BE5CEBD2E45D833E549990C098492AB34B`)
verified current — never uploaded.

## Per-stage status (labels: PASS / BLOCKED / NOT RUN)

| Stage | Status | Detail |
|---|---|---|
| 1 Preflight (identity, inventory, artifact) | **PASS** | Same assumed-role session; pools except below / functions / APIs absent; `tkt-tickets` ResourceNotFound; `Tickets`+`TicketComments` ACTIVE empty, PITR off; spend MTD $0; IAM user `Ticket_System` exists, untouched (no keys, no login, no switch — cannot override SCP either) |
| 2 Cognito | **BLOCKED** | Creates SCP-denied (`CreateUserPool`, `CreateUserPoolClient`, `CreateGroup` → explicitDeny, org `o-mpoi6ieonm`). Discovered pool `ap-southeast-2_EtwJXz5fb` ("tkt-diagnostic-no-create", NOT ours): Essentials/MFA-off/no-add-ons, but username-based, no clients/groups/domain — partially suitable, owner decision required before use. No pool/client/group/user created or modified |
| 3 DynamoDB `tkt-tickets` | **BLOCKED** | `CreateTable` simulated explicitDeny. Spec: pk+sk, on-demand (per owner instruction), no PITR/GSI. Existing tables untouched |
| 4 S3 bucket | **BLOCKED** | `CreateBucket`/CORS/BPA simulated explicitDeny; `ListAllMyBuckets` live-denied so absence unconfirmable — creation must tolerate name collision. Config ready (`deploy/s3-cors.json`) |
| 5 Execution role + 7 Lambdas | **BLOCKED** | `CreateFunction` denied; `CreateRole` simulates allowed but never attempted without explicit Stage 4 approval (a lone role deploys nothing). Configs ready (`functions.json`, `execution-role.json`); artifact ready; `verify-live.js` smoke prepared (clean SKIP pre-deploy) |
| 6 API Gateway + authorizer + 7 routes | **BLOCKED** | `CreateApi`/`CreateAuthorizer`/`CreateRoute`/`CreateIntegration` denied. Config ready (`api-routes.json`) |
| 7 Live M1–M9 | **BLOCKED** | No backend to test against. Minimal plan stands: 401 check, then owner-run sign-in flows |
| 8 Billing alert/budget | **BLOCKED** | Alarm path SCP-denied; budget proposal awaiting owner email + approval. Manual Billing checks recommended meanwhile |
| Frontend wiring (`.env.local`) | **NOT RUN** | Blocked on Stage 2 (no Pool/Client/Domain IDs to write; placeholders refused) |

## Real identifiers (verified, no secrets)

- Pool (unadopted): `ap-southeast-2_EtwJXz5fb` · Issuer pattern:
  `https://cognito-idp.ap-southeast-2.amazonaws.com/<poolId>` (no domain configured)
- Tables: `arn:aws:dynamodb:ap-southeast-2:517374107239:table/Tickets`,
  `.../table/TicketComments` (intact, 0 items)
- Required table (not created): `arn:aws:dynamodb:ap-southeast-2:517374107239:table/tkt-tickets`
- API invoke URL / Hosted UI URL / bucket name / function ARNs: **none exist**

## Cost position (no zero-cost promises)

Spend caused: $0. Expected at PoC scale once unblocked: Cognito ~$0 (Essentials,
~3 users inside 10,000 shared MAU; overage $0.015/MAU); on-demand DynamoDB ~$0 idle;
Lambda/API-GW/S3 pennies per smoke request. Confirm the Billing Free Tier page
before Stage 2; keep the $1-budget decision gated.

## Manual testing instructions (for you, after unblock)

1. Start backend/frontend locally (`README.md`), confirm mock mode green.
2. After Stages 2–6: fill `frontend/.env.local` (template below), restart Vite,
   sign in via Hosted UI as customer-a → create ticket → sign out → route guard
   check on `/tickets` → customer-b isolation check → agent update/comment checks →
   one tiny PNG upload → sign out. Single-digit requests; delete test items after.
3. `.env.local` template (values only post-Stage 2/6, never commit):
   `VITE_API_URL=<invoke-url>`, `VITE_COGNITO_AUTHORITY=https://<prefix>.auth.ap-southeast-2.amazoncognito.com`,
   `VITE_COGNITO_CLIENT_ID=<id>`, `VITE_REDIRECT_URI=http://localhost:5173/callback`.

## Cleanup (nothing destructive, nothing executed)

Nothing was created, so nothing needs deletion. Local: `npm run reset:demo`
(backend) clears demo data. If a future deploy leaves test items, delete the test
tickets/comments, empty-then-delete the bucket, and remove functions/API/pool/table
in reverse order — each with explicit approval, never blindly.

## Exact unblock actions (owner/admin)

1. Confirm provenance + reuse verdict for pool `ap-southeast-2_EtwJXz5fb`
   (adopt-with-username-deviation vs new email-model pool).
2. Grant the `backend/deploy/admin-scoped-access.json` exception (or execute
   `backend/deploy/console-runbook.md` stages yourself) — one stage at a time.
   Exact SCP edit: `backend/deploy/scp-remediation.md` (owner-side narrowing of
   `p-tsj48uzg`; no Allow policy can substitute for it).
3. Supply the budget notification email or decline to manual checks.
4. Exact SCP edit: `backend/deploy/scp-remediation.md` (owner-side narrowing of
   `p-tsj48uzg`; `DescribePolicy` is denied from here, so the owner adapts the
   candidate to the actual statement — no Allow policy substitutes).
