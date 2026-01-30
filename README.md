<div align="center">

# CraftCommand

**Professional Minecraft server management platform focused on local-first and team hosting.**

![version](https://img.shields.io/badge/version-v1.6.2--stable-emerald)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)
![license](https://img.shields.io/badge/license-MIT-blue.svg)

A self-hosted Minecraft control panel designed to **prevent mistakes**, **explain problems**, and **scale safely from solo use to small teams**.

Built with **React 19** and **Node.js**, featuring **granular permissions**, **audit logging**, and **secure, guided connectivity options**.

[Features](#features) • [Quick Start](#quick-start) • [Security Model](#security-model) • [Documentation](#documentation)

</div>

---

## Features

### Core Server Management

- **Real-time Console** — Low-latency WebSocket terminal with ANSI color and command history
- **Smart Monitoring** — Live CPU / RAM / TPS tracking with crash detection
- **File Manager** — IDE-like editor with syntax highlighting and safety checks
- **Server Architect** — Guided setup for Paper, Purpur, Fabric, Forge, NeoForge, and Modpacks
- **Automated Backups** — Scheduled snapshots with retention policies
- **⚠️Velocity Proxy** Temporarily disabled due to stability issues. It will be reimplemented in a future update.

---

### Multi-User & Access Control

- **Role-Based Access Control (RBAC)**: Comprehensive system (Owner, Admin, Manager, Viewer) with hardened enforcement.
- **Per-Server Permissions**: Fine-grained access control lists (ACLs) for specific server instances.
- **Secure Authentication**: JWT-based session management with robust token handling and 1.6.0 stable synchronization.
- **Audit Logging**: Immutable record of all system actions, login attempts, and configuration changes.

---

### Connectivity & Remote Access

- **Local-First by Default**: Binds to `127.0.0.1` unless explicitly changed.
- **Remote Access (Beta)**: Securely expose servers via VPN, Reverse Proxy, or Direct Binding with a guided configuration wizard.
- **Bind Management**: Strict `127.0.0.1` default binding with opt-in `0.0.0.0` exposure.
- **HTTPS Support (Advanced)**: Optional native SSL support or reverse-proxy setup for secure access.

---

### Advanced Architecture & Stability

- **SQLite Storage**: Reliable local database option for multi-user setups (Stable).
- **Pro-Grade Dashboard**: High-density 60FPS UI with compact controls and advanced resource visualization (v1.6.0).
- **Diagnostics Engine**: Automated heuristic analysis of server logs to identify common issues (16+ rules).
- **Startup Protection**: Resource locking to prevent data corruption during concurrent operations.
- **Resource Control**: CPU priority management and JVM optimization flags (Aikar's Flags).
- **Emergency Killswitch**: One-click local launcher options to instantly disable remote access.

---

## Quick Start

### Requirements

- **Node.js 18+**
- **Windows 10+**, **macOS 10.15+**, or **Linux (Ubuntu 20.04+)**

---

### Windows (Recommended)

CraftCommand includes a guided launcher — **no commands required**.

1. Run `run_locally.bat`
2. Choose **[1] Start (Auto-Setup)**
3. The dashboard opens automatically in your browser

The launcher also provides:

- HTTPS setup
- Remote access setup
- Repair / recovery options
- Emergency remote-access disable

---

### Linux / macOS (Manual)

```bash
git clone https://github.com/Extroos/craftCommand.git
cd craftcommand
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
npm run start:all
```

### Access

Open the dashboard at:  
**http://localhost:3000**

---

### Default Credentials (First Run Only)

- **Email:** `admin@craftcommand.io`
- **Password:** `admin`

You will be **required to change these credentials immediately** after the first login.

---

## Security Model

CraftCommand follows a **Secure by Default, Explicit by Choice** philosophy.

- **Network Isolation** — Local-only binding by default.
- **Explicit Exposure** — Remote access requires admin approval and clear warnings.
- **Authentication** — JWT-based sessions with bcrypt-hashed passwords.
- **Authorization** — Centralized permission enforcement across REST and WebSockets.
- **Auditability** — All sensitive actions are logged.
- **Emergency Control** — Local launcher can instantly disable remote access.

CraftCommand is designed to **make unsafe setups difficult, not easy**.

---

## Documentation

- **`docs/https.md`** — HTTPS and reverse proxy setup
- **`docs/remote-access.md`** — VPN, domain, and port-forwarding guidance
- **`SECURITY.md`** — Threat model and security guarantees
- **`reports/`** — Internal audit and stabilization reports

---

## User Roles Overview

| Role    | Scope  | Capabilities             |
| ------- | ------ | ------------------------ |
| Owner   | System | Full control             |
| Admin   | System | Manage users and servers |
| Manager | Server | Operate assigned servers |
| Viewer  | Server | Read-only access         |

---

## Technology Stack

- **Frontend:** React 19, Vite, TailwindCSS, TypeScript
- **Backend:** Node.js, Express, Socket.IO
- **Storage:** SQLite / JSON (local-first)
- **Security:** JWT, Bcrypt, Helmet

---

<div align="center">
Developed by <a href="https://github.com/Extroos">Extroos</a>
</div>
