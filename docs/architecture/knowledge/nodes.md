# Distributed Node Orchestration

## Purpose

Manages remote Node Agents, enabling centralized control of Minecraft servers across multiple host machines.

## Scope

- **Node Registry**: Managing the `nodes.json` persistent store of enrolled agents.
- **Enrollment**: Handling the multi-phase handshake (Pre-enroll -> Download -> Pair) for new agents.
- **Heartbeats**: Tracking node health and marking stale agents as `OFFLINE`.
- **Local Node**: Managing the built-in "Local Node" for zero-config single-machine operation.

## Invariants (Do Not Break)

- **Local Persistence**: The "Local Node" (ID: `local`) must always exist and be marked `ONLINE` as long as the panel is running.
- **Debounced Saves**: Node heartbeats must use the `SAVE_DEBOUNCE_MS` (5s) window to prevent disk thrashing.
- **Protocol Matching**: Agents must match or be compatible with the panel's `protocolVersion` (from `version.json`).
- **Security**: Enrollment secrets and tokens must be cryptographically secure and verified before pairing.

## Key Flows

### 1. Enrollment Handshake

1. **Pre-Enroll**: Panel generates a UUID, secret, and short-lived download token.
2. **Download**: Agent uses the token to fetch its pre-configured binary/config.
3. **Handshake**: Agent connects back using the secret; Panel updates its host/port/status to `ONLINE`.

### 2. Status Monitoring

1. **Heartbeat**: Agents send health metrics every 30s.
2. **Sweep**: `NodeRegistryService` runs Every 30s (`startHeartbeatSweep`).
3. **Offline**: If `lastHeartbeat > 60s`, the node is marked `OFFLINE` and events are emitted.

## Verified Entry Points / File Map

### backend

- **Core Registry**: [NodeRegistryService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/nodes/NodeRegistryService.ts)
- **Agent Handler**: [NodeAgentHandler.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/nodes/NodeAgentHandler.ts)
- **Enrollment logic**: [NodeEnrollmentService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/nodes/NodeEnrollmentService.ts)
- **Route Handlers**: [nodes.routes.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/nodes/nodes.routes.ts)

### frontend

- **Node Manager UI**: `frontend/src/features/nodes/NodeManager.tsx`
- **Enrollment Wizard**: `frontend/src/features/nodes/EnrollmentWizard.tsx`

## Registry Maintenance
- **Validation**: Node names and host strings are sanitized before storage.
- **Constraints**: Duplicate Host:Port identifiers are rejected to prevent register pollution.
- **Capabilities**: Hardware signatures (CPU/RAM/Java) are updated during every heartbeat.

## Testing Checklist + Done

- [x] Verify `local` node is auto-created on first run.
- [x] Verify debounced save prevents multiple writes during concurrent heartbeats.
- [ ] Test behavior when a node reconnects after being `OFFLINE` (ensure status flip back to `ONLINE`).
- [ ] Verify `enrollmentToken` is consumed or invalidated after successful pairing.
