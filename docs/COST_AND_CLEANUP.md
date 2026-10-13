# Cost & Cleanup

> Local phase: $0 by construction — everything runs on localhost; no AWS API is
> called at all. The notes below govern the future deployment phase.

> I do not claim any service below is free in your account. Charges and credit/Free
> Tier eligibility depend on your account terms and usage. When in doubt: stop and ask.

## Billing posture

- Verified read-only 2026-10-12: **no CloudWatch alarms** in us-east-1 (where billing
  alarms live), **no budgets visible** via `describe-budgets`, and Cost Explorer
  month-to-date (Oct 1–12) `UnblendedCost` = **$0.00 USD (estimated)**.
- The execution checklist's billing alert is therefore **NOT configured**. Creating
  one (a billing alarm needs us-east-1 CloudWatch + billing-metric access; a budget
  needs Billing permissions and can send paid SNS/email notifications) requires your
  approval — I have not created either and will not without it.

- Tables `Tickets` / `TicketComments` are **provisioned 1 RCU / 1 WCU** (verified via
  `describe-table`). Provisioned capacity can bill even with zero traffic. Do NOT
  change billing mode, enable autoscaling, PITR, backups, global tables, or
  replication without approval.
- No EC2, RDS, NAT gateway, load balancer, VPC endpoint, or paid support will be
  created by this project. None exist for it today.
- S3: no versioning/replication/logging (would multiply storage/request charges).
- CloudWatch: Lambda/API Gateway emit logs per invocation — keep live tests to a
  handful of requests and do not delete log groups blindly.

## Cost risks per pending action

| Action | Possible charges | Mitigation |
|---|---|---|
| Cognito pool + test users | Monthly-active-user charges may apply | Create pool on approval; only the users you create in Console; delete test users after |
| `tkt-tickets` table (Stage 3, if approved) | Provisioned 1 RCU/1 WCU ≈ existing tables' profile; on-demand alternative is pay-per-request | Minimal config, no PITR/GSI; confirm against account terms at approval; never claimed free |
| S3 bucket + uploads | Storage + PUT/GET requests | Tiny approved test files only; lifecycle cleanup after tests |
| Lambda deploys + invokes | Requests + GB-seconds + log ingestion | One deploy at a time; single-digit smoke invocations |
| API Gateway HTTP API | Per-request charges | No polling/load tests; verify then stop |
| DynamoDB scans (list route) | Read units (N+1 comment queries) | Few tickets during tests; document, don't scan repeatedly |
| `aws configure` rewrites | Could break working login session | Never run without approval |

## Test discipline (anti-burn rules)

- Prefer `npm test` / `npm run build` (zero AWS cost) — they already cover validation,
  authz, presigned-URL logic, 401/403 guards, and route guards.
- Live AWS tests only after Stage C approval: create 1–2 tickets, 1 comment, 1 tiny
  upload; then delete test items. Never loop, poll, or load-test.
- Never upload large files or repeatedly upload/delete objects.

## Local cleanup (this phase)

- `Set-Location backend; npm run reset:demo` — clears `data/tickets.json` + `data/uploads/`.
- Smoke tests use isolated temp dirs (deleted afterwards) and never touch demo data.
- `data/uploads/` and `.env*` are ignore-listed (`backend/.gitignore`) for the future.

## AWS cleanup (future deployment phase, approval-gated)

```powershell
# Verify first (read-only):
aws apigatewayv2 get-apis --region ap-southeast-2
aws lambda list-functions --region ap-southeast-2
aws s3api list-buckets --region ap-southeast-2
aws cognito-idp list-user-pools --max-results 20 --region ap-southeast-2
```

1. Delete test tickets/comments (Console or one approved CLI call), empty the S3 bucket.
2. Delete HTTP API, then Lambda function, then S3 bucket, then User Pool — each with
   your explicit approval, confirming names/ARNs first.
3. **Keep** the two DynamoDB tables unless you explicitly ask to remove them (they hold
   your data and cost the least to leave idle; confirm billing first).
4. Remove `.env.local` from any shared machine; never commit it (no `.env` files are
   committed today — verified).
