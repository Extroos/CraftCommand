<div align="center">
  
# CraftCommand

**The Professional Hybrid Cloud Platform for Java & Bedrock Infrastructure**

![version](https://img.shields.io/badge/version-v1.12.5-emerald)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)
![license](https://img.shields.io/badge/license-AGPLv3-blue.svg)

**CraftCommand** is a professional-grade orchestrator that bridges the gap between simple local launchers and complex enterprise infrastructure. It provides **monolithic management** with a **distributed data plane**, designed to **prevent mistakes**, **explain problems**, and **scale safely** from solo use to massive networks.

[Features](docs/ARCHITECTURE.md) • [Architecture](docs/ARCHITECTURE.md) • [Quick Start](#quick-start) • [Security Model](SECURITY.md) • [Full Docs](docs/README.md)

</div>

---

## Why CraftCommand?

### The "Goldilocks" Solution

Most hosting solutions are either **too fragile** (Basic `.bat` files) or **too complex** (Enterprise panels requiring Linux degrees and hours of setup). CraftCommand offers a third way: **Hybrid Orchestration**.

- **Easier than a Batch File**: One click to start. No editing text files to fix RAM or Java versions.
- **Unified Engine**: Native support for **Java (Paper, Spigot, Vanilla)** and **Bedrock Edition (Dedicated Server)** with software-aware configurations.
- **Simpler than Enterprise**: Runs on **Windows**, installs in **seconds**, and scales with **Zero-Knowledge** worker nodes.

### Honest Comparison Matrix

| Feature              | Standard Launchers |     Enterprise Panels      |      **CraftCommand (v1.12.5)**       |
| :------------------- | :----------------: | :------------------------: | :-----------------------------------: |
| **Ideal For**        |      Testing       | Reselling & Large Networks |    **Home Hosting & Private Use**     |
| **Setup Time**       |      Instant       |     Hours (Linux req.)     |       **Instant (Zero-Config)**       |
| **Architecture**     |    Local Child     |     Distributed Docker     |      **Hybrid (Local + Agents)**      |
| **OS Synergy**       |        All         |        Linux First         | **Universal (Win Panel + Lin Nodes)** |
| **Resilience**       |    Crash = Dead    |        Auto-Restart        |    **Auto-Healing v3 (Sentinel)**     |
| **Networking**       |  Manual Port Fwd   |       Reverse Proxy        |  **Proxy Orchestration (Velocity)**   |
| **World Data**       |     Level Fold     |      Manual Database       |    **World Intelligence (Dynmap)**    |
| **Mod Management**   |     Level Fold     |       Manual Upload        |    **Modpack Intelligence Engine**    |
| **Environment Fix**  |   Manual Install   |        Error & Exit        |  **Integrated Auto-Fix (Heuristic)**  |
| **File Transfer**    |     Local Only     |      SFTP Client Req.      |  **Secure Chunked Sync (Built-in)**   |
| **UX Design**        |  Industrial/Flat   |      Functional/Busy       |     **Premium Glassmorphic IDE**      |
| **Audit Logging**    |         ❌         |        Per-Instance        |   **Immutable Cluster-Wide Ledger**   |
| **Software Support** |  Java Only (typ.)  |         Universal          |    **Java & Bedrock (Optimized)**     |
| **Core Advantage**   |       Manual       |      Manual / Plugins      |  **Intelligent Diagnosis & Healing**  |

![Server Selection](assets/ServerSelection.png)
_Manage multiple servers with a professional, data-dense interface._

---

## The CraftCommand Advantage

**Why choose CraftCommand instead of Pterodactyl, Crafty, or AMP?**

While other platforms focus on being general-purpose containers, CraftCommand is built as a **specialized orchestrator** with vertical integration for game server lifecycles.

### Modpack Intelligence Engine (v1.12.5)

Stop fighting mod crashes. Our **Triple-Layer Mod Stabilization** ensures your modpacks boot correctly the first time.

- **Modrinth API Verifier**: Automatically scans for `"server_side": "unsupported"` mods and moves them to `_client_mods/`.
- **Transitive Dependency Resolver**: Scans `fabric.mod.json`/`mods.toml` and auto-installs missing dependencies from Modrinth.
- **JiJ (Jar-in-Jar) Intelligence**: Detects embedded libraries to prevent duplicate mod conflicts before they even load.

### Enterprise-Grade Security Suite

Your infrastructure is only as safe as its weakest link. We provide mandatory protection for your cluster.

- **Native 2FA (TOTP)**: Full multi-factor authentication with **AES-256-CBC encrypted secrets** and **Bcrypt-hashed** recovery codes.
- **Session Revocation**: View active sessions and perform a **Global Logout** to instantly invalidate all JWT tokens across the cluster.
- **Systems Integrity**: Cryptographically signed updates (Ed25519) with SHA256 integrity verification, preventing supply-chain attacks.

### Hybrid Orchestration & Auto-Healing

Scale horizontally without the complexity of deep Docker management or Kubernetes.

- **Sentinel v3 (Sentinel)**: A proactive auto-healing engine that performs multi-stage triage (`Triage -> Scrap -> Start -> Verify`) on failing instances.
- **Chained Automation Engine**: Build multi-action sequences (e.g., `Save-All -> Backup -> Update -> Restart`) with a full 5-field Cron parser.
- **Distributed Node Orchestration**: Enroll remote hosts in seconds using **Zero-Knowledge** pair-bonding and unified resource telemetry.

### Key Differentiators

1.  **Intelligent Diagnosis Engine**: Don't just see a crash—understand it. Our heuristic engine (v2.1) identifies over 40 common failure points (EULA, Java version, port conflicts, corrupted mods) and offers one-click auto-fixes.
2.  **Cryptographically Secure Updates**: Your infrastructure is only as safe as its updates. We use industry-standard **Ed25519 signatures** and SHA256 integrity verification for every system update, preventing supply-chain attacks.
3.  **Proxy Network Fabric (Velocity Automation)**: The industry's first "Zero-Config" proxy orchestrator. Native Velocity integration automatically manages internal secrets, forwarding protocols, and backend server links.

---

## Core Capabilities

### 1. Global Operations Center (GOC)

_The cluster-wide "God View"_

- **Resource Heatmap**: Real-time spatial visualization of CPU/RAM density across the entire cluster with load-aware color coding.
- **Environment Health**: Integrated prerequisite detection and normalization (Java 8-21, Docker, Git, Permissions).
- **One-Click Heuristic Fix**: Automatically repair remote node environments directly from the UI using targeted diagnosis.
- **Node Capabilities**: Instant advertising of host capabilities (OS, Core Count, Virtualization Status).

### 2. World Intelligence & Telemetry

_Deep spatial visibility into your worlds_

- **Dynmap Integration**: Professional one-click installation and verification suite for real-time world maps.
- **Viewport Control**: Native embedded map viewports with secure proxy-forwarding.
- **Remote Render Triggers**: Trigger update, full, or radius renders directly from the panel without console access.
- **Health Handshake**: Automated telemetry verification via internal service probes.

### 3. Proxy Orchestration

_High-performance network management_

- **Native Velocity Support**: Full-stack integration for high-performance proxies with automated lifecycle management.
- **Via Suite Automation**: One-click deployment of the ViaVersion suite (Backwards, Rewind) for multi-version compatibility.
- **Forwarding Synchronization**: Automated management of modern/legacy forwarding secrets and backend server links.
- **Connectivity Mapping**: Visual management of server aliases and priority join lists.

### 4. Resilience & Auto-Healing v3 (Sentinel)

- **Sentinel Throttling**: Proactive system sentinel that protects the host by throttling recoveries during CPU/RAM/IO overload.
- **Drift Detection**: Automatic repair of "Zombie" instances (Status ONLINE but PID missing) and orphaned processes.
- **Stateful Recovery Pipeline**: Multi-stage repair logic (Triage -> Scrap -> Start -> Verify) with stability scoring.
- **Safe Mode Protection**: Panic control system that isolates failing instances to prevent host exhaustion.
- **Graceful Shutdown Protocol**: Countdown-based termination with automated in-game warnings and real-time cancellation support.

### 5. Systems Integrity & Security (v1.12.5)

_Production-grade safety for your cluster_

- **Two-Factor Authentication (2FA)**: Fully native TOTP support with AES-encrypted secrets and secure session revocation.
- **Industry-Standard Security**: Integrated Ed25519 signature verification and SHA256 hashing for all system updates.
- **Atomic State Transitions**: Safe file swapping with automated backup and rollback pathways to prevent data corruption.
- **Protocol Guardians**: Intelligent checks that ensure distributed nodes and proxies remain compatible during upgrades.

### 6. Cross-Play Ecosystem (v1.11.9)

_Unified Java & Bedrock gameplay_

- **One-Click Integration**: Native Geyser and Floodgate orchestration for seamless Bedrock client connections.
- **Automated Networking**: Intelligent UDP port management and real-time connectivity diagnostics.
- **Floodgate Optimization**: Zero-config authentication mapping for unified player identities across platforms.

### 7. Global Access & Infrastructure (v1.11.9)

_Zero-config remote connectivity_

- **Cloudflare Tunnels**: Integrated one-click provisioning for secure global access without manual port forwarding.
- **Dynamic DNS (DDNS)**: Native DuckDNS synchronization and real-time propagation monitoring.
- **Hosting OS Mode**: Specialized service layer for bare-metal resource isolation and disk quota enforcement.

### 8. Developer Experience (DevX)

- **Embedded Monaco IDE**: The power of VS Code in your browser with full syntax highlighting, bracket matching, and real-time co-presence for Minecraft configurations.
- **Plugin Marketplace**: Integrated Modrinth/Spiget search with automated dependency resolution and version-matching logic.
- **MC Identity Restoration**: Professional 64x64 PNG branding system that automatically stabilizes and injects your `server-icon.png` and `world_icon.png`.
- **High-Performance Grep Search**: Look inside massive log files and configurations instantly with contextual snippets and optimized server-side scanning.
- **Chained Automation Engine**: Build multi-action sequences for scheduled tasks (e.g., `Save-All -> Backup -> Update -> Restart`) with precise Cron-based offsets.
- **Immutable Audit Ledger**: Cluster-wide audit trail for every command, import, and configuration change, ensuring 100% accountability.

---

## Operational Excellence (v1.12.5)

**Built for stability. Optimized for performance.**

The v1.12.5 update focuses on the "Invisible Features" that make self-hosting reliable at scale.

- **Standardized API Request Layer**: Enforced consistency across all cluster communications for 100% reliable status reporting.
- **High-Efficiency Batch Storage**: Atomic, high-performance updates for audits and notifications using our new SQLite/JSON batch provider.
- **Proactive Pre-flight Diagnosis**: The system now blocks server startups if a critical environment failure (like a Java version mismatch) is predicted.
- **Surgical Mobile Responsiveness**: A telemetry-grade mobile UI that preserves density while enabling cluster management on any device.

![Dashboard](assets/Dashboard.png)
_Real-time monitoring with Auto-Healing v3, World Intelligence, and Systems Integrity controls._

---

## Distributed Hosting (Worker Nodes)

**Scale safely without touching the command line.**

CraftCommand utilizes a specialized **Node Agent** to manage remote resources (Other PCs, VPS, or Old Laptops).

- **One-Click Enrollment**: Use the Wizard to generate a secure **Bootstrap ZIP**.
- **Zero-Knowledge Pairing**: Automated cryptographic handshake using rotating secrets.
- **Mixed OS Clusters**: Host your Panel on Windows and your Servers on a fleet of Linux VPS instances seamlessly.

---

## Quick Start

### Installation & Launch

#### Flow 1: Single PC (Hybrid Mode)

_Best for: Users who want to play and host on the same computer._

1.  **Download & Extract** the latest release.
2.  **Run Launcher**: Execute `run_CraftCommand.bat`.
3.  **Start**: Choose **[1] Start (Auto-Setup)**.
4.  **Access**: Open `http://localhost:3000`.

#### Flow 2: Distributed (Commander + Nodes)

_Best for: Managing a fleet of servers (VPS, extra laptops, etc)._

1.  **Set up the Commander**: Follow Flow 1 to install the panel on your main PC.
2.  **Add a Node**:
    - Go to **Global Settings > Nodes**.
    - Click **"Add Node"**.
    - Follow the Wizard to generate a **Bootstrap Bundle (ZIP)**.
3.  **Deploy Agent**:
    - Copy the ZIP to your second machine.
    - Extract and run `bootstrap_agent.bat`.
    - The node will automatically pair with your Commander panel using Zero-Knowledge encryption.

#### Flow 3: Developer (Source)

_Best for: Contributing to CraftCommand._

1.  **Clone Repo**: `git clone https://github.com/Extroos/Craft-Commands.git`
2.  **Install**: `npm install` (Root directory).
3.  **Dev Mode**: `npm run dev`.
4.  **Access**: Open `http://localhost:3000`.

### Default Credentials

- **Email:** `admin@craftcommand.io`
- **Password:** `admin`

> [!CAUTION]
> You will be **required to change these credentials immediately** after your first login.

---

## Security Model

**Secure by Default, Explicit by Choice.**

- **Systems Integrity**: Cryptographically signed updates (Ed25519) with SHA256 integrity verification.
- **RBAC (Hierarchy Guard)**: Strict role isolation (Owner > Admin > Manager).
- **Network Isolation**: Local-only binding by default; remote exposure requires owner-level approval.
- **Token Hardening**: JWT-based sessions with industry-standard bcrypt hashing.
- **Capability Advertising**: Nodes advertise their limits; the Panel never sends a task a node cannot sustain.

---

---

## Troubleshooting

Common issues and error codes are documented in the dedicated guide.

[**View the Troubleshooting Guide (Error Codes & Fixes)**](docs/support/TROUBLESHOOTING.md)

Some common quick fixes:

- **E_JAVA_MISSING**: Use the **Heuristic Fix (Wand Icon)** in the GOC to auto-install the correct Java version.
- **E_PORT_IN_USE**: Port conflict detected. Use the **Environment Doctor** to identify the conflicting process.
- **Can't Connect**: Ensure your DuckDNS synchronization is active in Global Settings.
- **Access Denied**: If seen during Caddy setup, this is a benign launcher error and has been suppressed in v1.11.9.

---

## Technical Architecture

- **Core**: React 19, TypeScript, Node.js, Express, Socket.IO.
- **Styling**: Framer Motion (60FPS), Vanilla CSS, Glassmorphism (Premium Aesthetic).
- **Orchestration**: Modpack Intelligence Engine, Auto-Healing v3 (Sentinel) & Cross-Play Support.
- **Security**: 2FA (TOTP), Ed25519 Software Signing, AES-256-CBC Encryption.
- **Storage**: Hybrid Dual-Storage (SQLite for teams, JSON for solo portability).
- **License**: [GNU Affero General Public License v3.0](LICENSE)

---

<div align="center">
  Developed by <a href="https://github.com/Extroos">Extroos</a>
</div>
