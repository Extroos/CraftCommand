# Core System Services

## Purpose

Manages core lifecycle, environment abstraction, audit logging, and schema migrations.

## Scope

- **Safety Compliance**: Pre-flight validation (EULA, RAM, Assets) before server execution.
- **Audit & Logging**: Universal activity tracking (Action -> Repository -> Global Live Feed).
- **Application Updates**: Lifecycle management for CraftCommand itself (Check -> Verify -> Download -> Apply).
- **Environment Abstraction**: `HostingOSService` translates system-level commands (e.g., `free -m`, `wmic`) for the dashboard.
- **Migrations**: Automated schema updates and manual data-structure porting (e.g., `StorageMigrationService` for JSON -> SQLite).

## Invariants (Do Not Break)

- **Blocking Safety**: `SafetyService.validateServer` MUST be a blocking call in the startup pipeline.
- **Audit Authenticity**: Every `AuditService.log` call MUST include a `userId` and `timestamp`.
- **Update Verification**: Application updates MUST be verified for integrity before a restart is triggered.
- **Live Broadcasting**: All audit logs MUST be broadcasted via Socket.io to the `server:global` room for the activity feed.

## Key Flows

### 1. Application Update Pipeline

1. **Detection**: `UpdateService` polls for new versions.
2. **Verification**: `UpdateVerifier` checks releases against the current environment.
3. **Staging**: Downloads assets to a temporary staging area.
4. **Application**: Triggers a restart and swap of binaries.

### 2. Storage Migration Pipeline

1. **Trigger**: Admin selects "Migrate to SQLite" in Data settings.
2. **Rebind**: Application rebinds repositories to the new provider.
3. **Copy**: Data is iterated and copied from the old provider to the new one.
4. **Verify**: Integrity check performed; original data preserved as a backup.

### 3. Audit & Activity Broadcasting

1. **Log**: Service (e.g., `ServerService`) calls `AuditService.log(userId, 'SERVER_START')`.
2. **Persist**: Entry is added to the atomic audit repository.
3. **Broadcast**: Socket.io emits `activity:new` to all connected admins.

## Verified Entry Points / File Map

### backend/src/features/system/

- **Safety**: [SafetyService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/system/SafetyService.ts)
- **Audit**: [AuditService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/system/AuditService.ts)
- **Updates**: [UpdateService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/system/UpdateService.ts)
- **Environment**: [HostingOSService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/system/HostingOSService.ts)
- **Settings**: [SystemSettingsService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/system/SystemSettingsService.ts)

## System Constraints

- **Memory Validation**: `SafetyService` blocks startup if requested RAM exceeds host physical availability.
- **Migration Persistence**: `MigrationService` maintains sidecar backups during schema transitions.
- **Log Integrity**: Every `AuditService` record requires a `userId` and high-resolution `timestamp`.
