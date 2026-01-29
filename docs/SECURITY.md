# Security Policy

## Authentication

- **Method**: JSON Web Tokens (JWT).
- **Passwords**: Hashed using `bcryptjs` (Salt Rrounds: 10).
- **Storage**: User credentials are stored in `data/users.json`.

## Authorization

Role-Based Access Control (RBAC) is implemented via `UserRole`:

- `OWNER`: Full System Access + User Management.
- `ADMIN`: Server Management (Start/Stop/Edit).
- `MANAGER`: Limited Server Management.
- `VIEWER`: Read-only access to console/stats.

## File System Security

- **Path Traversal Protection**: Services use sanitized paths.
- **Isolation**: Server instances run in isolated directories within `minecraft_servers/`.
- **Repo Layer**: Direct file I/O is restricted to the Repository Layer (`backend/src/storage/`).

## API Security

- **Socket.IO**: Connection requires a valid JWT Handshake.
- **Validation**: All inputs are validated at the Service boundary.

## Reporting Vulnerabilities

Please do not open GitHub issues for security vulnerabilities.
Contact the development team directly or submit a private report.
