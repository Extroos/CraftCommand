<div align="center">

<<<<<<< HEAD
# Craft-Commands
=======
# Craft Commands
>>>>>>> 58b27fd (chore: Sync project updates, documentation, and metadata)

**Professional Minecraft server management platform focused on local-first and team hosting.**

![version](https://img.shields.io/badge/version-v1.7.0--stable-emerald)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)
![license](https://img.shields.io/badge/license-MIT-blue.svg)

A self-hosted Minecraft control panel designed to **prevent mistakes**, **explain problems**, and **scale safely from solo use to small teams**.

Built with **React 19** and **Node.js**, featuring **granular permissions**, **audit logging**, and **secure, guided connectivity options**.

[Features](#features) • [Quick Start](#quick-start) • [Security Model](#security-model) • [Documentation](#documentation)

</div>

## Why Craft Commands? 🚀

Craft Commands is built to bridge the gap between simple local launchers and complex enterprise panels. It follows a **Secure by Default, Explicit by Choice** philosophy, ensuring your server environment remains stable, isolated, and accessible only when you want it to be.

---

## Features

### 🎮 For Everyone (The Smooth Experience)

- **Hybrid Orchestration (NEW)** — Run servers as local processes or isolated Docker containers with a single toggle.
- **The "Arty" Dashboard** — High-density, 60-FPS interface designed for clarity and speed. No clutter, just control.
- **Smart Monitoring** — Live CPU, RAM, and TPS tracking with automated crash detection and auto-restart.
- **One-Click modpacks** — Guided setup for Paper, Purpur, Fabric, Forge, NeoForge, and major Modpacks.
- **Zero-Config HTTPS** — Secure your panel with native SSL management handled entirely by our guided launcher.
- **File Manager IDE** — Edit configurations, logs, and properties with syntax highlighting and instant saving.

### 🛠️ For Developers & Power Users (The Engineering Edge)

- **3-State Permissions** — Granular Access Control Lists (Grant, Deny, Inherit) for every server and system node.
- **Port Protection Engine** — Proactive ghost-process purging. No more "Port already in use" errors during engine switches.
- **Automated Heuristics** — A diagnostic engine that analyzes logs in real-time to solve 90% of common startup failures.
- **Runner Abstraction** — Pluggable architecture supporting Native and Docker runners with shared lifecycle events.
- **Audit Ledger** — Immutable logging of every system action, from login attempts to hierarchy violations.
- **Aikar's Optimizations** — Built-in suite for JVM tuning, GC selection (ZGC/G1GC), and thread priority management.

---

## Quick Start

### Requirements

- **Node.js 18+**
- **Windows 10+**, **macOS 10.15+**, or **Linux (Ubuntu 20.04+)**

---

### Windows (Recommended)

Craft Commands includes a guided launcher — **no commands required**.

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
git clone https://github.com/Extroos/craft-commands.git
cd craft-commands
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

- **Email:** `admin@craftcommands.io`
- **Password:** `admin`

You will be **required to change these credentials immediately** after the first login.

---

## Security Model 🛡️

Craft Commands follows a **Secure by Default, Explicit by Choice** philosophy.

- **Network Isolation** — Local-only binding by default (`127.0.0.1`).
- **Explicit Exposure** — Remote access requires owner-level approval and guided configuration.
- **Hierarchy Guard** — Strict role-based isolation (Owner > Admin > Manager). Users cannot modify anyone at or above their own level.
- **Token Hardening** — JWT-based sessions with industry-standard bcrypt hashing for all credentials.
- **Atomic Operations** — Resource locking prevents data corruption during simultaneous server modifications.
- **Emergency Killswitch** — Instant local launcher options to sever all external connections.

---

## Technical Architecture ⚙️

- **Frontend:** React 19 (Latest), Vite, TailwindCSS, Framer Motion (60FPS animations)
- **Backend:** Node.js (CommonJS), Express, Socket.IO (Real-time streams)
- **Orchestration:** Native Process Spawning & Docker Engine Integration
- **Storage:** Hybrid SQLite (for teams) and JSON (for solo portability)
- **Security:** Helmet, Rate-Limiting, JWT, Hierarchy Middleware

---

<div align="center">
Developed by <a href="https://github.com/Extroos">Extroos</a>
</div>
