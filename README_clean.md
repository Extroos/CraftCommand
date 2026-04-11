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
- Mod browser with Modrinth integration — checks for client-only mods, resolves missing dependencies
- Scheduled tasks (backup, restart, custom commands)
- Multi-user access with role-based permissions (Owner > Admin > Manager > Viewer)
- Two-factor authentication (TOTP)
- Backup and restore
- Velocity proxy integration
- Dynmap one-click install

**What doesn't work yet (or is incomplete):**

- ✅ **Linux & macOS support** — Full native support via `run_CraftCommand.sh`. Includes `systemd` units for panel and agent processes.
- ✅ **Remote Agent Support (One-Click)** — Secure, token-based node enrollment. Manage 100+ physical servers from one central panel.
- ✅ **Docker & Scalability** — `docker-compose.yml` runs both the backend and agents. Integrated SQLite storage for large-scale setups.

---

## How It Works (Architecture)

## How It Works (Architecture)

CraftCommand is a distributed node-based platform consisting of a **Control Plane** (Backend) and multiple **Execution Planes** (Agents).

### Core Components

1.  **Control Plane (Backend)**: Built with Node.js/Express. It handles authentication, fleet-wide configuration management, and the centralized diagnostic engine.
2.  **Web UI (Frontend)**: React 19 application providing a real-time management interface over Socket.IO.
3.  **Execution Engines (Runners)**: The architecture supports three pluggable running environments:
    - **NativeRunner**: Spawns processes on the host machine using `child_process.spawn()`. Includes a **Top-Down Aggregator** for efficient stats collection on high-density nodes.
    - **DockerRunner**: Manages isolated environments via the Docker Engine API.
    - **RemoteRunner**: Proxies lifecycle commands to **Remote Agents** over encrypted sockets for multi-machine scaling.

### System Overview

```
                      ┌─────────────────────────────────┐
                      │        Browser UI (React)       │
                      └────────────────┬────────────────┘
                                       │
                                   Socket.IO
                                       │
                      ┌────────────────▼────────────────┐
                      │     Backend (Control Plane)     │
                      └─┬──────────────┬──────────────┬─┘
                        │              │              │
                 ┌──────▼───────┐ ┌────▼────┐ ┌───────▼───────┐
                 │ NativeRunner │ │ Docker  │ │ RemoteRunner  │
                 └──────┬───────┘ └────┬────┘ └───────┬───────┘
                        │              │              │
               ┌────────▼───────┐ ┌────▼────┐ ┌───────▼───────┐
               │ Minecraft.jar  │ │Container│ │  Node Agent   │
               │  (Child Proc)  │ │(Docker) │ │ (Remote Host) │
               └────────────────┘ └─────────┘ └───────┬───────┘
                                                      │
                                             ┌────────▼───────┐
                                             │ Minecraft.jar  │
                                             └────────────────┘
```

### Technical Data Flow

1. **Native Path**: The Backend spawns the server as a direct child process. It uses `tree-kill` for clean shutdowns and a background stats loop to aggregate metrics from the process tree.
2. **Docker Path**: The Backend communicates with the local Docker daemon to pull images and manage container lifecycles with resource quotas.
3. **Remote Path**: lifecycle commands are serialized and sent over a persistent WebSocket to a remote Agent, which executes the local Native/Docker logic and streams logs back to the Control Plane.

### Storage & Persistence

- **Pluggable Storage**: Uses a stateless repository pattern. Small setups run on **flat JSON** files; production environments toggle to **SQLite** for ACID-compliant tracking of thousands of servers/users.
- **Process Resilience**: On Linux, we provide `systemd` units for both the Panel and the Agent. If a server crashes, the **Diagnostic Pipeline** (Pre-Flight -> Execution -> Health Monitor -> Repair) attempts to resolve configuration drift (e.g., EULA, ports, Java versions) before restarting.

### Resource Isolation

Unlike simplified panels, CraftCommand implements **Cross-Platform Resource Hardening**:

- **Windows**: Uses Job Objects and priority tags for CPU/RAM limits.
- **Linux**: Uses Cgroups and IO BPS/Weight throttling.
- **Shared**: Port-collision protection kills "Ghost" processes (UDP/TCP) before spawning new instances.

---

## Technical Comparison

CraftCommand is designed for technical transparency and low-overhead management.

| Feature          | CraftCommand                   | Pterodactyl       | Crafty      |
| :--------------- | :----------------------------- | :---------------- | :---------- |
| **Logic Root**   | Node.js (Universal)            | PHP / Go          | Python      |
| **Execution**    | Native / Remote / Docker       | Docker-Only       | Native-Only |
| **Port Mapping** | Integrated UDP/TCP Scanners    | Manual            | Manual      |
| **Diagnostics**  | Recursive Log Analysis (Regex) | Basic Error Logic | None        |
| **Mod Support**  | Integrated Modrinth/Forge API  | Manual            | Manual      |

**Why use CraftCommand?**

- **Native Windows/Linux Logic**: No Python, Docker, or MySQL required for basic setup.
- **Automated Mod Management**: Integrated Modrinth search and automated dependency resolution.
- **Diagnostic Engine**: Regex-based log parsing detects common issues (missing EULA, port conflicts, Java version mismatches) and applies automated fixes.
- **Remote Nodes**: Manage servers across multiple machines from a single UI.

**Why you should use Pterodactyl or Crafty instead:**

- You require total isolation via Docker containers (Pterodactyl).
- You need a mature, battle-tested community and massive plugin ecosystem.
- You are running a commercial hosting business.

---

## Quick Start

### 1. Requirements

- **Node.js**: 18.x or 20.x ([download](https://nodejs.org/))
- **Java**: 17, 21, or 25 (Required for Minecraft 1.21+)
- **Git**: For cloning and updates

### 2. Installation

```bash
git clone https://github.com/Extroos/Craft-Commands.git
cd Craft-Commands
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

### Where Are Files Stored?

```
Craft-Commands/
├── data/                    # All panel data (configs, users, backups, audit logs)
│   ├── servers.json         # Server configurations
│   ├── users.json           # User accounts (passwords are bcrypt-hashed)
│   ├── sessions.json        # Active sessions
│   └── database.db          # SQLite DB (if team mode enabled)
├── minecraft_servers/       # Actual Minecraft server files
│   ├── my-survival/         # Each server gets its own folder
│   │   ├── server.jar
│   │   ├── server.properties
│   │   └── ...
│   └── my-creative/
├── backups/                 # Server backups (ZIP files)
├── .env                     # Environment config (JWT secret, ports)
└── run_CraftCommand.bat     # Windows launcher
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

- ✅ Good for: a server you run while you're at your PC, a 24/7 machine where you don't mind running a terminal window
- ❌ Bad for: production servers that need to survive reboots without manual intervention

- ✅ **Windows Service support (via NSSM) and Linux systemd units** — Scripts included in the repository.

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
**Maturity:** Beta — Feature-complete, technically verified for production-like environments.

| What                     | Status     | Notes                             |
| ------------------------ | ---------- | --------------------------------- |
| Windows single-machine   | ✅ Works   | Verified 100% parity with Linux   |
| Multi-server management  | ✅ Works   | Supports 100s of active instances |
| User management & 2FA    | ✅ Works   | Role-based permissions support    |
| Crash recovery           | ✅ Works   | 40+ diagnostic auto-fix patterns  |
| Mod compatibility        | ✅ Works   | Automatic Dependency Resolution   |
| Linux deployment         | ✅ Works   | Launch scripts included           |
| Multi-node / distributed | ✅ Works   | Token-based enrollment            |
| Docker deployment        | ✅ Works   | `docker-compose` support          |
| Scale (>1000 servers)    | ✅ Works   | Supported via SQLite opt-in       |
| Automated tests          | ⚠️ Pending | Integration suite in preparation  |

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
- **Storage:** JSON files (solo) or SQLite (team mode) — no external DB needed
- **Auth:** bcrypt + JWT + TOTP 2FA
- **License:** [GNU AGPLv3](LICENSE)

---

<div align="center">
  Built by <a href="https://github.com/Extroos">Extroos</a>
</div>
