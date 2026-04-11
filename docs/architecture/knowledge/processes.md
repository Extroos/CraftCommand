# Process Management

## Purpose

Manages server process lifecycles, environment configuration (Java), monitoring, and termination sequences.

## Scope

- Backend: Child process management, port protection, startup locks, and status polling.
- Frontend: Power control state machines (Start/Stop/Restart buttons).
- Excludes: File management, plugin installation, or network proxies (shared but distinct skills).

## Invariants (Do Not Break)

- **Start Idempotency**: Calling `/start` on an already running server must return success, not an error.
- **Startup Locks**: Only one startup operation allowed per server ID at a time.
- **Reachability Sync**: A background interval (every 10s) verifies port availability. If a server is `STARTING` but its port is responsive, it is forced to `ONLINE`.
- **Bedrock Shutdown**: Escalated sequence using optimized polling (v1.12.0): `stdin:stop` -> Poll (10s) -> `SIGINT` -> Poll (10s) -> `SIGKILL`. The system detects termination instantly instead of waiting for fixed timeouts.
- **Bedrock Console**: Commands to Bedrock servers use a 50ms buffer delay to ensure reliability of console injection.
- **Bedrock Stats**: System performance for Bedrock is supplemented via **UDP RakNet Querying** to get real-time player counts and latency.
- **Stats Ring Buffer**: All CPU/RAM metrics are fed into a sliding window buffer for the Diagnosis engine.
- **Stop Availability**: The Stop button MUST be enabled during the `STARTING` state to allow recovery from hangs.
- **Port Matching**: A Java server MUST NOT start if its configured port is occupied by a different PID (unless it's the SAME server being adopted).

## Key Flows

### Execution Flow

1. Check Safety (Java, Port, EULA).
2. Acquire Startup Lock.
3. Mark status `STARTING`.
4. Spawn Process.
5. Poll for Port Reachability.
6. Mark status `ONLINE`.

### Failure flow (what can go wrong + expected handling)

- **Port Conflict**: ServerService identifies the process by port. If it's a different PID, start fails. If same PID, it "adopts" it.
- **Zombie Process**: If server fails to stop gracefully within `shutdownTimeout`, ProcessManager issues a SIGKILL.
- **Health Hang**: If port never opens, status remains `STARTING` until timed out or manually stopped.

## Verified Entry Points / File Map

### backend

- **Process Management** [ProcessManager.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/processes/ProcessManager.ts)
- **Startup Orchestration** [StartupManager.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/servers/StartupManager.ts)
- **Java Resolution** [JavaManager.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/processes/JavaManager.ts)
- **Service API** [ServerService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/servers/ServerService.ts)
- **Routes** [servers.routes.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/servers/servers.routes.ts)

### frontend

- **Power Controls** [Dashboard.tsx](file:///c:/Users/user/Desktop/Craft-Commands/frontend/src/features/dashboard/Dashboard.tsx)
- **Status Context** [ServerContext.tsx](file:///c:/Users/user/Desktop/Craft-Commands/frontend/src/features/servers/context/ServerContext.tsx)

## Constraints & Logging

- **Role Requirement**: `MANAGER` role is required for process control.
- **Concurrency**: `operationLocks` prevents simultaneous startup/shutdown commands for a single ID.
- **Log Markers**: `[ProcessManager:${id}]`, `[ServerService:${id}]`.
- **Exit Codes**: `MISSING_EXECUTABLE`, `PORT_IN_USE`.

## Testing Checklist + Done

- [x] Verify `/start` is idempotent (returns 200 even if already running).
- [x] Verify Stop button is clickable while server says "Starting...".
- [x] Verify PID adoption via port check.
