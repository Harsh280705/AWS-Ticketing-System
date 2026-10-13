# SCP remediation — exact change for the organization owner (PROPOSAL ONLY, not applied)

Status: the CLI session cannot read `p-tsj48uzg` (`DescribePolicy` → AccessDenied),
so its exact statement text is unknown. Nothing below was executed. Do NOT apply
any of this from the member account — only the Organizations management account
(`899810483413`) owner can change SCPs, and detaching/weakening guardrails is
their call alone.

## Verified facts (read-only evidence)

- Denied principal: `arn:aws:sts::517374107239:assumed-role/AccountFullAccessRole/*`
  (member account `517374107239`, org `o-mpoi6ieonm`).
- Denying policy named in live errors: Service Control Policy `p-tsj48uzg`
  (`o-mpoi6ieonm` policy store). Simulation: `explicitDeny`, `AllowedByOrganizations:
  False` on every Stage 2–6 create action.
- The role carries `AdministratorAccess` with no permissions boundary, so no
  identity-side change can help. An additional Allow policy (including
  `admin-scoped-access.json`) CANNOT override an explicit SCP Deny.

## The only effective fix (owner action)

In the management account, narrow the Deny statement(s) in `p-tsj48uzg` so they no
longer match this deployment, using ONE of these minimal edits (owner picks):

**Option A — exclude the deployment principal (smallest blast radius):**
add to the Deny statement's `Condition` block:
```json
"Condition": {
  "StringNotEquals": {
    "aws:PrincipalArn": "arn:aws:iam::517374107239:role/managed/AccountFullAccessRole"
  }
}
```
(If the statement already has a Condition block, merge this key into it; if it uses
`NotAction` scoping instead, confirm with the owner — do not stack overlapping denies.)

**Option B — exclude the ticketing action set account-wide:**
scope the Deny statement with `"NotAction": [...]` listing the Stage 2–6 actions in
`admin-scoped-access.json`, or attach that file's actions as an explicit account-level
allow AND remove/condition the overlapping Deny. Note: an Allow alone changes nothing
while the explicit Deny still matches — the Deny must be narrowed first.

**Option C — detaching route:** move account `517374107239` to an OU without the
restrictive policy, or delegate Stage 2–6 execution to an admin identity outside the
deny scope (see `console-runbook.md`). No new account or organization is created.

## What must NOT change

Unrelated guardrails in the same SCP, other accounts/OUs, billing configuration,
the existing `Tickets`/`TicketComments` tables, or pool `ap-southeast-2_EtwJXz5fb`.
No `*` allowances, no EC2/networking additions, no budget/alarm changes.

## Verification after the owner confirms (read-only, our side)

```powershell
aws sts get-caller-identity --region ap-southeast-2
aws iam simulate-principal-policy --policy-source-arn arn:aws:iam::517374107239:role/managed/AccountFullAccessRole --action-names cognito-idp:CreateUserPool --region ap-southeast-2
```

Only on `allowed` does Stage 2 proceed — one gated stage at a time.
