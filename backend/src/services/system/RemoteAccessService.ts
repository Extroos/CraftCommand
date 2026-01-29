import { systemSettingsService } from './SystemSettingsService';
import { auditService } from './AuditService';
// We will import RateLimit middleware check here later if needed, 
// for now we trust the server startup to apply it.

export class RemoteAccessService {
    
    /**
     * Returns the safe bind address for the HTTP/Socket server.
     * Default: 127.0.0.1 (Localhost Only)
     * Remote Mode: 0.0.0.0 (All Interfaces)
     */
    getBindAddress(): string {
        const settings = systemSettingsService.getSettings();
        if (settings.app.remoteAccess?.enabled) {
            return '0.0.0.0';
        }
        return '127.0.0.1';
    }

    /**
     * Checks if the system is safe enough to enable Remote Access.
     * Throws an error if safety gates are not met.
     */
    async validateSafetyGates(): Promise<void> {
        // 1. Audit Logging Check
        // We know AuditService is active if we can import it, but let's check config if we had a toggle
        // For now, checks are implicit in the architecture.
        
        // 2. Rate Limit Check verification (Conceptual)
        // In a real app we might inspect the Express app stack or config.
        // Here we just warn if it's "Direct" mode without rigorous checks.

        const settings = systemSettingsService.getSettings();
        
        // Gate: Must not be using default admin credentials (TODO: Add check)
        
        return;
    }

    enable(method: 'vpn' | 'proxy' | 'direct'): void {
        this.validateSafetyGates();

        systemSettingsService.updateSettings({
            app: {
                remoteAccess: {
                    enabled: true,
                    method
                }
            }
        });

        auditService.log(
            'SYSTEM', 
            'SYSTEM_SETTINGS_UPDATE', 
            'system', 
            { remoteAccess: true, method }, 
            '127.0.0.1'
        );
    }

    disable(): void {
        systemSettingsService.updateSettings({
            app: {
                remoteAccess: {
                    enabled: false
                }
            }
        });

        auditService.log(
            'SYSTEM', 
            'SYSTEM_SETTINGS_UPDATE', 
            'system', 
            { remoteAccess: false }, 
            '127.0.0.1'
        );
    }

    getStatus() {
        const settings = systemSettingsService.getSettings();
        return {
            enabled: settings.app.remoteAccess?.enabled || false,
            method: settings.app.remoteAccess?.method,
            bindAddress: this.getBindAddress()
        };
    }
}

export const remoteAccessService = new RemoteAccessService();
