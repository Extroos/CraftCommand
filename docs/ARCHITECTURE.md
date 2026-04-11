# CraftCommand Architecture

CraftCommand is a self-hosted Minecraft server management panel. This document details the core systems and data flows.

## 1. Storage Model

CraftCommand uses a **Hybrid Dual-Storage Model**:

- **Solo Mode**: Atomic JSON files for maximum portability. Move the folder, and the panel moves with it.
- **Node Mode**: Embedded SQLite for high-concurrency permission checks and audit logging.

## 2. Core Systems

### A. Process Management (`ProcessManager.ts`)

Manages the lifecycle of Minecraft server processes across distributed nodes:

- **Execution Engines**: Implements `IServerRunner` for `native` (Node.js `child_process`) and `containerized` (Docker Engine API) execution.
- **Port Collision Detection**: Monitors local interface bindings and identifies PIDs occupying target server ports.
- **Console I/O**: High-throughput Socket.IO pipe for buffered log streaming and command injection.

### B. Server Installer (`InstallerService.ts`)

Handles modpack and server jar installation:

- **ZIP Analysis**: Recursively scans archive structures to find the actual server root directory.
- **Auto-Flattening**: Removes wrapper directories (e.g., `ServerPack_1.0/`) that cause startup failures.

### C. Crash Diagnosis (`DiagnosisService.ts`)

A log-based pattern matching system:

- **Pattern Matching**: Analyzes crash logs using 40+ regex patterns to identify common failures (OOM, class conflicts, EULA refusal).
- **Fix Suggestions**: Suggests and executes fixes (e.g., switching Java version, accepting EULA) from the diagnostic results.

### D. Update System (`UpdateService.ts`)

Handles panel self-updates with integrity checks:

- **Signature Verification**: Updates are signed with Ed25519. The backend verifies `manifest.sig` against a local public key.
- **Hash Verification**: SHA256 hashes for every file in the bundle are checked during extraction.
- **Rollback**: Preserves the previous version automatically, allowing recovery if post-update health checks fail.

### E. Network Configuration (`NetworkTemplateService.ts`)

Manages network settings across servers and distributed nodes:

- **Forwarding Secrets**: Manages and distributes modern/legacy forwarding secrets (and BungeeGuard tokens) to backend servers.
- **Cross-Play Support**: Manages UDP port allocation for Geyser/Floodgate for Bedrock + Java client access.
- **Cloudflare Tunnels**: Optional zero-config remote access without firewall changes.

### F. API Layer (`ApiService.ts`)

The frontend communicates through a unified service that handles:
- **Auth Headers**: Automatic JWT injection.
- **Error Handling**: Consistent parsing of backend error payloads.
- **Request Helpers**: Simplified `get`, `post`, `patch`, `put`, and `delete` wrappers.

### G. Mod & Plugin Filtering (`ModpackService.ts`)

Backend module for managing Java archive dependencies:
- **Environment Filtering**: Queries the Modrinth API for side-specific tags (`client`, `server`, `unsupported`).
- **Dependency Resolution**: Recursively fetches missing mod dependencies.
- **Integrity Validation**: Cross-references API metadata with local `fabric.mod.json`/`mods.toml` parsing to resolve JAR conflicts.

### H. Dynmap Integration

Web-based Minecraft map support:
- **Automated Installation**: One-click deployment of the Dynmap plugin.
- **Port Management**: Automatic reservation and mapping of the Dynmap web port.
- **Render Control**: Trigger map renders from the dashboard.

### I. Server Cloning

- **Full Cloning**: Create copies of existing servers via the `cloneServer` API.
- **Templates**: Deploy standardized server environments using pre-configured metadata.

---

## 3. Communication & Monitoring

1.  **Transport**: Socket.IO for real-time streaming.
2.  **System Monitoring**: OS-level CPU/RAM metrics (via `systeminformation`) streamed to the frontend.
3.  **State Sync**: Repository layer on backend + React state on frontend maintain synchronized server health.
4.  **2FA**: TOTP implementation with AES-256-CBC encrypted secrets and bcrypt-hashed backup codes.

---

## 4. Distributed Architecture (Primary/Worker)

CraftCommand utilizes a decentralized orchestration model:

- **Primary Panel**: Manages the API gateway, global user database, and node registry.
- **Node Agents**: Independent workers that handle local file I/O and process supervision.
- **Handshake Protocol**: Enrollment uses time-limited JWTs for initial Ed25519 identity issuance.
- **Compatibility Mapping**: Agents report `agentVersion` during heartbeat; the primary enforces protocol minimums to prevent architectural drift.

---

_Next: See [Networking & Connectivity](networking/OVERVIEW.md) for details on the communication bridge._
