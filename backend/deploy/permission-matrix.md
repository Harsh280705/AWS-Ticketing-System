# Permission matrix — deploy identity vs Lambda runtime (reviewed 2026-10-12)

Source of truth for resource/condition support: AWS Service Authorization Reference
+ service permissions references (checked 2026-10-12). Findings labeled
[VERIFIED] (docs-checked) or [PRUDENT] (conservative choice, flagged).

Conventions: deploy identity = the admin-approved principal running Stages 2–6
(governed by `admin-scoped-access.json`); runtime = `tkt-lambda-execution-role`
(governed by `execution-role.json`). Region `ap-southeast-2`, account `517374107239`
embedded in ARNs wherever the action supports it. No deletes, no org/billing,
no compute/networking anywhere.

## 1. Cognito (`cognito-idp`) — deploy identity

[VERIFIED] CreateGroup / CreateUserPoolClient / CreateUserPoolDomain support the
`userpool` resource type; CreateUserPool supports NO resource type (must be `*`);
service condition keys are tag-only, so the old `aws:RequestedRegion` condition was
dropped as unverifiable — region scoping now comes from `userpool/*` ARNs.

| Action | Needed for (runbook) | Resource | Change from v1 proposal |
|---|---|---|---|
| CreateUserPool | Stage 2 pool | `*` (unavoidable) | none — flagged §8 |
| CreateUserPoolClient | SPA client | `userpool/*` (was `*`) | tightened |
| CreateUserPoolDomain | prefix domain | `userpool/*` | **ADDED (was missing)** |
| UpdateUserPoolClient | fix callback/logout URLs | `userpool/*` | **ADDED (fix cycles)** |
| UpdateUserPool | fix email/config | `userpool/*` | **ADDED (fix cycles)** |
| DescribeUserPoolDomain | verify domain | `userpool/*` | **ADDED (was missing)** |
| DescribeUserPool / DescribeUserPoolClient / ListUserPoolClients / ListGroups | verify | `userpool/*` | tightened from `*` |
| ListUserPools | inventory | `*` (unavoidable, read-only) | split out, flagged §8 |
| AdminCreateUser / AdminSetUserPassword / AdminConfirmSignUp / AdminAddUserToGroup / AdminGetUser | test users (owner sets passwords) | `userpool/*` | tightened from `*` |
| DeleteUserPool*, SetUserPoolMfaConfig, TagResource, federation actions | — | — | deliberately excluded |

## 2. DynamoDB (`dynamodb`) — deploy identity

[VERIFIED] `ListTables` supports no resource type (must be `*`); Create/Describe
support table ARNs.

| Action | Needed for | Resource | Change |
|---|---|---|---|
| CreateTable / DescribeTable | Stage 3 `tkt-tickets`; reads of legacy tables | the 3 table ARNs | unchanged |
| ListTables | inventory | `*` (unavoidable, read-only) | **split from table ARNs (old scope was invalid)** |
| UpdateTable / UpdateContinuousBackups / TTL / DeleteTable / TagResource | — | — | excluded (no PITR/changes/deletes/tags) |

## 3. S3 (`s3`) — deploy identity

Bucket ARNs carry no region, so scoping is by name pattern
`arn:aws:s3:::ticketing-attachments-*`. Presigned-URL *signing* needs no IAM
(local crypto); the browser PUT authorizes against the Lambda role.

| Action | Needed for | Resource | Change |
|---|---|---|---|
| CreateBucket / Get+PutPublicAccessBlock / Get+PutBucketCors / ListBucket / HeadBucket | Stage 4 bucket + verify | name-pattern ARN | HeadBucket **ADDED** (existence check) |
| ListAllMyBuckets | — | — | excluded (also org-denied; unnecessary) |
| PutBucketEncryption | — | — | not needed: SSE-S3 default applies automatically to new buckets |
| DeleteBucket / versioning / logging / replication | — | — | excluded |
| Any object action for the deploy identity | — | — | none needed (runtime + browser flows cover it) |

## 4. Lambda (`lambda`) — deploy identity

[PRUDENT] All function-level actions below support function ARNs; `ListFunctions`
needs `*`.

| Action | Needed for | Resource | Change |
|---|---|---|---|
| CreateFunction / GetFunction / GetFunctionConfiguration / UpdateFunctionConfiguration / AddPermission / InvokeFunction | Stage 5 deploy + verify + minimal smoke | `function:tkt-*` | unchanged |
| UpdateFunctionCode | redeploy after fixes (runbook rebuild path) | `function:tkt-*` | **ADDED (was missing)** |
| GetPolicy | verify API GW invoke permission | `function:tkt-*` | **ADDED (was missing)** |
| ListFunctions | inventory | `*` (unavoidable, read-only) | **ADDED, split, flagged §8** |
| DeleteFunction / Tag+Untag / PublishVersion | — | — | excluded (no deletes/tags/versions; $LATEST only) |

## 5. API Gateway v2 (`apigatewayv2`) — deploy identity

Collection reads need the `/apis` collection ARN alongside `/apis/*`.

| Action | Needed for | Resource | Change |
|---|---|---|---|
| CreateApi / CreateAuthorizer / CreateRoute / CreateIntegration / CreateStage / CreateDeployment | Stage 6 | `/apis`, `/apis/*` | collection added |
| UpdateRoute / UpdateIntegration / UpdateAuthorizer / UpdateStage | fix cycles | `/apis/*` | **ADDED (were missing)** |
| GetApis / GetAuthorizers / GetRoutes / GetIntegrations / GetStages / GetDeployments | verify | `/apis`, `/apis/*` | collection added; Stages/Deployments **ADDED** |
| Delete* / TagResource | — | — | excluded |

## 6. IAM (`iam`) — deploy identity

[VERIFIED pattern] `iam:PassedToService` is valid ONLY on `PassRole`; placing it
on CreateRole/PutRolePolicy/GetRole would make those calls FAIL. Split applied.

| Action | Needed for | Resource | Change |
|---|---|---|---|
| PassRole (condition: PassedToService = lambda.amazonaws.com) | attach execution role at CreateFunction | role ARN | **isolated to its own statement (was breaking sibling actions)** |
| CreateRole / PutRolePolicy / GetRole | Stage 5 role (inline policy only) | role ARN, no condition | condition removed |
| GetRolePolicy / ListRolePolicies | verify inline policy | role ARN | **ADDED (were missing)** |
| AttachRolePolicy / CreatePolicy / DeleteRole | — | — | excluded (inline-only, no deletes) |

## 7. CloudWatch Logs (`logs`) — deploy identity

[VERIFIED] `DescribeLogGroups` is a List action with no resource type (must be `*`).

| Action | Needed for | Resource | Change |
|---|---|---|---|
| DescribeLogGroups | find function log groups | `*` (unavoidable, read-only) | **moved off the scoped ARN (old scope was invalid)** |
| FilterLogEvents | read smoke-test logs | `log-group:/aws/lambda/tkt-*` | **ADDED (was missing)** |
| CreateLogGroup/Stream, PutLogEvents | runtime only (execution role) | — | not a deploy permission |

## 8. Unavoidable broad permissions (flagged for administrator approval)

All read-only except one, none cover data mutation beyond the ticketed scope:
`cognito-idp:CreateUserPool` (* — service allows nothing narrower),
`cognito-idp:ListUserPools` (*), `dynamodb:ListTables` (*),
`lambda:ListFunctions` (*), `logs:DescribeLogGroups` (*).
Everything else is scoped to `tkt-*` / `tkt-tickets` + legacy-table reads /
`ticketing-attachments-*` / the single execution-role ARN.

## 9. Runtime permissions (execution role — separate file, verified)

Trust: `lambda.amazonaws.com` AssumeRole only — correct. Data plane actually used
by the code (grep-verified imports: DynamoDB-DocumentClient Get/Put/Scan/Query,
S3 PutObject+GetObject presigning, no KMS/VPC/streams):
`dynamodb:{GetItem,PutItem,Scan,Query}` on `tkt-tickets` ONLY (legacy-table
statement removed — deployed code never touches those tables),
`s3:{PutObject,GetObject}` on `attachments/*` (GetObject **ADDED** — presigned
download URLs authorize against this role),
`logs:{CreateLogGroup,CreateLogStream,PutLogEvents}` scoped to `/aws/lambda/tkt-*`.
No admin rights, no other services.

## 10. Download signing needs no deploy permission

Presigned GET URLs are minted inside `tkt-getTicket`/`tkt-listTickets` with the
function's own credentials when `BUCKET_NAME` is set; without it, attachments
carry `url: null` and the UI hides Download. The deploy identity gains nothing
new from this flow.

## 11. Gaps closed in code by this review (all covered by new tests)

- Attachment keys were never persisted in production (upload returned a key the
  ticket never stored) → keys accepted at create, user-namespace-verified.
- Ticket detail had no working download path (relative-URL fetch only) →
  presigned GET urls on detail/list when configured, `url: null` otherwise.
- `GET /tickets/{id}` dropped comments/activity/ticketId (raw-vs-public mix-up
  in `requireVisibleTicket` consumers) → fixed, regression-tested.
