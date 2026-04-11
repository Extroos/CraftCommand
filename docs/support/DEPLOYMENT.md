# Deployment Guide

This guide covers deploying CraftCommand on **Windows** and **Linux** systems. For architecture details, see [ARCHITECTURE.md](../ARCHITECTURE.md).

---

## Windows Deployment

### Requirements
- **Node.js**: 18.x or 20.x
- **Java**: JRE 17, 21, or 25
- **OS**: Windows 10/11 or Windows Server 2019+

### Quick Start (Manual)
1. Install requirements.
2. Clone repository and entry: `cd Craft-Commands`.
3. Run `run_CraftCommand.bat` and select **Option [1]**.

### Running as a Windows Service (NSSM)

To keep CraftCommand running after reboot and auto-restart on crash:

1. Download [NSSM](https://nssm.cc/download) and extract `nssm.exe` to a folder in your PATH (e.g., `C:\Tools\`)

2. Build the backend:
   ```cmd
   cd backend
   npm run build
   ```

3. Install the service:
   ```cmd
   nssm install CraftCommandPanel "C:\Program Files\nodejs\node.exe" "C:\path\to\Craft-Commands\backend\dist\server.js"
   nssm set CraftCommandPanel AppDirectory "C:\path\to\Craft-Commands"
   nssm set CraftCommandPanel AppEnvironmentExtra "NODE_ENV=production"
   nssm set CraftCommandPanel AppStdout "C:\path\to\Craft-Commands\logs\panel-stdout.log"
   nssm set CraftCommandPanel AppStderr "C:\path\to\Craft-Commands\logs\panel-stderr.log"
   nssm set CraftCommandPanel AppRotateFiles 1
   nssm set CraftCommandPanel AppRotateBytes 10485760
   ```

4. Start the service:
   ```cmd
   nssm start CraftCommandPanel
   ```

5. Verify:
   ```cmd
   nssm status CraftCommandPanel
   ```

To remove:
```cmd
nssm stop CraftCommandPanel
nssm remove CraftCommandPanel confirm
```

---

## Linux Deployment

### Requirements
- **OS**: Ubuntu 22.04+, Debian 12+, Rocky Linux 9+
- **Node.js**: 18.x or 20.x
- **Java**: OpenJDK 17, 21, or 25 (headless is sufficient)
- **Permissions**: Sudo access for service installation

### Quick Start (Manual)

```bash
git clone https://github.com/Extroos/Craft-Commands.git
cd Craft-Commands
chmod +x run_CraftCommand.sh
./run_CraftCommand.sh
```

This runs CraftCommand interactively. Close the terminal and it stops. For persistence, use systemd below.

### Production Deployment with systemd

#### 1. Create a dedicated user

```bash
sudo useradd -r -m -d /opt/craftcommand -s /bin/bash craftcommand
```

#### 2. Install CraftCommand

```bash
sudo -u craftcommand git clone https://github.com/Extroos/Craft-Commands.git /opt/craftcommand
cd /opt/craftcommand

# Install dependencies
sudo -u craftcommand npm install
cd backend && sudo -u craftcommand npm install && sudo -u craftcommand npm run build && cd ..
cd frontend && sudo -u craftcommand npm install && sudo -u craftcommand npm run build && cd ..
cd agent && sudo -u craftcommand npm install && sudo -u craftcommand npm run build && cd ..
```

#### 3. Configure environment

```bash
sudo -u craftcommand cp .env.example .env
sudo -u craftcommand nano .env
```

**Required changes in `.env`:**
```env
JWT_SECRET=<generate-a-random-64-char-string>
BACKEND_PORT=3001
NODE_ENV=production
```

Generate a secure JWT secret:
```bash
openssl rand -base64 48
```

#### 4. Create data directories

```bash
sudo -u craftcommand mkdir -p /opt/craftcommand/{data,minecraft_servers,backups,logs,uploads}
```

#### 5. Install the systemd service

```bash
# Copy the service file
sudo cp /opt/craftcommand/scripts/systemd/craftcommand-panel.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable auto-start on boot
sudo systemctl enable craftcommand-panel

# Start the service
sudo systemctl start craftcommand-panel

# Check status
sudo systemctl status craftcommand-panel
```

#### 6. View logs

```bash
sudo journalctl -u craftcommand-panel -f
```

#### 7. Firewall

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 3001/tcp comment "CraftCommand Panel"
sudo ufw allow 25565/tcp comment "Minecraft Default"

# RHEL/Rocky (firewalld)
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --permanent --add-port=25565/tcp
sudo firewall-cmd --reload
```

### Alternative: Running with PM2

If you prefer PM2 over systemd:

```bash
sudo npm install -g pm2

cd /opt/craftcommand/backend
pm2 start dist/server.js --name craftcommand-backend

# Auto-start on reboot
pm2 startup
pm2 save
```

---

### Node Agent Deployment (Linux / Windows)

For managing server instances on machines separate from the Primary Panel, use the technical enrollment protocol:

#### 1. Token Generation
- Navigate to **Node Registry -> Add Node**.
- The system generates a join token (TTL: 15 minutes) and a bootstrap command.

#### 2. Agent Execution
Execute the bootstrap command on the target host.

**Linux / macOS:**
```bash
./run_CraftCommand.sh --join http://<panel-url>:3001 <token>
```

**Windows (PowerShell):**
```powershell
.\run_CraftCommand.bat --join http://<panel-url>:3001 <token>
```

#### 3. Identity Handshake
The agent uses the token to retrieve persistent Ed25519 identity strings from the panel via WebSocket. Upon successful handshake, the status transitions to `ONLINE` in the Node Registry.

---

## Docker Deployment

The `docker-compose.yml` orchestrates the backend services and the local agent daemon.

```bash
cd Craft-Commands
docker-compose up -d
```

### Remote Agent via Docker

If you wish to spin up a remote agent strictly via Docker, you can use the standalone enrollment:
```bash
docker run -d \
  --name craftcommand-agent \
  -e PANEL_URL=http://<panel-url>:3001 \
  -e JOIN_TOKEN=<token> \
  -v /var/run/docker.sock:/var/run/docker.sock \
  extroos/craftcommand-agent:latest
```

---

## File Locations

| Path | Contents |
|---|---|
| `data/` | Panel metadata (configs, users, sessions, audit logs) |
| `data/servers.json` | Server configurations |
| `data/users.json` | User accounts (bcrypt-hashed passwords) |
| `minecraft_servers/` | Actual Minecraft server files (JARs, worlds, configs) |
| `backups/` | Server backup ZIP archives |
| `logs/` | Panel and health logs |
| `.env` | Environment config (JWT secret, ports) |

---

## Troubleshooting

### Panel won't start
```bash
# Check logs
sudo journalctl -u craftcommand-panel -n 50

# Common issues:
# - "JWT_SECRET is not set" → Edit .env and add a proper secret
# - "EACCES permission denied" → Fix ownership: chown -R craftcommand:craftcommand /opt/craftcommand
# - "EADDRINUSE" → Port 3001 in use. Kill the other process or change BACKEND_PORT in .env
```

### Agent won't connect
```bash
# Check agent logs
sudo journalctl -u craftcommand-agent -n 50

# Common issues:
# - "Connection failed" → Verify PANEL_URL is reachable (curl http://panel:3001/api/system/status)
# - "Token Expired 401" → Join tokens expire after 15 minutes. Generate a new one in the UI.
# - Firewall blocking → Ensure port 3001 is open on the panel machine
```

### Minecraft server won't start
- Check the server's **Diagnosis** tab in the panel UI
- Common auto-fixed issues: EULA not accepted, port conflict, Java not found
- If server enters Safe Mode after 3 crashes: review logs, fix the root cause, then click "Reset Safe Mode"
