<div align="center">

# CraftCommand

**Professional Minecraft server management platform focused on local-first and team hosting.**

![version](https://img.shields.io/badge/version-v1.5.0--unstable-orange)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)
![license](https://img.shields.io/badge/license-MIT-blue.svg)

> ⚠️ **Version 1.5.0 is currently UNSTABLE**  
> This release introduces major architectural changes (permissions, HTTPS, remote access foundations).
> Do not use in production without backups.

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

---

### Multi-User & Permissions
- **Role-Based Access Control (RBAC)** — Owner / Admin / Manager / Viewer
- **Per-Server ACLs** — Fine-grained permissions per server instance
- **Deny-Wins Authorization** — Explicit denies always override role grants
- **Audit Logging** — Append-only logs for logins, commands, file edits, and lifecycle actions

---

### Connectivity & Remote Access
- **Local-First by Default** — Binds to `127.0.0.1` unless explicitly changed
- **Remote Access (Opt-in / Beta)**  
  Guided setup for:
  - VPN-based access (recommended, no port forwarding)
  - Reverse proxy with domain (Caddy / Nginx)
  - Direct binding with port forwarding (advanced)
- **HTTPS Support (Advanced)**  
  - Native HTTPS (user-provided certificates)
  - Reverse-proxy HTTPS (recommended)
  - ⚠️ HTTPS encrypts traffic but does NOT automatically expose the panel

---

### Stability & Safety
- **Startup Protection** — Prevents port conflicts and unsafe launches
- **Config Verification Gate** — Detects mismatches before starting servers
- **Emergency Remote-Access Disable** — One-click local killswitch
- **Diagnostics Engine** — Automated analysis of common Minecraft server issues
- **Resource Controls** — JVM tuning (Aikar flags), CPU priority management

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
git clone https://github.com/Extroos/craftCommand.git
cd craftcommand
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
npm run start:all

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

| Role    | Scope  | Capabilities |
|--------|--------|--------------|
| Owner  | System | Full control |
| Admin  | System | Manage users and servers |
| Manager| Server | Operate assigned servers |
| Viewer | Server | Read-only access |

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
