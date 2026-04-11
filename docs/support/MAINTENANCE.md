# System Maintenance & Data Storage

Technical reference for data persistence, JVM resource management, and automated maintenance protocols.

## 1. Data Persistence Model

CraftCommand utilizes a tiered storage architecture:

- **Config Store**: `backend/data/db.json` (Flat-file JSON by default).
- **Audit Repository**: SQLite database for high-concurrency event logging.
- **Backups**: Local ZIP archives in `backend/data/backups/` and remote cloud mirroring.

## 2. Resource Optimization Protocol

Automated maintenance tasks are managed via `DiagnosisActions.ts` and the `Global Settings > Maintenance` module:

### JVM Memory Management
The system monitors Java process heap usage. If consumption exceeds 85%, the following GC prioritization is executed:
1. **Application Layer**: Triggers `spark gc` (if Spark is available).
2. **Runtime Layer**: Executes native `jcmd <pid> GC.run` for OS-level heap release.
3. **CLI Layer**: Fallback to standard console `gc` command.

### Log Rotation & Truncation
To prevent disk exhaustion:
- **Interval**: 24-hour scan of `latest.log`.
- **Threshold**: Files exceeding 100MB are truncated.
- **Retention**: Preserves the file header and the terminal 500 lines for diagnostic integrity.

## 3. Backup & Retention Logic

### Providers
- **Local**: Direct filesystem mirroring.
- **Cloud (S3)**: AWS, Cloudflare R2, Backblaze B2, MinIO.
- **Secure Transfer**: SFTP to remote SSH targets.

### Retention Constraints
The system implements a **Last-10-Strict** retention policy:
- **Automatic Deletion**: The 10 most recent un-locked archives are preserved; older records are purged.
- **Lock Override**: Archives marked as `Locked` are excluded from the retention sweep and must be manually deleted.
