# CraftCommand (Beta)

Self-hosted Node.js management panel for Minecraft (Java & Bedrock). Built for process supervision, automated crash recovery, and integrated mod management.

![version](https://img.shields.io/badge/version-v1.13.0-emerald)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-blue)
![license](https://img.shields.io/badge/license-AGPLv3-blue.svg)

> **BETA SOFTWARE**: This project is now in a technically verified Beta state.
> Tested primarily on Windows 11 and Ubuntu 22.04 LTS. Proceed with caution in production.

---

## What It Does

CraftCommand is a web panel that lets you create, configure, start, stop, and monitor Minecraft servers (Java and Bedrock) from a browser. You run the backend on your machine, open `localhost:3000`, and manage your servers from there.

**What actually works today:**

- Create Java (Paper, Spigot, Vanilla, Forge, Fabric) and Bedrock servers from the UI
- Start/stop/restart servers with a live console
- Crash detection and automatic restart (with a 3-strike safe mode so it doesn't thrash your CPU)
- File manager with a built-in code editor (Monaco)
- Mod browser with Modrinth integration checks for client-only mods, resolves missing dependencies
- Scheduled tasks (backup, restart, custom commands)
- Multi-user access with role-based permissions (Owner > Admin > Manager > Viewer)
- Two-factor authentication (TOTP)
- Backup and restore
- Velocity proxy integration
- Dynmap one-click install

**What doesn't work yet (or is incomplete):**

-     **Linux & macOS support**     Full native support via `run_CraftCommand.sh`. Includes `systemd` units for panel and agent processes.
-     **Remote Agent Support (One-Click)**     Secure, token-based node enrollment. Manage 100+ physical servers from one central panel.
-     **Docker & Scalability**     `docker-compose.yml` runs both the backend and agents. Integrated SQLite storage for large-scale setups.

---

## How It Works (Architecture)

CraftCommand implements a **Decoupled Control Plane** architecture, separating the management logic from the execution environment. This allows for high-density local management and seamless multi-node scaling.

### Core Architectural Layers

1.  **Control Plane (Panel Backend)**: A Node.js/Express service responsible for authentication (JWT/TOTP), global configuration management, and the centralized **Diagnostic Engine**. It maintains a stateless relationship with the Runners.
2.  **Execution Plane (Runners)**: Pluggable bridges that manage the lifecycle of Minecraft processes.
    - **NativeRunner**: Direct process management via \child_process.spawn()\. Uses a **Heuristic Top-Down Aggregator** to monitor process trees with minimal CPU overhead.
    - **DockerRunner**: Interfaces with the \docker.sock\ to manage containers with hardware-level isolation.
    - **RemoteRunner**: A WebSocket-based bridge that proxies commands to remote agents, allowing a single panel to manage servers across different physical locations.
3.  **Data Plane (Minecraft Instance)**: The actual Java or Bedrock process, monitored via stdout/stdin streams and periodic health checks.

### Technical System Overview

```
                      +---------------------------------+
                      |    Web UI (React 19 + Vite)     |
                      +---------------------------------+
                                       |
                               Authentication (JWT)
                               WebSocket (Socket.IO)
                                       |
                      +---------------------------------+
                      |    Backend (Control Plane)      |
                      |  (Diagnostics + Orchestration)  |
                      +---------------------------------+
                        |              |              |
                 +--------------+ +-----------+ +---------------+
                 | NativeRunner | | Docker    | | RemoteRunner  |
                 | (Host Path)  | | (APIV1)   | | (WebSocket)   |
                 +--------------+ +-----------+ +---------------+
                        |              |              |
               +----------------+ +-----------+ +---------------+
               | Minecraft.jar  | | Container | |  Node Agent   |
               | (Standard IO)  | | (Cgroups) | | (Remote Host) |
               +----------------+ +-----------+ +---------------+
                                                       |
                                              +----------------+
                                              | Minecraft.jar  |
                                              +----------------+
```

### 3. Launching

- **Windows**: Run `run_CraftCommand.bat`
- **Linux / macOS**: Run `chmod +x run_CraftCommand.sh && ./run_CraftCommand.sh`

Select **Option [1]** in the menu to perform the initial setup and start the platform.

4. Open `http://localhost:3000` in your browser.

### Default Login

- **Email:** `admin@craftcommand.io`
- **Password:** `admin`

> [!CAUTION]
> You'll be forced to change these on first login. If you're exposing this to the internet (don't, yet), change the JWT secret in `.env` first.

### Where Are Files Stored

```
Craft-Commands/
+-- data/                    # All panel data (configs, users, backups, audit logs)
|   +-- servers.json         # Server configurations
|   +-- users.json           # User accounts (passwords are bcrypt-hashed)
|   +-- sessions.json        # Active sessions
|   +-- database.db          # SQLite DB (if team mode enabled)
+-- minecraft_servers/       # Actual Minecraft server files
|   +-- my-survival/         # Each server gets its own folder
|   |   +-- server.jar
|   |   +-- server.properties
|   |   +-- ...
|   +-- my-creative/
+-- backups/                 # Server backups (ZIP files)
+-- .env                     # Environment config (JWT secret, ports)
+-- run_CraftCommand.bat     # Windows launcher
```

### Linux & Unix Support

CraftCommand is natively supported on Linux (Ubuntu/Debian/Rocky) and macOS via the `run_CraftCommand.sh` entrypoint.

- **Process Supervision**: Use the provided `systemd` units in `scripts/systemd/` for 24/7 uptime.
- **Portability**: Supports local Node.js runtimes in the `.runtimes/` directory.

See the full [Deployment Guide](docs/support/DEPLOYMENT.md) for more details.

---

## How Servers Are Managed

This was a question from the community, so let me be explicit:

**Process lifecycle:**

- Minecraft servers run as **child processes** of the Node.js backend (via `child_process.spawn()`).
- They are **NOT** Windows Services or systemd services.
- If the CraftCommand backend stops (you close the terminal, machine reboots), **all Minecraft servers stop too**.
- When you start CraftCommand again, it checks which servers were marked "online" before shutdown and attempts to restart them.

**Auto-restart behavior:**

- If a Minecraft server crashes, the recovery service kicks in within 5 seconds.
- It reads the last ~1,000 lines of the server log looking for known error patterns (EULA not accepted, port already in use, missing JAR, Java version mismatch, corrupted mods, etc.).
- If it finds a known issue, it tries to fix it automatically (e.g., sets `eula=true`, kills the process hogging the port, moves the bad mod to a quarantine folder).
- Then it restarts the server.
- After 3 consecutive crashes with no successful startup between them, the server enters "safe mode" and stops restarting. You get a notification in the panel.

**What this means in practice:**

-     Good for: a server you run while you're at your PC, a 24/7 machine where you don't mind running a terminal window
-     Bad for: production servers that need to survive reboots without manual intervention

-     **Windows Service support (via NSSM) and Linux systemd units**     Scripts included in the repository.

---

## Security

Recent community audits have been addressed with the following implementations:

- **Pass-Hash**: Passwords hashed with bcrypt (cost factor 12).
- **Session Control**: 24h JWT expiration with server-side JTI session tracking and revocation.
- **Brute-Force Protection**: Rate limiting on login (5 attempts / 15 min), 2FA, and sensitive API actions.
- **Path Traversal Protection**: Hardened path resolution on all file management operations.
- **Atomic Writes**: `temp+rename` patterns for all settings and repository saves to prevent data corruption.
- **2FA**: TOTP-based two-factor authentication.
- **Ed25519 Signing**: Digitally signed system updates for secure delivery.

**Important:** The `.env` file ships with a default JWT secret. If you're running this on anything other than localhost, **change it**. The backend will refuse to start in production mode (`NODE_ENV=production`) if the default secret is still set.

---

## Current Status

**Version:** 1.13.0 (April 2026)
**Maturity:** Beta Feature-complete, technically verified for production-like environments.

| What                     | Status  | Notes                             |
| ------------------------ | ------- | --------------------------------- |
| Windows single-machine   | Works   | Verified 100% parity with Linux   |
| Multi-server management  | Works   | Supports 100s of active instances |
| User management & 2FA    | Works   | Role-based permissions support    |
| Crash recovery           | Works   | 40+ diagnostic auto-fix patterns  |
| Mod compatibility        | Works   | Automatic Dependency Resolution   |
| Linux deployment         | Works   | Launch scripts included           |
| Multi-node / distributed | Works   | Token-based enrollment            |
| Docker deployment        | Works   | `docker-compose` support          |
| Scale (>1000 servers)    | Works   | Supported via SQLite opt-in       |
| Automated tests          | Pending | Integration suite in preparation  |

---

## Developer's Notes

This project was built to solve specific friction points in local Minecraft administration: namely, the lack of "smart" log parsing for common errors and the manual effort of managing mods across multiple versions.

**Regarding AI-generated content:**
Early documentation (README and changelogs) for this repo was heavily supplemented by LLMs to create a "professional" appearance. Feedback from the community was clear: that tone was misleading and lacked technical substance. We have since moved to a direct, developer-centric documentation style.

**Feedback:**
If the software crashes or a feature doesn't work as described, please open a GitHub Issue with your logs. Beta testing is the only way to reach maximum stability.

---

## Contributing

```bash
git clone https://github.com/Extroos/Craft-Commands.git
cd Craft-Commands
npm install      # Root dependencies
cd backend && npm install
cd ../frontend && npm install
cd ..
npm run dev      # Starts backend + frontend in dev mode
```

Open `http://localhost:3000`. The backend runs on port 3001.

---

## Tech Stack

- **Backend:** Node.js 18+, Express 4, Socket.IO 4, TypeScript
- **Frontend:** React 19, Vite, TypeScript, Framer Motion
- **Storage:** JSON files (solo) or SQLite (team mode) no external DB needed
- **Auth:** bcrypt + JWT + TOTP 2FA
- **License:** [GNU AGPLv3](LICENSE)

---

<div align="center">
  Built by <a href="https://github.com/Extroos">Extroos</a>
</div>
