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

## 3. Communication & Telemetry Hierarchy

1.  **Transport**: Socket.IO for binary-efficient real-time streaming.
2.  **Telemetry**: High-fidelity OS monitoring (using `systeminformation`) provides sub-second CPU/RAM metrics to the frontend.
3.  **State Sync**: Redux (on frontend) and the Repository Layer (on backend) maintain a synchronized view of server health across all connected clients.

## 4. Multi-Node distributed Model (v1.10+)

CraftCommand supports a **Primary/Worker** architecture.

- **Primary Node**: Hosts the UI and global user database.
- **Worker Nodes**: Lightweight agents that manage local server files and execute process commands.
- **Bootstrap Enrollment**: New nodes are added via a secure ZIP package containing a pre-shared encrypted token for instant pairing.

---

_Next: See [Networking & Connectivity](networking/OVERVIEW.md) for details on the communication bridge._
