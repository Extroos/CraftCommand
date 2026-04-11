# Server Orchestration

## Purpose

Orchestrates server lifecycles, player state management, and maintenance automation.

## Scope

- **Startup Orchestration**: Multi-phase pipeline (Validation -> Env Prep -> Java Resolve -> Command Build -> Launch).
- **Player Management**: Unified handling of online rosters and offline JSON lists (Ops, Whitelist, Bans).
- **Automatic Repair (Sentinel)**: State-aware recovery pipeline with loop protection and "Safe Mode" drift repair.
- **Config Optimization**: Tiered presets (Small to Mega) for performance tuning `server.properties` and Paper configs.
- **Map Integration**: Zero-config detection and control of Dynmap and BlueMap.

## Invariants (Do Not Break)

- **Safety First**: `StartupManager` MUST always call `SafetyService.validateServer` before launch unless `force` is true.
- **Atomic Configs**: `ConfigPresetsService` MUST preserve comments when modifying `server.properties` and use a backup-and-rename strategy for critical YAMLs.
- **Drift Detection**: The Automatic Repair sentinel MUST check for "Drift" (Status=ONLINE, PID=Missing) every 10s and trigger repair.
- **Automatic Repair Telemetry**: Every healing cycle and system health check MUST log telemetry to standard errors to prevent silent diagnostics failures.
- **Safe Mode Reset**: The system provides a manual reset mechanism to clear stability penalties and unlock servers from "Safe Mode" after repeated crashes.
- **Offline List Logic**: Modifying player lists (Ops/Bans) while the server is OFFLINE must use direct JSON modification with Mojang/XUID resolution.

## Key Flows

### 1. Startup Pipeline

1. **Safety**: Validate RAM, EULA, and Executable.
2. **Conflict Check**: Purge processes on ports if `force=true`.
3. **Preset Enforcement**: Auto-inject performance flags (e.g., Aikar's flags) and override properties for proxy-backends (e.g., `online-mode=false`).
4. **Launch**: Handover to `ProcessManager`.

### 2. Auto-Repair Logic

1. **Triage**: Diagnose crash source via `DiagnosisService`.
2. **Repair**: Apply targeted fixes (e.g., port scrubbing, EULA fixing).
3. **Verify**: Exponential backoff stability watch.
4. **Safe Mode**: Block auto-starts after 3 consecutive failures to prevent resource exhaustion.

## Verified Entry Points / File Map

### backend/src/features/servers/

- **Orchestrator**: [StartupManager.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/servers/StartupManager.ts)
- **Status Hub**: [ServerService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/servers/ServerService.ts)
- **Roster Logic**: [PlayerService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/servers/PlayerService.ts)
- **Health Sentinel**: [AutomaticRepairService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/servers/AutomaticRepairService.ts)
- **Optimization**: [ConfigPresetsService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/servers/ConfigPresetsService.ts)
- **Map Control**: [MapService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/servers/MapService.ts)

## Operational Constraints
- **Resource Guard**: The repair engine throttles intensive tasks (e.g., S3 cloud syncing) if disk I/O exceeds 80MB/s.
- **BOM Protection**: `PlayerService` strips UTF-8 byte order marks from JSON files to ensure cross-platform parsing stability.
- **Port Reclamation**: `StartupManager` uses `NetUtils.killProcessOnPort` to ensure availability before launching a new process.
