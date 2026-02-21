/**
 * Local type definitions for the Node Agent.
 * Making the agent 100% standalone by localizing shared types.
 */

export interface NodeCapabilities {
    java?: string;         // e.g. "17.0.2"
    docker?: boolean;      // Is Docker engine available?
    git?: boolean;         // Is git installed?
    node?: string;         // Node.js version
    os?: string;           // e.g. "Linux 5.10" or "Windows 10"
}

export interface NodeInfo {
    id: string;            // UUID
    name: string;          // Human-readable label
    host: string;          // IP or hostname
    port: number;          // Agent port
}
