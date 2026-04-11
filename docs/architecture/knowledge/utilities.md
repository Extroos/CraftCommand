# Technical Utilities & Constants

## Purpose

Defines common patterns for OS interaction, network management, data types, and application lifecycle.

## Scope

- **NetUtils**: Port availability checks, Bedrock/RakNet UDP querying, and "Ghost" process liquidation.
- **FS & Constants**: Centrally defined data paths (`SERVERS_ROOT`, `UPLOADS_ROOT`) and atomic file helper utilities.
- **Shared Type System**: The unified language between Backend and Frontend (Interfaces, Enums, DTOs).
- **Graceful Lifecycle**: The orchestration of `SIGINT`/`SIGTERM` to safely close all services and child processes.

## Invariants (Do Not Break)

- **Path Resolution**: Never hardcode paths; always use `DATA_PATHS` from `constants`.
- **Safe Port Reclaiming**: `NetUtils.killProcessOnPort` MUST perform a name check before killing a process to avoid terminating non-Minecraft system services.
- **Bedrock Querying**: Always use the RakNet UDP Unconnected Ping pattern for Bedrock health checks.
- **Ordered Shutdown**: Services MUST be shut down in the correct priority order: Integrations -> Backups -> Watchers -> ProcessManager.

## Key Flows

### 1. Graceful Shutdown Path

1. **Signal**: `SIGINT` or `SIGTERM` detected in [server.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/server.ts).
2. **Stop Ingress**: HTTP server stops accepting new connections.
3. **Dismantle**: Discord, Update, and FileWatcher services are closed gracefully.
4. **Kill Servers**: `ProcessManager.shutdown()` kills all child PIDs with appropriate signals.
5. **Exit**: Process exits with code 0 on success.

### 2. Network Conflict Resolution

1. **Check**: `NetUtils.checkPortBind` determines if a port is physically available.
2. **identify**: If busy, `NetUtils.identifyProcess` finds the owner PID.
3. **Purge**: If a ghost server (java/bedrock) is found, `NetUtils.killProcessOnPort` uses `taskkill /F` (Windows) or `SIGKILL` (Linux) to reclaim it.

## Verified Entry Points / File Map

### backend/src/utils/

- **Network**: [NetUtils.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/utils/NetUtils.ts)
- **Logging**: [logger.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/utils/logger.ts)
- **SSL**: [ssl.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/utils/ssl.ts)

### shared/

- **Truth**: `types/` & `constants/` (The data contract).

## Operational Details
- **Windows Process Control**: `NetUtils` uses `taskkill /T` on Windows for full process tree termination.
- **SSL Fallback**: `sslUtils` generates self-signed certificates if secure mode is enabled without CA certs.
- **Input Validation**: `utils/validation.ts` enforces data integrity before service-layer entry.
