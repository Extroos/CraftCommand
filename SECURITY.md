# Security Policy

## Supported Versions

The following versions of CraftCommand are currently supported with security updates:

| Version | Supported                   |
| ------- | --------------------------- |
| 1.10.x  | :white_check_mark: (Stable) |
| 1.9.x   | :warning: (Legacy)          |
| < 1.9   | :x:                         |

## Reporting a Vulnerability

**Do not create a public issue** for security vulnerabilities. Security is taken seriously, and I aim to patch critical issues within 48 hours of verification.

Please contact me directly through GitHub or via the [Discord](https://discord.gg/craftcommands) priority support channel with:

- A detailed description of the vulnerability.
- Steps to reproduce the issue (PoC/Exploit).
- Potential impact assessment.
- Suggested fixes (if any).

Once a patch is released, you will be credited for the discovery unless you prefer to remain anonymous.

## Hardening Measures (v1.10.0+)

CraftCommand implements several layers of defense-in-depth:

- **Trio-State RBAC Engine**: Granular permissions (Inherit, Allow, Deny) with strict role isolation: **Owner > Admin > Manager > Viewer**.
- **Hierarchical Guard System**: Prevents staff from elevating their own privileges or modifying accounts higher in the hierarchy.
- **Network Isolation**: Backend services bind to `127.0.0.1` by default. Remote exposure requires explicit opt-in and owner-level "Remote Access Mode" activation.
- **Zero-Config SSL**: Automated self-signed certificate generation protects local LAN traffic with HTTPS/TLS.
- **Atomic Persistence Layer**: Database and configuration writes use atomic operations to prevent data corruption or partial state injection during system crashes.
- **Audit Synchronization**: Immutable logging of all sensitive actions (Permission changes, Logins, Server management) with high-fidelity timestamps.
- **Session Security**: JWT-based authentication with `bcryptjs` hashing and industry-standard token rotation.

## File System & Runtime Security

- **Path Traversal Protection**: All file-based operations use strict sanitization and validation to prevent directory traversal.
- **Instance Isolation**: Minecraft servers run in isolated subdirectories within `minecraft_servers/`.
- **Repository Pattern**: Direct file I/O is abstracted and restricted to the Repository Layer, preventing ad-hoc file mutations elsewhere in the codebase.

## Security Best Practices

- **Update Regularly**: Always run the latest stable version from the `main` branch.
- **Environment Safety**: Review allowed IPs in `servers.json` and keep `2FA` enabled for sensitive roles.
- **Monitor Audit Logs**: Regularly check the Audit Log tab for suspicious entry or configuration patterns.

Thank you for helping keep the CraftCommand ecosystem safe and secure!
