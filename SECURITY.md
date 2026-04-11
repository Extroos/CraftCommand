# Security Policy

## Supported Versions

| Version         | Supported                    |
| --------------- | ---------------------------- |
| 1.13.x (Active) | :test_tube: (Beta)         |
| 1.11.x (Stable) | :white_check_mark: (Legacy) |
| < 1.11          | :no_entry_sign: (EOL)      |

## Reporting a Vulnerability

**Do not create a public issue** for security vulnerabilities. Security is taken seriously, and I aim to patch critical issues within 48 hours of verification.

Please contact me directly through GitHub or via the [Discord](https://discord.gg/craftcommands) priority support channel with:

- A detailed description of the vulnerability.
- Steps to reproduce the issue (PoC/Exploit).
- Potential impact assessment.
- Suggested fixes (if any).

Once a patch is released, you will be credited for the discovery unless you prefer to remain anonymous.

## Core Security Infrastructure

CraftCommand implements several layers of defense-in-depth:

- **Role-Based Access Control (RBAC)**: Granular permissions with Inherit/Allow/Deny states. Strict role hierarchy: **Owner > Admin > Manager > Viewer**.
- **Privilege Escalation Guards**: Users cannot modify accounts with higher privileges or elevate their own role.
- **Hardware Throttling**: OS-level resource enforcement (Windows Job Objects / Linux Cgroups) prevents a compromised or runaway server from crashing the host.
- **Automatic Repair Integrity**: Diagnostic rules are now lazily loaded and isolated to prevent circular dependency deadlocks and runtime failures during critical healing operations.
- **WebSocket-First Transport**: Real-time communication is hardened against session hijacking and 400 polling errors via mandatory WebSocket prioritization.
- **Network Binding**: Backend binds to `127.0.0.1` by default. Remote access requires explicit opt-in by the owner.
- **Emergency Disconnect**: Immediate termination of all external bridges (tunnels, proxies) when triggered.
- **Update Verification**: All updates are signed and verified via SHA256 hashing before application.
- **Session Security**: JWT-based auth with `bcryptjs` password hashing and session revocation support.
- **Audit Logging**: All sensitive actions (permission changes, logins, server management) are logged with timestamps.

## File System & Runtime Isolation

- **Path Traversal Protection**: All file operations use strict sanitization and `path.resolve` validation to prevent directory traversal.
- **Process Isolation**: Minecraft servers run in dedicated subdirectories with restricted environment variables. Sensitive secrets (JWT_SECRET) are stripped from the child process environment.
- **Repository Pattern**: Data persistence is abstracted behind an ACID-compliant repository layer to prevent ad-hoc file mutations or corruption.

## Security Best Practices

- **Update Regularly**: Always run the latest stable version from the `main` branch to receive security patches.
- **Environment Safety**: Review allowed IPs in `servers.json` and keep 2FA enabled for admin roles.
- **Monitor Audit Logs**: Regularly check the Audit Log tab for suspicious activity.

Thank you for helping keep the CraftCommand ecosystem safe and secure!
