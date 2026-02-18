# Networking & Connectivity Overview

This section covers how CraftCommand handles internal communication, public exposure, and dynamic domain management.

## The Networking Architecture

CraftCommand uses a **Decoupled Connectivity Layer**. This means the backend handles the heavy lifting of IP detection and DNS propagation, while the frontend provides a high-level wizard for user interaction.

### Core Modules

1.  **[Dynamic DNS (DDNS)](DDNS.md)**: Tools for assigning professional hostnames (DuckDNS, No-IP, etc.) to your servers.
2.  **[Remote Access & Tunnels](TUNNELS.md)**: **Recommended** - Zero-config connectivity via Cloudflare.
3.  **[Traditional Security & Proxies](REMOTE_ACCESS.md)**: Details on Caddy, Nginx, and manual port forwarding.
4.  **[Cross-Play Ecosystem](CROSSPLAY.md)**: Managing Java & Bedrock (Geyser/Floodgate)

### Option B: Built-in Reverse Tunneling (Cloudflare)

**Best for**: Instant, zero-config global access.

1.  See the dedicated [**Cloudflare Tunnels Guide**](TUNNELS.md).
2.  Provides automated TLS (HTTPS) and custom domain provisioning.

### Option C: Legacy Reverse Tunneling (Playit.gg)

## Key Concepts

- **Binding**: By default, the panel "binds" to `127.0.0.1`. This means only YOU can see it. Enabling "Remote Access Mode" changes this to `0.0.0.0`, allowing external traffic.
- **Resolution**: The system periodically checks your Public IP against your configured hostnames. If they don't match, the "Networking" tab will show a Warning.
- **Reverse Proxy**: I strongly recommend using a proxy like **Caddy** or **Nginx** to handle SSL (HTTPS). This ensures your passwords and commands aren't sent over the internet in plain text.

---

_Need help with a specific configuration? Visit the [Troubleshooting Guide](../support/TROUBLESHOOTING.md)._
