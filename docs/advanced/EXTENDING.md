# Extending CraftCommand

Technical guide for developing custom diagnostic modules and implementing third-party server execution engines (Runners).

## Diagnostic System

The diagnostic engine (found in `backend/src/features/diagnosis/`) uses a rule-based system to detect and repair server issues.

### Adding a Custom Action
If you need to perform a specific repair (e.g., modifying a custom config file), add it to `DiagnosisActions.ts`.

```typescript
// backend/src/features/diagnosis/DiagnosisActions.ts

export const DiagnosisActions = {
    // ...
    repairCustomConfig: async (fs: FileSystemManager) => {
        const config = await fs.readFile('config.yml');
        const updated = config.replace('debug: false', 'debug: true');
        await fs.writeFile('config.yml', updated);
    }
}
```

### Creating a Diagnosis Rule
Rules are triggered based on log patterns or health checks. To add a new rule, modify the appropriate rule file (e.g., `PluginDiagnosisRules.ts`).

```typescript
// backend/src/features/diagnosis/PluginDiagnosisRules.ts

export const CustomPluginRules: DiagnosisRule[] = [
    {
        id: 'CUSTOM_PLUGIN_ERROR',
        pattern: /Error: Custom plugin failed to load/i,
        action: 'REPAIR_CUSTOM_CONFIG',
        priority: 1
    }
];
```

## Server Engines (Runners)

All server execution logic must implement the `IServerRunner` interface from `backend/src/features/processes/runners/IServerRunner.ts`.

### Implementing a New Runner
To support a new technology (e.g., Podman or Kubernetes), create a new runner class:

```typescript
export class PodmanRunner implements IServerRunner {
    async start(id: string, command: string, cwd: string, env: any): Promise<void> {
        // Implementation for podman run
    }
    async stop(id: string, force?: boolean): Promise<void> {
        // Implementation for podman stop
    }
    // ... Implement all other interface methods
}
```

## Integration Hooks

### Event Bus
The panel uses a central event bus for cross-feature communication. Significant events are emitted by the `NativeRunner` and `BackupService`.

- `PROCESS_STARTED`: Emitted when a server process spawns.
- `BACKUP_COMPLETED`: Emitted after a successful ZIP creation and cloud upload.

### Global Settings State
The `GlobalSettings` object is a shared singleton. To add new settings, update the `GlobalSettings` type in `shared/types/index.ts` and ensure the `SystemSettingsService.ts` handles the migration of the `db.json` file.
