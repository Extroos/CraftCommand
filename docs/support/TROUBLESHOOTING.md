# Troubleshooting Guide

This guide is the primary resource for resolving common runtime errors, configuration issues, and platform bugs.

## 🩺 Use "The Doctor" First

Before manual troubleshooting, always use the built-in diagnostic engine:

1.  Go to the **Server Dashboard**.
2.  Click the **Stethoscope** icon (**Diagnostics**).
3.  The system will analyze your logs and environment to provide a targeted solution.

---

## 🏗 Common Runtime Issues

### 1. Server Starts then Immediately Stops

- **Cause**: You likely haven't accepted the EULA.
- **Fix**: Check the console for a message requiring an "Accept" interaction, or go to the server folder and set `eula=true` in `eula.txt`. Note that in **v1.12.5**, the Doctor may skip this check on the first boot to reduce noise.

### 2. Modpack Crash on First Boot

- **Cause**: Client-side mods or missing dependencies.
- **Fix**: CraftCommand's **Modpack Intelligence** should handle this automatically. If it persists, check the `_client_mods/` folder for any missed entries or use the **"Force Re-Scan"** action in the server's Mod Manager.

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
- **Fix**:
  - Change the server port in **Settings**.
  - Or, use the panel's "Port Protection" feature which should automatically offer to kill the "Ghost Process".

---

## 🌐 Networking & Connectivity

### 1. "Connection Refused" (Friends cannot join)

- **Check Firewalls**: Ensure your host machine allows the Minecraft port (default: 25565) and the Panel port (default: 3000) through Windows Firewall.
- **Port Forwarding**: Verify your router configuration. Your public IP should be reachable at the specified port.
- **Remote Access Mode**: Ensure the global toggle is **ON** in System Settings if you are not using a tunnel like Playit.gg.
- **Can't Connect**: Ensure your DuckDNS synchronization is active in Global Settings.

### v1.11.3 Systems Integrity Errors

| Error Code                  | Meaning                                                  | Resolution                                                                                             |
| :-------------------------- | :------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| `UPDATE_SIGNATURE_INVALID`  | The update bundle failed Ed25519 verification.           | Ensure `keys/update_public_key.pem` is present and untampered. Do not use unofficial update sources.   |
| `UPDATE_APPLY_FAILED`       | The atomic swap failed (likely file locks).              | Stop all servers and run `scripts/verify-shutdown.cjs` before retrying.                                |
| `NODE_VERSION_INCOMPATIBLE` | Your worker node agent is too old for the primary panel. | Go to Nodes settings, generate a new Bootstrap ZIP, and update your node.                              |
| `MIGRATION_FAILED`          | The SQLite/JSON schema upgrade failed.                   | Check the `backend/data/migrations` logs. Restore from the automatic backup created during the update. |

### Distributed Node Connectivity

- **E_NODE_OFFLINE**: Background worker is detached. Restart `run_CraftCommand.bat`.
- **E_PORT_IN_USE**: Port conflict detected. Use the **Environment Doctor** to identify the conflicting process.

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
