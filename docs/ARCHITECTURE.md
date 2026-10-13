# Architecture

## Target deployed architecture

```text
Vue 3 SPA (Vite)
  │  Authorization: Bearer <Cognito JWT>
  ▼
API Gateway HTTP API ── Cognito JWT authorizer (verifies signatures)
  │  event.requestContext.authorizer.jwt.claims
  ▼
Lambda (Node.js 22, backend/lambda.js → backend/aws-server.js)
  ├── DynamoDB  Tickets        (PK ticketId S)
  └── DynamoDB  TicketComments (PK ticketId S, SK commentId S)

Attachments:
Vue SPA → POST /tickets/presigned-url (Lambda) → pre-signed PUT URL
Vue SPA → PUT object directly to private S3 bucket (key: attachments/<userSub>/…‑<file>)
```

## Supplement alignment notes (acceptance spec)

- **Env names** (frontend): `VITE_API_URL`, `VITE_COGNITO_AUTHORITY`,
  `VITE_COGNITO_CLIENT_ID`, `VITE_REDIRECT_URI` (+ optional `VITE_COGNITO_LOGOUT_URI`,
  `VITE_COGNITO_SCOPE`). See `.env.example`.
- **Tailwind CSS**: wired via `@tailwindcss/vite` + `theme.css`/`utilities.css`
  **without preflight**, so the existing custom design is untouched; utilities are
  used on the standalone Login/Callback views. Pinia is intentionally *not* added:
  the auth singleton (`src/auth/useAuth.js`) doesn't need a store library, and the
  supplement says to use these libraries "only where appropriate".
- **No invented agent directory**: the assignee control offers Unassigned + the
  signed-in agent (+ "Assign to me" action) instead of hardcoded names.
- **Cross-customer access → documented 404** (`NOT_FOUND`, same shape as missing
  ticket — never confirm/deny another customer's ticket). Agent-only `PUT` by a
  customer → **403**. Missing/invalid JWT → **401**.
- **Schema mapping** (retained two tables ↔ supplement single-table design):
  `pk=TICKET#id/sk=META` ≡ `Tickets` item keyed by `ticketId` (activity embedded
  as `[{type, actorId, detail, createdAt}]`); `sk=COMMENT#time` ≡ `TicketComments`
  items keyed `(ticketId, commentId)` ordered by `Query(ScanIndexForward)`;
  `ACTIVITY#time` ≡ the embedded activity array (timeline order = array order);
  `assigneeId` input is accepted and normalized to `assignee` (+ persisted).
  **Local JSON mirrors this exactly**: ticket objects carry `activity[]`,
  `comments[]` (stand-in for `TicketComments` rows), `attachments[]` metadata +
  `attachmentKeys[]`; uploaded bytes live outside the JSON under
  `data/uploads/<sub>/` (production: private S3, keys `attachments/<sub>/…`).
  Ownership isolation = `createdBy === sub` scoping on every read path.
- **Lambda shapes**: seven-function sources = `src/handlers/tkt-*.js` over
  `src/lib/ticketsSingleTable.js` (same validation/auth/data-access), artifact
  `backend/dist/ticketing-handlers.zip` (mock code excluded, hash-recorded).
  Ticket detail/list responses include `attachments[]` with presigned GET urls when
  `BUCKET_NAME` is set (`url: null` otherwise, Download hidden); create accepts
  user-namespace-verified `attachmentKeys`. Single-function code (`lambda.js`
  + `aws-server.js`) retained as fallback, not deployed. Runtime **`nodejs22.x`**
  — the plan's Node.js 20 (`nodejs20.x`) was deprecated 2026-04-30. Full cost/ops
  comparison and deploy decision in `RESOURCE_INVENTORY.md`.

## Why this shape

- **JWT authorizer, not a Lambda authorizer:** the authorizer verifies signatures;
  the Lambda only parses already-verified claims (`src/lib/auth.js`). The helpers
  deliberately never verify signatures themselves — local/test token parsing must
  not be mistaken for production verification.
- **DynamoDB path:** existing two tables stay byte-identical until/unless Stage 3
  approves the required `tkt-tickets` (pk/sk) table, which the wired handlers
  already target. See `RESOURCE_INVENTORY.md` schema comparison — no silent migration.
- **Role from `cognito:groups` only:** groups `Customer` / `Agent`. Frontend role
  display is cosmetic; every PUT / view decision is re-checked in the backend.
- **Local mock mode preserved:** `backend/server.js` (mock auth + JSON file + local
  disk) runs with zero config and zero AWS. It can never authenticate the deployed
  path (mock tokens rejected by `getUserFromClaims`, mock routes absent from Lambda).

## Code map

| Path | Purpose |
|---|---|
| `backend/server.js` | **Local Express**: mock-auth required, JSON-file + local-disk attachments. Local-only `/auth/mock-*`, `/mock-uploads/*`. Exact 7 ticket paths |
| `backend/src/lib/mockUsers.js` | Fixture identities + mock mint/verify (role always from fixture). Imported ONLY by `server.js` |
| `backend/scripts/reset-local-data.js` / `smoke-local.js` | Local data reset / 14-step localhost smoke |
| `backend/aws-server.js` | Express + DynamoDB, JWT-required, agent-gated PUT, owner-or-agent reads |
| `backend/lambda.js` | `serverless-http` wrapper (`module.exports.handler`) |
| `backend/src/lib/auth.js` | Claims parsing, `attachUser`, `requireAgent`, `canViewTicket`, `getUserFromLambdaEvent` (pure, tested) |
| `backend/src/lib/validation.js` | Ticket/comment validation, `filterTickets`, `scopeTicketsToUser` (pure, tested) |
| `backend/src/lib/uploads.js` | Presigned-URL validation + user-namespaced key builder (pure, tested) |
| `backend/src/lib/response.js` | Consistent `{ error: { code, message } }` shape + Lambda proxy helpers |
| `backend/tests/` | `node --test` suites, mocked — never call AWS |
| `backend/src/lib/tickets.js` | Shared DynamoDB data-access used by both deploy shapes (injected client, tested) |
| `backend/src/handlers/` | Seven plan-literal handlers, wired to `ticketsSingleTable.js` (env `TABLE_NAME=tkt-tickets`), artifact `backend/dist/ticketing-handlers.zip` — implemented + tested, not deployed |
| `frontend/src/views/Dashboard.vue` | Ticket dashboard (moved from `App.vue`, extended with auth/roles/attachments) |
| `frontend/src/auth/mock.js` | Mock fixtures mirror + session storage (fixture parity tested) |
| `frontend/src/router/index.js` | `/` → `/tickets`, `/tickets` (requiresAuth), `/login`, `/callback` + `beforeEach` guard |
| `frontend/src/views/Login.vue` / `Callback.vue` | Hosted UI entry + authorization-code callback |
| `frontend/src/auth/` | `cognito.js` (UserManager), `useAuth.js` (reactive user), `guard.js` (pure, tested) |
| `frontend/src/router/index.js` | `/`, `/login`, `/callback` + `beforeEach` guard |
| `frontend/src/services/api.js` | Token-aware fetch client, server-side filter params, S3/mock direct upload |

## Local request lifecycle (current phase)

1. `/login` picker → `POST /auth/mock-login {userId}` → `mock.<payload>.local` in
   `sessionStorage` (12 h expiry, no passwords, no secrets).
2. SPA attaches `Authorization: Bearer <mock>`; `server.js` verifies shape + expiry
   and resolves identity/role **from the fixture**, ignoring token role claims.
3. Same 401/403/documented-404 rules as production (shared `validation`/`auth` libs).
4. Attachments: `POST /tickets/presigned-url` returns `{uploadUrl: …/mock-uploads/…,
   mock: true}` (never an S3 URL) → browser PUTs bytes → local disk under
   `data/uploads/<sub>/` → metadata appended to the owned ticket.

## Production request lifecycle (future deployment)

1. User signs in via Cognito Hosted UI (authorization code + PKCE) → tokens in sessionStorage.
2. SPA attaches `Authorization: Bearer <access_token>` to every API call.
3. API Gateway JWT authorizer verifies the token; Lambda receives verified claims.
4. `attachUser({ required: true })` → 401 when claims are absent/invalid.
5. Route handlers: customers scoped to `createdBy === sub`; agents see all;
   `PUT /tickets/{id}` additionally passes `requireAgent` → 403 otherwise.
6. Errors never include stacks, credentials, or internal details.

## Known PoC trade-offs

- `GET /tickets` uses DynamoDB `Scan` + per-ticket comment `Query` (N+1). Fine for a
  handful of tickets; add a `createdBy` GSI only with approval if volume grows.
- Ticket items carry both `ticketId` and duplicate `id` for local-shape compatibility.
- `backend/services/api.js` is dead code (kept, documented in audit); remove after approval.
- Live discovery 2026-10-12: pool `ap-southeast-2_EtwJXz5fb` exists (Essentials,
  MFA off, no add-ons) but is username-based with no clients/groups/domain —
  partially suitable, owner decision pending; untouched by this agent.
