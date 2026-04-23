# Changelog

All notable changes to this project will be documented in this file.

## [1.13.2] - 2026-04-12 - UI & Architectural Hardening

### Added
- **Zustand State Migration**: Transitioned the entire frontend from nested Contexts to a high-performance, modular Zustand store, eliminating re-render cascades and optimizing state lookups.
- **Multi-Language Feature**: Implemented support for 11 languages with 1:1 schema parity and full structural integrity.
- **Header Refactoring**: Fully transitioned the navigation Header component to the i18next framework for all supported locales.

### Fixed (Deep State Integrity)
- **Full State Cleanup**: Implemented zero-trace server deletion that targets ghost state in shared services and the OS host.
- **Scheduler Memory Pruning**: Fixed a persistent memory leak where deleted servers remained in the global `ScheduleService` task observer map.
- **Proxy Ghost Link Removal**: Velocity proxies now automatically remove links to deleted backend servers, preventing "Ghost Connectivity" log spam and CPU overhead on the proxy.
- **OS Firewall Sanitization**: Implemented automatic flushing of host-level firewall rules (`netsh`/`iptables`) created by the automated firewall service. Rules are now tagged with server IDs for deterministic cleanup.
- **Installer Temp Space**: Fixed a storage leak where `temp_extract` folders and modpack zip files were orphaned if a server was deleted during an active deployment.
- **Migration Artifact Cleanup**: Added automated daily pruning of legacy `.migrated_` backup folders from previous data migrations.
- **Collaboration Sync**: Fixed a cross-talk bug where typing indicators were mirrored across all server consoles; they are now correctly siloed by server ID.

### Hardened (System & Infrastructure Audit)
- **SafeFS Path Guard**: Implemented a system-wide security guard in `SafeFileOperation.ts` that enforces strict directory boundaries. All file writes, moves, and deletions are now validated against authorized root directories (`SERVERS_ROOT`, `DATA_DIR`), preventing path-traversal exploits.
- **Lifecycle Status Locking**: Hardened `BackupService` and `PluginService` to block restores and installations while the server is `ONLINE` or `STARTING`, eliminating `EBUSY` file-lock conflicts and JAR corruption.
- **Command Injection Prevention**: Refactored `NativeRunner` to use array-based `spawn` for permissions fixes (`icacls`), bypassing the host shell and eliminating injection risks via manipulated directory paths.
- **Socket Terminal Sanitization**: Implemented strict length limits and control-character stripping for incoming console commands to prevent DoS attempts and terminal escape sequence exploits.
- **Reliable Cloud Sync**: Transitioned cloud backup destinations to the `SafeFileOperation` engine, ensuring configuration persistence is atomic and resilient to power loss.
- **Startup Timeout Cleanup**: Fixed a memory leak in `ProcessManager` where orphaned failure-watchdog timeouts remained in memory after server deletion.

## [1.13.0] - 2026-04-11 - Infrastructure Hardening

### Added

- **Official Linux Deployment Support**: Added `run_CraftCommand.sh` and `run_agent.sh` for native POSIX environments.
- **Service Setup Scripts**: added `systemd` unit templates for Panel and Agent in `scripts/systemd/`.
- **Infrastructure Documentation**: Added `DEPLOYMENT.md` and `LIFECYCLE.md` technical guides.
- **Advanced Repair Control**: Configuration toggles for System Drift Detection and IO Throttling.
- **Patching Engine**: Integrated background update staging with atomic swap logic in launchers.
- **Data Protection**: Updates now skip user-defined directories (`data/`, `minecraft_servers/`, `.env`) during synchronization.

### Improved

- **Terminology Alignment**: Renamed "Auto-Healing" to **"Automatic Repair"** for clarity.
- **Documentation Sanitization**: Removed non-technical jargon from `README.md` and project docs.
- **Knowledge Base Centralization**: Consolidated architectural documentation into `docs/architecture/knowledge/`.
- **UI Density**: Implemented collapsible advanced settings to reduce dashboard clutter.

### Fixed & Hardened

- **Server Restart Stability**: Added a port-release verification loop to prevent race conditions during automated restarts.
- **Startup Logic**: Hardened EULA validation to block startup immediately if `eula.txt` is missing on disk.
- **Orphaned File Cleanup**: Implemented automatic pruning of temporary directories from failed imports.
- **Resource Monitoring**: Added 15s history smoothing to CPU monitoring to eliminate false-positive "Node Overloaded" alerts.
- **UDP Port Detection**: Updated `NetUtils` to identify and clear ghost processes on UDP ports (Bedrock/Geyser).
- **IO Throttling**: Added `--blkio-weight` support for Docker on Windows/Mac hosts.
- **API Stability**: Increased global rate limits to 5,000 requests/15m to resolve session timeout issues.
- **Security Updates**: Enabled JTI session tracking, login rate limiting, and stricter environment variable validation.
- **Process Integrity**: Fixed 16 silent error handlers in core backend services.

## [1.12.5] - 2026-03-26

- **Performance**: $O(N)$ process tracking and 64KB log tailing buffers.
- **Collaboration**: Integrated activity history and granular permission tracking.
- **Diagnostics**: 4-tier analysis pipeline with causality suppression.
- **Infrastructure**: Native Playit.gg integration and Docker runtime abstraction.
- **UI**: Mojang/Bedrock manifest syncing and persistent deployment monitoring.

## [1.12.0] - 2026-03-20

- **Mod Management**: Server-side filtering and dependency resolution for Modrinth.
- **Scheduling**: Multi-sequential task execution and graceful shutdown countdowns.
- **Console**: 50-item command history and log level filtering.
- **Storage**: Batch storage layer for audit logs and notifications.
- **Fixes**: Resolved Java deployment freezes and BDS 404 errors.

## [1.11.x] - 2026-02-21

- **Diagnosis**: Rules for corrupted JARs and Geyser port conflicts.
- **Backups**: Concurrency locking and automated retention logic.
- **Networking**: PowerShell-based integrity checks for remote access binaries.
- **Minecraft Support**: Added 1.21.x support and per-server Java version pinning.

## [Legacy]

- **1.11.0**: Velocity proxy integration and cross-play (Geyser/Floodgate) automation.
- **1.10.x**: Dynamic DNS (DuckDNS) support and SQLite storage consolidation.
- **1.9.x**: Plugin Marketplace (Spiget/Hangar) and notification engine.
- **1.8.x**: Adaptive UI grid and responsiveness improvements.
- **1.7.0**: Zero-Config HTTPS and multi-user RBAC.

## Known Issues

- (No critical known issues for v1.13.0)
