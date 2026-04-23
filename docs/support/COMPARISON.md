# Comparison: CraftCommand vs Crafty Controller

When choosing a game server management panel, the two most common self-hosted options are CraftCommand and Crafty Controller. While both allow you to manage Minecraft servers, they take fundamentally different architectural approaches.

## Feature Breakdown

| Feature                | CraftCommand                                | Crafty Controller            | Pterodactyl           |
| ---------------------- | ------------------------------------------- | ---------------------------- | --------------------- |
| **Primary Focus**      | Automated recovery, Admin tools, Mod tracking | Stability, community plugins | Mass hosting, billing |
| **Crash Diagnosis**    | Yes (40+ auto-fixes)                        | No (Manual restarts)         | No (Manual restarts)  |
| **Mod Management**     | Yes (Modrinth API, client-side filtering)   | No                           | No                    |
| **Architecture**       | Typescript / Node.js                        | Python 3                     | PHP / Go              |
| **Multi-Node Support** | Yes (WebSocket agents)                      | No (Single machine)          | Yes (Wings nodes)     |
| **File Editor**        | Advanced (Monaco / VS Code)                 | Standard                     | Standard              |
| **Database**           | JSON by default (SQLite optional)           | SQLite required              | MySQL required        |

## When to Choose CraftCommand

CraftCommand is built specifically for users who want intelligent server management rather than just a process manager. You should choose CraftCommand if:

1. **You hate diagnosing crashes:** If a server fails to start, CraftCommand reads the console output, identifies the exact error (e.g., EULA unsigned, wrong Java version, port conflict, incompatible mod), and attempts to fix it automatically.
2. **You play heavily modded servers:** The integrated Modrinth browser automatically prevents client-only mods (like Optifine or Minimaps) from crashing your dedicated server instance by quarantining them during installation.
3. **You want multi-server deployment without complexity:** You can manage a cluster of local nodes without deploying MySQL databases or configuring Redis.

## When to Choose Crafty Controller

Crafty Controller is an excellent, mature project with years of stability. You should choose Crafty if:

1. **You want maximum community support:** Crafty has a large, established community and long-standing stability.
2. **You prefer Python:** Crafty is written in Python, which some administrators prefer for security and footprint auditing.
3. **You only need single-machine management:** If you don't need multi-node agent support, Crafty's single-machine footprint is very reliable.

## Conclusion

Choose **Crafty Controller** for proven, long-term stability and simple process management.
Choose **CraftCommand** if you want automated recovery, modpack management, and a modern UI out of the box.
