# 2FA Data Model

## UserProfile Updates

The following fields are added to the `UserProfile` interface:

- `twoFactorEnabled`: boolean (default: false)
- `twoFactorSecretEncrypted`: string (TOTP secret, encrypted at rest)
- `twoFactorVerifiedAt`: number (timestamp of last successful verification during setup)
- `twoFactorBackupCodesHashed`: string[] (hashed recovery codes)
- `twoFactorPendingSecretEncrypted`: string (temporary secret during setup)
- `twoFactorPendingCreatedAt`: number (timestamp for pending secret expiration)

## Security Rules

1. **Secrets**: Never store plain secrets. Even if the DB is JSON/SQLite, we should use a system-level encryption key (from `.env`) to encrypt `twoFactorSecretEncrypted`.
2. **Backup Codes**: Stored as bcrypt hashes. Only displayed once to the user during enrollment.
3. **Pending Secrets**: Expire after 10 minutes. Only one pending secret per user.
4. **State Transitions**: `twoFactorEnabled` only becomes `true` after a successful `POST /2fa/setup/confirm` which validates a live TOTP code against the `pendingSecret`.
