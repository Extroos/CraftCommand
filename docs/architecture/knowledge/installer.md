# Software Installer System

## Purpose

Downloads and provisions server binaries (Paper, Velocity, Bedrock, etc.) and generates initial configuration files.

## Scope

- Downloading JARs/Binaries from PaperMC, Mojang, or Modrinth.
- Managing installation progress for the UI.
- Initial configuration generation (EULA, toml files).
- Excludes: Java runtime installation (handled by JavaManagement) and running the process.

## Invariants (Do Not Break)

- **Disk Space Check**: Must verify at least 200MB-500MB free before starting (`SafeFileOperation.checkDiskSpace`).
- **Progress Reporting**: Must emit `progress` and `status` events to the `InstallerService` EventEmitter.
- **Velocity Executable**: For Velocity servers, the `executable` config field MUST be set to `velocity.jar` explicitly.
- **Fallback Logic**: If a version 404s (common with Velocity), retry with `-SNAPSHOT` suffix.

## Key Flows

### Provisioning Flow

1. User selects software/version.
2. Installer fetches build metadata from remote API.
3. Disk space verified.
4. File downloaded to `workingDirectory` (or cache).
5. Zip files extracted (if Bedrock).
6. Basic configs (`eula.txt`, `server.properties`) generated.
7. Server config saved with `status: OFFLINE`.

### Failure flow (what can go wrong + expected handling)

- **404 Build**: Handled by retrying with `-SNAPSHOT` (for Velocity) or selecting the next latest build.
- **DNS Error**: Logged with specific troubleshooting message for the user.
- **Disk Full**: Safety error thrown, installation aborted, status reset.

## Verified Entry Points / File Map

### backend

- **Main Service**: [InstallerService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/installer/InstallerService.ts)
- **Templates**: [TemplateService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/installer/TemplateService.ts)

### frontend

- **Creation UI**: [ServerSelection.tsx](file:///c:/Users/user/Desktop/Craft-Commands/frontend/src/features/servers/ServerSelection.tsx) - Handled via `create_server` flow.
- **Status Sync**: Listens to `INSTALLING` status and displays the progress overlay.

## Resource Management
- **Caching**: Local binary caching for Bedrock and common JARs to optimize bandwidth.
- **Validation**: Folder paths restricted to `SERVERS_ROOT` to prevent traversal.

## Testing Checklist + Done

- [x] Verify Velocity downloads correctly and sets `executable: 'velocity.jar'`.
- [x] Verify 404 fallback to `-SNAPSHOT` works.
- [ ] Verify Bedrock extraction handles Windows/Linux file permissions.
- [ ] Verify installation progress bars in UI accurately reflect backend percent.
