# Changelog

All notable changes to this project will be documented in this file.

## [1.11.6] - 2026-02-21 - Core Deployment Hotfix

### Fixed

- **Template Installation**: Resolved an "Unsupported template type" error when deploying Bedrock or Velocity servers.
- **Installer registration**: Correctly mapped software templates to their respective installation drivers in the internal pipeline.

## [1.11.5] - 2026-02-21 - Universal Core Stabilization

### Improved

- **Universal Diagnostic Compatibility**: Expanded core diagnostic rules to be fully software-agnostic.
  - **Multi-Software Detection**: Refined `BadConfigRule` to support success patterns for Forge, Bedrock, Velocity, and BungeeCord.
  - **Platform Hardening**: Explicitly suppresses Java-specific diagnostics (like Java Version mismatches) for C++ based Bedrock servers to prevent irrelevant alerts.
  - **Stability Guards**: System-wide synchronization of `ONLINE` status guards across all supported software types.

## [1.11.4] - 2026-02-21 - Technical Stabilization & Core Resilience

### Improved

- **Diagnosis Hardening (v2.2)**: System-wide stabilization of core diagnostic rules to eliminate false positives.
  - **BadConfigRule Refinement**: Integrated context-aware logic that verifies successful startup before flagging configuration errors, suppressing noise from transient Fabric 1.21+ startup quirks.
  - **Status-Aware Guards**: Applied `ONLINE` status guards to `EulaRule`, `MissingJarRule`, and `JavaVersionRule` to prevent stagnant log entries from triggering redundant critical alerts while servers are running.
  - **No-Such-File Silencing**: Specifically suppresses the `NoSuchFileException: server.properties` warning on first launches, allowing the server to generate defaults without administrative interference.

## [1.11.3] - 2026-02-21 - Diagnostic Intelligence & Backup Hardening

### Added

- **System Diagnosis Expansion (v2.1)**: Integrated 6 new enterprise-grade diagnosis rules targeting common operational failures:
  - **ClientOnlyModRule**: Identifies client-side mods installed on standalone servers.
  - **CorruptedModJarRule**: Detects empty or partial JAR files from interrupted downloads.
  - **ProxyForwardingConfigRule**: Diagnoses Bungee/Velocity IP forwarding mismatches.
  - **GeyserPortConflictRule**: Transparently identifies UDP 19132 port collisions for cross-play servers.
  - **PlayerDataCorruptionRule**: Detects corrupted `.dat` files preventing player logins.
  - **BrokenDatapackRule**: Diagnoses world load failures caused by syntax errors in Datapacks.
- **Enhanced Auto-Healing Actions**: Introduced `REMOVE_MOD` for corrupted dependency cleanup and `REASSIGN_BEDROCK_PORT` for automated network resolution.
- **Wider Minecraft Version Support**:
  - **Modern (1.20 - 1.21.x)**: Full support for the 1.21.x series up to 1.21.11.
  - **Legacy Support**: Restored compatibility for legacy versions including 1.7.10, 1.8.8, 1.12.2, and 1.19.2.
  - **Intelligent Java Pinning**: Integrated version-aware Java mappings to automatically recommend the optimal runtime (Java 21 for 1.21+).

### Improved

- **Backup System Hardening (v2.1)**:
  - **Concurrency Locking**: Implemented per-server backup locks to prevent disk I/O congestion from simultaneous operations.
  - **Robust ID Generation**: Backup IDs now feature randomized suffixes for guaranteed uniqueness across clustered nodes.
  - **Smart Retention Logic**: Resolved various retention bugs; the system now correctly respects the `keepCount` parameter and prioritizes purging `Auto-Save` snapshots over user-created `Manual` backups.
- **Backend Stability**: Enforced strict `ServerStatus` enum synchronization throughout the backend lifecycle to eliminate race conditions and "ghost" process states.
- **UI Responsiveness**: Redesigned the version selection UI in the creation wizard with cleaner Modern/Legacy grouping.

### Fixed

- **NetworkOfflineRule False Positives**: Refined the authentication connectivity check to strictly match Mojang connection exceptions, preventing false flags during normal offline states.
- **Server Stop Race Condition**: Resolved an issue where rapid interaction could trigger 409 conflicts during server shutdown transitions.
- **Mod Diagnosis Regex**: Hardened the corrupted JAR detection to handle non-standard filename characters.

## [1.11.2] - 2026-02-18 - Hotfix: Agent Dependencies

### Fixed

- **Distributed Node Crash**: Verified and fixed missing `systeminformation` dependency in the Agent workspace that caused the embedded node engine to fail on startup.
- **Launcher Automation**: Updated `run_locally.bat` to automatically detect and install missing dependencies for the `agent` directory alongside backend/frontend.

## [1.11.1] - 2026-02-18 - Hotfix: Remote Access & HTTPS

### Fixed

- **Critical Remote Access Failure**: Rewrote `install-caddy.cjs`, `install-proxy.cjs`, and `share-website.cjs` to use robust PowerShell-based downloading, fixing 0-byte corrupt executables.
- **Caddy Launch Error**: Resolved "This app can't run on your PC" error by enforcing GitHub Release verification and unblocking binaries via PowerShell.
- **HTTPS Port Conflict**: Added domain sanitization to `manage-caddy.cjs` to automatically strip port 3000 from user input, preventing app crashes.
- **Panic Kill Persistence**: Implemented real-time file watching in `SystemSettingsService` ensuring "Panic Kill" immediately isolates the network without requiring a restart.
- **Zero-Config Tunnel Spec**: Corrected `PlayitProvider` to use the valid `start` command instead of the deprecated `run` argument.

## [1.11.0] - 2026-02-18 - Network Fabric & Systems Integrity

### Added

- **Native Velocity Support**: Full-stack integration for the high-performance Velocity proxy server, including automated installation, a dedicated dashboard, and specialized lifecycle management.
- **Proxy Network Architecture**: A sophisticated backend synchronization engine that automatically manages forwarding secrets (`modern`, `legacy`, `bungeeguard`) and linked backend server links.
- **Dedicated Velocity Dashboard**: A professional, neutral-aesthetic command center for proxies, featuring real-time network health diagnostics and optimized metric visualization.
- **One-Click Multi-Version Support**: Integrated ViaVersion Suite (ViaVersion, ViaBackwards, ViaRewind) specifically for proxies to handle multi-version client connections seamlessly.
- **Global Style Engine**: Comprehensive support for user-defined backgrounds with persistence across the entire panel (Dashboard, Settings, Profile, etc.).
- **Smart Resource Engine**: Backend services for CPU affinity/process limits (`ProcessLimiter`), auto-scaling memory (`MemoryScalerService`), and load capacity simulation (`LoadSimulatorService`).
- **Self-Managed Network Fabric**: Traffic balancing, network templates (`NetworkTemplateService`), and automated port/firewall management across distributed nodes.
- **Templates & Marketplace Expansion**: Mod bundles (`ModBundleService`), pre-tuned config presets (`ConfigPresetsService`), and disk quota enforcement via `HostingOSService`.
- **One-Click Global Access**: Automated Cloudflare Tunnel provisioning and zero-config remote access orchestration.
- **Hosting OS Mode**: Dedicated service layer for bare-metal server management with resource isolation and disk quotas.
- **ModpackBrowser Multi-Source Search**: Extended `ModpackService` to search both mods and modpacks in parallel via Modrinth, with deduplication and graceful error handling.
- **Mod/Modpack Type Filtering**: Frontend toggle chips for filtering by content type (All, Mods, Modpacks) and loader (Fabric, Forge, NeoForge, Quilt) with auto-detection from server software.
- **Cross-Play Ecosystem**: Native Geyser/Floodgate integration for unified Bedrock/Java gameplay with automated UDP port orchestration and real-time connectivity diagnostics.
- **Secure Systems Integrity Engine**: A production-grade update architecture featuring atomic state transitions, automated backup/recovery pathways, and data preservation locks.
- **Cryptographic Lifecycle Security**: Industry-standard Ed25519 signature verification and SHA256 hashing for all system updates, ensuring end-to-end supply chain security.
- **Advanced Update Diagnostics**: Intelligent monitoring rules to identify and mitigate signature mismatches, installation failures, or database migration drifts.
- **Distributed Protocol Guardians**: Automated compatibility checks that prevent system-wide updates if connected nodes or proxies require manual intervention.
- **Intelligent Lifecycle Alerts**: Real-time administrative notifications for system improvements with deep-linking to the refined maintenance dashboard.

### Improved

- **Process Lifecycle Hardening**: Engineered a robust "Stopping" state bridge in the backend to prevent accidental server restarts and "ghost" process hang-ups during manual shutdowns.
- **Intelligent Creation Flow**: Redesigned the "Create Server" wizard with a dedicated Velocity path, software-aware defaults (RAM, Java versions), and real-time validation.
- **SettingsManager Velocity Context**: The settings UI now dynamically hides irrelevant gameplay environments (Gamemode, Difficulty) for proxies and reveals specialized "Proxy Dynamics" controls.
- **Professional UI Aesthetic**: Standardized premium glassmorphism and magazine-style hero layouts across the new Velocity components and updated the Proxy Network manager.
- **Real-Time Status Synchronization**: Improved `ServerContext` polling and implemented "Heartbeat Recovery" to ensure UI state consistency during rapid interaction sequences.
- **CreateServer Type Safety**: Added `'Do Not Override'` to the `javaVersion` union, removed dead wizard steps (`category`, `marketing`), and replaced unsafe `as any` casts with proper typed assertions.
- **CreateServer Code Cleanup**: Removed ~30 unused imports across `index.tsx`, `ProConfig.tsx`, and `WizardMode.tsx`, deleted dead `getRecommendedJava` wrapper and duplicate `canCreate` access-denied guard (20 lines of dead code).
- **ModpackBrowser UX**: Added error handling with retry button, result counts, mod vs modpack badges, improved empty states with search suggestions, and formatted download counts.
- **Platform Launcher Redesign**: Rebuilt `run_locally.bat` with auto-sized console (`mode con cols=80 lines=42`), compact FIGlet ASCII banner, grouped menu categories (Operations/Diagnostics/Advanced), and consistent section layout.
- **Update UX Refinement**: Re-engineered the System Update UI into an adaptive, embedded component that integrates seamlessly into Global Settings without layout clutter.
- **Atomic Swap Robustness**: Hardened the PowerShell-based update applicator to handle complex directory merges and state transitions.
- **Launcher FIGlet Banner**: Replaced unescaped characters in the ASCII banner for 100% reliability across terminal environments.
- **Update Intelligence**: Targeted notifications (Admins/Owners only) and exponential backoff for network resilience.
- **Cross-Play UX**: Real-time status feedback and "one-click" toggle for Floodgate authentication.

### Fixed & Patched

- **Stopping/Restart Loop**: Fixed a critical race condition where the Panel's self-healing logic would erroneously restart a server that was intentionally being shut down.
- **Software Version Registry Sync**: Resolved protocol metadata conflicts for Minecraft 1.21.11, ensuring the internal registry remains stable during proxy handshakes.
- **Forwarding Secret Automation**: Patched a configuration drift issue where Paper backends would fail to verify player details due to missing or stale proxy secrets.
- **Wizard Status Persistence**: Resolved a state-leak bug in the creation flow that would occasionally preserve irrelevant software templates between distinct setup attempts.
- **Modpack Route Type Param**: Updated `/api/modpacks/search` to accept a `type` query parameter (`all`, `mod`, `modpack`) with backward-compatible defaults.
- **Ed25519 Crypto Verification**: Fixed a critical bug in `UpdateVerifier` where incorrect digest algorithms caused signature validation failures in Node.js.
- **Update Path Nesting**: Resolved a directory recursion issue where update files were incorrectly nested during the application phase.
- **Notification Action Linking**: Fixed button-less update alerts; all update notifications now correctly route to the maintenance dashboard.

- **Stable Share Wizard**: A new, professional multi-step flow for configuring Dynamic DNS (DDNS) with real-time verification and automated propagation checks.
- **Native DuckDNS Integration**: Direct IP synchronization directly from the panel, eliminating the need for external background update software.
- **Intelligent Resource Guardians**: Real-time pre-flight checks for JVM compatibility and hardware-limit RAM allocation to prevent system-wide instability.
- **System Diagnosis Core (v2)**: Overhauled diagnostic engine that identifies common Minecraft errors (EULA, Java, Plugins) and offers one-click "Auto-Fix" solutions.
- **Minecraft Server Icon Restoration**: Automated 64x64 PNG branding system that ensures every server instance projects your professional identity on the Minecraft server list.
- **Zero-Latency Networking Cache**: Persistent back-end storage for networking diagnostics, ensuring immediate UI loads even during high-latency DNS lookups.
- **Full-Stack Avatar Uploads**: Integrated profile picture management with automated backend optimization and real-time dashboard synchronization.
- **Documentation Overhaul**: Comprehensive cleanup of the technical library, merging redundant policies (Security, Contributing), reorganizing the folder structure into logical categories (Networking, Support), and significantly expanding the Architecture and Testing references.

### Improved

- **Dynamic DNS Persistence**: Implemented backend status caching (`serverDdns`) to preserve networking diagnostics across page navigations and system restarts.
- **DNS Resolution Resilience**: Added multi-attempt retry logic and fallback to OS-level resolvers to handle transient `EREFUSED` or `ETIMEOUT` lookup failures.
- **Auto-Healing Manager (v3)**: Stabilized background monitoring with improved "Panic Control" and specialized logic for Bedrock native binary recovery.
- **API Route Foundation**: Hardened the `ApiService` to consistently handle `/api` prefixing and resolved persistent 404 errors on specific update triggers via a robust GET fallback.
- **Professional UI Refresh**: Overhauled the Networking and Diagnosis tabs with premium glassmorphism, refined typography, and real-time activity indicators.
- **Launcher Hardening**: Resolved PowerShell syntax errors in `run_locally.bat` by implementing robust escaped quoting for all interactive prompts.
- **Maintenance Mode (Fix/Reinstall)**: Hardened dependency cleanup logic with case-insensitive confirmation and real-time installation feedback.
- **Icon Stabilization Logic**: Implemented high-performance image processing via `sharp` to automatically resize and convert user-uploaded icons to 64x64 PNG for perfect in-game display.
- **Visual Identity Feedback**: Enhanced `SettingsManager.tsx` to provide real-time "Stabilizing Icon" feedback during the upload and optimization process.

### Fixed & Patched

- **Networking Sync Stability**: Fixed a bug where the Networking tab would reset or "crush" during navigation; implemented silent background polling and instant cache retrieval.
- **Panic Control Restoration**: Rebuilt the missing emergency isolation infrastructure, ensuring instant decommissioning of network bridges.
- **ESM/CJS Compatibility**: Resolved `ERR_REQUIRE_ESM` startup failures by isolating script-specific module configurations.
- **Plugin Marketplace Recovery**: Fixed Spiget 404 handling and improved error display when search providers are temporarily offline.
- **React Hook Stability**: Resolved a critical "Rules of Hooks" violation in `AppContent` caused by conditional context access.
- **Environment Stability**: The Stability Audit now automatically identifies and flags missing core storage directories (`minecraft_servers`, `uploads`).

## [1.10.0] - 2026-02-11 - Distributed Operations & Cluster Resilience

### Added

- **One-Click Distributed Nodes**: Automated enrollment via Bootstrap ZIP for remote hosts.
- **Global Operations Center (GOC)**: Distributed resource telemetry and spatial heatmap visualization.
- **Intelligent Scheduler**: Dynamic, metric-based server assignment across worker nodes.
- **Zombie Adoption**: Integrated self-healing that re-acquires running server processes after agent crashes or panel restarts.
- **Embedded Monaco IDE**: Full-screen configuration editor with syntax highlighting and real-time co-presence.
- **Chaos-Hardened Sockets**: Hardened retry logic and exponential backoff for inter-node communication.
- **Fixed Navigation**: Implemented a state-aware `fixed` header to preserve global controls during deep scrolling.
- **Documentation Hub**: Established a dedicated `/docs` core with a centralized index, unifying technical references and user guides.
- **Minimalist Server Selection**: Redesigned the server entry point with a compact, high-density grid for better cluster visibility.
- **Safe Downgrade Path**: Implemented bidirectional sync in the SQLite engine. Data written to SQL is automatically reflected in JSON backups, ensuring no data loss when switching providers.
- **Distributed Nodes Feature Gating**: Context-aware UI items for 'Global Operations' and 'Monitoring' that only appear when the engine is active and the user is authorized.
- **Rainbow Hold Authentication**: An interactive, high-contrast login refinement with a progressive 'Rainbow' button hold effect for secure entry.
- **Native Bedrock Support**: End-to-end integration for Minecraft Bedrock Edition, including automated binary repair, specialized log tracking, and software-aware configuration settings.
- **Server Icon Customization**: Support for custom icons (`server-icon.png` for Java, `world_icon.png` for Bedrock) with a dedicated preview and upload UI.
- **Branded Iconography**: Integrated new professional brand icons across Login and Global Settings, with `website-icon.png` as the default server fallback.

### Improved

- **Professional UI Refresh**: Glassmorphic dashboard overhaul with optimized layout compression and high-density spacing.
- **Documentation Consolidation**: Merged `features.md` into `ARCHITECTURE.md` and unified security policies into a single `docs/SECURITY.md`.
- **Smart Terminal**: Responsive CLI with adaptive prompts and scanline effects.
- **Layout Consistency**: Standardized page padding across all core views (Dashboard, Settings, Profile) to prevent header overlap.
- **Storage Consolidation**: Migrated legacy `audit.json` and fragmented `schedules/*.json` files into a unified, high-performance SQLite provider.
- **Audit Resilience**: Implemented automated pruning (5,000 entry cap) for SQL-based audit logs to ensure cluster longevity.
- **Login Aesthetics**: Overhauled login glassmorphism with better contrast, refined typography, and improved cursor-following lighting effects.
- **HTTPS Stability**: Hardened the Zero-Config Caddy integration and resolved "Protocol Mismatch" warnings in the Settings UI.

### Fixed & Patched

- **Node Registry Emergency Fix**: Resolved a critical race condition where node deployment state was not persisting across container restarts.
- **Global Settings API**: Fixed a 404 error caused by legacy endpoint routing in the settings module.
- **Node Management 403**: Patched a permission elevation check that was erroneously blocking node configuration on some setups.
- **Node Selection Persistence**: Corrected a state-reset bug where the "Select Node" dropdown would revert during multifactor configuration.
- **Docker Lifecycle Stability**: Hardened the lifecycle management service to ensure reliable container cleanup and synchronization.
- **API Reliability**: Eliminated 401/403 loop conditions during rapid navigation across distributed nodes.
- **Global Safety Redirects**: Implemented automatic redirects if unauthorized paths (like Global Operations) are accessed while the Distributed Engine is disabled.
- **Schedule Migration Heuristics**: Automated migration logic for legacy per-server schedules, including safety-renaming of old files.
- **Header Alignment**: Fixed layout issues in the fixed header specifically when navigating between manage and selection views.
- **Bedrock Versioning**: Patched an logic error where Bedrock servers defaulted to `server.jar` in metadata; implemented a backend healing layer for native execution.
- **Log Pattern Reliability**: Fixed a bug where Bedrock player join/leave events were not detected in the real-time roster.

## [1.9.1] - 2026-02-10 - Collab Hardening & Host Mode Sync

### Added

- **Host Mode**: A master switch to toggle multi-user collaboration features (Chat, Presence, User Management) and enforce Solo Mode.
- **Centralized Versioning**: Programmatic linkage using `version.json` as the single source of truth for the entire application.

### Improved

- **OperatorChat**: Synchronized user profiles (PFPs) and removed automated system tips for a cleaner experience.
- **Update Logic**: Hardened version comparison in `UpdateService` to prevent stale notification alerts.

## [1.9.0] - 2026-02-10 - Plugin Marketplace Stabilization

### Added

- **Plugin Marketplace**: Fully operational aggregate search (Modrinth, Spiget, Hangar) and automated installation.
- **Enhanced Notifications**: Real-time error alerts and persistent system notifications.
- **Stable Auth**: Hardened JWT verification and consistent developer secrets.

### Fixed

- **UI Consistency**: Resolved missing "Plugins" tab in the header.
- **API Reliability**: Fixed 401 Unauthorized loops and malformed response crashes in the frontend.

## [1.8.1] - 2026-02-10 - Integrated Notification System

### Added

- **Notification System**: Full persistent notification engine with real-time Socket.IO alerts.
- **Bell Icon**: Header integration with unread badge counter and dropdown list.
- **Update Integration**: Automated GitHub update checks now trigger system-wide notifications instead of dashboard banners.
- **Auto-Pruning**: Periodic cleanup of old notifications to maintain performance.

### Fixed

- **Header Imports**: Resolved duplicate import issues in the key layout component.

## [1.8.0] - 2026-02-02 - Quality Mode & Adaptive Design

- **Quality Mode (Beta)**: Glassmorphism, custom backgrounds, and smooth animations.
- **Adaptive Dashboard**: New "Micro Mode" and responsive grid layout with drag-and-drop persistence.
- **Smart Terminal**: Resizable console with adaptive prompt and scanline effects.
- **System Diagnosis**: Integrated crash analysis and auto-fix suggestions.

## [1.7.x] - Remote Access & Process Control

- **[1.7.7] Global Alignment**: Unified versioning and documentation synch.
- **[1.7.6] Path Stabilization**: Explicit executable tracking and absolute path resolution.
- **[1.7.5] CLI Aesthetics**: Refined terminal output and PowerShell quoting fixes.
- **[1.7.4] Ghost Hunter**: Detection and purging of unmanaged processes holding server ports.
- **[1.7.1] Connectivity Suite**: **Zero-Config HTTPS** (Caddy) and **Automated Remote Bridge** (Playit.gg) with Panic Control.
- **[1.7.0] Granular Permissions**: **3-State Access Control** (Inherit/Allow/Deny) and Global System Rights.

## [1.6.x] - RBAC & Multi-User

- **[1.6.2] Identity**: Account linking, profile picture customization, and reduced motion accessibility.
- **[1.6.0] Professional Core**: **Pro-Grade Dashboard** refresh, Zero-Config SSL, and solidified Multi-User RBAC.

## [1.5.0] - UI Redesign

- **Compact UI**: Redesigned Global Settings for professional density.
- **Audit Logging**: Real-time system action logging.

## [1.4.x] - Stability & Architecture

- **[1.4.0] Stable Release**: Introduced **Server Architect** wiki, Atomic Writes, and Operation Locking.
- **[1.4.3]**: Java installation heuristic improvements.

## Known Issues

- **Node Persistence (Edge Case)**: Occasionally, rapid agent restarts might create a "Ghost" node in the UI until the next panel refresh.
- **Docker Networking**: Auto-forwarding of ports within Docker containers is currently restricted to Linux hosts.

## Roadmap & Strategy

- **v1.11.x**: Distributed Backup Replication (RAID-1 for server data).
- **v1.12.x**: AI-Powered Log Analysis (Predictive crash prevention).
- **v2.0.0**: Native Mobile Application (iOS/Android) for cluster management.
