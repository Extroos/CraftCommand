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

## v1.12.x: Security & Modpack Intelligence

Version 1.12.0 is a mandatory security update.

- **2FA Migration**: If you previously used a placeholder 2FA guide, you must now enable the **Native 2FA Security Suite** in your Profile settings.
- **Mobile Optimization**: This version introduces a professional `viewport` meta tag. If you are using a custom frontend build, ensure your `index.html` is synchronized with the latest source to enable mobile responsiveness.
- **Diagnostic Skip Logic**: On first boot of a fresh server, the "Doctor" diagnostic engine will now skip certain unnecessary checks (like EULA) until the first attempted start to reduce noise.
- **Modpack Stabilization**: Transitioning to v1.12.0 automatically enables **Triple-Layer Mod Stabilization**. Your existing modpacks will be scanned for client-side only mods upon the next server restart.

## v1.11.x: Systems Integrity & Signatures

## v1.10.x: Distributed Ops & DB Migration

v1.10.x represents a significant architectural shift. Note the following:

### 1. Root Module System

The project has moved away from a root-level `"type": "module"` configuration to improve compatibility with native Node.js scripts. Ensure your custom scripts use `require()` or `ts-node` for imports.

### 2. Node Re-Enrollment

If you were using early beta multi-node features, your workers must be re-paired using the **Add Node Wizard** in the Global Settings tab.

### 3. Database Migration

The system will automatically migrate your JSON schema on the first boot. If you see a "Migrating..." splash screen, **do not interrupt the process**.

## Troubleshooting Upgrade Failures

- **`ERR_REQUIRE_ESM`**: Confirm that `package.json` in the root does **NOT** contain `"type": "module"`.
- **404 Errors**: Ensure you have run `npm run build` in the `frontend` folder to generate the latest static assets.

---

_For additional help, visit the [Troubleshooting Guide](support/TROUBLESHOOTING.md)._
