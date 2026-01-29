<div align="center">

# CraftCommand

**Enterprise-grade Minecraft server management platform with multi-user authentication**

![version](https://img.shields.io/badge/version-v1.4.0-blue)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)
![minecraft](https://img.shields.io/badge/Minecraft-local--hosting-green)
![status](https://img.shields.io/badge/status-active--development-yellow)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/react-19.x-61dafb.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org/)

A web-based control panel for managing Minecraft servers on your local machine. Built with React and Node.js, featuring **role-based access control**, **audit logging**, and **advanced diagnostics**.

[Features](#features) • [Quick Start](#quick-start) • [Documentation](#documentation) • [Security](#security) • [Roadmap](#roadmap)

</div>

---

### Core Management

- **Real-time Console**: WebSocket-powered terminal with live command execution
- **Smart Monitoring**: CPU/RAM graphs, TPS tracking, crash detection with auto-diagnosis
- **File Manager**: In-browser editor with syntax highlighting for configs and scripts
- **Server Architect**: Built-in knowledge base with guides for deployment, optimization, and hardware sizing
- **Player Management**: Ops, whitelist, bans with automatic UUID resolution
- **Automated Backups**: Scheduled ZIP snapshots with configurable retention policies
- **Plugin Marketplace**: (Preview) Browse and install plugins directly from the dashboard

### Multi-User & Security 🔐

- **Role-Based Access Control (RBAC)**: Owner, Admin, Manager, and Viewer roles
- **Per-Server Permissions**: Granular access control for start/stop, file access, console usage
- **JWT Authentication**: Secure session management with token-based authentication
- **Audit Logging**: Track all user actions (login, server operations, configuration changes)
- **Data Integrity**: Atomic file system writes and operation locking to prevent corruption

### Server Types & Installation

- **Multi-Software Support**: Paper, Purpur, Spigot, Forge, NeoForge, Fabric, Vanilla
- **Template System**: Pre-configured server templates with resource recommendations
- **One-Click Modpacks**: Browse and install from Modrinth API directly
- **Auto Java Management**: Automatically downloads and manages Java 8/11/17/21
- **Smart Installation**: Automated headless installers for Forge/NeoForge

### Advanced Features

- **Pre-Start Safety Gate**: Validates EULA, port availability, Java version before startup
- **Enhanced Diagnostics Engine**: 16+ intelligent rules for crash analysis and performance tuning
- **Discord Integration**: Webhooks and full bot control for server events
- **Resource Controls**: CPU priority management (normal/high/realtime)
- **Performance Optimization**: Aikar's Flags and Spark profiler integration

### UI/UX Excellence

- **Global State Sync**: Instant, unified UI updates across all tabs and windows
- **Startup Protection**: Intelligent locking system to prevent data corruption
- **Dynamic Accent Colors**: 8 theme presets (Emerald, Blue, Violet, Amber, Rose, etc.)
- **Reduced Motion**: Accessibility support for users preferring minimal animations
- **Glassmorphism Design**: Modern, premium aesthetic with smooth micro-animations

## Quick Start

### Prerequisites

- **Node.js 18+** ([Download](https://nodejs.org/))
- **Windows 10+**, **macOS 10.15+**, or **Ubuntu 20.04+**

### Installation

```bash
git clone https://github.com/Extroos/craftCommand.git
cd craftcommand
npm install
cd backend && npm install && cd ..
```

### Environment Configuration

Create a `.env` file in the root directory based on `.env.example`:

```env
# Backend Configuration
VITE_API_URL=http://localhost:3001

# Default Admin Credentials (CHANGE THESE!)
DEFAULT_ADMIN_EMAIL=admin@craftcommand.io
DEFAULT_ADMIN_PASSWORD=admin

# JWT Secret (Generate a secure random string)
JWT_SECRET=your-super-secret-jwt-key-change-this
```

> **⚠️ SECURITY WARNING**: Change the default credentials and JWT secret immediately before deploying!

### Run

```bash
# Windows
run_locally.bat

# macOS/Linux
npm run start:all
```

Open `http://localhost:3000` in your browser.

**Default Login Credentials:**

- Email: `admin@craftcommand.io`
- Password: `admin`

> **🔐 Important**: The default admin user is created automatically on first startup with OWNER role. Change the password immediately after first login!

## Documentation

### User Roles & Permissions

| Role    | Description                             | Default Permissions                               |
| ------- | --------------------------------------- | ------------------------------------------------- |
| OWNER   | Full system access (local machine only) | All permissions, user management, system settings |
| ADMIN   | Server and user management              | Create/delete servers, manage users, all ops      |
| MANAGER | Operational control                     | Start/stop servers, console access, file editing  |
| VIEWER  | Read-only monitoring                    | View status, logs, and stats only                 |

**Per-Server Permissions:**

- `server.view` - View server status and information
- `server.start_stop` - Start, stop, and restart servers
- `server.console` - Execute console commands
- `server.files` - Access and edit server files
- `server.settings` - Modify server configuration
- `users.manage` - Create, update, and delete users (Admin+)

### Supported Server Types

| Software | Versions       | Notes                       |
| -------- | -------------- | --------------------------- |
| Paper    | 1.8 - 1.21+    | Recommended for performance |
| Purpur   | 1.16 - 1.21+   | Feature-rich Paper fork     |
| Spigot   | 1.8 - 1.21+    | Plugin-compatible           |
| Vanilla  | 1.8 - 1.21+    | Official Mojang server      |
| Fabric   | 1.14 - 1.21+   | Lightweight mod loader      |
| Forge    | 1.7 - 1.20.6   | Classic mod platform        |
| NeoForge | 1.20.4 - 1.21+ | Modern Forge fork           |
| Modpacks | All            | Modrinth integration        |

### Architecture

```
Browser (localhost:3000) → Vite Dev Server → Backend (localhost:3001) → Minecraft Servers
                                                    ↓
                                            JWT Auth + RBAC
                                            Audit Logging
                                            WebSocket Events
```

**Network Ports:**

- `3000`: Frontend (Vite development server)
- `3001`: Backend (Express + Socket.IO)
- `25565`: Default Minecraft server port (configurable per-server)

### Project Structure

craftcommand/
├── frontend/ # React Application
│ ├── src/
│ │ ├── components/ # UI Components
│ │ │ ├── Auth/ # Login filters
│ │ │ ├── Views/ # Dashboard pages
│ │ │ └── ...
│ │ ├── context/ # React Context (User, Server)
│ │ └── App.tsx # Main Entry
├── backend/ # Node.js Backend
│ ├── src/
│ │ ├── services/ # Business Logic (20+ services)
│ │ ├── routes/ # API Endpoints
│ │ └── minecraft_servers/ # Server Instances (Gitignored)
├── shared/ # Shared Types
└── docs/ # Documentation

### System Requirements

**Minimum:**

- CPU: Dual-core @ 2.0 GHz
- RAM: 4 GB (2 GB for Minecraft)
- Disk: 5 GB (SSD recommended)

**Recommended:**

- CPU: Quad-core @ 3.0 GHz+
- RAM: 16 GB (8 GB+ for modded servers)
- Disk: 20 GB SSD

## Security

### Authentication & Authorization

CraftCommand uses a robust security model:

1. **JWT-based authentication** with secure HTTP-only token storage
2. **Role-Based Access Control (RBAC)** with 4 predefined roles
3. **Per-server permission system** for fine-grained access control
4. **Bcrypt password hashing** (cost factor: 10)
5. **Audit logging** for all critical operations

### Best Practices

✅ **DO:**

- Change default admin credentials immediately
- Use strong, unique passwords for all users
- Generate a secure random JWT secret (minimum 32 characters)
- Review audit logs regularly for suspicious activity
- Keep Node.js and dependencies up to date

❌ **DON'T:**

- Expose the application to the internet without additional security layers
- Share JWT secrets or commit them to version control
- Grant OWNER role to multiple users (use ADMIN instead)
- Disable authentication in production environments

### Environment Variables

Required environment variables in `.env`:

```bash
# API Configuration
VITE_API_URL=http://localhost:3001

# Authentication
DEFAULT_ADMIN_EMAIL=admin@craftcommand.io
DEFAULT_ADMIN_PASSWORD=admin
JWT_SECRET=your-super-secret-jwt-key-change-this

# Optional: Custom JWT expiration (default: 24h)
JWT_EXPIRES_IN=24h
```

## Roadmap

### ✅ Completed (Milestone 1-4)

#### Multi-User Foundation

- [x] Multi-user authentication system (JWT + sessions)
- [x] Role-Based Access Control (OWNER, ADMIN, MANAGER, VIEWER)
- [x] Per-server permission management
- [x] Audit logging backend service
- [x] Secure password hashing and update flows
- [x] User management UI (create, update, delete users)

#### Templates & Resources

- [x] Server template system with wizard-based creation
- [x] Resource control (CPU priority: normal/high/realtime)
- [x] Auto-populate RAM/port recommendations from templates
- [x] Modrinth modpack browser integration

#### Diagnostics & Safety

- [x] Pre-start safety gate (EULA, port, Java validation)
- [x] Enhanced diagnostics engine (16+ intelligent rules)
- [x] Smart crash analysis with actionable suggestions
- [x] Startup protection and operation locking

#### Core Features

- [x] Real-time console streaming
- [x] Live CPU/RAM monitoring with charts
- [x] File manager with syntax highlighting
- [x] Automated backup system with scheduling
- [x] One-click server installation (all major platforms)
- [x] Forge/NeoForge headless installer
- [x] Crash detection and log analysis
- [x] Player management (ops, whitelist, bans)
- [x] Aikar's Flags JVM optimization
- [x] Automatic Java provisioning (8/11/17/21)
- [x] Discord webhook integration

- [x] Spark profiler integration
- [x] Purpur server support

#### Type Safety & Build Quality

- [x] Complete TypeScript type synchronization
- [x] Frontend/Backend type alignment
- [x] Zero compilation errors
- [x] Comprehensive interface definitions

### 🚧 In Progress (Milestone 4 continued)

- [ ] **Audit Log UI**: Web interface to view and filter audit events
- [ ] **API Token System**: Generate tokens for external integrations

### 📋 Planned

#### Host Mode Features

- [ ] Remote access with optional authentication
- [ ] Multi-server dashboard for managing multiple hosts
- [ ] Docker containerization for easy deployment
- [ ] Smart Proxy Wizard (hostname routing, unified port setup)

#### Advanced Features

- [ ] Plugin marketplace with real download capability
- [ ] RCON protocol support for remote console
- [ ] World backup/restore with version control
- [ ] Automated plugin updates
- [ ] Server clustering (multiple nodes)

## Technologies

**Frontend:**  
React 19 • Vite • TypeScript • TailwindCSS • Socket.IO Client • Framer Motion • Recharts

**Backend:**  
Node.js • Express • Socket.IO • TypeScript • JWT • Bcrypt • Archiver • Chokidar • Systeminformation • Minecraft Server Util

**Build Tools:**  
ts-node • nodemon • ESBuild (via Vite)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with clear commit messages
4. Ensure all TypeScript compilation passes (`npm run build`)
5. Test your changes thoroughly
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request with a detailed description

## Known Limitations

- **Local-first**: Designed for local machine hosting, not cloud deployment
- **HTTPS**: Not supported (local HTTP only, use reverse proxy for SSL)
- **Multi-tenancy**: Single-user desktop application (multi-user auth is for access control, not isolation)
- **Large logs**: Files >100MB may cause performance issues in console viewer
- **Windows specific**: Some features (CPU priority) work best on Windows

## Troubleshooting

### Backend won't start (EADDRINUSE)

**Problem**: Port 3001 is already in use  
**Solution**: Kill existing Node.js processes using port 3001

```powershell
# Windows PowerShell
Get-Process node | Stop-Process -Force

# macOS/Linux
killall node
```

### Frontend can't connect to backend

**Problem**: CORS or connection refused errors  
**Solution**: Ensure `VITE_API_URL` in `.env` points to `http://localhost:3001`

### Type errors after git pull

**Problem**: TypeScript compilation errors  
**Solution**: Ensure types are synchronized

```bash
# Frontend and backend should have identical types.ts
copy types.ts backend\src\types.ts  # Windows
cp types.ts backend/src/types.ts    # macOS/Linux
```

## License

MIT License - see [LICENSE](LICENSE) file.

**Third-party:**

- Minecraft © Mojang Studios
- Modrinth API © Modrinth
- PaperMC API © PaperMC
- Spark © lucko

**Disclaimer:**
This project is not affiliated with Mojang Studios or Microsoft. Users are responsible for accepting the Minecraft EULA when downloading and running server software.

---

<div align="center">

**Developed by [Extroos](https://github.com/Extroos) with AI assistance**

[Report Bug](https://github.com/Extroos/craftCommand/issues) · [Request Feature](https://github.com/Extroos/craftCommand/issues) · [Discussions](https://github.com/Extroos/craftCommand/discussions)

</div>
