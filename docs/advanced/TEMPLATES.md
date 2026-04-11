# Server Template Management

CraftCommand uses a JSON-based template system to enable rapid deployment of standardized server environments.

## Core Templates (Built-in)

The following templates are available by default and are defined in `TemplateService.ts`. Built-in templates cannot be deleted.

| Software | ID | Rec. RAM | Java Version |
| :--- | :--- | :--- | :--- |
| **Paper** | `paper-latest` | 4096 MB | Java 21 |
| **Vanilla** | `vanilla-latest` | 2048 MB | Java 21 |
| **Fabric** | `fabric-latest` | 4096 MB | Java 21 |
| **Forge** | `forge-1.21.11` | 6144 MB | Java 21 |
| **NeoForge** | `neoforge-1.21.11` | 4096 MB | Java 21 |
| **Bedrock** | `bedrock-latest` | 2048 MB | N/A |
| **Velocity** | `velocity-latest` | 1024 MB | Java 21 |

## Custom Templates

You can create your own templates by capturing the state of an existing server.

### Creating from Server
When use the `createFromServer` logic, the system extracts the following metadata:
- **Software Type**: (e.g., Paper, Forge).
- **Core Version**: The specific version string (e.g., 1.20.1).
- **RAM Configuration**: Converts current GB allocation to MB recommendation.
- **Java Runtime**: Strips the "Java " prefix to store the raw version integer.
- **Flags**: Checks if **Aikar's Flags** are enabled to include them in the new template preset.

### Data Storage
Custom templates are persisted to `backend/data/templates.json`. You can manually backup or edit this file to share templates between different CraftCommand installations.

## Installation Logic

When a template is applied, the `TemplateService` dispatches the request to the `InstallerService` based on the specified `type`.
- **Zip-Based**: If a template includes a `downloadUrl`, the panel performs a ZIP extraction with a "Smart Flatten" to ensure the `workingDirectory` is correctly structured.
- **Binary-Based**: For types like `Bedrock`, the panel downloads and overlays the specific binaries required for that OS/Architecture.
