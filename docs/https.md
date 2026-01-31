# HTTPS & Reverse Proxy Guide

Craft Commands runs by default on **HTTP** (port 3000/3001) for local development and LAN usage.

> [!IMPORTANT]
> **HTTPS does not equal Remote Access.**
> Configuring HTTPS secures the connection, but it **does not** automatically make your server visible to the internet. You still need to configure **Port Forwarding** or use a **VPN** (See `docs/remote-access.md`).

For secure remote access or team usage, we **strongly recommend** using a Reverse Proxy to handle HTTPS.

## Method 1: Caddy (Recommended)

[Caddy](https://caddyserver.com/) is the easiest way to get automatic HTTPS (including local certificates).

### 1. Install Caddy

Download Caddy from [caddyserver.com/download](https://caddyserver.com/download).

### 2. Caddyfile Configuration

Create a file named `Caddyfile` in your Craft Commands root.

**For LAN Access (Automatic Self-Signed):**

```caddyfile
craft-commands.local {
    reverse_proxy localhost:3000
}
```

_Note: You may need to add `craft-commands.local` to your hosts file pointing to your server IP._

**For Public Domain (Let's Encrypt):**

```caddyfile
your-domain.com {
    reverse_proxy localhost:3000
}
```

### 3. Run Caddy

```bash
caddy run
```

---

## Method 2: Nginx

If you prefer Nginx, here is a standard configuration block.

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade"; # Critical for Socket.IO
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Security Warning

> [!WARNING]
> Do NOT expose the backend port (3001) directly to the internet. Always route traffic through the proxy (port 80/443) which forwards to the frontend/backend.
