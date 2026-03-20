# Dynamic DNS (DDNS) Configuration

Assigning a custom hostname to your Minecraft server provides a professional experience for your players and ensures your server remains reachable even if your residential Public IP changes.

## Features of the CraftCommand Networking Core

- **Provider Agility**: Direct support for DuckDNS, No-IP, Dynu, and manual HTTP-based updaters.
- **Protocol Health Monitoring**: The panel performs silent background DNS lookups to verify that your domain matches your current public IP.
- **Propagation Tracking**: Visual indicators show if your DNS changes are "Pending", "Propagating", or "Active" across global resolvers.
- **Persistent Sync (v1.11+)**: If an update fails due to provider downtime, CraftCommand will periodically retry the sync until the record is successfully updated.
- **Per-Server Isolation**: Assign unique subdomains to different server instances even if they run on the same machine.

## Implementation Guide

### 1. The Networking Wizard

Most users should use the built-in wizard to avoid configuration errors:

1.  Connect to your server via the Dashboard.
2.  Open **Settings** -> **Networking**.
3.  Click **Domain Setup Wizard**.
4.  Choose your provider and enter your token/credentials and desire prefix.

### 2. Manual Configuration (Advanced)

If you use a provider not listed in the wizard, you can manually enter your credentials in the Networking tab. Ensure you provide the full FQDN (e.g., `mc.myserver.com`).

## Common Propagation Pitfalls

- **TTL (Time to Live)**: Most free DDNS providers have a TTL of 60 seconds. However, local ISP DNS servers often cache records for much longer. If your IP changed but your hostname still points to the old IP, try changing your PC's DNS to `8.8.8.8` (Google) or `1.1.1.1` (Cloudflare).
- **Double NAT**: If your hostname resolves to your router's public IP but you cannot connect, ensure the router is correctly forwarding traffic to the local IP of your server machine.

---

_Note: Assigning a DDNS hostname does not bypass port forwarding requirements. See [Remote Access Guide](REMOTE_ACCESS.md) for details._
