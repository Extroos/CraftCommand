A. Vanilla Servers
Strengths:
Automated detection of Paper/Spigot/Vanilla jars.
EULA, port, RAM, and Java checks are handled.
Console feedback and diagnosis are in place.
Potential Bugs/Traps:
If .env is missing or JWT_SECRET is insecure/too short, you won’t see a clear startup error (risk of service failing with odd errors).
Port conflicts: Process ghosting is handled for the most part, but a rare “ghost process” may still keep a server marked as OFFLINE until manual intervention.
If a user customizes their server jar name or layout in an unexpected way, ImportService heuristics could pick the wrong “main” executable.
B. Modded Servers (Forge, Fabric, Purpur, etc.)
Strengths:
Modpack Intelligence Engine flags and quarantines client-only mods automatically.
Dependency auto-resolution (SmartMod) is present and should reduce user-breakage.
Diagnostic rules for “Java Version Mismatch,” “Corrupt Mods,” and “Memory Pressure” are detailed.
Potential Bugs/Traps:
If a pack has a huge number of mods, mods with Jar-in-Jar (JiJ) dependency patterns, or very new loader setups (not flagged in modrinth_env.json), there may still be missed client-only mods.
Some modpacks require specific Java versions (e.g., 21 for Minecraft 1.21+); if you force a lower version and the system doesn’t update it, you'll get “incompatible Java” crashes.
If agent or backend is missing the latest modrinth_env.json, user may see warnings about mod compatibility that are now outdated.
C. Proxy/Network Servers (Velocity, Bungee)
Strengths:
Proxy detection/handling for velocity is included for port 25577 by default.
Forwarding secret automation is in the release.
Potential Bugs/Traps:
If you customize proxy configs or run multiple proxies on the same machine, auto-detection may route traffic to the wrong instance without advanced configuration.
Proxy backend secret syncs patched, but manual changes can still break forwarding.
📈 2. “Power-User” Scenarios: Many Servers, High Load
A. High Concurrency
Potential Performance Risks:
Busy-wait pattern persists in agent/backend: If you run 20+ servers, every time a dashboard metric pulls “system snapshot,” the agent may waste CPU in a tight polling loop (via isScanning busy-wait).
With 20 servers, expect 10–30% CPU waste just reporting simple stats.
Consequence: Higher hosting costs, dashboard lag, SSH login shows high CPU even at “idle.”
ProcessManager Listener “Leak”: If many servers are started and stopped rapidly (as in, hundreds of lifecycle events per hour), event listener counts could grow and eventually cause Node’s “MaxListenersExceededWarning” or outright memory bloat/crash.
B. Log Buffer Growth
Issue: Each server's process output is stored in an unbounded buffer on the agent until flushed to the main panel.
Consequence: If a modded server is extremely verbose (as is common with Forge/Fabric debug log), RAM usage grows over time–may get OOM on weaker hardware.
Best Practice: All log buffers should have a “max lines” policy and flush old logs, which is not yet enforced.
