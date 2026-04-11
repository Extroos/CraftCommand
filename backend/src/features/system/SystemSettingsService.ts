
import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';
import { NetworkConfig } from '@shared/types/network';
import axios from 'axios';
import { networkConfigGenerator } from '../network/NetworkConfigGenerator';

const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export interface SystemSettings {
    discordBot: {
        enabled: boolean;
        token: string;
        clientId: string;
        guildId: string;
        commandRoles: string[]; // Role IDs allowed to use commands
        notificationChannel: string; // Channel ID for server events
        chatChannel: string; // Channel ID for chat bridge
    };
    app: {
        theme: 'dark' | 'light' | 'system';
        autoUpdate: boolean;
        hostMode: boolean; // New Flag
        storageProvider?: 'json' | 'sqlite';
        remoteAccess?: {
            enabled: boolean;
            method?: 'vpn' | 'proxy' | 'direct' | 'cloudflare';
            externalIP?: string;
        };
        https?: {
            enabled: boolean;
            mode?: 'native' | 'bridge'; // native = backend handles SSL, bridge = external proxy (Caddy) handles it
            domain?: string;
            keyPath: string;
            certPath: string;
            passphrase?: string;
        };
        dockerEnabled?: boolean;
        distributedNodes?: {
            enabled: boolean;
            nodeHeartbeatThresholdMs?: number; // threshold in ms
            mirrorRemoteBackups?: boolean; // toggle for backup mirroring
        };
        automaticRepair?: boolean;
        automaticRepairV3?: {
            driftDetectionEnabled: boolean;
            ioThrottlingThreshold: number; // 0-100 percentage
            healthSnapshotInterval: number; // minutes
        };
        security?: {
            forceAdmin2FA: boolean;
        };
        advancedNetworking?: {
            edgeCaching: {
                enabled: boolean;
                cacheSizeMB: number;
            };
            trafficCompression: {
                enabled: boolean;
                level: number;
            };
            ddosShield: {
                enabled: boolean;
                burstThreshold: number; // requests per second
            };
        };
    };
}

class SystemSettingsService extends EventEmitter {
    private settings: SystemSettings;
    private clockOffset: number = 0;

    constructor() {
        super();
        this.settings = this.loadSettings();
        this.watchSettings();
        this.syncClockOffset().catch(err => {
            const { logger } = require('../../utils/logger');
            logger.error(`[SystemSettingsService] Initial clock sync failed: ${err.message}`);
        });
    }

    private watchSettings() {
        try {
            // Watch settings.json
            fs.watch(SETTINGS_FILE, (eventType) => {
                if (eventType === 'change') {
                    const { logger } = require('../../utils/logger');
                    logger.info('[SystemSettingsService] Settings file changed, reloading...');
                    try {
                        const newSettings = fs.readJSONSync(SETTINGS_FILE);
                        this.settings = { ...this.settings, ...newSettings };
                        this.emit('updated', this.getSettings());
                    } catch (e) {
                         const { logger } = require('../../utils/logger');
                         logger.error(`[SystemSettingsService] Failed to reload settings: ${e}`);
                    }
                }
            });

            // Watch version.json
            const versionFile = path.join(process.cwd(), '../version.json');
            if (fs.existsSync(versionFile)) {
                fs.watch(versionFile, (eventType) => {
                    if (eventType === 'change') {
                        const { logger } = require('../../utils/logger');
                        logger.info('[SystemSettingsService] Version file changed, notifying clients...');
                        this.emit('updated', this.getSettings());
                    }
                });
            }
        } catch (e) {
            const { logger } = require('../../utils/logger');
            logger.error(`[SystemSettingsService] Failed to watch system files: ${e}`);
        }
    }

    private loadSettings(): SystemSettings {
        try {
            fs.ensureDirSync(DATA_DIR);
            if (!fs.existsSync(SETTINGS_FILE)) {
                const defaultSettings: SystemSettings = {
                    discordBot: {
                        enabled: false,
                        token: '',
                        clientId: '',
                        guildId: '',
                        commandRoles: [],
                        notificationChannel: '',
                        chatChannel: ''
                    },
                    app: {
                        theme: 'dark',
                        autoUpdate: false,
                        hostMode: true, // Default to Host Mode for now
                        remoteAccess: { enabled: false },
                        https: { enabled: false, keyPath: '', certPath: '' },
                        dockerEnabled: false,
                        storageProvider: 'json',
                        distributedNodes: { 
                            enabled: false,
                            nodeHeartbeatThresholdMs: 60000, 
                            mirrorRemoteBackups: false 
                        },
                        automaticRepair: true,
                        automaticRepairV3: {
                            driftDetectionEnabled: true,
                            ioThrottlingThreshold: 80,
                            healthSnapshotInterval: 5
                        },
                        security: {
                            forceAdmin2FA: false
                        },
                        advancedNetworking: {
                            edgeCaching: { enabled: false, cacheSizeMB: 512 },
                            trafficCompression: { enabled: true, level: 6 },
                            ddosShield: { enabled: true, burstThreshold: 50 }
                        }
                    }
                };
                const tempPath = `${SETTINGS_FILE}.tmp`;
                fs.writeJSONSync(tempPath, defaultSettings, { spaces: 4 });
                fs.moveSync(tempPath, SETTINGS_FILE, { overwrite: true });
                return defaultSettings;
            }
            const loaded = fs.readJSONSync(SETTINGS_FILE);
            // Ensure hostMode exists if migrating
            if (loaded.app) {
                if (loaded.app.hostMode === undefined) loaded.app.hostMode = true;
                if (loaded.app.dockerEnabled === undefined) loaded.app.dockerEnabled = false;
                if (loaded.app.storageProvider === undefined) loaded.app.storageProvider = 'json';
                if (loaded.app.https && loaded.app.https.enabled && !loaded.app.https.mode) {
                    loaded.app.https.mode = 'native';
                }
                if (loaded.app.distributedNodes === undefined) {
                    loaded.app.distributedNodes = { 
                        enabled: false, 
                        nodeHeartbeatThresholdMs: 60000,
                        mirrorRemoteBackups: false
                    };
                } else {
                    if (loaded.app.distributedNodes.nodeHeartbeatThresholdMs === undefined) {
                        loaded.app.distributedNodes.nodeHeartbeatThresholdMs = 60000;
                    }
                    if (loaded.app.distributedNodes.mirrorRemoteBackups === undefined) {
                        loaded.app.distributedNodes.mirrorRemoteBackups = false;
                    }
                }
                if (loaded.app.automaticRepair === undefined) {
                    loaded.app.automaticRepair = loaded.app.autoHealing ?? true;
                    delete loaded.app.autoHealing;
                }
                if (loaded.app.automaticRepairV3 === undefined) {
                    loaded.app.automaticRepairV3 = loaded.app.autoHealingV3 ?? {
                        driftDetectionEnabled: true,
                        ioThrottlingThreshold: 80,
                        healthSnapshotInterval: 5
                    };
                    delete loaded.app.autoHealingV3;
                }
                if (loaded.app.security === undefined) {
                    loaded.app.security = {
                        forceAdmin2FA: false
                    };
                }
                if (loaded.app.advancedNetworking === undefined) {
                    loaded.app.advancedNetworking = {
                        edgeCaching: { enabled: false, cacheSizeMB: 512 },
                        trafficCompression: { enabled: true, level: 6 },
                        ddosShield: { enabled: true, burstThreshold: 50 }
                    };
                }
            }
            return loaded;
        } catch (e) {
            const { logger } = require('../../utils/logger');
            logger.error(`Failed to load settings.json, using defaults: ${e}`);
            return {
                discordBot: { enabled: false, token: '', clientId: '', guildId: '', commandRoles: [], notificationChannel: '', chatChannel: '' },
                app: { theme: 'dark', autoUpdate: false, hostMode: true }
            } as any;
        }
    }

    getSettings(): any {
        let versionData = { version: '0.0.0', title: 'Unknown', codename: 'Unknown', notes: [] };
        try {
            const versionFile = path.join(process.cwd(), '../version.json');
            if (fs.existsSync(versionFile)) {
                versionData = { ...versionData, ...fs.readJSONSync(versionFile) };
            }
        } catch (e) {
            const { logger } = require('../../utils/logger');
            logger.error(`[SystemSettingsService] Failed to read version.json: ${e}`);
        }

        return {
            ...this.settings,
            metadata: versionData,
            version: versionData.version
        };
    }

    isHostMode(): boolean {
        return this.settings?.app?.hostMode !== false;
    }

    getClockOffset(): number {
        return this.clockOffset;
    }

    async syncClockOffset(): Promise<void> {
        try {
            // Check time against a reliable external source (Google's HTTP Date header)
            const startTime = Date.now();
            const response = await axios.head('https://www.google.com', { timeout: 5000 });
            const serverDateStr = response.headers['date'];
            
            if (serverDateStr) {
                const serverTime = new Date(serverDateStr).getTime();
                const localTime = Date.now();
                // Add half of the round-trip time to be more precise
                const rtt = localTime - startTime;
                const adjustedServerTime = serverTime + (rtt / 2);
                
                this.clockOffset = adjustedServerTime - localTime;
                
                if (Math.abs(this.clockOffset) > 5000) {
                    const { logger } = require('../../utils/logger');
                    logger.info(`[SystemSettingsService] System clock drift detected: ${Math.round(this.clockOffset / 1000)}s offset applied.`);
                }
            }
        } catch (e: any) {
            const { logger } = require('../../utils/logger');
            logger.warn(`[SystemSettingsService] Failed to sync clock offset: ${e.message}`);
        }
    }

    updateSettings(updates: any): SystemSettings {
        const { logger } = require('../../utils/logger');
        logger.info(`[SystemSettingsService] Updating settings with: ${JSON.stringify(updates, null, 2)}`);
        if (updates.discordBot) {
            this.settings.discordBot = { ...this.settings.discordBot, ...updates.discordBot };
        }
        if (updates.app) {
            this.settings.app = { ...this.settings.app, ...updates.app };
        }
        
        // Handle top-level keys if any
        Object.keys(updates).forEach(key => {
            if (key !== 'discordBot' && key !== 'app') {
                (this.settings as any)[key] = updates[key];
            }
        });
        
        logger.debug(`[SystemSettingsService] New settings state saved.`);

        try {
            const tempPath = `${SETTINGS_FILE}.tmp`;
            fs.writeJSONSync(tempPath, this.settings, { spaces: 4 });
            fs.moveSync(tempPath, SETTINGS_FILE, { overwrite: true });
            
            // Trigger Network Config Regeneration if relevant settings changed
            if (updates.app?.advancedNetworking || updates.app?.https) {
                this.regenerateNetworkConfigs();
            }

            this.emit('updated', this.getSettings());
        } catch (e) {
            logger.error(`Failed to save settings.json: ${e}`);
            try { if (fs.existsSync(`${SETTINGS_FILE}.tmp`)) fs.unlinkSync(`${SETTINGS_FILE}.tmp`); } catch (err) { logger.debug(`[SystemSettingsService] Final cleanup failed: ${err}`); }
        }
        return this.settings;
    }

    private async regenerateNetworkConfigs() {
        const { logger } = require('../../utils/logger');
        const net = this.settings.app.advancedNetworking;
        const https = this.settings.app.https;

        if (net?.edgeCaching?.enabled || (https?.enabled && https?.mode === 'bridge')) {
            logger.info('[SystemSettingsService] Regenerating NGINX Edge configs...');
            await networkConfigGenerator.generateNginxConfig({
                domain: https?.domain || 'localhost',
                backendPort: 3000, // Backend API port
                enableCache: net?.edgeCaching?.enabled || false,
                cacheSizeMB: net?.edgeCaching?.cacheSizeMB || 512,
                enableSSL: https?.enabled || false,
                certPath: https?.certPath,
                keyPath: https?.keyPath
            });
        }
    }

    updateDiscordConfig(config: Partial<SystemSettings['discordBot']>): SystemSettings {
        this.settings.discordBot = { ...this.settings.discordBot, ...config };
        return this.updateSettings({ discordBot: this.settings.discordBot });
    }
}

export const systemSettingsService = new SystemSettingsService();
