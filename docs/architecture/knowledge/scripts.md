# Operations & Maintenance

## Purpose

Manages application updates, environment bootstrapping, and emergency recovery scripts.

## Scope

- **System Updater**: Lifecycle (Check -> Download -> Extract -> Backup -> Atomic Install -> Finalize) for application updates.
- **PowerShell Bootstrap**: Environment preparation and runtime verification for Windows hosts.
- **Emergency CLI**: Tools for manual intervention (e.g., disabling remote access).
- **Update Verification**: Pre-install integrity checks.

## Invariants (Do Not Break)

- **Preservation List Truth**: The `PRESERVE_LIST` in `system-updater.cjs` MUST explicitly include `backend/data`, `.env`, and `uploads`. Never overwrite user data during an update.
- **Atomic Backup Rule**: The updater MUST snapshot the current `backend/src` and `web/current` directories before applying new files.
- **Merge Logic**: For the `proxy/` and `scripts/` directories, the updater MUST use a merge-and-overwrite strategy rather than a full folder replacement to preserve custom Caddyfiles or environment flags.
- **Permission Check**: All maintenance scripts MUST perform a write-access check on the project root before initiating mutations.

## Key Flows

### 1. Safe Application Update

1. **Detection**: `system-updater.cjs` polls GitHub API for the latest release bundle.
2. **Staging**: Downloads and extracts to a `temp_update` workspace.
3. **Backup**: Creates a timestamped ZIP in `backups/updates/`.
4. **Mutate**: Iteratively copies new files, skipping paths in the `PRESERVE_LIST`.
5. **Reconcile**: Triggers `npm install --production` if `package.json` changes were detected.

### 2. Emergency Repair

1. **Trigger**: System becomes unreachable via HTTPS.
2. **Execute**: `node scripts/ops/emergency-disable-remote.cjs`.
3. **Result**: Forcibly rewrites `settings.json` to disable the Proxy Bridge and resets to local-only mode.

## Verified Entry Points / File Map

### scripts/

- **Main Updater**: [system-updater.cjs](file:///c:/Users/user/Desktop/Craft-Commands/scripts/system-updater.cjs)
- **Bootstrap**: [apply_update.ps1](file:///c:/Users/user/Desktop/Craft-Commands/scripts/apply_update.ps1)
- **Ops Hub**: `scripts/ops/` (e.g., [manage-caddy.cjs](file:///c:/Users/user/Desktop/Craft-Commands/scripts/ops/manage-caddy.cjs))

## Operational Details
- **Lock Management**: `run_CraftCommand.bat` is excluded from updates to avoid OS file locks.
- **Database Migration**: Deployment scripts use an `update_applied.flag` to trigger post-update schema migrations.
- **Caddy Validation**: Domain verification prevents port conflicts during management.
