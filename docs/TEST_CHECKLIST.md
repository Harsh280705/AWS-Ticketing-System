# Test Checklist

> Deployment gate status lives in `docs/DEPLOYMENT_PREFLIGHT.md` (local-complete vs
> AWS-pending). This file records test evidence only.
> Mark **Passed** only with the evidence stated. Anything not yet run stays **Not run**.

## Automated — local phase (verified 2026-10-12, zero AWS; no AWS API called at all)

Backend `npm test`: **83/83 pass** (24 suites). Frontend `npm test`: **9/9 pass**.
`vite build`: pass (33 modules). Smoke `npm run smoke`: **14/14 SMOKE OK**.

| # | Test | Command | Result |
|---|---|---|---|
| A1 | Ticket creation validation (required, enums, limits, defaults) | `npm test` in `backend/` | **Passed** |
| A2 | Listing + status/priority/search filters + newest-first sort | `npm test` in `backend/` | **Passed** |
| A3 | Status/assignment validation (incl. empty-update, blank assignee, `assigneeId` alias) | `npm test` in `backend/` | **Passed** |
| A4 | Comment validation (required, trim, length cap) | `npm test` in `backend/` | **Passed** |
| A5 | Agent sees all / customer sees own (scoping) | `npm test` in `backend/` | **Passed** |
| A6 | Cross-customer view/comment denied (pure `canViewTicket`) | `npm test` in `backend/` | **Passed** |
| A7 | Missing/invalid auth → 401; customer PUT → 403; bad presigned MIME → 400 (HTTP, rejected before any SDK call) | `npm test` in `backend/` (`http-auth.test.js`) | **Passed** |
| A8 | Presigned-URL validation + namespaced unique keys (no S3 calls) | `npm test` in `backend/` | **Passed** |
| A9 | Frontend route guards (protected → `/login` every mode, agent-only, signed-in away from `/login`) | `npm test` in `frontend/` | **Passed** |
| A10 | Frontend production build (router + OIDC + mock auth + views + Tailwind) | `npm run build` in `frontend/` | **Passed** — 33 modules |
| A11 | Local API health + both servers boot | `node server.js` + `npm run dev`, `Invoke-RestMethod /health`, `Invoke-WebRequest :5173` | **Passed** — `mode: local-mock`, frontend HTTP 200 |
| A12 | Seven-handler acceptance on single-table fake (create/isolation/404/filters/agent-update/comments/presigned/401/403) | `npm test` in `backend/` (`handlers.test.js`) | **Passed** |
| A13 | Mock-auth units: fixtures, mint/verify, tampered-role ignored, expiry, `ALLOW_MOCK_AUTH=false`, production-path rejects mock tokens | `npm test` in `backend/` (`mock-auth.test.js`) | **Passed** — 8/8 |
| A14 | Local-stack integration on isolated temp data: 7-route 401s, spoof rejection, ownership 404s, exact 403 shape, filters/search, chronological comments, mock upload→download→attach, traversal/owner/type/size blocks, restart persistence | `npm test` in `backend/` (`local-server.test.js`) | **Passed** — 14/14 |
| A15 | Frontend mock helpers: fixture parity with backend, token recognize/decode, session round-trip | `npm test` in `frontend/` (`mock.test.js`) | **Passed** |
| A16 | Localhost end-to-end smoke (14 steps, temp data, deleted after) | `npm run smoke` in `backend/` | **Passed — SMOKE OK** |
| A17 | Required single-table lib (`tkt-tickets` pk/sk) + TABLE_NAME precedence: META/CREATED storage, scoping, 404s, agent update + actor activity, chronological comments, 400s (fake pk/sk store; table pending Stage 3) | `npm test` in `backend/` (`single-table.test.js`) | **Passed** — 7/7 |
| A18 | Production attachment round-trip (mocked): user-scoped keys accepted at create and persisted, foreign keys 400, download urls signed when configured / null otherwise, detail-fix regression (comments/activity/id intact), local create-keys merge | `npm test` in `backend/` (`handlers`, `single-table`, `validation`, `uploads`, `local-server` suites) | **Passed** |

## Manual browser pass (local, done by you)

Open `http://localhost:5173`, sign in as each fixture, and walk through
`docs/LOCAL_DEVELOPMENT.md` scenarios (create, filter, search, detail, agent update,
assign-to-me, comments, attachment, switch user, sign out). Automated suites cover the
rules; the browser pass confirms the four screens end-to-end.

## Live AWS (BLOCKED — no deployed backend; SCP denies all creates for the CLI session, pool use + stages await owner/admin approval)

Status for M1–M10: **BLOCKED** (not merely unrun — execution is policy-barred until
the Stage 2 gate clears; see `DEPLOYMENT_PREFLIGHT.md` §3 and
`backend/deploy/admin-request.md`). Local equivalents proven in A14/A16 are cited
per row; they do not count as live passes.

| # | Test | Steps | Expected |
|---|---|---|---|
| M1 | Sign-up / sign-in (Hosted UI) | Create users in Console; sign in at `/login` | Tokens issued; `/callback` lands on `/tickets` — **Not run** |
| M2 | Customer A creates ticket | Signed in as A: create with title/desc/priority/category | 201; appears in A's list — **Not run** |
| M3 | Customer B cannot access A's ticket | B opens A's id directly; B lists tickets | 404 `NOT_FOUND`; absent from list — **Not run live** (locally proven in A14) |
| M4 | Agent sees both customers' tickets | Agent lists | Both visible — **Not run live** (locally proven in A14) |
| M5 | Status/priority filtering | `GET /tickets?status=&priority=&q=` | Server-filtered — **Not run live** (locally proven in A14) |
| M6 | Agent updates status + assignee | `PUT` as Agent | 200 + activity w/ actorId — **Not run live** (locally proven in A14) |
| M7 | Comments chronological | Add 2 comments, `GET` comments | Oldest-first — **Not run live** (locally proven in A14) |
| M8 | Attachment upload | Upload tiny png via UI | 200 presigned URL + PUT to S3 — **Not run** (needs bucket; locally proven in A14) |
| M9 | No token → 401 | Call any `/tickets*` without `Authorization` | 401 — **Not run live** (locally proven in A14) |
| M10 | Customer PUT → 403 | Customer calls `PUT /tickets/{id}` | 403 `FORBIDDEN` — **Not run live** (locally proven in A14) |

## Distinguishing test kinds

- **Unit** (A1–A6, A8–A9, A13, A15): pure functions, mocked — ran locally, no network.
- **Local integration** (A7, A11, A14, A16): localhost HTTP only — ran, no AWS.
- **AWS read-only** (prior phases): `describe/list` only — ran then, none this phase.
- **Live AWS** (M1–M10): none executed. Do not mark passed until actually run post-approval.
  Mock/local success does not prove live deployment works.
