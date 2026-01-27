<div align="center">

# CraftCommand

**Full-stack Minecraft server management platform for local hosting**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/react-19.x-61dafb.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org/)

A web-based control panel for managing Minecraft servers on your local machine. Built with React and Node.js.

[Features](#features) • [Quick Start](#quick-start) • [Documentation](#documentation) • [Roadmap](#roadmap)

</div>

---

## Features

- **Real-time Console**: WebSocket-powered terminal with live command execution
- **One-Click Modpacks**: Browse and install from Modrinth API directly
- **Automated Backups**: Scheduled ZIP snapshots with retention policies
- **Smart Monitoring**: CPU/RAM graphs, crash detection, performance hints
- **Multi-Software**: Paper, Spigot, Forge, NeoForge, Fabric, Vanilla support
- **Auto Java**: Automatically downloads and manages Java 8/11/17/21
- **File Manager**: In-browser editor for configs and scripts
- **Player Management**: Ops, whitelist, bans with UUID resolution
- **Discord Webhooks**: Server event notifications (start/stop/crash/join/leave)
- **Startup Protection**: Intelligent locking system to prevent data corruption during boot sequences
- **Global State Sync**: Instant, unified UI updates across all tabs and windows
- **Secure Authentication**: Built-in admin password management with professional login interface
- **Auto-Backup**: One-click automation to snapshot servers every 2 hours without manual cron setup
=======

## Quick Start

### Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- Windows 10+, macOS 10.15+, or Ubuntu 20.04+

### Installation

```bash
git clone https://github.com/Extroos/craftCommand.git
cd craftcommand
npm install
cd backend && npm install && cd ..
```

### Run

```bash
# Windows
run_locally.bat

# macOS/Linux
npm run start:all
```

Open `http://localhost:3000` in your browser.

**Default credentials:**

- Email: `admin@craftcommand.local`
- Password: `changeme`

## Documentation

### Supported Server Types

| Software | Versions       | Notes                       |
| -------- | -------------- | --------------------------- |
| Paper    | 1.8 - 1.21+    | Recommended for performance |
| Spigot   | 1.8 - 1.21+    | Plugin-compatible           |
| Vanilla  | 1.8 - 1.21+    | Official Mojang server      |
| Fabric   | 1.14 - 1.21+   | Lightweight mod loader      |
| Forge    | 1.7 - 1.20.6   | Classic mod platform        |
| NeoForge | 1.20.4 - 1.21+ | Modern Forge fork           |
| Modpacks | All            | Modrinth integration        |

### Architecture

```
Browser (localhost:3000) → Vite Dev Server → Backend (localhost:3001) → Minecraft Servers
```

**Ports:**

- `3000`: Frontend (Vite)
- `3001`: Backend (Express + Socket.IO)
- `25565`: Default Minecraft port (configurable)

### Key Directories

```
craftcommand/
├── components/           # React UI
├── backend/
│   ├── src/services/    # 14 backend services
│   ├── data/            # Runtime data (servers.json, backups, etc.)
│   └── minecraft_servers/ # Server instances
├── services/api.ts      # Frontend API client
└── vite.config.ts       # Dev server config
```

### System Requirements

**Minimum:**

- CPU: Dual-core @ 2.0 GHz
- RAM: 4 GB (2 GB for Minecraft)
- Disk: 5 GB (SSD recommended)

**Recommended:**

- CPU: Quad-core @ 3.0 GHz+
- RAM: 16 GB (8 GB+ for modded)
- Disk: 20 GB SSD

## Roadmap

### Completed (Phases 1-20)
=======
### Completed

- [x] Real-time console streaming
- [x] Live CPU/RAM monitoring
- [x] File manager with syntax highlighting
- [x] Automated backup system with scheduling
- [x] One-click server installation (Paper, Vanilla, Spigot, Fabric)
- [x] Forge/NeoForge headless installer
- [x] Modrinth modpack browser
- [x] Crash detection and log analysis
- [x] Player management (ops, whitelist, bans)
- [x] Aikar's Flags JVM optimization
- [x] Automatic Java provisioning
- [x] Discord webhook integration
<<<<<<< HEAD
- [x] **Status Stabilization**: True `STARTING` vs `ONLINE` states, startup lock protection
- [x] **Player Tracking**: Real-time join/leave events, port conflict prevention
- [x] **Security Hardening**: Secure login redesign, password update system
- [x] **UI/UX Polish**: Dynamic header status, custom branding, glassmorphism UI
- [x] Proxy mode support (Velocity/BungeeCord)
- [x] Spark profiler integration
- [x] Advanced system settings

### In Progress (Phases 21-22)

- [ ] Plugin marketplace (Backend implementation)
=======

### In Progress

- [ ] Proxy mode support (Velocity/BungeeCord)
- [ ] Spark profiler integration
- [ ] Advanced system settings

### Planned

- [ ] Multi-server dashboard
- [ ] Docker containerization
- [ ] RCON support
<<<<<<< HEAD
=======
- [ ] Plugin marketplace

## Technologies

**Frontend:** React 19, Vite, TypeScript, Socket.IO Client, Framer Motion  
**Backend:** Node.js, Express, Socket.IO, TypeScript, Archiver, Chokidar, Systeminformation

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/name`)
3. Commit changes (`git commit -m 'Add feature'`)
4. Push to branch (`git push origin feature/name`)
5. Open Pull Request

## Known Limitations

- **HTTPS**: Not supported (local HTTP only)
- **Multi-user**: Single-user desktop application
- **Plugin Marketplace**: UI mockup only (no real downloads)
- **Large logs**: Files >100MB may crash console viewer

## License

MIT License - see [LICENSE](LICENSE) file.

**Third-party:**

- Minecraft © Mojang Studios
- Modrinth API © Modrinth
- PaperMC API © PaperMC

---

<div align="center">

**Developed by [Extroos](https://github.com/Extroos) with AI assistance**

[Report Bug](https://github.com/Extroos/craftCommand/issues) · [Request Feature](https://github.com/Extroos/craftCommand/issues)

</div>
