# Cognito settings — Stage 2 (NOT APPLIED, console path by you)

- Pool name: `ticketing-pool` · Region: `ap-southeast-2` · Tier: **Essentials**
  (verify on the review screen; never Plus; MFA None; threat protection OFF).
- Sign-in: email · Self-registration ON · Verify email via Cognito default sender ·
  Required attributes: email only (no phone) · Recovery: email-only.
- No Lambda triggers · No social/SAML/OIDC providers · No machine-to-machine grants ·
  No SES/custom senders · No custom domain.
- App client: SPA, **no secret**, authorization-code-grant only,
  scopes `openid email profile`, callback `http://localhost:5173/callback`,
  sign-out `http://localhost:5173/`.
- Prefix domain `<unique>.auth.ap-southeast-2.amazoncognito.com`.
- Groups `Customer`, `Agent` (no IAM roles). Test users customer-a/customer-b/agent-1
  created+confirmed by you; agent-1 into `Agent`; agent signs in again for the claim.

Pricing review: Essentials default; 10,000 direct-MAU free tier shared per
account/org (not GovCloud-excluded here); ~3 test users ⇒ expected $0, overage
$0.015/MAU. CLI cannot prove org-level allowance consumption — confirm the Billing
console Free Tier page before creation (Stage 2 proposal repeats this).
