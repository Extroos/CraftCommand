# Backend Optimization & Performance

This guide details the technical implementation of resource management and process isolation in CraftCommand.

## Process Discovery (Heuristics)

CraftCommand identifies child processes through a multi-stage discovery engine as defined in `NativeRunner.ts`.

1.  **Tagging**: When a server starts, the panel injects the `-Dcraftcommand.id=<serverId>` flag into the java arguments.
2.  **Top-Down Aggregation**: Every 1000ms, the engine scans the system process tree. It uses the `Win32_Process` CIM instance on Windows and `si.processes` on Linux.
3.  **Discovery Priority**:
    *   **Direct PID Match**: The immediate PID returned by `spawn()`.
    *   **Tag Match**: Search for the `-Dcraftcommand.id` property in the command line string.
    *   **Heuristic Match**: If both fail, the engine searches for the `serverId` within the path of any process named `java`, `node`, or `bedrock_server`.

## Hardware Limits & Environment

### RAM Enforcement
When a RAM limit is set, the value is passed via the `CC_RAM_LIMIT_MB` environment variable. 
*   **Native Engine**: Uses OS-level Job Objects (Windows) or Cgroups (Linux) to hard-cap memory.
*   **Java Allocation**: The panel automatically calculates `-Xmx` (Max Heap) based on the limit, leaving a 15% buffer for non-heap (metaspace/stack) overhead.

### Environment Whitelist
To prevent sensitive panel secrets (e.g., `JWT_SECRET`) from leaking to server processes, the `NativeRunner` uses a strict whitelist (`SAFE_ENV_KEYS`). Only the following data is passed to the child:
- System paths (`PATH`, `JAVA_HOME`)
- Locale settings (`LANG`, `TERM`)
- Server-specific IDs (`SERVER_PORT`, `JAVA_VERSION`)

## Optimization Recommendations

### Disk I/O (SQLite & JSON)
*   **Journal Mode**: The panel's SQLite instance uses `WAL` (Write-Ahead Logging) to allow concurrent reads/writes without lock contention.
*   **Archival**: ZIP creation uses the `archiver` library with `zlib` level 1 (fastest) to minimize CPU spikes during backup operations.

### Network Throughput
*   **Buffer Size**: WebSocket console streams are buffered to 50ms intervals to prevent UI freezing on high-frequency log output (e.g., debug logs).
*   **Compression**: Proxy-level Gzip is used for the management API to reduce bandwidth on mobile connections.
