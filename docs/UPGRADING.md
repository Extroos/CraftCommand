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

## v1.11.x: Systems Integrity & Signatures

Version 1.11.3 introduces **Signed Updates**.

- **Signature Check**: If your update fails with a `SIGNATURE_INVALID` error, ensure you haven't manually modified the `keys/update_public_key.pem` file.
- **Node Compatibility**: You may be blocked from updating if your worker nodes are running outdated agents. Update your nodes first by deploying a new Bootstrap ZIP.

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
