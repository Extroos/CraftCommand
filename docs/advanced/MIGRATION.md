# Server Migration Guide

CraftCommand includes an automated import engine that analyzes existing server directories or archives to configure internal server instances.

## Import Workflow (Analysis Cycle)

The migration process follows a two-stage 1:1 mapping of your source files.

### 1. Analysis Stage
When you point the panel to a folder or upload a ZIP, the `ImportService.ts` executes the `analyzeFiles` logic. 

**Detection Logic**:
*   **Software**: The engine scans for specific signatures:
    *   `Paper`: Scans for `paper.jar`, `paper-`, or `paper.yml`.
    *   `Purpur`: Scans for `purpur.jar`, `purpur.yml`, or `config/purpur-global.yml`.
    *   `Forge`: Scans for `forge-` patterns or a `mods` directory.
    *   `Bedrock`: Scans for `bedrock_server` binaries.
*   **Configuration**: The engine reads the `server.properties` file:
    *   **Port**: Extracts `server-port`.
    *   **MOTD**: Extracts and unescapes the `motd` string.
*   **Resource Heuristics**: 
    *   Sets RAM to **4GB** if a `mods` folder is detected.
    *   Sets RAM to **1GB** for Proxy (Velocity) or Bedrock.
    *   Selects the **Recommended Java Version** based on the detected Minecraft version string in the .jar filename.

### 2. Execution Stage
- **Flattening**: If a ZIP contains a single nested folder, the panel automatically flattens it to the root of the server directory.
- **Safety Checks**: The panel blocks imports from protected system directories (e.g., `backend`, `frontend`, `data`) to prevent recursive crashes or data leaks.

## Migrating from other Panels (Pterodactyl)

The engine specifically detects Pterodactyl migration markers (`egg-server.json` or `.pterodactyl`). 
*   **Action**: While CraftCommand does not support Pterodactyl eggs, it uses these markers to prioritize local file management over cloud-sync defaults.

## Rollback Mechanism

If an import fails or is misconfigured, the `rollbackImport` function provides a safety net:
1.  **File Cleanup**: Deletes the newly created working directory.
2.  **State Reset**: Removes the server entry from the internal database.

This ensures your panel's state remains clean if a large migration is aborted.
