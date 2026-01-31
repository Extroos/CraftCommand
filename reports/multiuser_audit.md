# Multi-User System Audit Report

## 1. System Overview

Craft Commands uses a Node.js/Express backend with Socket.IO for real-time communication.

- **Language**: TypeScript
- **Storage**: JSON Files (default) or SQLite (optional) via Repository pattern.
- **Client**: React SPA.

## 2. Authentication Architecture

### 2.1 User Storage

- **File**: `users.json` (managed by `UserRepository`).
- **Schema**:
  - `id` (UUID)
  - `email`, `username`
  - `passwordHash` (Bcrypt)
  - `role` (Enum: OWNER, ADMIN, MANAGER, VIEWER)
  - `permissions` (Per-server overrides)

### 2.2 Login Flow

1. User POSTs to `/api/auth/login`.
2. Backend verifies bcrypt hash.
3. Backend generates a **Session Token**.
   - **Current Implementation**: `Base64(userId:timestamp)`
   - **Critical Vulnerability**: This token is NOT signed. Anyone who guesses a User UUID can forge a token.
4. Token returned to client (stored in likely `localStorage` or memory).

### 2.3 Request Authentication

- **REST**: `authMiddleware.verifyToken` decodes the Base64 token and fetches the user.
- **Socket**: `socketAuthMiddleware` performs the same check during the `handshake`.
  - **Technical Debt**: Socket middleware reads `users.json` directly from disk instead of using `UserRepository`.

---

## 3. Authorization & Permissions

### 3.1 Architecture

- **Service**: `PermissionService` (Singleton).
- **Model**: Role-Based Access Control (RBAC) with optional per-server ACL overrides.
- **Storage**: Hardcoded Role definitions in code; per-user overrides in `users.json`.

### 3.2 Roles (Current Hardcoded Definitions)

| Role        | Permissions                                                  |
| ----------- | ------------------------------------------------------------ |
| **OWNER**   | Full Access (Bypasses checks)                                |
| **ADMIN**   | `users.manage`, `server.*` (All server actions)              |
| **MANAGER** | `server.*` (but NO `users.manage`)                           |
| **VIEWER**  | `server.view`, `server.console` (Read?), `server.files.read` |

### 3.3 Gaps identified vs Requirements

1. **Granularity**: "Console" permission is currently shared (Read/Write unclear differentiation).
2. **Missing Permissions**:
   - `server.players.manage`
   - `server.backups.manage`
   - `server.restart` (Merged with start/stop currently?)
3. **Enforcement**:
   - `server.command` permission exists but need to verify strict enforcement on the socket `command` event.

---

## 4. Security Critical Findings

### 🚨 High Severity

- **Insecure Token**: The "Access Token" is a simple Base64 string. It lacks a cryptographic signature (HMAC/RSA).
  - **Risk**: Identity Spoofing.
  - **Remediation**: Must replace with signed JWT or Session ID.

### ⚠️ Medium Severity

- **Missing Rate Limiting**: No protection against brute-force login attempts found in `AuthService`.
- **Inconsistent Data Access**: logic duplication between REST auth and Socket auth.

### ℹ️ Low Severity

- **Session invalidation**: Tokens rely on timestamp but don't seem to have an expiration check in the code snippet viewed.

---

## 5. Implementation Plan (Phase 2)

1. **Fix Token Generation**: Switch to `jsonwebtoken` immediately.
2. **Expand Permission Enums**: Add the granular permissions requested (`server.console.read`, `server.console.write`).
3. **Update Role Definitions**: Split generic `server.console` into Read/Write for Viewers vs Managers.
4. **Implement Socket Guards**: Ensure every socket event checks `permissionService.can()`.
