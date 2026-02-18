# 2FA Requirements

## Scope

- **Method**: TOTP (Time-based One-Time Password) via Authenticator apps.
- **Recovery**: 10 one-time use recovery codes.
- **Enforcement**: Optional by user, mandatory for OWNER/ADMIN if system policy is enabled.

## Rules

1. **Per-User Activation**: Users can enable/disable 2FA in their profile.
2. **Safe Enrollment**: Verification must occur before 2FA is formally enabled on the account.
3. **No Lockouts**: Recovery codes must be presented during enrollment and stored by the user.
4. **Auditability**: All 2FA events must be logged in the system Audit Log.
5. **Rate Limiting**: Failed 2FA attempts must be rate-limited to prevent brute-force attacks.

## Policy

- A system-wide setting `require_owner_2fa` will force 2FA for all OWNER accounts.
