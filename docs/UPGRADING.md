# Upgrading CraftCommand

This guide ensures a safe transition between major and minor releases of CraftCommand. Following these steps preserves your server data, user accounts, and configurations.

## ⚠️ Pre-Upgrade Requirements

1.  **STOP ALL SERVERS**: Use the "Global Stop" action or the `Emergency Disable` script.
2.  **BACKUP DATA**: Copy the `backend/data/` and `minecraft_servers/` directories to a safe location.

---

## Upgrade Flow 1: Safe Web Update (Recommended)

As of **v1.11.3**, CraftCommand features an integrated update engine that handles the heavy lifting safely.

1.  **Navigate** to `Global Settings > System Update`.
2.  **Check for Updates**: The system will verify signature integrity and Node.js compatibility.
3.  **Download & Prepare**: The system will download the signed bundle and prepare an atomic swap.
4.  **Install & Restart**: Once ready, click "Restart to Apply". The system will perform an atomic folder swap and preserve your data.

## Upgrade Flow 2: Manual Git (Technical)

If you are a developer or using a custom fork:

1.  **Fetch Latest**: `git pull origin main`
2.  **Update Dependencies**: `npm run install:all`
3.  **Rebuild Assets**: `npm run build --prefix frontend`
4.  **Restart**: Execute `run_CraftCommand.bat`.

---

## v1.12.x: Security & Mod/Plugin Filtering

Version 1.12.5 implements critical security and dependency resolution updates.

- **2FA Migration**: Users MUST migrate to the native TOTP implementation. Secrets are hashed and encrypted via the primary security service.
- **Frontend Assets**: Introduction of standard `viewport` meta tags for cross-device visibility. Custom builds require synchronization with the current `index.html` template.
- **Diagnostic Heuristics**: Automated startup checks now utilize a suppression window to prevent redundant diagnostic flags during initial server provisioning.
- **Mod/Plugin Quarantining**: The update enables automated side-specific filtering. Artifacts tagged as `client-only` by the Modrinth API are migrated to `_client_mods/` to ensure Java runtime stability.

## v1.11.x: Systems Integrity & Signatures

## v1.10.x: Distributed Ops & DB Migration

v1.10.x represents a significant architectural shift.

### 1. Root Module System

The project has moved away from a root-level `"type": "module"` configuration to improve compatibility with native Node.js scripts. Ensure your custom scripts use `require()` or `ts-node` for imports.

### 2. Node Re-Enrollment

Worker agents deployed during the beta phase must be re-initialized via the **Node Registry** to establish a secure Ed25519 identity and update the WebSocket handshake protocol.

### 3. Database Migration

The system will automatically migrate your JSON schema on the first boot. If you see a "Migrating..." splash screen, **do not interrupt the process**.

## Troubleshooting Upgrade Failures

- **`ERR_REQUIRE_ESM`**: Confirm that `package.json` in the root does **NOT** contain `"type": "module"`.
- **404 Errors**: Ensure you have run `npm run build` in the `frontend` folder to generate the latest static assets.

---

_For additional help, visit the [Troubleshooting Guide](support/TROUBLESHOOTING.md)._
