# Filesystem Interface

## Purpose

Provides an asynchronous, sandboxed interface for file manipulation within the server working directory.

## Scope

- **Path Resolution**: Enforcing the "Root Sandbox" to prevent path traversal attacks.
- **Operations**: Async primitives for `list`, `read`, `write`, `delete`, `move`, and `copy`.
- **Atomic Writes**: Using temporary files and renames (`.tmp`) to prevent data corruption during crashes.
- **Compression**: Managing ZIP creation for backups or downloads via `archiver`.

## Invariants (Do Not Break)

- **Strict Sandboxing**: All paths MUST be resolved via `resolvePath`. If a path resolves outside the `basePath`, it MUST throw an "Access denied" error.
- **Atomicity**: `writeFile` MUST use a `.tmp` file and `fs.rename` to ensure the target file is never in a partially-written state.
- **Normalization**: Paths should be normalized to use forward slashes (`/`) for cross-platform consistency in the UI and state.

## Key Flows

### 1. Secure Path Resolution

1. **Input**: A relative path string (e.g., `../../etc/passwd`).
2. **Action**: `path.resolve(basePath, relativePath)` creates an absolute path.
3. **Guard**: Verifies the result starts with `basePath`.
4. **Outcome**: Returns safe absolute path or throws error.

### 2. File Manipulation (CRUD)

1. **List**: Returns structured objects with `name`, `isDirectory`, `size`, and `modified` (formatted for UI).
2. **Move/Copy**: Includes "Copy Logic" (e.g., `file.txt` -> `file - Copy.txt`) if source and destination are the same.
3. **Delete**: Uses `fs.remove` (recursive) for both files and directories.

## Verified Entry Points / File Map

### backend

- **System Manager**: [FileSystemManager.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/files/FileSystemManager.ts)
- **Route Handlers**: `backend/src/features/files/files.routes.ts`

### frontend

- **File Browser**: `frontend/src/features/files/FileList.tsx`
- **File Editor**: `frontend/src/features/files/FileEditor.tsx`

## Operational Constraints
- **Platform Handling**: Automatically translates between Windows and POSIX path separators during resolution.
- **Error Normalization**: Maps native FS errors to standardized API error codes.
- **Atomicity**: Writes use `.tmp` sidecar files followed by a move operation to prevent corruption.
- **Normalization**: All output paths use forward slashes (`/`) for consistency.

## Testing Checklist + Done

- [x] Verify `resolvePath` blocks `..` traversal.
- [x] Verify `writeFile` creates a `.tmp` file before renaming.
- [ ] Test behavior with very large directories (>10,000 files).
- [ ] Verify `compress` correctly handles nested directory structures.
