# Zero-Config Remote Access (Cloudflare Tunnels)

CraftCommand v1.11.3 integrates **Cloudflare Tunnels** (formerly Argo Tunnels) to provide secure, global access to your panel and servers without the need for manual port forwarding or DDNS.

## 1. How it Works

A Cloudflare Tunnel creates a secure, outbound-only connection between your host machine and the Cloudflare edge network.

- **No Inbound Ports**: You do not need to open Port 80, 443, or 25565 on your router.
- **TLS by Default**: All traffic is encrypted with Cloudflare's enterprise-grade certificates.
- **Identity Protection**: Easily hook into Cloudflare Access to add an extra layer of 2FA before anyone even reaches your login page.

## 2. Setup Flow

1. **Enable**: Go to `Global Settings > Networking > Remote Access`.
2. **Provision**: Click "Generate Tunnel". The system will provide a `cloudflared` token.
3. **Activate**: Once the token is verified, your panel will be accessible via your chosen custom domain (e.g., `panel.yourdomain.com`).

## 3. Distributed Considerations

Worker Nodes can also utilize Tunnels. When a node is enrolled, it can be configured to use a **Private Tunnel** (v1.11.3+) to communicate back to the Primary node. This effectively allows you to host servers behind strict CGNAT, mobile hotspots, or corporate firewalls without any port configuration.

---

_See [Network Overview](OVERVIEW.md) for local networking alternatives._
