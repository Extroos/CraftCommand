# Security Policy

## Supported Versions

The following versions of CraftCommand are currently supported with security updates:

| Version | Supported                   |
| ------- | --------------------------- |
| 1.6.x   | :white_check_mark: (Stable) |
| 1.5.x   | :warning: (Legacy)          |
| 1.4.x   | :x:                         |

## Reporting a Vulnerability

Security is taken seriously in CraftCommand. If you discover a security vulnerability, please follow these steps:

1. **Do not create a public issue** for security vulnerabilities.
2. Contact me directly through GitHub with:
   - A detailed description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact assessment
   - Suggested fixes (if any)
3. I'll do my best to respond as quickly as possible and work on a fix.
4. Once patched, you'll be publicly credited for the discovery (unless you prefer to remain anonymous).

## Security Architecture (v1.6.0 Stable)

CraftCommand v1.6.0 introduces several critical security hardening measures:

- **Hardened RBAC**: Roles (Owner, Admin, Manager, Viewer) are strictly enforced at both the API and UI levels. Non-privileged roles are prevented from viewing or triggering background updates and file mutations.
- **Zero-Config SSL**: Built-in logic for automatic self-signed certificate generation ensure that local exposures are protected by HTTPS even in development/private environments.
- **Atomic Persistence**: Database and configuration writes use atomic operations to prevent data corruption or partial state injection during system failures.
- **Audit Synchronization**: Every security-sensitive action (Logins, Permission changes, Server deletions) is logged with immutable timestamps.

## Security Best Practices

When using CraftCommand:

- Keep your installation up to date with the latest version
- Use strong authentication for any exposed endpoints
- Review server configurations regularly
- Monitor logs for suspicious activity

Thank you for helping keep CraftCommand safe and secure!
