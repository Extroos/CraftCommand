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
}
