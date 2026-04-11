# Ingress Security & Proxy Configuration

Controls public exposure of the CraftCommand panel and hosted server instances.

## 1. Authentication & Integrity

Before enabling global ingress, verify the following security constraints:

- **RBAC Enforcement**: Use the `User Manager` to restrict roles; only accounts with `ROLE_OWNER` can modify ingress binding settings.
- **2FA (TOTP)**: Authentication tokens use the Time-based One-Time Password protocol. Configure via [2FA.md](../security/2FA.md).
- **Throttling**: The auth-layer implements rate limiting for login attempts to mitigate dictionary attacks.

## 2. Ingress Methods

### A. Reverse Tunneling
- **Cloudflare Tunnels**: Establishes an outbound-only connection via `cloudflared`. See [TUNNELS.md](TUNNELS.md).
- **Playit.gg**: Tertiary agent for UDP/TCP mapping via global relay.

### B. Network Proxy
Located in `Global Settings > Network`, the internal proxy layer manages:
- **Rate Limiting**: Throttles API requests per source IP.
- **WebSocket Gateway**: Manages `Upgrade` and `Connection` header translation for the Socket.IO event stream.

### C. Dynamic DNS (DDNS)
For direct exposure via port forwarding on dynamic WAN IPs:
- **Synchronization**: Automated IP detection and provider API calls (e.g., DuckDNS) maintain A-record integrity. See [DDNS.md](DDNS.md).

## 3. TLS Termination (HTTPS)

Persistent SSL/TLS encryption must be handled by an external reverse proxy when using direct ingress.

### Caddy (Standard Configuration)
Caddy manages ACME-based certificate issuance and renewal automatically.
```caddyfile
your-domain.com {
    reverse_proxy localhost:3000
}
```

### Nginx (Manual Configuration)
Ensure `Upgrade` and `Connection` headers are passed to support the WebSocket control channel:
```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## 4. Emergency Procedures

### Local Binding Reset
In the event of a security breach or network stability failure:
1.  Execute `scripts/ops/emergency-disable-remote.cjs`.
2.  The application will immediately re-bind to `127.0.0.1`.
3.  Ingress traffic from non-local interfaces will be dropped at the application layer.

---

_For specific protocol translation details, see [CROSSPLAY.md](CROSSPLAY.md)._
