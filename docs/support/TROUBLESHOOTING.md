# Troubleshooting Guide

This guide is the primary resource for resolving common runtime errors, configuration issues, and platform bugs.

## 1. Integrated Diagnostics

The platform includes a diagnostic engine that parses logs and system state to identify root causes:

1.  Navigate to the **Server Dashboard**.
2.  Select **Diagnostics**.
3.  The engine analyzes recent `stdout` patterns and identifies common failure signatures (EULA, Port Conflicts, RAM exhaustion).

---

## 🏗 Common Runtime Issues

### 1. Server Starts then Immediately Stops

- **Fix**: Check the console for a message requiring an "Accept" interaction, or go to the server folder and set `eula=true` in `eula.txt`. The diagnostic engine may skip this check on the first boot to reduce noise.

### 2. Mod/Plugin Loading Failures

- **Heuristic Filtering**: The panel identifies client-only mods by scanning Modrinth environment tags.
- **Resolution**: Incompatible mods are automatically moved to the `_client_mods/` subdirectory. If a crash persists, execute a **"Force Re-Scan"** in the Mod Manager to re-evaluate dependencies.

### 2. "Java Version Mismatch"

- **Cause**: The version of Java you are using is either too old or too new for your Minecraft version.
- **Fix**:
  - **MC 1.21+**: Requires **Java 21**.
  - **MC 1.18 - 1.20**: Requires **Java 17**.
  - **MC 1.17**: Requires **Java 16**.
  - **MC 1.16 and below**: Requires **Java 8** or **11**.
- **Action**: Change the version in **Server Settings -> Java Environment**.

### 3. Port Conflict (`E_PORT_IN_USE`)

- **Cause**: Another program (possibly another Minecraft server or a previous crashed instance) is using the port.
- **Resolution**: 
  - Modify the server port in **Settings**.
  - Enable the **Port Reclamation** feature to automatically identify and terminate conflicting PIDs.

---

## 🌐 Networking & Connectivity

- **Firewalls**: Verify that the host firewall permits traffic on the Minecraft port (`25565`) and the panel ingress port (`3000`).
- **Gateway Forwarding**: Ensure the router routes external traffic to the server's local IP.
- **DDNS Logic**: If using Dynamic DNS, verify that the `NetworkService` is successfully synchronizing IP changes.

### v1.11.3 Systems Integrity Errors

| Error Code                  | Meaning                                                  | Resolution                                                                                             |
| :-------------------------- | :------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| `UPDATE_SIGNATURE_INVALID`  | The update bundle failed Ed25519 verification.           | Ensure `keys/update_public_key.pem` is present and untampered. Do not use unofficial update sources.   |
| `UPDATE_APPLY_FAILED`       | The atomic swap failed (likely file locks).              | Stop all servers and run `scripts/verify-shutdown.cjs` before retrying.                                |
| `NODE_VERSION_INCOMPATIBLE` | Your worker node agent is too old for the primary panel. | Go to Nodes settings, generate a new Bootstrap ZIP, and update your node.                              |
| `MIGRATION_FAILED`          | The SQLite/JSON schema upgrade failed.                   | Check the `backend/data/migrations` logs. Restore from the automatic backup created during the update. |

- **E_NODE_OFFLINE**: Node agent is detached. Restart the process or check container health.
- **E_PORT_IN_USE**: Conflicting process detected on the node. Use the **Environment Doctor** functionality in the node registry.
- **Token Expired (401 Unauthorized)**: Join tokens during One-Click Enrollment are securely capped at 15 minutes. Generate a new command from the Node Registry.
- **Agent Socket Rejection**: Ensure the `PANEL_URL` provided to the agent correctly matches the routable IP of the backend, including `http://` or `https://`.

### 2. DNS Resolution Failures

- If your DDNS hostname isn't working, see the [Dynamic DNS Guide](../networking/DDNS.md).

---

## 📋 Error Code Dictionary

| Code                    | Type    | Meaning                           | Action                                    |
| :---------------------- | :------ | :-------------------------------- | :---------------------------------------- |
| **E_2FA_REQUIRED**      | Security| Account has 2FA enabled.          | Enter your TOTP or Recovery code.         |
| **E_2FA_INVALID**       | Security| Incorrect challenge response.     | Verify your device clock or use a backup. |
| **E_NODE_OFFLINE**      | System  | Background worker is detached.    | Restart `run_CraftCommand.bat`.           |
| **E_JAVA_MISSING**      | Runtime | No compatible JDK found.          | Install the required Java version.        |
| **E_FILE_NOT_FOUND**    | Files   | Missing `.jar` or world folder.   | Verify your installation files.           |
| **E_SERVER_BUSY**       | Logic   | Locked by another action.         | Wait 30 seconds and retry.                |
| **E_RAM_CRITICAL**      | System  | Insufficient system RAM to start. | Reduce server allocation or add more RAM. |
| **E_DIRECTORY_MISSING** | Files   | Server path does not exist.       | Check the working directory setting.      |

## Need More Help?

- **Logs**: Always check `backend/logs/app.log` for the most detailed error stack traces.
- **Discord**: Join the [Community Discord](https://discord.gg/craftcommands) for peer support.
- **GitHub**: Report repeatable bugs on the [Issue Tracker](https://github.com/Extroos/Craft-Commands/issues).
