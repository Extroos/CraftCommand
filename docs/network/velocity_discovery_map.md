# Velocity Discovery Map

This document maps the existing CraftCommand infrastructure to identify integration points for Velocity Proxy and Multi-Version support.

## 1. Server Lifecycle & Execution

- **RunnerFactory**: `backend/src/features/processes/runners/RunnerFactory.ts`
  - Velocity will use the `NativeRunner` (or `DockerRunner` if enabled) just like other Java servers. No changes needed to the factory.
- **ProcessManager**: `backend/src/features/processes/ProcessManager.ts`
  - Handles status tracking and log buffering. Velocity will be tracked like any other server instance.

## 2. Server Configuration & Metadata

- **Shared Types**: `shared/types/index.ts`
  - `ServerConfig.software` needs to include `'Velocity'`.
- **Capability Utils**: `shared/utils/CapabilityUtils.ts`
  - `getServerCapabilities` needs a new case for `'velocity'`:
    - `softwareCategory: 'JAVA'`
    - `supportsPlugins: true` (Velocity plugins)
    - `supportsModpacks: false`
    - `recommendedPort: 25565`
    - `binaryName: 'velocity.jar'`

## 3. Installation Flow

- **InstallerService**: `backend/src/features/installer/InstallerService.ts`
  - Need `installVelocity(serverDir, version, build)`:
    - Download from Papermc API (`https://api.papermc.io/v2/projects/velocity/...`)
    - Generate `velocity.toml` with safe defaults.
    - Set forwarding mode (likely `modern` or `bungeecord` depending on user choice, default `modern`).

## 4. Startup & Environment

- **StartupManager**: `backend/src/features/servers/StartupManager.ts`
  - `prepareEnvironment`: Add Velocity check to ensure `plugins` folder exists.
  - `buildStartCommand`: Velocity is a standard JAR execution.
  - `enforceBackendProperties`: Velocity uses `velocity.toml` instead of `server.properties`. Need a new method `enforceVelocityConfig`.

## 5. Diagnosis & Auto-Healing

- **DiagnosisRules**: `backend/src/features/diagnosis/DiagnosisRules.ts`
  - Add rules for:
    - Port conflicts.
    - `velocity.toml` parsing errors.
    - Reachability of backend servers.
- **AutoHealingService**: `backend/src/features/servers/AutoHealingService.ts`
  - Already generic enough to handle `RECOVERING` state and one-click fixes.

## 6. Frontend Entry Points

- **CreateServerWizard**: `frontend/src/features/servers/CreateServer/index.tsx`
  - Add "Velocity Proxy" to `softwareOptions`.
  - Update `handleDeploy` to call `API.installServer(id, 'velocity', ...)`.
- **Server Details**: Need a new tab or dashboard widget for "Network" management if the server is a proxy.

## 7. Distributed Nodes

- **Node Management**: Velocity can run on any node with `java` capability.
- **Reachability**: The proxy needs to know the LAN/Node IP of its backends.
