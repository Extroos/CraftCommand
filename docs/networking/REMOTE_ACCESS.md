# Remote Access & Security Proxy Guide

Communication in CraftCommand is secure by default (localhost only). To expose your server to friends or the public, you must understand the two layers of remote access: **Securing the Connection (HTTPS)** and **Exposing the Network**.

## 🛑 Security Hardening First

Before enabling external access, ensure your installation is hardened:

1.  **Strict Authentication**: Every administrative account must have a strong password. Manage these in `Global Settings -> Users`.
2.  **Two-Factor Authentication (2FA)**: **Recommended** - Enable native TOTP protection in your User Profile to prevent account takeovers via leaked passwords.
3.  **Session Management**: Use the "Logout All Devices" feature if you suspect account compromise to instantly invalidate all active JWT sessions.
4.  **Rate Limiting**: CraftCommand automatically prevents brute-force attacks by banning IPs after 5 failed login attempts for 1 hour.
5.  **Owner Lock**: Only accounts with the `Owner` role can toggle **Remote Access Mode**.

---

## Part 1: Exposing the Network (Remote Access)

Choose the method that fits your technical comfort level.

### Option A: Tunneling & Mesh VPN (High Security)

**Best for**: Private groups, avoiding router configuration.

1.  **Tailscale** or **ZeroTier**: Install these on your host machine and your friends' devices.
2.  **Private IP**: Friends connect using your assigned VPN IP (e.g., `100.x.y.z:3000`).
3.  **Pros**: No open ports on your router; end-to-end encryption.

### Option B: Built-in Reverse Tunneling (Playit.gg)

**Best for**: Game + Dashboard access without port forwarding.

1.  Go to `run_CraftCommand.bat` or System Settings.
2.  Select **[5] Setup Remote Access** -> **[2] Playit.gg (Reverse Proxy)**.
3.  Follow the generated "Claim URL" to link your account.

### Option C: Traditional Port Forwarding (Advanced)

**Best for**: High-performance public servers.

1.  **Router Config**: Forward TCP/UDP port **25565** (Minecraft) and TCP port **3000** (Panel) to your host's local IP.
2.  **Toggle Mode**: Go to **Global Settings** and enable **"Remote Access Mode"**. This allows the backend to bind to `0.0.0.0` instead of `127.0.0.1`.
3.  **Warning**: Your public IP is visible. Bots will scan these ports within minutes.

---

## Part 2: Securing the connection (HTTPS)

Once your panel is exposed, you **must** use a Reverse Proxy to provide SSL/TLS encryption.

### Method 1: Caddy (Recommended for Auto-HTTPS)

Caddy handles SSL certificate renewal automatically via Let's Encrypt.

1.  Download [Caddy](https://caddyserver.com/).
2.  Create a `Caddyfile` in the root directory:
    ```caddyfile
    your-domain.com {
        reverse_proxy localhost:3000
    }
    ```
3.  Run `caddy run`.

### Method 2: Nginx (Standard Configuration)

For existing Nginx setups, use the following block. Note the **Upgrade** and **Connection** headers are critical for the Socket.IO console.

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Emergency Disable

If you suspect unauthorized access or are under a DDoS attack:

1.  Run `run_CraftCommand.bat` -> **Option [6] Emergency Disable**.
2.  This instantly re-binds the panel to `127.0.0.1` and blocks all external WebSocket traffic.
