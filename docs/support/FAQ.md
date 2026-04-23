# Frequently Asked Questions (FAQ)

## General

### What is CraftCommand?
A self-hosted web panel for managing Minecraft servers (Java and Bedrock). You run it on your machine, open `localhost:3000`, and create/configure/monitor servers from the browser.

### Is it free?
Yes. Open-source under AGPLv3. No licensing fees for personal or production use.

### Why CraftCommand instead of Crafty Controller / Pterodactyl / AMP?

Honest comparison — every panel has trade-offs:

| Feature | CraftCommand | Crafty Controller | Pterodactyl |
|---|---|---|---|
| **Crash diagnosis** | Reads crash logs, identifies the cause (40+ patterns), and attempts automatic fixes (wrong Java, EULA, port conflicts, bad mods) | Restarts the process; no log analysis | Restarts the process; no log analysis |
| **Mod management** | Built-in Modrinth browser. Auto-detects client-only mods and quarantines them. Resolves missing dependencies | No mod management | No mod management |
| **Multi-machine** | Manage servers across multiple physical machines from one panel (WebSocket agents) | Single machine only | Multi-machine via Wings nodes |
| **File editor** | Monaco (VS Code) editor built in | Basic file manager | Basic file manager |
| **Database requirement** | None (JSON files). SQLite optional for scale | SQLite required | MySQL required |
| **Maturity** | Beta — solo developer, smaller community | Stable — established community | Stable — large community, production-proven |
| **Language** | Node.js / TypeScript | Python | PHP / Go |
| **Docker support** | docker-compose for panel + agents | Docker native | Docker native |

**Be honest with yourself:** If you need battle-tested stability and a large support community, Pterodactyl or Crafty are more mature. CraftCommand's advantages are crash intelligence, mod management, and simple setup (no external DB).

## Mods & Plugins

### How does mod filtering work?
When you browse mods from the panel, CraftCommand queries the Modrinth API and checks each mod's `environment` tags. If a mod is marked as `client`-only and `server: unsupported`, it's automatically moved to a `_client_mods/` folder instead of the `mods/` folder, so it won't crash your server on startup.

If a mod requires other mods to work, CraftCommand detects those missing dependencies and offers to install them automatically.

### Which Java version do I need?
CraftCommand can manage this per-server:
- **MC 1.21+**: Java 21+
- **MC 1.18 – 1.20**: Java 17
- **MC 1.8 – 1.16**: Java 8 or 11

## Multi-Machine Setup

### How do I manage servers on another machine?
1. In the panel, go to **Node Registry → Add Node**
2. Copy the join command (it includes a one-time token that expires in 15 minutes)
3. Run the command on the remote machine
4. The agent connects to the panel via WebSocket and appears as "Online"

You can manage multiple remote machines from one panel.

### What does the panel store?
- **Default**: JSON files in the `data/` folder (zero-dependency, portable)
- **Optional**: SQLite database for setups with many concurrent users or 100+ servers

## Operations

### How do I reset my admin password?
Edit `backend/data/users.json` and replace the `password` field with a new bcrypt hash. You can generate one with:
```bash
node -e "const b=require('bcryptjs');b.hash('newpassword',12,(e,h)=>console.log(h))"
```

### Is the panel accessible remotely?
By default, it binds to `127.0.0.1` (localhost only). To allow remote access:
- Bind to `0.0.0.0` in `.env`, or
- Use an outbound tunnel (Cloudflare, Playit.gg), or
- Put it behind a reverse proxy (Caddy/Nginx) with TLS
