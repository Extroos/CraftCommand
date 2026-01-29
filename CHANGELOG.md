# Changelog

All notable changes to this project will be documented in this file.

## [1.5.0-unstable] - 2026-01-30 - UI Redesign & Security Fixes

### Added

- **Compact UI**: Redesigned Global Settings for a more professional, "arty" feel with reduced card sizes and better density.
- **Remote Access Control**: Added "Disable" button directly in Global Settings and Remote Access Wizard.
- **Audit Logging**: Implemented missing backend endpoint for real-time system audit logs.

### Changed

- **Layout Optimization**: Global Settings now uses a responsive 3-column grid for better screen utilization.
- **Aesthetics**: Removed excessive animations and large padding in favor of a clean, classic design.

### Fixed

- **Host Mode Security**: Fixed a critical bug where authentication was bypassed incorrectly in Personal Mode even if Host Mode was enabled.
- **API Reliability**: Added missing `verifyToken` checks and audit log routes.

## [1.4.3] - 2026-01-29 - Bug Fix and Stabilization

### Fixed

- **UI Issue**: Fixed Start button being disabled after creating a new server until page refresh.
- **Java Download**: Improved `isJavaDownloading` logic to only check active download phases.

### Changed

- **Java Installation**: Optimized Java download process for better performance.

## [1.4.0] - 2026-01-29

### Stability Update

- **Stable Release**: This version marks a significant stability milestone, superseding v1.3.0 and v1.0.0.

### Added

- **Server Architect**: Built-in Wiki for deployment guides and hardware sizing.
- **Atomic Writes**: Implemented safe file writing to prevent data corruption during crashes.
- **Operation Locking**: Added concurrency controls for server operations.
- **Plugin Marketplace (Preview)**: Interface for browsing plugins (Install functionality in progress).
- **Diagnostics Engine**: "Explain-My-Server" rules for crash analysis.

### Changed

- **Security Hardening**: Enforced strict path validation to prevent directory traversal.
- **Documentation**: Updated README with accurate feature set and "Local-first" warnings.
- **Deprecation**: Quarantined unused assets and legacy config files.

### Fixed

- **Logo Paths**: Resolved simplified logo imports for better build compatibility.
- **Race Conditions**: Fixed potential state conflicts in `ServerService`.

## [1.2.0] - Previous Release

- Role-Based Access Control (RBAC).
- Discord Integration.
- Server Templates.
