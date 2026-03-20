# 2FA Data Model

## UserProfile Updates

The following fields are added to the `UserProfile` interface:

- `twoFactorEnabled`: boolean (default: false)
- `twoFactorSecretEncrypted`: string (TOTP secret, encrypted at rest)
- `twoFactorVerifiedAt`: number (timestamp of last successful verification during setup)
- `twoFactorBackupCodesHashed`: string[] (hashed recovery codes)
- `twoFactorPendingSecretEncrypted`: string (temporary secret during setup)
- `twoFactorPendingCreatedAt`: number (timestamp for pending secret expiration)

## Security Rules (v1.12.0 Implementation)

1. **Secrets**: Never stored in plain-text. We use **AES-256-CBC encryption** with a system-level `ENCRYPTION_KEY` (managed via `.env`).
2. **Backup Codes**: Stored as **bcrypt hashes**. Only displayed once to the user during enrollment. Verified using `bcrypt.compare`.
3. **Pending Secrets**: Expire after 10 minutes. Only one pending secret per user is stored at any time.
4. **Session Revocation**: Integrated via `SessionRepository`. Allows invalidating specific tokens (`jti`) upon role change or user-initiated "Logout All Devices."
5. **State Transitions**: `twoFactorEnabled` only becomes `true` after a successful `POST /2fa/setup/confirm` which validates a live TOTP code against the `pendingSecret`.
