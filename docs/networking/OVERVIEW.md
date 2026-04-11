# Networking & Connectivity Overview

Manages ingress traffic, DNS synchronization, and cross-platform protocol translation.

## Connectivity Methods

| Method | Protocol | Architecture | Security |
| :--- | :--- | :--- | :--- |
| **Cloudflare Tunnel** | Outbound HTTPS/UDP | Reverse Tunnel (no ports) | Cloudflare Edge / TLS |
| **Reverse Proxy** | Port 80/443 | Local Proxy (Caddy/Nginx) | Panel-managed TLS |
| **Dynamic DNS** | Direct Port | Dynamic IP Sync | Firewall-dependent |

## Protocol Details

- **Host Binding**: Software binds to `127.0.0.1` by default for local-only access. `0.0.0.0` allows global ingress.
- **Health Verification**: The panel periodically queries reverse proxy PIDs and tunnel processes to verify status.
- **Domain Resolution**: Automated checks compare public IP against DNS A-records; mismatches trigger status warnings.
- **Standard Routing**: Caddy is utilized as the default internal entry point for HTTPS termination.

---

_For specific configurations, refer to the [Dynamic DNS](DDNS.md) or [Tunnels](TUNNELS.md) documentation._
