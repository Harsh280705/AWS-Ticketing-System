# Resource Inventory (actual, verified read-only)

Account `517374107239` · Region **`ap-southeast-2`** (CLI default is `ap-south-1` —
always pass `--region ap-southeast-2`). No secrets below.

## Exists — reuse

| Resource | Name / ID | Key facts |
|---|---|---|
| DynamoDB table | `Tickets` | PK `ticketId` (S). ACTIVE, 0 items, provisioned 1 RCU/1 WCU |
| DynamoDB table | `TicketComments` | PK `ticketId` (S) + SK `commentId` (S). ACTIVE, 0 items, provisioned 1 RCU/1 WCU |

## Does NOT exist yet (verified)

| Resource | Check | Planned name / value |
|---|---|---|
| Cognito User Pool | `list-user-pools` → one pool `ap-southeast-2_EtwJXz5fb` ("tkt-diagnostic-no-create", appeared 2026-10-12, NOT created by this agent) | Essentials, MFA OFF, no add-ons, Cognito-default email — BUT username-based, no clients/groups/domain. Partially suitable; owner decision required before use |
| Cognito app client | (no pool) | SPA, no secret, auth-code + PKCE, callbacks `http://localhost:5173/callback` / `http://localhost:5173/` |
| Cognito groups | (no pool) | `Customer`, `Agent` (no IAM roles attached) |
| S3 bucket | `list-buckets` → `[]` (global namespace; re-check 2026-10-12 final assignment: `ListBuckets` now SCP-denied, so absence can't be re-verified — creation must handle possible name collision) | name TBD (must be globally unique), BPA on, no versioning |
| Lambda functions | `list-functions` → `[]` | **Seven `tkt-*` functions per PDF** (wired to `ticketsSingleTable.js`, env `TABLE_NAME`/`BUCKET_NAME`, artifact `backend/dist/ticketing-handlers.zip` sha256 `0243253E…92AB34B`, configs + console runbook in `backend/deploy/`, NOT deployed — Stage 5 approval required). Single-function option retired for this assignment (see below) |
| Lambda execution role | only managed/service roles present | least-privilege role TBD (DynamoDB on 2 table ARNs + `s3:PutObject` on `attachments/*` + scoped logs) |
| API Gateway HTTP API | `get-apis` + `get-rest-apis` → `[]` | HTTP API + Cognito JWT authorizer (issuer `https://cognito-idp.ap-southeast-2.amazonaws.com/<poolId>`, audience = client ID), 7 JWT routes + open `GET /health`, CORS `http://localhost:5173` with `authorization,content-type` |
| Billing alarm | `describe-alarms` (us-east-1) → `[]` | none — see COST_AND_CLEANUP; creation needs approval |
| Budgets | `describe-budgets` → no data returned | none visible — creation needs approval + Billing perms |
| Oct 1–12 month-to-date | Cost Explorer `UnblendedCost` | **$0.00 USD** (estimated) |

## Runtime decision (supplement §2)

Source plan names Node.js 20, but `nodejs20.x` was **deprecated 2026-04-30**
(AWS Lambda runtimes doc, checked 2026-10-12). New functions use **`nodejs22.x`**
(supported to 2027-04-30, matches local Node v22.18.0 and the v3 SDK already in
`package.json`). Documented here so the deviation from the plan is explicit.

## Seven functions vs one (supplement §2 cost/ops analysis)

- **Per-request cost is identical** (Lambda bills requests + GB-s either way).
- Seven functions add: 7 configurations to keep in sync, 7 CloudWatch log groups,
  7 cold-start surfaces, 7 IAM wiring points — more operational surface, better
  fault isolation and per-route metrics.
- One function (`serverless-http` around the tested Express app) adds: a single
  deployable, one log group, one concurrency/timeout setting; all routes share a
  cold start (loads the whole app, still small).
- **Final assignment decision: deploy the seven PDF-named functions** (`tkt-*`).
  The earlier single-function recommendation is superseded — the PDF explicitly
  requires seven separately deployed functions, and silently substituting one
  function is forbidden. The single-function code (`lambda.js` + `aws-server.js`)
  is retained in-repo as a tested fallback, never deployed without a new approval.
  **No function of either shape has been created — approval required.**

## Schema comparison — required `tkt-tickets` vs existing tables (Stage 3 pending)

Re-verified 2026-10-12 (final assignment Stage 1): `Tickets` = PK `ticketId` (S),
ACTIVE, 0 items, PROVISIONED 1 RCU/1 WCU, STANDARD, PITR DISABLED;
`TicketComments` = PK `ticketId` (S) + SK `commentId` (S), same settings.
Neither table was created, deleted, migrated, or reconfigured.

| Required (`tkt-tickets`) | Existing equivalent | Conflict? |
|---|---|---|
| Table `tkt-tickets`, pk (S) + sk (S) | Two tables with `ticketId`/`commentId` keys | **Name + shape differ — new table needed, approval required** |
| Ticket `pk=TICKET#id, sk=META` + 10 attributes | `Tickets` item (same attributes; `assignee` display + `assigneeId` persisted) | Mappable 1:1 |
| Activity `sk=ACTIVITY#time` items | Embedded `activity[]` array | Handlers wired to `ticketsSingleTable.js` (tested 7/7); existing tables untouched |
| Comment `sk=COMMENT#time` items | `TicketComments` rows ordered by `Query` | Mappable 1:1 via `COMMENT#<time>#<uuid>` |
| Ownership `createdBy == sub` | Identical rule in both libs | None |
| PoC Scan permitted, no GSI | Same (Scan + in-code filter) | None |

**Migration-free proposal:** create `tkt-tickets` (**on-demand PAY_PER_REQUEST** per
owner instruction for this small POC — $0 idle — no PITR/GSIs/streams) leaving both
existing tables byte-identical; handlers are already wired (`TABLE_NAME`) and tested,
so after approval the flow is create → verify ACTIVE → deploy functions. Existing tables are never deleted/migrated/reconfigured without a
separate explicit approval. Neither billing mode is claimed free — confirm against
your account terms at approval time.
