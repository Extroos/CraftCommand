# CraftCommand Architecture

CraftCommand is a self-hosted Minecraft server management panel. This document describes how the major systems work.

## 1. Storage

CraftCommand stores data in two modes:

- **Solo Mode (default)**: Flat JSON files in `data/`. Move the folder, and the panel moves with it. No database to configure.
- **Team Mode (opt-in)**: Embedded SQLite for setups with many concurrent users or hundreds of servers. Enabled in Settings.

## 2. Core Systems

### A. Process Management (`ProcessManager.ts`)

Manages the lifecycle of Minecraft server processes:

- **Runners**: Supports two execution modes via the `IServerRunner` interface:
  - `NativeRunner` — starts Minecraft as a child process (`child_process.spawn()`) on the same machine
  - `DockerRunner` — creates containers via the Docker Engine API for hardware isolation
- **Port conflict detection**: Before starting a server, checks if the target port is already in use and identifies which PID is holding it
- **Console I/O**: Streams server output to the web UI via Socket.IO and accepts commands from the console input

### B. Server Installer (`InstallerService.ts`)

Handles modpack and server JAR installation:

- **ZIP analysis**: Scans uploaded archives to find the actual server root directory (the folder containing `server.jar` or `server.properties`)
- **Auto-flattening**: Removes wrapper directories (e.g. `ServerPack_1.0/`) that cause startup failures because the JAR isn't in the expected path

### C. Crash Diagnosis (`DiagnosisService.ts`)

Reads crash logs and tries to fix common problems automatically:

- **Pattern matching**: Scans the last 1,000 lines of server output against 40+ regex patterns to identify failures (out-of-memory, class conflicts, EULA not accepted, wrong Java version, corrupted mods)
- **Auto-fix**: When a known pattern is matched, the system can apply a fix automatically (switch Java version, accept EULA, quarantine a bad mod) and restart the server

### D. Update System (`UpdateService.ts`)

Handles panel self-updates:

- **Signature verification**: Update bundles are signed with Ed25519. The backend checks `manifest.sig` against a local public key before applying
- **Hash verification**: SHA-256 hashes for every file in the bundle are validated during extraction
- **Rollback**: The previous version is preserved automatically. If post-update health checks fail, you can roll back

### E. Network Configuration (`NetworkTemplateService.ts`)

Manages network settings across servers:

- **Forwarding secrets**: Distributes Velocity modern-forwarding secrets and BungeeGuard tokens to backend servers
- **Cross-play**: Manages UDP port allocation for Geyser/Floodgate so Bedrock clients can join Java servers
- **Tunnels**: Optional Cloudflare tunnel support for remote access without port forwarding

### F. API Layer (`ApiService.ts`)

The frontend communicates with the backend through a shared service that handles:
- Automatic JWT header injection
- Consistent error parsing
- Typed request/response helpers (`get`, `post`, `patch`, `put`, `delete`)

### G. Mod & Plugin Filtering (`ModpackService.ts`)

Backend module for managing server-side mod compatibility:
- **Environment filtering**: Queries Modrinth API for `environment` tags (`client`, `server`, `unsupported`). Client-only mods are moved to `_client_mods/` to prevent startup crashes
- **Dependency resolution**: If a mod requires other mods, the system detects missing dependencies and offers to install them
- **Integrity checks**: Cross-references API metadata with local `fabric.mod.json`/`mods.toml` to identify JAR conflicts

### H. Dynmap Integration

Web-based Minecraft map support:
- **One-click install**: Deploys the Dynmap plugin from the panel UI
- **Port management**: Automatically reserves a port for the Dynmap web interface
- **Render control**: Trigger map renders from the dashboard

### I. Server Cloning

- **Full clone**: Create copies of existing servers via the `cloneServer` API
- **Templates**: Deploy standardized server environments using saved presets

---

## 3. Communication & Monitoring

1.  **Transport**: Socket.IO for real-time streaming (console output, status changes, notifications)
2.  **System monitoring**: OS-level CPU/RAM metrics (via `systeminformation`) streamed to the frontend
3.  **State sync**: Backend repository + React frontend state stay synchronized on server health
4.  **2FA**: TOTP implementation with AES-256-CBC encrypted secrets and bcrypt-hashed backup codes

---

## 4. Multi-Machine Setup (Panel + Agents)

CraftCommand can manage servers across multiple physical machines:

- **Panel**: The central API, user database, and web UI. Runs on one machine.
- **Agents**: Lightweight workers that run on remote machines. They handle local file I/O and process management.
- **Enrollment**: Agents join via a time-limited token (15 min). The panel issues persistent Ed25519 identity keys during the handshake.
- **Version compatibility**: Agents report their version during heartbeat. The panel enforces minimum version requirements to prevent protocol mismatches.

---

_Next: See [Networking & Connectivity](networking/OVERVIEW.md) for details on remote access and tunnels._
