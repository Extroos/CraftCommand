
import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';
import { NetworkConfig } from '@shared/types/network';
import axios from 'axios';

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
        autoHealing?: boolean;
        autoHealingV3?: {
            driftDetectionEnabled: boolean;
            ioThrottlingThreshold: number; // 0-100 percentage
            healthSnapshotInterval: number; // minutes
        };
        security?: {
            forceAdmin2FA: boolean;
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
            console.error('[SystemSettingsService] Initial clock sync failed:', err.message);
        });
    }

    private watchSettings() {
        try {
            fs.watch(SETTINGS_FILE, (eventType) => {
                if (eventType === 'change') {
                    console.log('[SystemSettingsService] Settings file changed, reloading...');
                    try {
                        const newSettings = fs.readJSONSync(SETTINGS_FILE);
                        this.settings = { ...this.settings, ...newSettings };
                        this.emit('updated', this.settings);
                    } catch (e) {
                         console.error('[SystemSettingsService] Failed to reload settings:', e);
                    }
                }
            });
        } catch (e) {
            console.error('[SystemSettingsService] Failed to watch settings file:', e);
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
                        autoHealing: true,
                        autoHealingV3: {
                            driftDetectionEnabled: true,
                            ioThrottlingThreshold: 80,
                            healthSnapshotInterval: 5
                        },
                        security: {
                            forceAdmin2FA: false
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
                if (loaded.app.autoHealing === undefined) {
                    loaded.app.autoHealing = true;
                }
                if (loaded.app.autoHealingV3 === undefined) {
                    loaded.app.autoHealingV3 = {
                        driftDetectionEnabled: true,
                        ioThrottlingThreshold: 80,
                        healthSnapshotInterval: 5
                    };
                }
                if (loaded.app.security === undefined) {
                    loaded.app.security = {
                        forceAdmin2FA: false
                    };
                }
            }
            return loaded;
        } catch (e) {
            console.error('Failed to load settings.json, using defaults', e);
            return {
                discordBot: { enabled: false, token: '', clientId: '', guildId: '', commandRoles: [], notificationChannel: '', chatChannel: '' },
                app: { theme: 'dark', autoUpdate: false, hostMode: true }
            } as any;
        }
    }

    getSettings(): any {
        let version = '0.0.0';
        try {
            const versionFile = path.join(process.cwd(), '../version.json');
            if (fs.existsSync(versionFile)) {
                version = fs.readJSONSync(versionFile).version;
            }
        } catch (e) {
            console.error('[SystemSettingsService] Failed to read version.json:', e);
        }

        return {
            ...this.settings,
            version
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
                    console.log(`[SystemSettingsService] System clock drift detected: ${Math.round(this.clockOffset / 1000)}s offset applied.`);
                }
            }
        } catch (e: any) {
            console.warn('[SystemSettingsService] Failed to sync clock offset:', e.message);
        }
    }

    updateSettings(updates: any): SystemSettings {
        console.log('[SystemSettingsService] Updating settings with:', JSON.stringify(updates, null, 2));
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
        
        console.log('[SystemSettingsService] New settings state:', JSON.stringify(this.settings, null, 2));

        try {
            const tempPath = `${SETTINGS_FILE}.tmp`;
            fs.writeJSONSync(tempPath, this.settings, { spaces: 4 });
            fs.moveSync(tempPath, SETTINGS_FILE, { overwrite: true });
            this.emit('updated', this.settings);
        } catch (e) {
            console.error('Failed to save settings.json', e);
            try { if (fs.existsSync(`${SETTINGS_FILE}.tmp`)) fs.unlinkSync(`${SETTINGS_FILE}.tmp`); } catch (err) {}
        }
        return this.settings;
    }

    updateDiscordConfig(config: Partial<SystemSettings['discordBot']>): SystemSettings {
        this.settings.discordBot = { ...this.settings.discordBot, ...config };
        return this.updateSettings({ discordBot: this.settings.discordBot });
    }
}

export const systemSettingsService = new SystemSettingsService();
