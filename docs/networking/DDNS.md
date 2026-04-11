# Dynamic DNS (DDNS) Synchronization

Synchronizes local public IP address changes with supported external DNS providers.

## 1. Technical Architecture

`NetworkService.ts` manages the detection and synchronization lifecycle:

- **Public IP Detection**: Polls external sources (`api.ipify.org`, `icanhazip.com`, `ifconfig.me/ip`) to detect WAN IP drift.
- **Synchronization Interval**: Configurable via `app.network.updateInterval` (default: 60 minutes).
- **A-Record Verification**: Uses `dns.resolve4` to compare the FQDN against the current WAN IP, bypassing OS-level caches for accurate verification.
- **Provider Support**: 
  - **DuckDNS**: Automated updates via `www.duckdns.org/update?domains={domain}&token={token}&ip={ip}`.
  - **Manual/Other**: Validated via resolution monitoring; updates must be handled by external clients.

## 2. Operational Logic

1. **Detection**: Every 60 minutes (or on startup), the service fetches the current public IP.
2. **Comparison**: The system compares the result with the `lastKnown` IP in `data/network-state.json`.
3. **Trigger**: If `currentIp !== lastKnown`, the system iterates through all servers with `updateEnabled: true`.
4. **Execution**: Issues a GET request to the provider's API with the new IP address.
5. **Confirmation**: Re-verifies resolution via `verifyDdns` after a 5s delay.

## 3. Constraints

- **Propagation Delay**: While free providers often use low TTL (60s), upstream ISP resolvers may cache records longer.
- **State Persistence**: Network states are persisted atomically to `network-state.json.tmp` before being moved to the final path to prevent corruption.
- **Inbound Access**: DDNS only handles name resolution; firewall ingress (port forwarding) must be configured on the local gateway.

---

_For ingress security details, see [REMOTE_ACCESS.md](REMOTE_ACCESS.md)._
