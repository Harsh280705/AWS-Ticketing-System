# Implementation Audit — AWS Serverless Ticketing System

**Date (UTC):** 2026-10-12
**Mode:** READ-ONLY audit. No AWS resources were created, updated, or deleted. No credentials printed or stored.
**Project root:** `D:\Yantra3loka LLP\Training\Week 4 (12 October to 18 October)\AWS Ticketing System`

## 0. How this audit was performed

- Listed all non-`node_modules` files with `Get-ChildItem -Recurse`.
- Read: `backend/server.js`, `backend/aws-server.js`, `backend/lambda.js`, `backend/services/api.js`,
  `backend/package.json`, `backend/data/tickets.json`, `frontend/src/App.vue`, `frontend/src/main.js`,
  `frontend/src/style.css`, `frontend/src/services/api.js`, `frontend/package.json`,
  `frontend/vite.config.js`, `frontend/index.html`.
- Safe local checks only: `node --check` on 3 backend files (all pass), `npm run build` in
  `frontend/` (passes, see §7), temporary local start of `backend/server.js` to verify
  `/health` and `/tickets` (server stopped afterwards).
- AWS read-only commands only, always with explicit `--region ap-southeast-2`:
  `sts get-caller-identity`, `configure list`, `dynamodb list-tables` + 2× `describe-table`,
  `cognito-idp list-user-pools`, `lambda list-functions`, `apigatewayv2 get-apis`,
  `apigateway get-rest-apis`, `s3api list-buckets`, `iam list-roles` (names/ARNs only).
- No CloudFormation / SAM / Serverless / CDK / Terraform commands were run.
- No test files were uploaded to AWS. DynamoDB tables contain 0 items (verified via `ItemCount`).

## 1. AWS identity and region context (read-only evidence)

| Item | Evidence |
|---|---|
| Caller identity | `arn:aws:sts::517374107239:assumed-role/AccountFullAccessRole/<session-id>` (UserId redacted here; full JSON seen in terminal only) |
| Account | `517374107239` |
| CLI region default | `ap-south-1` (from `~/.aws/config`) — **mismatches project region** |
| Project region | `ap-southeast-2` — all resource checks below used explicit `--region ap-southeast-2` |
| Auth method | `aws login --remote` session (access_key/secret_key type `login`, values not displayed) |

> **Risk note:** every future AWS CLI command MUST pass `--region ap-southeast-2` explicitly,
> otherwise it will silently target `ap-south-1`. Never run `aws configure` to "fix" this
> without your approval, per your cost-safety rules.

## 2. Repository structure (actual)

```text
backend/
  server.js                 # local Express + JSON-file storage (working)
  server.local-backup.js    # byte-identical copy of server.js (redundant)
  aws-server.js             # Express + DynamoDB (DynamoDB logic present, NO auth, NO S3)
  lambda.js                 # serverless-http wrapper around aws-server.js (5 lines)
  package.json              # express, cors, dotenv, aws SDK v3, serverless-http
  package.local-backup.json # same deps minus serverless-http (redundant)
  package-lock.json
  data/tickets.json         # 1 demo ticket ("Payment issue")
  services/api.js           # UNUSED backend copy of fetch helper (frontend duplicate)
  src/handlers/             # EMPTY directory
  src/lib/                  # EMPTY directory
frontend/
  src/App.vue               # ~56 KB single-file monolith: UI + state + API calls + inline <style>
  src/main.js               # createApp(App).mount('#app') only — no router setup
  src/style.css             # ~1458-line dark theme (standalone, largely overridden by App.vue inline styles)
  src/services/api.js       # fetch helper, hardcoded http://localhost:3000, no auth header
  src/components/HelloWorld.vue  # default Vite template, unused
  vite.config.js, index.html, package.json, README.md (default Vite text)
docs/                       # created by this audit; previously did not exist
```

No `.env` files, no `*.yml`/`*.yaml` deployment templates, no tests (`*.test.js`/`*.spec.js`
only exist under `node_modules`), no git repo (`git status` → "not a git repository").

## 3. Feature-by-feature audit table

### 3a. Frontend

| Feature / resource | Existing state | Evidence | Missing work | Proposed next action (Stage A, local only) | Potential AWS cost / risk |
|---|---|---|---|---|---|
| Login / sign-up screen | NOT IMPLEMENTED | `App.vue` has no login form, no Cognito/Hosted UI redirect, hardcoded profile "Your Workspace / Local demo · Agent view" | Add login view + OIDC callback route (`/callback`), sign-out | Add `oidc-client-ts` AuthContext + Vue Router (`/`, `/callback`, `/tickets`, `/tickets/:id`), keep demo fallback clearly labelled | None locally. Cognito MAU charges possible once users are created — do not create users without approval |
| Protected Vue routes + route guards | NOT IMPLEMENTED | `main.js` mounts `App` directly; `vue-router` is installed but never imported; nav (`Tickets/My tasks/Customers/Reports/Settings`) is in-component `activeNav` state, non-ticket tabs are placeholders | Add router with `requiresAuth` guard | Stage A: implement router + guards against mock auth; wire real Cognito config later | None locally |
| Role distinction (Customer vs Agent) | NOT IMPLEMENTED | All users see agent controls (status/priority/assignee selects); no group check | Gate agent-only controls on `cognito:groups` contains `Agent` | Stage A: role flag from mock JWT; enforce real check in backend middleware | None locally |
| Ticket list + status/priority filter + search | PARTIALLY IMPLEMENTED (local only) | `App.vue` `filteredTickets` computed + table UI; but `services/api.js list()` takes no params so filtering is client-side only | Pass `?status=&priority=&q=` to backend; keep client filter as fallback | Small edit to `ticketApi.list(params)` | None locally |
| Create ticket form | PARTIALLY IMPLEMENTED (local only) | Modal with title/description/category/priority; no attachment input, no validation messages beyond `required`, duplicate-submit guarded via `saving` flag | Add attachment file input (staged, not auto-uploaded), inline validation | Stage A edits to `App.vue` + `api.js` | None locally |
| Ticket detail + activity timeline + comments | PARTIALLY IMPLEMENTED (local only) | Detail view + timeline + conversation exist; `openTicket()` fires 2 requests (`get` + `comments`) and merges; works against local server | Refresh-after-update already done; add loading/empty states per comment thread | Minor UX hardening, no rewrite | None locally |
| Attachment upload via pre-signed URL | NOT IMPLEMENTED | No file input; `ticketApi` has no `presignedUrl` method; backend returns 501 | Add `getPresignedUrl()` + `PUT` to S3 from browser | Stage A: validate filename/MIME/size locally with unit tests; no live upload until approved | S3 storage + PUT request charges if live-tested; keep test files tiny and approved-only |
| API auth header | NOT IMPLEMENTED | `services/api.js request()` sends only `Content-Type`, never `Authorization: Bearer` | Attach Cognito access token via interceptor | Stage A with mock token | None locally |
| Demo-mode labelling | WEAK | "Local API" / "Local demo" tags exist in topbar/sidebar/footer, but demo data (1 JSON ticket) is visually indistinguishable from real data | Add explicit banner: "LOCAL DEMO — not AWS data" when `VITE_API_MODE=local` | Cosmetic edit | Prevents confusion; no cost |

### 3b. Backend — local (`server.js`)

| Feature / resource | Existing state | Evidence | Missing work | Proposed next action | Potential AWS cost / risk |
|---|---|---|---|---|---|
| `GET /health` | COMPLETE (local) | Verified live during audit: `{"status":"ok","service":"ticketing-api"}` | None | Keep as-is | None |
| `POST /tickets` | COMPLETE (local, no auth) | Validates title/description + priority enum; defaults `Medium`/`Technical Issue`/`Open` | Add auth + `createdBy` from JWT (do not trust body) | Stage A: extract validation into shared `src/lib/validation.js` with unit tests | None |
| `GET /tickets` (+`status`,`priority`,`q`) | COMPLETE (local, no auth) | In-memory filter over JSON file; verified `count:1` during audit | Add ownership scoping (customer → own only) | Stage A: pure filter/authorize functions + tests | None |
| `GET /tickets/{id}` | COMPLETE (local, no auth) | `findTicket` by `id`; 404 handling | Add ownership check | Shared `authorize()` helper + tests | None |
| `PUT /tickets/{id}` | COMPLETE (local, no auth) | Status/priority enum validation + activity entries | Restrict to Agent role; customers → 403 | Role-check middleware + tests | None |
| `POST + GET /tickets/{id}/comments` | COMPLETE (local, no auth) | Required-text validation; chronological push order | Add ownership check; enforce sort on read | Tests for ordering + auth | None |
| `POST /tickets/presigned-url` | STUB (501) | Returns `AWS_NOT_CONFIGURED` | Real S3 presigner (in `aws-server.js`/Lambda path, not local JSON path) | Stage A: pure key-builder + validator, no live S3 | None |
| Storage | JSON file (`data/tickets.json`, 1 ticket) | Read/write verified | Keep as local fallback permanently | Do not delete | None |

### 3c. Backend — AWS path (`aws-server.js` + `lambda.js`)

| Feature / resource | Existing state | Evidence | Missing work | Proposed next action | Potential AWS cost / risk |
|---|---|---|---|---|---|
| DynamoDB integration | PARTIALLY IMPLEMENTED | `Get/Put/Scan/Query` against `Tickets` + `TicketComments`; `TICKETS_TABLE`/`COMMENTS_TABLE` env override; dual `ticketId`+`id` fields; activity array embedded in ticket item | Ownership (`createdBy`) checks; replace N+1 `Scan`+per-ticket-`Query` in list with leaner read (or document PoC trade-off); GSI only if justified | Stage A: add `createdBy` filter + `ownerOrAgent` guard as pure functions; load-test nothing | DynamoDB provisioned 1 RCU/1 WCU per table (see §4) — scans + N+1 queries consume read units; keep manual tests to a handful of items |
| JWT verification / Cognito authorizer | NOT IMPLEMENTED | No `Authorization` parsing, no JWKS verification, `createdBy`/`authorId` hardcoded to `local-demo-user`, no group check | Add authorizer (API GW JWT authorizer = cheapest; no Lambda authorizer needed) + backend defense-in-depth claim check | Stage B plan + Stage C after approval | API GW + Lambda invocation charges per request; JWT authorizer itself has no extra fee but requests do — test with single-digit requests only |
| `PUT` role enforcement | NOT IMPLEMENTED | Any caller can change status/assignee | `requireAgent` middleware reading `cognito:groups` | Stage A code + tests, Stage C wiring | None beyond request charges |
| S3 pre-signed URL | NOT IMPLEMENTED (501) | Same stub message as local | `S3Client` + `PutObjectCommand` + `getSignedUrl`, key prefix `uploads/<sub>/<uuid>-<sanitized-name>`, validate ext/MIME/size | Stage A validator + key-builder tests; Stage C bucket + CORS after approval | S3 PUT/storage charges; block public access; do not enable versioning/replication |
| Lambda handler | THIN WRAPPER ONLY | `lambda.js`: `serverless(app)` with `serverless-http`; no events/log sanitizing | Add JSON error shape (no stack/credential leak), confirm Node 22 runtime | Local `handler` smoke test with mock API GW v2 event (no deploy) | Lambda GB-s + CloudWatch Logs ingestion on live tests — keep invocations minimal |
| `src/handlers/`, `src/lib/` modularization | NOT IMPLEMENTED (empty dirs) | `Get-ChildItem src -Recurse` shows 2 empty folders | Split `aws-server.js` into `handlers/tickets.js`, `handlers/comments.js`, `handlers/uploads.js`, `lib/auth.js`, `lib/validation.js`, `lib/response.js`, `lib/dynamo.js` | Stage A refactor with existing behaviour preserved; unit-testable | None |

### 3d. AWS resources (account `517374107239`, region `ap-southeast-2`)

| Feature / resource | Existing state | Evidence | Missing work | Proposed next action | Potential AWS cost / risk |
|---|---|---|---|---|---|
| DynamoDB `Tickets` (PK `ticketId` S) | EXISTS, ACTIVE, 0 items | `describe-table`: `TableStatus ACTIVE`, `ItemCount 0`, `BillingMode PROVISIONED`, 1 RCU/1 WCU | None (reuse as-is) | No change; recommend **keeping two-table design** — see §5 | Provisioned capacity bills even when idle (small but non-zero); do NOT enable PITR/backups/global tables without approval |
| DynamoDB `TicketComments` (PK `ticketId` S, SK `commentId` S) | EXISTS, ACTIVE, 0 items | Same `describe-table` output pattern; `ScanIndexForward:true` query already chronological | None (reuse as-is) | No change | Same as above |
| Cognito User Pool + app client + `Customer`/`Agent` groups | NOT FOUND | `list-user-pools --max-results 20` → `[]` (current account+region only) | Pool (email sign-in), SPA client (no secret, code+PKCE), callback `http://localhost:5173/callback`, logout `http://localhost:5173/`, 2 groups | Stage B: exact console/CLI plan for approval; Stage C: create once | Cognito MAU-based pricing — explain before creating users; never create users or change memberships without approval |
| S3 attachment bucket (private, Block Public Access, CORS for localhost:5173) | NOT FOUND | `list-buckets` → `[]` (global namespace, so no suitable bucket exists) | One bucket, BPA on, CORS PUT-only from localhost, no versioning | Stage B plan; Stage C create after approval; no test uploads until approved | Storage + request charges; keep objects tiny and few |
| Lambda function (Node 22) + execution role | NOT FOUND | `list-functions` → `[]`; `list-roles` shows only managed/service roles, no project role | Function from `lambda.js` + least-privilege role (DynamoDB Get/Put/Scan/Query on 2 tables, S3 PutObject on prefix, logs:write) | Stage B plan; Stage C deploy after approval | Invocations + duration + log ingestion; one-at-a-time deploys, minimal smoke tests |
| API Gateway HTTP API + Cognito JWT authorizer + 7 routes | NOT FOUND | `get-apis` → `[]`, `get-rest-apis` → `[]` | HTTP API, JWT authorizer (issuer = Cognito pool), all 7 routes attached with authorization | Stage B plan; Stage C after approval | Per-request charges; verify with single-digit requests, no polling/load tests |

## 4. DynamoDB schema decision (do NOT migrate without approval)

- **Existing:** two tables (`Tickets` PK `ticketId`; `TicketComments` PK `ticketId` + SK `commentId`).
  `aws-server.js` already implements this correctly, including chronological comment queries.
  Both tables are `ACTIVE` with `ItemCount 0`.
- **Reference design in prompt:** single table `tkt-tickets` with `pk=TICKET#<id>` / `sk=META|ACTIVITY#…|COMMENT#…`.
- **Recommendation: keep the two existing tables (lowest risk).** Reasons: (a) code already works
  against them; (b) zero items means no data to migrate but also no benefit to churning tables;
  (c) deleting/recreating tables risks billing confusion and wastes the working setup;
  (d) the two-table pattern satisfies every required route for a small PoC.
- **Caveat:** `GET /tickets` currently `Scan`s the whole table then N+1 `Query`s comments.
  Fine for a PoC with a handful of tickets; document as a known limitation (§8) rather than
  adding a GSI now. If ticket volume ever grows, add a `createdBy` GSI — only with approval.
- **Billing note:** both tables are `PROVISIONED` at 1 RCU / 1 WCU, not on-demand. Provisioned
  capacity can incur charges even with zero traffic depending on account terms. I am NOT claiming
  this is free. Do not switch billing modes, enable autoscaling, PITR, or backups without approval.

## 5. What is genuinely complete vs. missing

**Complete and verified (keep, don't rewrite):**

1. Local Express CRUD for 6 of 7 routes (`server.js`) — verified live (`/health` ok, `/tickets` returns 1 ticket).
2. DynamoDB CRUD for 6 of 7 routes (`aws-server.js`) — code-complete, syntax-checked, deps installed.
3. Frontend ticket dashboard (list/filter/search/create/detail/comments/activity) — builds cleanly (`vite build` 226 ms).
4. Two DynamoDB tables ACTIVE with correct key schemas.
5. Lambda thin wrapper (`lambda.js`) + Node 22 parte (`node v22.18.0` locally satisfies "Node 22 for new functions").

**Missing (ordered by dependency):**

1. AuthN/Z everywhere (Cognito pool/client/groups → API GW JWT authorizer → backend claim checks → frontend login/guards/roles). This is the critical gap: **all 7 deployed routes currently would be unauthenticated** if deployed as-is.
2. S3 bucket + presigned-URL handler + frontend upload UI.
3. API Gateway HTTP API + Lambda deployment + execution role.
4. Shared validation/auth/response/Dynamo modules (`src/*` empty) + unit tests with mocked SDK (zero project tests today).
5. All 7 required docs (this file is #1; `ARCHITECTURE`, `LOCAL_DEVELOPMENT`, `AWS_DEPLOYMENT`, `COST_AND_CLEANUP`, `TEST_CHECKLIST`, `README` still missing).

## 6. Cost-safety posture for next steps

- **Stage A (local implementation)** costs nothing: refactor `aws-server.js` into `src/*`,
  add `lib/auth.js` (JWT-claim parser as pure function), `lib/validation.js`,
  presigned-URL key-builder/validator, frontend router + OIDC wiring behind env flag,
  Jest/Vitest unit tests with mocked `@aws-sdk/*` (no live calls). `npm run build` + `node --test` only.
- **Stage B (readiness audit)** is read-only: confirm pool/client/groups/bucket/Lambda/API absences
  (done above), draft exact create commands, state IAM permissions needed, flag uncertain charges, stop.
- **Stage C (only after your explicit approval)** creates, in order: (1) Cognito pool+client+groups,
  (2) S3 bucket + CORS + BPA, (3) Lambda execution role + function, (4) HTTP API + authorizer + routes.
  Each step verified with a single-digit number of manual requests. Stop on any billing warning,
  account restriction, or unexpected resource. No upgrades, no provisioned extras, no versioning/
  replication/backups/NAT/ALB/EC2/RDS, no load tests, no polling loops, minimal CloudWatch volume.
- I do not claim any of Lambda / API Gateway / Cognito / DynamoDB / S3 / CloudWatch is "free" in
  your account. Charges and Free Tier/credit eligibility depend on your account terms and usage.

## 7. Test evidence (this audit only)

| Check | Command | Result |
|---|---|---|
| Backend syntax | `node --check server.js && node --check aws-server.js && node --check lambda.js` | All OK |
| Frontend build | `npm run build` in `frontend/` | Pass: `dist/index.html 0.45 kB`, CSS 43.33 kB, JS 83.37 kB, 226 ms, 13 modules |
| Local API (temporary start, then stopped) | `Start-Job { node server.js }; Invoke-RestMethod /health; Invoke-RestMethod /tickets` | `/health` → `{"status":"ok","service":"ticketing-api"}`; `/tickets` → `count:1` ("Payment issue") |
| AWS DynamoDB | `list-tables` + 2× `describe-table` (`ap-southeast-2`) | `Tickets`, `TicketComments`, both ACTIVE, 0 items |
| AWS Cognito / Lambda / API GW / S3 | `list-user-pools`, `list-functions`, `get-apis`, `get-rest-apis`, `list-buckets` | All empty in current account+region (absence verified only for `517374107239` / `ap-southeast-2`) |
| Project unit tests | None exist | NOT RUN — none to run. Must not be marked passed |

## 8. Known limitations carried forward

- `GET /tickets` uses `Scan` + per-ticket comment `Query` (N+1 reads). Acceptable for PoC; revisit with `createdBy` GSI only if volume justifies it.
- Ticket items carry both `ticketId` and duplicate `id` for local-shape compatibility. Harmless; normalize only if a real bug appears.
- `App.vue` inline `<style>` (~400 lines of dark-theme overrides) shadows `src/style.css`. Consolidate styles only after auth work lands, to avoid UI regressions.
- `backend/services/api.js` is dead code (backend never imports it). Leave until refactor; then delete or repurpose.
- `package.local-backup.json` / `server.local-backup.js` are redundant copies. Keep until Stage A refactor is green, then remove with your approval.
- No git repo — recommend `git init` + initial commit (excluding `.env`) only when you approve.

## 9. Approval gate — what I need from you before touching AWS

**I have completed the read-only audit. I will not create, update, or deploy any AWS resource until you approve a specific plan.**

Proposed sequencing (details in `docs/AWS_DEPLOYMENT.md`, to be written in Stage A):

1. **Stage A (no approval needed, zero AWS cost):** local refactor + unit tests + frontend router/auth scaffolding + remaining docs. Proceed on your go-ahead.
2. **Stage B (read-only):** exact Cognito/S3/Lambda/API commands + IAM permissions + cost-risk table. I present, you approve line-by-line.
3. **Stage C (approval-gated deploys):** one component at a time, minimal verification requests, immediate stop on warnings.

**Questions for you:**
- (a) May I proceed with Stage A local work (no AWS calls)?
- (b) Confirm keeping the existing `Tickets` + `TicketComments` tables (no migration to `tkt-tickets`)?
- (c) When we reach Stage C, do you want Cognito user creation / group membership done by you in the Console (recommended — I never create users without approval)?

## 10. Addendum — local-phase completion (2026-10-12, zero AWS calls)

All Stage A/B work plus the final local master prompt are complete:

- `server.js` now enforces mock auth (401/403/documented-404) on the exact 7 paths,
  with JSON persistence extended for `actorId` activity, embedded comments,
  `attachments[]` metadata, and local-disk uploads (`PUT/GET /mock-uploads/*`,
  traversal-proof). Local-only `/auth/mock-*` endpoints mint `mock.<payload>.local`
  tokens for fixtures `customer-a`, `customer-b`, `agent-1` (no passwords/secrets).
- Mock tokens are structurally barred from production: only `server.js` imports
  `mockUsers.js`, and `getUserFromClaims()` rejects `mock:true` (tested both ways).
- Frontend: mock picker on `/login`, session restore + expiry handling, user
  switcher, `/tickets` route (root redirects), agent-gated controls + Assign-to-me
  (no invented directory), attachment upload/download UI, exact supplement env names,
  Tailwind wired without disturbing the existing design.
- Evidence: backend **69/69**, frontend **9/9**, `vite build` green, 14-step
  localhost smoke **SMOKE OK**, both servers boot-verified (`:3000` health
  `mode: local-mock`, `:5173` HTTP 200). Backups (`*.local-backup.*`) untouched;
  still no git repo; only `.env.example` (names, no values).
- Live AWS items (M1–M10, deployment, billing alert) remain honestly pending —
  see `TEST_CHECKLIST.md` and `DEPLOYMENT_PREFLIGHT.md`.

## 11. Addendum — final-assignment Stage 1 (2026-10-12, read-only + local builds)

- Account/region re-verified (same `517374107239` assumed role, `ap-southeast-2`);
  pools/functions/APIs still absent; both tables ACTIVE, empty, provisioned 1/1,
  PITR off. `s3:ListAllMyBuckets` is now explicitly SCP-denied, so bucket absence
  can't be re-verified — creation must tolerate name collision.
- PDF deviations recorded (`RESOURCE_INVENTORY.md`): seven `tkt-*` functions (single
  function retired), `nodejs22.x` (Node 20 deprecated), `tkt-tickets` pending approval
  with migration-free proposal, mock/JSON modes dev-only and isolated.
- Artifacts prepared locally, never uploaded: `backend/dist/ticketing-handlers.zip`
  (4.8 MB, sha256-recorded, mock code excluded) + `backend/deploy/` configs
  (functions, execution role, API routes, S3 CORS, Cognito settings, manifest).
- Suites re-run green: backend **75/75** (incl. new 6-test single-table lib),
  frontend **9/9**, `vite build` green. Stopping at the Stage 2 gate.

## 12. Addendum — deployment execution pass (2026-10-12, still zero mutations)

- Identity re-verified (same account/role); pools/functions/APIs absent (except the
  third-party pool below);
  `tkt-tickets` confirmed non-existent (`ResourceNotFoundException`); existing
  tables untouched. Secrets sweep of src/docs clean.
- Executed safe work: handlers rewired to `ticketsSingleTable.js` (env
  `TABLE_NAME`, `BUCKET_NAME` per deployment contract), live-token precedence fixed
  in the frontend (stale mock can no longer shadow Cognito), `handlers.test.js`
  converted to the single-table fake, same-ms comment ordering documented +
  stabilized, artifact rebuilt twice with packaging re-verified
  (current sha256 `B704648F…5E6C4B6D`), entry points load-tested,
  `backend/deploy/console-runbook.md` + admin request/policy proposal written.
  Suites green post-change: backend **76/76**, frontend **9/9**, build green.
- Discovered pool `ap-southeast-2_EtwJXz5fb` (unknown session, NOT this agent):
  Essentials/MFA-off/no-add-ons but username-based without clients/groups/domain —
  partially suitable, owner verdict pending, untouched.
- Blocked (reported, not bypassed): all creates SCP-denied for this CLI session;
  per-stage console/admin execution + approvals required. Live M1–M9 BLOCKED.

## 13. Addendum — execution pass with live discovery (2026-10-12, still zero mutations)

- Suites re-run green (backend **83/83**, frontend **9/9**, build green); artifact
  confirmed current (no src changes since zip); org discrepancy resolved:
  `describe-organization` succeeds — account `517374107239` IS a member of org
  `o-mpoi6ieonm` (master `899810483413`), so the member-root console showing a
  "create organization" page explains itself, and the SCP denial stands as the
  verified blocker (no org created/modified, no identity switched).
- **New discovery: pool `ap-southeast-2_EtwJXz5fb` ("tkt-diagnostic-no-create")
  appeared today 18:27 IST from an unknown session — not created by this agent.**
  Read-only assessment: Essentials, no add-ons, Cognito-default email, MFA OFF,
  self-registration allowed — but username-based sign-in (not email), no auto
  verification, no domain/clients/groups. Partially suitable; owner confirmation
  required before any use. Untouched.
- Live M1–M9 recorded **BLOCKED** (no deployed backend to test against); local
  results preserved separately. Frontend hosting assessed (local $0 recommended;
  CloudFront path documented, undeployed). Billing alarm/budget still uncreated
  (procedure stands in preflight §8).

## 14. Addendum — permission review + attachment-flow completion (2026-10-12, still zero mutations)

- Reviewed `admin-scoped-access.json` against the runbook, deployment scripts, IAM
  docs, and actual code imports. Fixed in proposal: PassRole condition isolated
  (was breaking sibling actions), `ListTables`/`ListFunctions`/`DescribeLogGroups`/
  `ListUserPools` split to required `*`, unverifiable `RequestedRegion` condition
  replaced by ARN scoping, domain/update/fix-cycle actions added
  (UserPoolDomain, Update*, GetPolicy, GetStages/Deployments, FilterLogEvents,
  HeadBucket, UpdateFunctionCode). New `permission-matrix.md` records the
  action-by-action evidence, deploy-vs-runtime split, and the 5 unavoidable-broad
  entries for admin approval.
- Fixed real product gaps found during review: attachment keys now persist at
  create (user-namespace-verified), ticket detail returns working presigned
  download urls when configured (`url: null` otherwise), `GET /tickets/{id}`
  regression (dropped comments/activity/id) repaired + regression-tested.
  Execution role gains runtime `s3:GetObject`; S3 CORS gains GET+authorization.
- Suites green post-change: backend **83/83**, frontend **9/9**, build green;
  artifact rebuilt (`0243253E…`, packaging re-verified, mock code excluded).

## 15. Addendum — final execution pass (2026-10-12, still zero mutations)

- Re-verified identity/account/region; pools (third-party only), functions, APIs
  still absent; `tkt-tickets` still ResourceNotFound; legacy tables ACTIVE with
  0 items, intact. SCP content unreadable (`DescribePolicy` AccessDenied —
  recorded once, not retried). Fresh evidence: backend **83/83**, frontend **9/9**,
  build green; artifact current with matching sha; no secrets on disk (example-only
  env); no token logging in the Lambda path; 7 functions × 8 routes config-consistent.
- Wrote `backend/deploy/scp-remediation.md`: the exact owner-side narrowing
  (exclude the deployment principal from `p-tsj48uzg`'s Deny, or scoped variants),
  with the explicit warning that no Allow policy can override the Deny and the SCP
  text itself is unreadable from here. Live M1–M9 stay **BLOCKED**; nothing created,
  retried, or bypassed.

## 16. Addendum — final execution sweep (2026-10-12, still zero mutations)

- Same identity/account/region re-verified; no profile or account change (foreign
  account `585985125232` never involved). IAM user `Ticket_System` confirmed to
  exist (read-only `GetUser`) — left strictly alone: no keys created, no login
  attempted, no identity switch; as a member-account principal it cannot override
  the SCP either. Pools/functions/APIs unchanged; `tkt-tickets` still absent;
  legacy tables ACTIVE, 0 items.
- Permission re-check (single simulation, read-only): 5/6 Stage 2–6 creates still
  `explicitDeny`; only `iam:CreateRole` simulates allowed — held uncreated (Stage 4
  needs explicit approval, and a lone role deploys nothing). No create attempted.
- Independent work completed: `backend/scripts/verify-live.js` (safe post-deploy
  smoke: public health + 401 check, clean SKIP without `LIVE_API_URL` — verified),
  handler↔route mapping re-verified consistent, fresh suites backend **83/83**,
  frontend **9/9**, build green. Live M1–M9 remain **BLOCKED** by policy, recorded
  with evidence, never labeled passed.
