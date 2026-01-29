# Changelog

All notable changes to this project will be documented in this file.

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
