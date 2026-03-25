/**
 * Centralized System Error Codes
 * 
 * Used for consistent error reporting in logs, WebSocket events, and UI alerts.
 * Aligns with Core Rule 5 (System Observability).
 */
export enum ErrorCode {
    // ── Node & Network ──
    E_NODE_STALE = 'E_NODE_STALE',           // Heartbeat timeout
    E_NODE_DEGRADED = 'E_NODE_DEGRADED',     // Resource pressure (CPU/RAM)
    E_NODE_AUTH_FAIL = 'E_NODE_AUTH_FAIL',   // Enrollment secret mismatch
    E_NET_DISCONNECT = 'E_NET_DISCONNECT',   // Socket lost
    E_NET_RECOVERY = 'E_NET_RECOVERY',       // Re-sync in progress

    // ── Process & Lifecycle ──
    E_PROC_SPAWN_FAIL = 'E_PROC_SPAWN_FAIL', // Child process failed to start
    E_PROC_CRASHED = 'E_PROC_CRASHED',       // Unexpected exit
    E_PROC_TIMEOUT = 'E_PROC_TIMEOUT',       // Start/Stop took too long
    E_PROC_PORT_BUSY = 'E_PROC_PORT_BUSY',   // Address already in use

    // ── Data & Filesystem ──
    E_FS_ATOMIC_FAIL = 'E_FS_ATOMIC_FAIL',   // Atomic swap failed
    E_FS_PERM_DENIED = 'E_FS_PERM_DENIED',   // Read/Write permissions missing
    E_FS_NO_SPACE = 'E_FS_NO_SPACE',         // 1GB safety threshold triggered
    E_DB_CORRUPT = 'E_DB_CORRUPT',           // JSON/SQLite load failure

    // ── System & Updates ──
    E_UPD_CORRUPT = 'E_UPD_CORRUPT',         // Zip bundle invalid
    E_UPD_ROLLBACK = 'E_UPD_ROLLBACK',       // Update failed, rolling back
    E_SYS_OVERLOAD = 'E_SYS_OVERLOAD'        // Entire host under extreme load
}

/**
 * Helper to wrap errors with codes.
 */
export class SystemError extends Error {
    constructor(public code: ErrorCode, message: string, public metadata?: any) {
        super(`[${code}] ${message}`);
        this.name = 'SystemError';
    }
}
