# AWS Serverless Ticketing System

Serverless help-desk ticketing: Vue 3 + Vite + Tailwind frontend, Cognito Hosted UI
auth (Customer/Agent groups), API Gateway HTTP API with JWT authorizer, Lambda
(Node.js 22), DynamoDB, and private S3 attachments via pre-signed URLs.

## Status (2026-10-12 — local PASS; AWS deployment BLOCKED on policy, zero mutations)

The complete application runs locally with mock auth + JSON/file persistence
(backend **83/83**, frontend **9/9**, build + 14-step smoke green).
No AWS resource has been created, modified, or deleted by this agent.
Live deployment is policy-barred: CLI creates are SCP-denied (verified), and a pool
`ap-southeast-2_EtwJXz5fb` appeared today from an unknown session — assessed
read-only as partially suitable (Essentials, but username-based, no clients/groups),
untouched, owner decision pending. Org question resolved: account `517374107239` is a
member of org `o-mpoi6ieonm` (master `899810483413`), which explains the member-root
console view. Admin path: `backend/deploy/admin-request.md` + `console-runbook.md`.
Live checklist M1–M10: BLOCKED; deployment artifacts ready but never uploaded
(`backend/dist/ticketing-handlers.zip`, `backend/deploy/`). Handover:
`docs/DEPLOYMENT_STATUS.md`. See `docs/TEST_CHECKLIST.md`.

## Run it locally (no AWS setup, ~2 minutes)

Terminal 1 — backend → `http://localhost:3000`:

```powershell
Set-Location ".\backend"; npm install; npm start
```

Terminal 2 — frontend → `http://localhost:5173`:

```powershell
Set-Location ".\frontend"; npm install; npm run dev
```

Open `http://localhost:5173` → you land on `/login`. Pick a test user:

| Test user | Email | Role | Try this |
|---|---|---|---|
| `customer-a` | customer-a@example.com | Customer | create tickets, comment on your own |
| `customer-b` | customer-b@example.com | Customer | verify you cannot see A's tickets (404) |
| `agent-1` | agent-1@example.com | Agent | see all tickets, update status/assignee, "Assign to me" |

No passwords — these are deterministic local fixtures (`backend/src/lib/mockUsers.js`).
The UI shows **LOCAL MOCK AUTH** everywhere; use *Switch user* / *Sign out* in the
top bar to verify authorization behavior.

Health check: `Invoke-RestMethod http://localhost:3000/health`
→ `{"status":"ok","service":"ticketing-api","mode":"local-mock"}`.

Reset only local data: `Set-Location .\backend; npm run reset:demo`
Full localhost smoke: `npm run smoke` (isolated temp data, 14 checks).

## What works locally (verified)

All 7 routes (`POST/GET /tickets`, `GET/PUT /tickets/{id}`, comment add/list,
`POST /tickets/presigned-url` as a labeled mock), all 4 screens (login, list with
filters+search, create with attachment, detail with activity/comments/agent controls),
401/403/404 authorization, role/ID spoof rejection, attachment upload/download persisted
to `backend/data/uploads/`, restart persistence. Mock tokens are structurally barred
from the production path (tested).

## What needs AWS later (honestly not done)

Cognito pool/users/groups, S3 bucket, Lambda + API Gateway deployment, live
checklist M1–M10, billing alert/budget. The production code (`aws-server.js`,
`lambda.js`, `src/handlers/tkt-*`, Cognito OIDC frontend) is implemented and
unit-tested but **never executed against AWS** — mocks don't prove deployment.
Switch-over guide: `docs/AWS_DEPLOYMENT.md`. Preflight gate: `docs/DEPLOYMENT_PREFLIGHT.md`.

## Docs

- `docs/LOCAL_DEVELOPMENT.md` — setup, mock users, reset, smoke, troubleshooting.
- `docs/ARCHITECTURE.md` — local vs production paths, schema mapping.
- `docs/TEST_CHECKLIST.md` — automated evidence (green) vs live tests (pending AWS).
- `docs/IMPLEMENTATION_AUDIT.md`, `docs/AWS_DEPLOYMENT.md`, `docs/COST_AND_CLEANUP.md`,
  `docs/RESOURCE_INVENTORY.md`, `docs/DEPLOYMENT_PREFLIGHT.md` — prior phases, kept current.

## Cost-safety rules (standing)

No paid plans, provisioned extras, versioning/replication/backups, EC2/RDS/NAT/ALB,
load tests, or polling. Every AWS mutation needs explicit approval first. Nothing here
is claimed "free" — eligibility depends on account terms. No `.env` files or
credentials are committed (only `.env.example` with names).
