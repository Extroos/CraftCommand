# Authentication & Permissions

## Purpose

Manages user identities, session persistence, and role-based access control (RBAC).

## Scope

- **Identity Store**: `users.json` repository with BCrypt hashing.
- **Authentication**: JWT issuance and TOTP-based 2FA.
- **Authorization**: RBAC enforcement via `ROLE_HIERARCHY`.
- **Profiles**: User preferences, avatars, and notification metadata.

## Invariants (Do Not Break)

- **Role Hierarchy**: `OWNER` (3) > `ADMIN` (2) > `MANAGER` (1) > `USER` (0).
- **One Owner Rule**: There MUST always be exactly one `OWNER` account. Downgrading the last owner is forbidden.
- **Role Elevation Guard**: Non-OWNERs cannot create or promote users to a role equal to or higher than their own.
- **Deep Merge Persistence**: User profile updates use recursive merging (especially for `serverAcl` and `preferences`) to prevent state desync.
- **2FA Encryption**: Secrets are stored using **AES-256-CBC** encryption with an environment-level `ENCRYPTION_KEY`.
- **JWT Security**: Tokens MUST be signed with `JWT_SECRET`, expire after a reasonable window, and include a unique session identifier (`jti`).
- **Session Revocation**: The system MUST verify session validity (via `jti`) on every authenticated request. Revoked sessions immediately invalidate the associated JWT.
- **Password Safety**: Raw passwords MUST NEVER be stored. Hashing with BCrypt (Cost: 10) is mandatory.
- **Avatar Identity**: Updates to `minecraftIgn` automatically trigger an avatar refresh via `minotar.net`.

## Key Flows

### 1. Authentication Workflow
1. **Credentials**: Email/password comparison via BCrypt.
2. **2FA Check**: Returns `partial` token if TOTP is active; full token requires code verification.
3. **Session**: Returns signed JWT with `jti` session identifier.

### 2. Authorization (RBAC)

1. **Middleware**: Routes use `requireRole` middleware.
2. **Check**: Compares `actorRole` value against the required role for the endpoint.
3. **Audit**: Failed access attempts are logged via `AuditService`.

## Verified Entry Points / File Map

### backend

- **Auth Engine**: [AuthService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/auth/AuthService.ts)
- **Permission Mapping**: [PermissionService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/auth/PermissionService.ts)
- **Route Handlers**: [auth.routes.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/auth/auth.routes.ts)
- **Global Constants**: `@shared/constants/roles.ts`

### frontend

- **Login Page**: `frontend/src/features/auth/LoginPage.tsx`
- **Users Manager**: `frontend/src/features/auth/UserManager.tsx`
- **Auth Provider**: `frontend/src/context/AuthContext.tsx`

## Security Constraints
- **Throttling**: Login routes are rate-limited to prevent brute-force attacks.
- **Verification**: Profile updates (emails, usernames) are validated for format and uniqueness.
- **Persistence**: User profile updates use recursive merging to prevent state loss.

## Testing Checklist + Done

- [x] Verify default `OWNER` account is created on first run (admin/admin).
- [x] Verify `MANAGER` cannot access `OWNER`-only settings.
- [ ] Test 2FA recovery flow (if implemented).
- [ ] Verify JWT expiration correctly triggers a logout on the frontend.
