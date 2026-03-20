# CraftCommand Architecture: Technical Deep-Dive

CraftCommand is engineered as a **Hybrid Orchestration Platform**, designed to bridge the gap between simple local launchers and enterprise-scale Minecraft infrastructures. This document details the core engines and data flows that power the platform.

## 1. The Core Philosophy: "Stateful Portability"

Unlike traditional panels that rely on centralized databases (MySQL/PostgreSQL), CraftCommand uses a **Hybrid Dual-Storage Model**.

- **Solo Mode**: Uses atomic JSON storage for maximum portability. Move the folder, and the whole panel moves with you.
- **Node Mode**: Leverages an embedded SQLite engine for high-concurrency permission checks and audit logging.

## 2. Advanced System Engines

### A. Intelligent Process Management (`ProcessManager.ts`)

The heartbeat of the platform. It handles the lifecycle of Minecraft instances through:

- **Abstraction Layer**: Supports both `native` (Child_Process) and `containerized` (Docker) engines seamlessly.
- **Ghost Protection**: Dynamically scans for "zombie" processes holding server ports and provides auto-cleanup logic.
- **Standard Input Pipeline**: A buffered WebSocket stream ensures console inputs are delivered reliably even under heavy CPU load.

### B. Heuristic Installation Pipeline (`InstallerService.ts`)

Designed to solve the "Nesting Problem" common in community modpacks.

- **Deep ZIP Analysis**: Recursively scans archive structures to identify the true `root` of a server pack.
- **Auto-Flattening**: Automatically standardizes directories (e.g., removing a wrapper `ServerPack_1.0/` folder) to prevent startup failures.

### C. "The Doctor" Diagnostic Engine (`DiagnosisService.ts`)

A log-based pattern matching system.

- **Predictive Matching**: Analyzes crash logs using RegEx patterns to identify common failures (JVM OOM, Class Mismatches, EULA refusal).
- **One-Click Remediation**: Suggests and executes fixes (e.g., updating Java version or Accepting EULA) directly from the telemetry data.

### D. Systems Integrity Engine (`UpdateService.ts`)

Ensures the panel's own longevity and security through a production-grade update lifecycle.

- **Cryptographic Assurance**: All updates must be signed with an Ed25519 private key. The backend verifies the `manifest.sig` against a local public key before any files are touched.
- **Supply Chain Security**: SHA256 hashes for every file in the bundle are cross-referenced during the extraction phase to prevent binary tampering.
- **Rollback Pathways**: The update applicator automatically preserves the previous version's state, allowing for one-click recovery if post-update health checks fail.

### E. Network Fabric Orchestration (`NetworkTemplateService.ts`)

A sophisticated layer that synchronizes connectivity across distributed clusters.

- **Forwarding Secret Automation**: Automatically manages and distributes modern/legacy forwarding secrets (and BungeeGuard tokens) to backend servers.
- **Cross-Play Bridging**: Orchestrates UDP port allocation for Geyser/Floodgate, ensuring a unified entry point for Bedrock and Java clients.
- **Cloudflare Lifecycle**: Managed provisioning of Cloudflare Tunnels for zero-config remote access without firewall exposure.

### F. Standardized API Layer (`ApiService.ts`)

The frontend communicates through a unified `ApiService` that handles:
- **Centralized Authentication**: Automatic injection of JWT `Authorization` headers.
- **Uniform Error Handling**: Consistent parsing of backend error payloads (`ConflictError`, `ValidationError`).
- **Standardized Request Lifecycle**: Simplified `get`, `post`, `patch`, `put`, and `delete` wrappers.

### G. Modpack Intelligence Engine (`ModpackService.ts`)

A sophisticated backend module for managing Minecraft modifications:
- **Heuristic Compatibility Scanning**: Batch queries Modrinth API to identify and quarantine client-side only mods.
- **Transitive Dependency Resolution**: Automatically identifies and installs missing dependencies from Modrinth.
- **Jar-in-Jar (JiJ) Detection**: Scans embedded libraries to prevent duplicate installs.
- **Triple-Layer Stabilization**: Combines API metadata with local `fabric.mod.json`/`mods.toml` parsing for 100% accuracy.

### H. Dynmap Orchestration

Embedded support for web-based Minecraft maps:
- **Automated Installation**: One-click deployment of the Dynmap plugin.
- **Port Orchestration**: Automatic reservation and mapping of the Dynmap web port.
- **Render Control**: Trigger map updates or full renders directly from the dashboard.

### I. Server Cloning and Template Engine

- **Atomic Cloning**: Create bit-for-bit copies of existing servers via the `cloneServer` API.
- **JSON Templates**: Deploy standardized server environments using pre-configured metadata.

---

## 3. Communication & Telemetry Hierarchy

1.  **Transport**: Socket.IO for binary-efficient real-time streaming.
2.  **Telemetry**: High-fidelity OS monitoring (using `systeminformation`) provides sub-second CPU/RAM metrics to the frontend.
3.  **State Sync**: Redux (on frontend) and the Repository Layer (on backend) maintain a synchronized view of server health across all connected clients.
4.  **2FA Security Suite**: Full TOTP implementation with AES-256-CBC encrypted secrets and bcrypt-hashed backup codes.

---

## 4. Multi-Node distributed Model (v1.10+)

CraftCommand supports a **Primary/Worker** architecture.

- **Primary Node**: Hosts the UI and global user database.
- **Worker Nodes**: Lightweight agents that manage local server files and execute process commands.
- **Bootstrap Enrollment**: New nodes are added via a secure ZIP package containing a pre-shared encrypted token for instant pairing.
- **Compatibility Guardians**: (v1.11+) Nodes advertise their `agentVersion` during handshake. The Primary will prevent updates that would break communication with outdated worker nodes.

---

_Next: See [Networking & Connectivity](networking/OVERVIEW.md) for details on the communication bridge._
