# Backup System

## Purpose

Manages ZIP archival, cloud uploads (S3/Sftp), and selective restoration (Full, World, Configs, or Plugins).

## Scope

- Backend: ZIP archival (`archiver`), cloud provider integration (S3/Sftp/Local-Copy), scheduled retention, and granular restore logic.
- Cloud: Support for S3-Compatible, Sftp/SSH, and Secondary Local Paths (NAS/Network shares).
- Excludes: File browsing (Filesystem), manual log backups (handled by Telemetry).

## Invariants (Do Not Break)

- **Provider Lifecycle**: All cloud destinations MUST implement the `ICloudBackupProvider` interface via the `createCloudProvider` factory.
- **Concurrency Guard**: Only ONE backup/restore operation allowed per server ID at a time.
- **Atomic Cloud Sync**: Every local backup creation should verify enabled cloud destinations for immediate upload.
- **Scope Awareness**: World-only backups must correctly identify world folders based on `server.properties` (`level-name`).
- **Path Verification**: Restores MUST overwrite existing files but maintain a temporary fallback if the ZIP extraction fails.

## Key Flows

### Normal flow (happy path)

1. Acquisition of Backup Lock for server.
2. Filter/Detection of files (Full vs. World-only).
3. ZIP creation with `archiver` in `data/backups/<serverId>/`.
4. Checksum (SHA256) calculation.
5. Cloud upload to all enabled destinations (S3/Sftp).
6. Update local index and notify user.

### Failure flow (what can go wrong + expected handling)

- **Windows File Lock**: `BackupService` implemented retry logic (up to 3 attempts) for files locked by external processes.
- **Cloud Timeout**: Individual cloud provider failures are caught and logged without failing the local backup.
- **Restore Failure**: If extraction fails, the service should warn the user, but note that the original files might be in an inconsistent state.

## Verified Entry Points / File Map

### backend

- **Main Service**: [BackupService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/backups/BackupService.ts)
- **Cloud Providers**: [CloudBackupProvider.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/backups/CloudBackupProvider.ts) (S3, Sftp).
- **Storage**: `backend/data/backups/` (Zips) and `backend/data/cloud-destinations.json`.

### frontend

- **Backups Tab**: [BackupManager.tsx](file:///c:/Users/user/Desktop/Craft-Commands/frontend/src/features/backups/BackupManager.tsx)
- **Cloud Config**: [CloudBackupDestinations.tsx](file:///c:/Users/user/Desktop/Craft-Commands/frontend/src/features/system/components/CloudBackupDestinations.tsx)

## Retention & Integrity

## Testing Checklist + Done

- [x] Verify world-only backup detects custom world names.
- [ ] Verify S3 upload handles large multi-part parts for massive servers.
- [ ] Verify restore logic correctly overwrites the `workingDirectory`.
- [ ] Test retention policy (oldest deleted when limit reached).
