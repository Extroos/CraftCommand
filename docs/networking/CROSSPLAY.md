# Cross-Platform Protocol Translation (Java & Bedrock)

Enables Bedrock Edition connectivity for Java servers via Geyser and Floodgate integration.

## 1. Technical Implementation

`CrossPlayService.ts` handles the multi-phase provisioning of the protocol translation layer:

- **Software Provisioning**: 
  - **Geyser**: Provisioned via the Modrinth API (`GEYSER_SLUG`).
  - **Floodgate**: Provisioned via the GeyserMC build server (`download.geysermc.org/v2/.../downloads/spigot`) or Modrinth for mod-based environments (Fabric/Forge).
- **Network Validation**: 
  - **UDP Probing**: Uses `NetUtils.checkUDPPortBind` (Node.js `dgram`) to verify the Bedrock port (default `19132`) is available before startup.
  - **EADDRINUSE**: If the port is bound, the service warns the user to prevent gateway collisions.
- **Topology Management**: 
  - **Standalone**: Geyser and Floodgate are installed on the target server.
  - **Velocity**: Geyser is installed on the Velocity proxy; Floodgate is synchronized across the proxy and backends for UUID consistency.

## 2. Authentication Protocol

- **Floodgate UUID Mapping**: Bedrock players are assigned virtual UUIDs based on their XUID, enabling persistent inventories and data on Java servers without a Mojang account.
- **Auth Bridging**: The server `auth-type` is set to `floodgate`, allowing internal encryption handshakes between the Geyser proxy and the server software.

## 3. Operational Constraints

- **Port Forwarding**: Public UDP traffic must be routed to the Bedrock port. Tunnels require specialized UDP ingress configuration.
- **Diagnostics**: Health checks use `RakNet UDP Unconnected Ping` to verify Bedrock-specific reachability.

---

_For core networking details, refer to [OVERVIEW.md](OVERVIEW.md)._
