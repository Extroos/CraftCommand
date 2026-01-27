
import fs from 'fs-extra';
import path from 'path';

const DATA_DIR = path.join(__dirname, '../../data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export interface SystemSettings {
    discordBot: {
        enabled: boolean;
        token: string;
        clientId: string;
        guildId: string;
        commandRoles: string[]; // Role IDs allowed to use commands
        notificationChannel: string; // Channel ID for server events
    };
    app: {
        theme: 'dark' | 'light' | 'system';
        autoUpdate: boolean;
    };
}

class SystemSettingsService {
    private settings: SystemSettings;

    constructor() {
        this.settings = this.loadSettings();
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
                        notificationChannel: ''
                    },
                    app: {
                        theme: 'dark',
                        autoUpdate: true
                    }
                };
                fs.writeJSONSync(SETTINGS_FILE, defaultSettings, { spaces: 4 });
                return defaultSettings;
            }
            return fs.readJSONSync(SETTINGS_FILE);
        } catch (e) {
            console.error('Failed to load settings.json, using defaults', e);
            return {
                discordBot: { enabled: false, token: '', clientId: '', guildId: '', commandRoles: [], notificationChannel: '' },
                app: { theme: 'dark', autoUpdate: true }
            } as any;
        }
    }

    getSettings(): SystemSettings {
        return this.settings;
    }

    updateSettings(updates: any): SystemSettings {
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

        try {
            fs.writeJSONSync(SETTINGS_FILE, this.settings, { spaces: 4 });
        } catch (e) {
            console.error('Failed to save settings.json', e);
        }
        return this.settings;
    }

    updateDiscordConfig(config: Partial<SystemSettings['discordBot']>): SystemSettings {
        this.settings.discordBot = { ...this.settings.discordBot, ...config };
        return this.updateSettings({ discordBot: this.settings.discordBot });
    }
}

export const systemSettingsService = new SystemSettingsService();
