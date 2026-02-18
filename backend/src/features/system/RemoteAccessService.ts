import { systemSettingsService } from './SystemSettingsService';
import { auditService } from './AuditService';
import { logger } from '../../utils/logger';
import { ConnectivityProvider } from '../networking/ConnectivityProvider';
import { DirectProvider } from '../networking/DirectProvider';
import { UPnPProvider } from '../networking/UPnPProvider';
import {  ConnectionStatus, ConnectivityMethod  } from '@shared/types';

import os from 'os';

export class RemoteAccessService {
    
    private providers: Map<ConnectivityMethod, ConnectivityProvider> = new Map();
    private activeProvider: ConnectivityProvider | null = null;

    constructor() {
        // Register available providers
        this.registerProvider(new DirectProvider());
        this.registerProvider(new UPnPProvider());
        // Future: this.registerProvider(new VpnProvider());
        // Future: this.registerProvider(new CloudflareProvider());
    }

    public async initialize(): Promise<void> {
        const settings = systemSettingsService.getSettings();
        if (settings.app.remoteAccess?.enabled && settings.app.remoteAccess.method) {
            try {
                await this.enable(settings.app.remoteAccess.method);
                logger.success(`[RemoteAccess] Restored connection via ${settings.app.remoteAccess.method}`);
            } catch (e: any) {
                logger.error(`[RemoteAccess] Failed to restore connection: ${e.message}`);
            }
        }
    }

    private registerProvider(provider: ConnectivityProvider) {
        this.providers.set(provider.id, provider);
    }

    /**
     * Returns the safe bind address for the HTTP/Socket server.
     */
    getBindAddress(): string {
        const settings = systemSettingsService.getSettings();
        if (settings.app.remoteAccess?.enabled) {
            return '0.0.0.0';
        }
        return '127.0.0.1';
    }

    /**
     * Gets the primary local IPv4 address of this machine.
     */
    getLocalIP(): string | undefined {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]!) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return '127.0.0.1';
    }

    async validateSafetyGates(): Promise<void> {
        // Placeholder for security checks (e.g. check if default password is changed)
        return;
    }

    async enable(method: ConnectivityMethod): Promise<boolean> {
        await this.validateSafetyGates();

        const provider = this.providers.get(method);
        if (!provider) {
            throw new Error(`Provider for method '${method}' not found.`);
        }

        logger.info(`[RemoteAccess] Enabling remote access via ${method}...`);

        try {
            // Disconnect current if different
            if (this.activeProvider && this.activeProvider.id !== method) {
                await this.activeProvider.disconnect();
            }

            const status = await provider.connect();
            this.activeProvider = provider;

            // Update persistent settings
            systemSettingsService.updateSettings({
                app: {
                    remoteAccess: {
                        enabled: true,
                        method,
                        externalIP: status.externalIP
                    }
                }
            });

            auditService.log('SYSTEM', 'SYSTEM_SETTINGS_UPDATE', 'system', { remoteAccess: true, method }, '127.0.0.1');
            return true;
        } catch (e: any) {
            logger.error(`[RemoteAccess] Failed to enable ${method}: ${e.message}`);
            // Rollback settings if needed?
            throw e;
        }
    }

    async disable(): Promise<void> {
        logger.info('[RemoteAccess] Disabling remote access...');
        
        if (this.activeProvider) {
            await this.activeProvider.disconnect();
            this.activeProvider = null;
        }

        systemSettingsService.updateSettings({
            app: {
                remoteAccess: {
                    enabled: false,
                    externalIP: undefined
                }
            }
        });

        auditService.log('SYSTEM', 'SYSTEM_SETTINGS_UPDATE', 'system', { remoteAccess: false }, '127.0.0.1');
    }

    async getStatus(): Promise<ConnectionStatus> {
        const settings = systemSettingsService.getSettings();
        const enabled = settings.app.remoteAccess?.enabled || false;
        const method = settings.app.remoteAccess?.method;
        const localIP = this.getLocalIP();

        // If we have an active provider, ask it for real-time status
        if (this.activeProvider) {
            const status = await this.activeProvider.getStatus();
            return { ...status, localIP };
        }

        // If enabled but no active provider, we might be in a transitional state or just booted.
        // We'll return the settings state as a fallback.
        return {
            enabled,
            method,
            externalIP: settings.app.remoteAccess?.externalIP,
            localIP,
            bindAddress: this.getBindAddress()
        };
    }
}

export const remoteAccessService = new RemoteAccessService();
