# Upgrading CraftCommand

This guide ensures a safe transition between major and minor releases of CraftCommand. Following these steps preserves your server data, user accounts, and configurations.

## ⚠️ Pre-Upgrade Requirements

1.  **STOP ALL SERVERS**: Use the "Global Stop" action or the `Emergency Disable` script.
2.  **BACKUP DATA**: Copy the `backend/data/` and `minecraft_servers/` directories to a safe location.

---

## Standard Upgrade Flow (Git)

If you installed via Git, use the following commands:

1.  **Fetch Latest**:
    ```bash
    git fetch origin
    git checkout main
    git pull origin main
    ```
2.  **Clean Dependencies**:
    ```bash
    npm run install:all
    ```
3.  **Rebuild Assets**:
    ```bash
    npm run build --prefix frontend
    ```
4.  **Restart**: Run `run_locally.bat`.

## Transitioning to v1.10.x ("Distributed Ops")

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
- **Port In Use**: A previous version might still be running in the background. Kill any `node.exe` processes manually and restart.

---

_For additional help, visit the [Troubleshooting Guide](support/TROUBLESHOOTING.md)._
