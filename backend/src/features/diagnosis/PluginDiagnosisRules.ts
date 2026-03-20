import { DiagnosisRule, DiagnosisResult, ServerConfig } from './types';
import { ServerStatus } from '@shared/types';
import fs from 'fs-extra';
import path from 'path';

/**
 * Rule for detecting missing plugin directory on servers that support them.
 */
export const PluginFolderMissingRule: DiagnosisRule = {
    id: 'plugin_folder_missing',
    name: 'Missing Plugins Directory',
    description: 'Server software supports plugins but the plugins folder is missing.',
    tier: 2,
    defaultConfidence: 100,
    triggers: [], 
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        const supports = ['Paper', 'Spigot', 'Purpur', 'BungeeCord', 'Velocity'].includes(server.software);
        if (!supports || !server.workingDirectory) return null;

        // Guard: Skip if the server hasn't been initialized yet (executable missing)
        const execFile = server.executable || (server.software === 'Bedrock' ? 'bedrock_server.exe' : 'server.jar');
        const jarPath = path.isAbsolute(execFile) ? execFile : path.join(server.workingDirectory, execFile);
        if (!(await fs.pathExists(jarPath))) return null;

        const pluginsDir = path.join(server.workingDirectory, 'plugins');
        if (!(await fs.pathExists(pluginsDir))) {
            return {
                id: `plugin-folder-${server.id}-${Date.now()}`,
                ruleId: 'plugin_folder_missing',
                severity: 'INFO',
                title: 'Plugins Directory Missing',
                explanation: 'The server software supports plugins but the "plugins" directory does not exist.',
                recommendation: 'Create the plugins directory to enable plugin support.',
                action: {
                    type: 'CREATE_PLUGIN_FOLDER',
                    payload: { path: pluginsDir },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Rule for detecting duplicate JAR files for the same plugin.
 */
export const DuplicatePluginJarRule: DiagnosisRule = {
    id: 'plugin_duplicate_jar',
    name: 'Duplicate Plugin JARs',
    description: 'Multiple JAR files found for the same plugin, which can cause load conflicts.',
    triggers: [/Ambiguous plugin name/i, /Duplicate plugin/i],
    tier: 2,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        if (!server.workingDirectory) return null;
        const pluginsDir = path.join(server.workingDirectory, 'plugins');
        if (!(await fs.pathExists(pluginsDir))) return null;

        const files = await fs.readdir(pluginsDir);
        const jars = files.filter(f => f.endsWith('.jar'));
        
        const groups: Record<string, string[]> = {};
        jars.forEach(file => {
            const baseName = file.split(/[-_\d]/)[0].toLowerCase();
            if (baseName.length > 3) {
                if (!groups[baseName]) groups[baseName] = [];
                groups[baseName].push(file);
            }
        });

        const duplicates = Object.values(groups).find(group => group.length > 1);
        if (duplicates) {
            return {
                id: `plugin-dup-${server.id}-${Date.now()}`,
                ruleId: 'plugin_duplicate_jar',
                severity: 'WARNING',
                title: 'Duplicate Plugin Jars Detected',
                explanation: `Multiple versions of the same plugin were found: ${duplicates.join(', ')}. This often prevents plugins from loading.`,
                recommendation: 'Remove the older versions of the plugin JAR files.',
                action: {
                    type: 'REMOVE_DUPLICATE_PLUGIN',
                    payload: { dir: pluginsDir, files: duplicates },
                    autoHeal: false // Manual confirmation safer for deletions
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Rule for detecting incompatible plugin versions.
 */
export const PluginIncompatibleRule: DiagnosisRule = {
    id: 'plugin_incompatible',
    name: 'Incompatible Plugin',
    description: 'A plugin is incompatible with the current server version or Java version.',
    triggers: [/UnsupportedClassVersionError/i, /Incompatible server version/i, /Could not load.*plugin.yml/i],
    tier: 3,
    defaultConfidence: 90,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const errorLine = logs.find(l => l.includes('UnsupportedClassVersionError') || l.includes('Incompatible server version'));
        if (errorLine) {
            return {
                id: `plugin-compat-${server.id}-${Date.now()}`,
                ruleId: 'plugin_incompatible',
                severity: 'CRITICAL',
                title: 'Plugin Incompatibility',
                explanation: 'A plugin cannot be loaded because it requires a newer Java version or is incompatible with this Minecraft version.',
                recommendation: 'Check the logs to find the specific plugin, then update it or switch to a compatible Java version.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Rule for detecting plugin-related permission issues.
 */
export const PluginAccessRule: DiagnosisRule = {
    id: 'plugin_access_denied',
    name: 'Plugin Access Denied',
    description: 'The server cannot access or read its plugins due to permission issues.',
    triggers: [/Permission denied.*plugins/i, /java.nio.file.AccessDeniedException.*plugins/i],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        if (!server.workingDirectory) return null;
        const pluginsDir = path.join(server.workingDirectory, 'plugins');

        // Check logs first (Reactive)
        const hasLogMatch = logs.some(l => /Permission denied.*plugins/i.test(l) || /java.nio.file.AccessDeniedException.*plugins/i.test(l));
        
        // If no log match, perform real validation (Proactive)
        if (!hasLogMatch) {
            if (!(await fs.pathExists(pluginsDir))) return null; // Handled by PluginFolderMissingRule
            
            try {
                // Try to list the directory to confirm access
                await fs.readdir(pluginsDir);
                return null; // Access is OK
            } catch (e: any) {
                // Only report if it's a permission error
                if (e.code !== 'EACCES' && e.code !== 'EPERM') return null;
            }
        }

        return {
            id: `plugin-perm-${server.id}-${Date.now()}`,
            ruleId: 'plugin_access_denied',
            severity: 'WARNING',
            title: 'Plugins Access Denied',
            explanation: 'The server process does not have sufficient permissions to read or write to the "plugins" directory.',
            recommendation: 'Repair the folder permissions to ensure the server can load plugins.',
            action: {
                type: 'UPDATE_CONFIG',
                payload: { repairPermissions: true },
                autoHeal: true
            },
            confidence: hasLogMatch ? 100 : 90,
            timestamp: Date.now()
        };
    }
};

/**
 * Rule for detecting when a restart is required to apply plugin changes.
 */
export const PluginPendingRestartRule: DiagnosisRule = {
    id: 'plugin_pending_restart',
    name: 'Plugin Changes Pending Restart',
    description: 'A restart is required to apply recent plugin installations or changes.',
    tier: 3,
    defaultConfidence: 100,
    triggers: [], 
    analyze: async (server: ServerConfig): Promise<DiagnosisResult | null> => {
        if (server.needsRestart && (server.status === ServerStatus.ONLINE || server.status === ServerStatus.STARTING)) {
            return {
                id: `plugin-restart-${server.id}-${Date.now()}`,
                ruleId: 'plugin_pending_restart',
                severity: 'INFO',
                title: 'Plugin Changes Pending',
                explanation: 'A plugin was recently installed, removed, or updated while the server was online. These changes will not take effect until the next restart.',
                recommendation: 'Restart the server to apply the pending plugin changes.',
                timestamp: Date.now()
            };
        }
        return null;
    }
};

/**
 * Rule for detecting GeyserMC port conflicts (UDP 19132 default)
 */
export const GeyserPortConflictRule: DiagnosisRule = {
    id: 'geyser_port_conflict',
    name: 'Geyser Port Conflict',
    description: 'Detects when Geyser fails to bind to its UDP port (typically 19132) because another server or instance is using it.',
    triggers: [
        /Geyser failed to start: Address already in use: bind/i,
        /Address already in use: bind.*19132/i,
        /Address already in use.*Geyser/i
    ],
    tier: 1,
    defaultConfidence: 100,
    analyze: async (server: ServerConfig, logs: string[]): Promise<DiagnosisResult | null> => {
        const fullLog = logs.join('\n');
        
        if (/Geyser failed to start: Address already in use: bind/i.test(fullLog) || (/Address already in use: bind/i.test(fullLog) && /19132/i.test(fullLog)) || (/Address already in use/i.test(fullLog) && /Geyser/i.test(fullLog))) {
            
            return {
                id: `geyser-port-${server.id}-${Date.now()}`,
                ruleId: 'geyser_port_conflict',
                severity: 'CRITICAL',
                title: 'Geyser Port Conflict Detected',
                explanation: 'GeyserMC tried to start but its Bedrock port (usually 19132) is already being used by another Minecraft Bedrock edition server or another Geyser instance on this machine.',
                recommendation: 'Change the Geyser Bedrock port in your cross-play settings to an available port, or use the "Fix Now" button to have it randomly assigned and synced.',
                action: {
                    type: 'REASSIGN_BEDROCK_PORT',
                    payload: { serverId: server.id },
                    autoHeal: true
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
};

export const PluginRules = [
    PluginFolderMissingRule,
    DuplicatePluginJarRule,
    PluginIncompatibleRule,
    PluginAccessRule,
    PluginPendingRestartRule,
    GeyserPortConflictRule
];
