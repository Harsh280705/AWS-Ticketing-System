# Administrator request — unblock ticketing-project deployment (REVIEW ONLY, nothing applied)

To: AWS Organizations / account administrator for member account `517374107239`
From: Ticketing System deployment (training project, region `ap-southeast-2`)
Date: 2026-10-12 (UTC)
Status: SCP denial still active — NO resource creation attempted; this is a handover, not an execution log.

## Owner decisions (binding on this deployment)

1. **Cognito:** create a NEW email-based pool per `cognito-new-pool.spec.json`.
   Do NOT adopt, modify, or delete pool `ap-southeast-2_EtwJXz5fb`. The new pool
   is created only after authorization is available.
2. **Proposal documents:** `admin-scoped-access.json` + `permission-matrix.md` are
   the review proposal (not applied). Do not modify AWS Organizations to review them.
3. **DynamoDB:** new `tkt-tickets` table, `pk`/`sk` String keys, **on-demand**
   capacity. `Tickets` and `TicketComments` preserved completely — no delete,
   migrate, or reconfigure.
4. **Test users:** `customer-a`, `customer-b`, `agent-1` created only after Cognito
   deploys, via the runbook flow. Passwords are set interactively by the owner and
   never written to the repository, chat, or reports.
5. **Budget:** no budget or billing alarm is created now. Manual billing checks
   continue (see below); alert configuration needs a separate approval + permissions.
6. **Cost control:** frontend stays local at `http://localhost:5173`. No CloudFront,
   hosting stacks, load tests, or repeated suites. Zero cost is never promised.

## Problem (verified, read-only)

All resource-creation calls from the login session
(`arn:aws:sts::517374107239:assumed-role/AccountFullAccessRole/<session>`) are
denied by Service Control Policy
`arn:aws:organizations::899810483413:policy/o-mpoi6ieonm/service_control_policy/p-tsj48uzg`.
Live errors name this SCP explicitly (e.g. `sns:ListTopics`, `s3:ListAllMyBuckets`);
`simulate-principal-policy` returns `explicitDeny` with `AllowedByOrganizations: False`
for `cognito-idp:CreateUserPool`, `s3:CreateBucket`, `dynamodb:CreateTable` (and all
other Stage 2–6 creates). The role itself carries `AdministratorAccess` with **no
permissions boundary**, so this is purely an organization-level denial — nothing on
our side can override it, and we will not try.

## Minimum ask (pick ONE)

- **Option 1 (preferred):** scoped SCP exception for the deployment identity, limited
  to the actions/region/resources in `admin-scoped-access.json` (this folder),
  ap-southeast-2 only, ticketing resources only. Time-box it if your policy allows.
- **Option 2:** execute the runbook yourself — `backend/deploy/console-runbook.md`
  (stages 2–6, console click-paths + exact settings). We supply values; you click.
- **Option 3:** run the Stage 2–6 creates from an admin identity and hand back the
  Pool ID, client ID, domain URL, bucket name, function names, and API invoke URL.

## What we will NOT ask for

No `*` actions, no EC2/RDS/networking, no Organizations/billing changes, no deletes
of existing data, no Plus/advanced-security features, no region switching, no secret
handling by chat. Deployment stays single-digit-request verified with logging minimal.

## Five broad permissions in the proposal (why each is needed + narrower alternative)

1. `cognito-idp:CreateUserPool` on `*` — the service defines no resource type for
   this action, so scoping is impossible. Blast radius: creates one reviewed pool.
2. `cognito-idp:ListUserPools` on `*` — read-only inventory/name-collision check;
   no narrower form exists.
3. `dynamodb:ListTables` on `*` — read-only presence checks; no narrower form exists.
4. `lambda:ListFunctions` on `*` — read-only duplicate-name avoidance; no narrower form exists.
5. `logs:DescribeLogGroups` on `*` — read-only log-group lookup; the List action
   supports no resource type.

Everything else is scoped to `tkt-*` functions, the three named tables,
`ticketing-attachments-*`, the `userpool/*` ARN pattern, the single execution-role
ARN, and `/apis` paths. Full action-by-action evidence: `permission-matrix.md`.

## Manual billing checks (until an alert is approved)

- Billing console → *Bills* (confirm $0 MTD) and → *Free Tier* (Cognito 10,000 MAU
  status) before Stage 2. Zero permissions required; the project owner runs these.
- To configure an alert later needs: `cloudwatch:PutMetricAlarm` in us-east-1
  (currently SCP-denied — needs an org exception) or `budgets:CreateBudget` plus a
  notification email (separate owner approval). Neither is created now.

## Cost note (for your approval record)

Expected at PoC scale: ~$0 idle (Cognito Essentials inside 10,000 free MAU with ~3
test users; on-demand DynamoDB $0 when idle; Lambda/S3/API-GW pennies per smoke
request). Nothing is claimed free without account-terms confirmation; the budget
decision is separately gated with the project owner. Training credits are not
treated as permission.

## Evidence bundle (all read-only, reproducible)

- `aws sts get-caller-identity --region ap-southeast-2` → account `517374107239`.
- `aws iam get-role --role-name AccountFullAccessRole` → AdministratorAccess, no boundary.
- `aws iam simulate-principal-policy --policy-source-arn
  arn:aws:iam::517374107239:role/managed/AccountFullAccessRole
  --action-names cognito-idp:CreateUserPool s3:CreateBucket dynamodb:CreateTable`
  → `explicitDeny`, `AllowedByOrganizations: False` for all three.
- Prior live denies name SCP `p-tsj48uzg` (org `899810483413`).

## Next command after you confirm the fix (read-only re-check, our side)

`aws sts get-caller-identity --region ap-southeast-2` plus ONE simulation re-check of
`cognito-idp:CreateUserPool`. Only on `allowed` do we proceed to Stage 2 creates —
one stage at a time, owner-approved, verified before continuing.
