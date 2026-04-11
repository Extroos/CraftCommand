import { AppError } from './AppError';

export class ValidationUtils {
    /**
     * Validates a port number (1-65535).
     */
    public static validatePort(port: any): number {
        const p = parseInt(port);
        if (isNaN(p) || p < 1 || p > 65535) {
            throw new AppError(400, 'INVALID_PORT', 'Invalid port. Must be between 1 and 65535.');
        }
        return p;
    }

    /**
     * Validates a hostname or IP address (simple check).
     */
    public static validateHost(host: string): string {
        if (!host || host.trim().length === 0) {
            throw new AppError(400, 'MISSING_HOST', 'Host is required.');
        }
        // Basic sanitization to prevent common injection characters in host strings
        if (/[;<>|&]/.test(host)) {
            throw new AppError(400, 'INVALID_HOST', 'Invalid host: contains illegal characters.');
        }
        return host.trim();
    }

    /**
     * Validates a generic ID slug (alphanumeric, dashes, dots).
     */
    public static validateId(id: string, fieldName: string = 'ID'): string {
        if (!id || !/^[a-zA-Z0-9-._ ]+$/.test(id)) {
            throw new AppError(400, 'INVALID_ID', `Invalid ${fieldName}. Must be alphanumeric with dashes, dots, or underscores.`);
        }
        return id;
    }

    /**
     * Validates RAM input (int, GB).
     */
    public static validateRam(ram: any): number {
        const r = parseInt(ram);
        if (isNaN(r) || r < 1 || r > 512) {
            throw new AppError(400, 'INVALID_RAM', 'Invalid RAM allocation. Must be between 1 and 512 GB.');
        }
        return r;
    }
    private static readonly RESERVED_NAMES = [
        'backend', 'frontend', 'node_modules', 'data', 'logs', 'backups', 
        'config', 'public', 'src', 'dist', 'build', 'temp', 'tmp',
        'auth', 'system', 'api', 'server', 'servers', 'minecraft_servers'
    ];

    /**
     * Validates a folder name (Alphanumeric, underscores, dashes only).
     * Rejects reserved system names.
     */
    public static validateFolderName(name: string): boolean {
        // 1. Basic Regex: Alphanumeric, underscores, dashes only.
        if (!/^[a-zA-Z0-9_\-]+$/.test(name)) return false;

        // 2. Reserved Names Check (Case-insensitive)
        if (this.RESERVED_NAMES.includes(name.toLowerCase())) return false;

        return true;
    }

    /**
     * Validates a build ID (Prevent path traversal).
     */
    public static validateBuildId(build: string): boolean {
        // Typical build: "1.2.3", "47.1.0", "1.20.1-47.1.0"
        return /^[a-zA-Z0-9.\-]+$/.test(build) && !build.includes('..');
    }
}
