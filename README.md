<div align="center">

# CraftCommand

**Professional Minecraft server management platform focused on local and team hosting.**

![version](https://img.shields.io/badge/version-v1.5.0--unstable-orange)

> [!WARNING]
> **Version 1.5.0 is currently UNSTABLE.** Use with caution in production environments.
> ![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)
> ![license](https://img.shields.io/badge/license-MIT-blue.svg)

A robust, self-hosted control panel designed for security, performance, and scalability. Built with **React 19** and **Node.js**, featuring **Granular RBAC**, **Audit Logging**, and **Secure Connectivity Options**.

[Features](#features) • [Quick Start](#quick-start) • [Security](#security) • [Documentation](#documentation)

</div>

---

## Features

### Core Management

- **Real-time Console**: Low-latency WebSocket terminal with command history and ANSI color support.
- **Smart Monitoring**: Live resource tracking (CPU/RAM/TPS) and automatic crash detection.
- **File Manager**: Integrated IDE-like editor with syntax highlighting for configuration files.
- **Server Architect**: Automated deployment wizard for Paper, Purpur, Fabric, Forge, and Modpacks.
- **Automated Backups**: Configurable retention policies and scheduled snapshots.

### Multi-User & Access Control

- **Role-Based Access Control (RBAC)**: Pre-defined roles (Owner, Admin, Manager, Viewer) with distinct privilege levels.
- **Per-Server Permissions**: Fine-grained access control lists (ACLs) for specific server instances.
- **Secure Authentication**: JWT-based session management with automatic token rotation.
- **Audit Logging**: Immutable record of all system actions, login attempts, and configuration changes.

### Connectivity & Network

- **Remote Access (Beta)**: Securely expose servers via VPN, Reverse Proxy, or Direct Binding with a guided configuration wizard.
- **Bind Management**: Strict `127.0.0.1` default binding with opt-in `0.0.0.0` exposure.
- **HTTPS Support (Advanced)**: Optional native SSL support or reverse-proxy setup for secure access.

### Advanced Architecture

- **SQLite Storage**: Reliable local database option for multi-user setups (v1.4.3+).
- **Redesigned Global Settings**: More compact and professional UI (v1.5.0).
- **Diagnostics Engine**: Automated heuristic analysis of server logs to identify common issues (16+ rules).
- **Startup Protection**: Resource locking to prevent data corruption during concurrent operations.
- **Resource Control**: CPU priority management and JVM optimization flags (Aikar's Flags).

---

## Quick Start

### Prerequisites

- **Node.js 18+**
- **Operating System**: Windows 10+, macOS 10.15+, or Ubuntu 20.04+

### Installation via Launcher (Windows)

The included batch launcher handles dependency resolution and environment verification automatically.

1. Run `run_locally.bat`
2. Select **[1] Start (Auto-Setup)**

### Manual Installation (Linux/macOS)

```bash
git clone https://github.com/Extroos/craftCommand.git
cd craftcommand
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
npm run start:all
```

Access the dashboard at `http://localhost:3000`.

### Default Credentials

- **Email**: `admin@craftcommand.io`
- **Password**: `admin`

> **Note**: You will be forced to change these credentials immediately upon first login.

---

## Security Model

CraftCommand adheres to a "Secure by Default" philosophy.

1.  **Network Isolation**: The backend binds strictly to `localhost` by default. Remote access requires explicit administrative enablement.
2.  **Authentication**: All sensitive endpoints require a valid JWT. Passwords are hashed using Bcrypt (Cost 10).
3.  **Authorization**: A "Deny-Wins" permission logic ensures strict enforcement of Access Control Lists.
4.  **Emergency Killswitch**: Local launcher option to instantly disable remote access and reset bindings.

---

## Documentation

### User Roles

| Role        | Scope  | Description                                                                    |
| :---------- | :----- | :----------------------------------------------------------------------------- |
| **OWNER**   | System | Full access to all servers, user management, and system settings.              |
| **ADMIN**   | System | Can create servers and manage users, but cannot modify root system config.     |
| **MANAGER** | Server | Can start/stop servers, access console, and edit files for assigned instances. |
| **VIEWER**  | Server | Read-only access to console output and status metrics.                         |

### Project Structure

```text
craftcommand/
├── backend/                 # Node.js API & WebSocket Server
│   ├── src/services/        # Business Logic & Singletons
│   ├── src/routes/          # REST API Endpoints
│   └── src/storage/         # JSON/SQLite Repositories
├── frontend/                # React 19 Single Page Application
│   ├── src/components/      # UI Components
│   └── src/context/         # Global State Management
├── shared/                  # TypeScript Type Definitions
└── docs/                    # Technical Documentation
```

### Supported Server Software

- **Paper / Purpur** (Recommended for performance)
- **Fabric / Forge / NeoForge** (Modding capability)
- **Vanilla / Spigot**
- **Modpacks** (Modrinth API Integration)

---

## Technologies

- **Frontend**: React 19, Vite, TailwindCSS, TypeScript
- **Backend**: Node.js, Express, Socket.IO, SQLite
- **Security**: JSON Web Tokens (JWT), Bcrypt, Helmet
- **System**: SystemInformation, Child Process management

---

<div align="center">
Developed by <a href="https://github.com/Extroos">Extroos</a>
</div>
