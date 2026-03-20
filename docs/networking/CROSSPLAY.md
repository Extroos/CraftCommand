# Cross-Play Ecosystem (Java & Bedrock)

CraftCommand provides native orchestration for **Geyser** and **Floodgate**, allowing Minecraft Bedrock Edition players (Consoles, Mobile, Win10) to join your Java Edition servers seamlessly.

## 1. Automatic Orchestration

When you enable Cross-Play in a server's settings:

- **Geyser**: The backend automatically downloads and configures the Geyser plugin/standalone agent.
- **UDP Port Management**: CraftCommand identifies an open UDP port and configures the listener automatically. In v1.12.0, this includes **Automated UDP Orchestration** which verifies firewall openness before completing the setup.
- **Floodgate**: Modern authentication bridging is enabled by default, allowing Bedrock players to join without needing a separate Java account.

## 2. Connectivity Pipeline

1. **The Handshake**: A Bedrock client connects to your server via UDP.
2. **Translation**: Geyser translates the Bedrock protocol into Java packets in real-time.
3. **Authentication**: Floodgate provides a "Virtual UUID" to the Java server, representing the Bedrock player.

## 3. Troubleshooting

- **UDP Firewall**: Ensure the Bedrock port (displayed in settings) is open on your router/firewall. Tunnels (like Cloudflare) may require specialized UDP configuration.
- **Skin Sync**: Use the integrated Global Settings to manage Global Skins for Bedrock players via the skin-restorer integration.

---

_See [Networking Overview](OVERVIEW.md) for more connectivity details._
