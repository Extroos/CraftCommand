# Remote Access Guide

Craft Commands is secure by default (localhost only). To play with friends, you must explicitly enable **"Remote Access Mode"** in Settings.

## 🛑 Safety First (Read This)

Exposing your server to the internet carries risks. Before enabling Remote Access, Craft Commands forces you to:

1.  **Rate Limit**: Prevent bots from guessing passwords.
2.  **Lockout Policy**: After 5 failed attempts, IP addresses are banned for 1 hour.
3.  **Strong Password**: Admin accounts must have strong passwords.

---

## Which Method should I use?

We support three ways to connect friends. Choose the one that fits your needs.

### Option A: Tunneling / Mesh VPN (Recommended)

**Best for**: Close friends, Playing without router config.
**Difficulty**: Easy
**Security**: High (Private Network)

1.  Install **Tailscale** or **ZeroTier** on your PC.
2.  Invite your friend to your network.
3.  They connect using your VPN IP (e.g., `100.x.y.z:3000`).
4.  **No Port Forwarding required.**

### Option A: Reverse Proxy (Built-in)

#### 1. Playit.gg (Game + Web) - **Recommended**

Users can join the server AND view the dashboard.

1.  Select **[5] Setup Remote Access** -> **[2] Reverse Proxy**.
2.  Follow the "Claim" link in the new window.

#### 2. Quick Web Share (Web Only)

**Best for**: Giving a friend temporary access to the Dashboard to help you.
**Limitation**: **NO GAME ACCESS**. Players cannot join via this link.

1.  Select **[5] Setup Remote Access** -> **[3] Quick Web Share**.
2.  Copy the `https://....loca.lt` link.
3.  Share it. (Note: Requires clicking "Click to Continue" on first visit).

### Option B: Reverse Proxy + Domain (Standard)

**Best for**: "Public" servers, Easy URL (e.g., `play.myserver.com`).
**Difficulty**: Medium
**Security**: Medium (Requires safe configuration)

1.  Get a Domain Name (or usage a free one like DuckDNS).
2.  Use the **HTTPS Setup Wizard** in `run_locally.bat` to generate a Caddy/Nginx config.
3.  Forward TCP Ports **443** (HTTPS) and **80** (HTTP) on your router to your PC.
4.  Friends connect via `https://play.myserver.com`.

### Option D: Direct Port Forwarding (Advanced)

**Best for**: Temporary testing by experts.
**Difficulty**: Hard (Manual Config)
**Security**: Low (Your IP is visible)

1.  Forward TCP Port **3000** on your router.
2.  **Warning**: Bots _will_ scan this port.
3.  You **must** enable the "Remote Access Mode" toggle in System Settings to allow connections from `0.0.0.0`.

---

## Emergency Disable

If you suspect an attack or unauthorized access:

1.  Run `run_locally.bat`.
2.  Select **Option [6] Emergency Disable**.
3.  This instantly blocks all external connections and resets the bind address to `127.0.0.1`.
