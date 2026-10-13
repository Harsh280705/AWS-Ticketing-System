# Local Development

Windows PowerShell + VS Code. No AWS credentials, no AWS charges for anything below.
**No AWS API is called in this phase** — not even read-only discovery.

## Prerequisites

- Node.js 22 (`node --version` → v22.x; verified v22.18.0)
- No global installs needed. No git repo here (nothing to commit/reset).

## Run (two terminals, existing ports)

```powershell
# Terminal 1 — backend demo API → http://localhost:3000
Set-Location "D:\Yantra3loka LLP\Training\Week 4 (12 October to 18 October)\AWS Ticketing System\backend"
npm install        # once
npm start
```

```powershell
# Terminal 2 — frontend → http://localhost:5173
Set-Location "D:\Yantra3loka LLP\Training\Week 4 (12 October to 18 October)\AWS Ticketing System\frontend"
npm install        # once
npm run dev
```

Open `http://localhost:5173` → `/login` → pick a test user → `/tickets`.

## Mock authentication (vs real Cognito)

| | Local mock (default) | Production Cognito (later) |
|---|---|---|
| Users | `customer-a`, `customer-b` (Customer), `agent-1` (Agent) | Cognito users in `Customer`/`Agent` groups |
| Login | `/login` picker, no passwords | Hosted UI, code + PKCE (`oidc-client-ts`) |
| Token | `mock.<payload>.local`, 12 h, minted by `POST /auth/mock-login` | Cognito JWT, verified by API GW authorizer |
| Storage | `sessionStorage` (survives reload, per tab) | `sessionStorage` via `oidc-client-ts` |
| Role source | backend fixture lookup (token role claims ignored) | `cognito:groups` claim |
| Label | **LOCAL MOCK AUTH** badges + banner | Agent/Customer environment tag |

Switch users any time via top-bar *Switch user* / *Sign out*. Expired/invalid tokens
→ 401 → session cleared → guard returns you to `/login`.

**Mock can never leak to production:** only `server.js` imports `mockUsers.js`;
`auth.js getUserFromClaims()` rejects `mock:true` claims (tested); the deployed API
has no `/auth/mock-*` or `/mock-uploads/*` routes.

## Persistence (vs DynamoDB/S3)

- Tickets/comments/activity/attachment metadata: `backend/data/tickets.json`
  (survives restarts; legacy `local-demo-user` ticket is visible to `agent-1` only).
- Uploaded bytes: `backend/data/uploads/<sub>/<uuid>-<file>` (served back with
  auth + traversal protection). Ignored for version control (`backend/.gitignore`).
- Reset ONLY local data: `Set-Location backend; npm run reset:demo`
  (clears JSON + uploads; never touches AWS).

## Configuration (no secrets)

```powershell
Copy-Item frontend\.env.example frontend\.env.local   # optional; empty Cognito vars = mock mode
```

| Variable | Local | Live (after future deployment approval) |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000` | API Gateway invoke URL |
| `VITE_COGNITO_AUTHORITY` | _(empty)_ | `https://<prefix>.auth.ap-southeast-2.amazoncognito.com` |
| `VITE_COGNITO_CLIENT_ID` | _(empty)_ | app client id |
| `VITE_REDIRECT_URI` | `http://localhost:5173/callback` | same |

Backend knows `PORT` (default 3000), `DATA_FILE`, `UPLOAD_DIR`, `ALLOW_MOCK_AUTH=true`
(never set this anywhere near production code).

## Verify

```powershell
Set-Location backend
npm test        # 69 tests: validation, authz, 401/403/404, spoof rejection, handlers, local stack
npm run smoke   # 14-step localhost end-to-end (isolated temp data)
Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 5

Set-Location ..\frontend
npm test        # 9 tests: route guards, mock helpers, fixture parity
npm run build   # production build check
```

Safe commands reference:

| Command | Safe? |
|---|---|
| `node --check`, `npm test`, `npm run build/smoke`, localhost `Invoke-RestMethod` | Yes — local only |
| Any `aws *` create/update/delete/put/upload, SAM/CDK/Terraform, console "Create" | **Forbidden this phase — do not run** |
| `aws configure`, region/permission/billing changes | **Forbidden this phase** |

## Troubleshooting

- `401` in UI → session expired: sign in again via *Switch user*.
- Backend port busy → another `node server.js` is running; stop it or `PORT=3001 npm start`
  (then set `VITE_API_URL=http://localhost:3001` in `frontend/.env.local`).
- Accidentally polluted demo data → `npm run reset:demo` in `backend/`.
- Frontend shows raw error banner → backend not running: start Terminal 1 first.
