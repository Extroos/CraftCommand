# Outbound Reverse Tunneling (Cloudflare)

Integrates `cloudflared` to establish secure, outbound-only connectivity without ingress port configuration.

## 1. Protocol Architecture

The tunnel system establishes a persistent connection between the host machine and the Cloudflare edge network:

- **Ingress Isolation**: No inbound ports (e.g., 80, 443, 25565) are opened on the local gateway/firewall.
- **TLS Termination**: Traffic is encrypted via Cloudflare's edge-level TLS certificates.
- **Authentication**: Access control is managed via Cloudflare Access (Zero Trust) JWT verification before reaching the application ingress.

## 2. Configuration Flow

1. **Authorization**: Primary Panel requests a tunnel configuration from the Cloudflare API.
2. **Token Injection**: The system provisions a `cloudflared` token, which is injected into the local process runner.
3. **Provisioning**: The backend maps the tunnel UUID to a user-defined custom domain (DNS CNAME record).

## 3. Node Orchestration

Distributed Worker Nodes can utilize **Private Tunnels** (v1.11.3+). 
- **Topology**: Allows nodes behind CGNAT or mobile networks to establish a secure back-channel to the Primary Node.
- **Connectivity**: Communication is routed through the Cloudflare global backbone, bypassing traditional routing constraints.

---

_For local connectivity alternatives, see [OVERVIEW.md](OVERVIEW.md)._
