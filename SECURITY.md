# Security Policy

## Supported Versions

The following versions of Craft Commands are currently supported with security updates:

| Version | Supported                   |
| ------- | --------------------------- |
| 1.7.x   | :white_check_mark: (Stable) |
| 1.6.x   | :warning: (Legacy)          |
| 1.5.x   | :x:                         |

## Reporting a Vulnerability

Security is taken seriously in Craft Commands. If you discover a security vulnerability, please follow these steps:

1. **Do not create a public issue** for security vulnerabilities.
2. Contact me directly through GitHub with:
   - A detailed description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact assessment
   - Suggested fixes (if any)
3. I'll do my best to respond as quickly as possible and work on a fix.
4. Once patched, you'll be publicly credited for the discovery (unless you prefer to remain anonymous).

## Security Architecture (v1.7.0 Stable)

Craft Commands v1.7.0 introduces several critical security hardening measures:

- **Granular Permissions & Overrides**: A 3-state permission engine (Inherited, Allow, Deny) with explicit server-level and global system-wide overrides.
- **Hardened Hierarchical Guards**: Strict enforcement of role hierarchy (Owner > Admin > Manager > Viewer) that prevents staff from elevating their own or others' rights beyond their assigned scope.
- **Global System Rights**: Controlled access to system-wide actions like user management and server provisioning, restricted to the Owner and authorized Admins.
- **Zero-Config SSL**: Built-in logic for automatic self-signed certificate generation ensure that local exposures are protected by HTTPS even in development/private environments.
- **Atomic Persistence**: Database and configuration writes use atomic operations to prevent data corruption or partial state injection during system failures.
- **Audit Synchronization**: Every security-sensitive action (Logins, Permission changes, Server deletions) is logged with immutable timestamps.

## Security Best Practices

When using Craft Commands:

- Keep your installation up to date with the latest version
- Use strong authentication for any exposed endpoints
- Review server configurations regularly
- Monitor logs for suspicious activity

Thank you for helping keep Craft Commands safe and secure!
