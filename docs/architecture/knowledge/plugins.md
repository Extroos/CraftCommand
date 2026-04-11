# Plugin & Mod Management

## Purpose

Manages cross-platform mod and plugin lifecycles, metadata extraction, and dependency resolution.

## Scope

- **Marketplace Integration**: Unified adapters for Modrinth, Spiget (SpigotMC), and Hangar (PaperMC).
- **Lifecycle Management**: Handling installation, uninstallation, updates, and "Soft Disabling" (renaming).
- **Dependency Resolution**: Automatically fetching required plugins during installation.
- **JAR Reconciliation**: Scanning the disk to discover manual installations and extract metadata (name, version, author).

## Invariants (Do Not Break)

- **Software Compatibility**: Plugins MUST only be searchable or installable if the server software supports them (e.g., no plugins on Vanilla).
- **Soft Disabling**: Disabling a plugin MUST be done by appending `.disabled` to the filename (e.g., `EssX.jar` -> `EssX.jar.disabled`).
- **Conflict Prevention**: Installation MUST verify if a file already exists; untracked files should be backed up (`.bak`) to prevent silent overwrites.
- **Integrity Check**: Every downloaded JAR MUST be validated (minimum `AdmZip` entry count > 0) before being added to the registry.

## Key Flows

### 1. Marketplace Installation

1. **Resolution**: `MarketplaceRegistry` finds the download URL based on server software/version.
2. **Download**: `InstallerService` fetches the JAR to the platform's target directory (`plugins/` or `mods/`).
3. **Registry**: `PluginService` creates a UUID-mapped record in the DB and triggers a "Restart Required" flag on the server.
4. **Dependencies**: Recursively installs required projects identified by the provider (e.g., Modrinth dependencies).

### 2. Manual Reconcilation (Scanning)

1. **Trigger**: User opens the Plugin Manager or manually requests a scan.
2. **Action**: `PluginService.scanInstalled` reads the directory for `.jar` files.
3. **Extraction**: Reads `plugin.yml` (Bukkit), `fabric.mod.json`, or `mods.toml` (Forge) to identify metadata.
4. **Sync**: Adds missing DB records for manual files and removes dead records for missing files.

## Verified Entry Points / File Map

### backend

- **Main Service**: [PluginService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/plugins/PluginService.ts)
- **Marketplace Adapter**: [MarketplaceRegistry.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/plugins/MarketplaceRegistry.ts)
- **Target Directories**: Handled by `getTargetDir` (plugins vs mods).

### frontend

- **Marketplace UI**: `frontend/src/features/plugins/Marketplace.tsx`
- **Installed List**: `frontend/src/features/plugins/PluginManager.tsx`

## Operational Logic
- **Stale Record Cleanup**: DB entries for missing files are purged during the `install` or `reconcile` cycle.
- **Metadata Sanitization**: Metadata extraction (plugin.yml/fabric.mod.json) includes BOM stripping for consistency.
- **Dependency Handling**: Only `required` dependencies are auto-provisioned; optional ones are ignored.

## Testing Checklist + Done

- [x] Verify `.disabled` renaming successfully stops a plugin from loading on Spigot.
- [x] Verify dependency resolution for Modrinth (e.g., floodgate required by Geyser).
- [ ] Test reconciliation with 100+ mods in a Fabric environment.
- [ ] Verify `validateJarIntegrity` catches 0-byte downloads.
