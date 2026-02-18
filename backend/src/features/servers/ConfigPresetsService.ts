
import path from 'path';
import fs from 'fs-extra';
import { ServerConfig } from '@shared/types';
import { logger } from '../../utils/logger';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║         CONFIG PRESETS SERVICE                      ║
 * ║  Optimized server.properties / paper configs        ║
 * ║  Pre-tuned per player count tier                    ║
 * ╚══════════════════════════════════════════════════════╝
 */

export type PlayerTier = 'small' | 'medium' | 'large' | 'mega';

export interface ConfigPreset {
    id: string;
    name: string;
    tier: PlayerTier;
    playerRange: string;          // "1-5", "6-25", etc.
    description: string;
    properties: Record<string, string | number | boolean>;  // server.properties overrides
    paperConfig?: Record<string, any>;  // paper-global.yml snippets
    recommendedRamGB: number;
}

const PRESETS: ConfigPreset[] = [
    {
        id: 'small',
        name: 'Small Server',
        tier: 'small',
        playerRange: '1–5 players',
        description: 'Optimized for personal/friend group servers. Maximum quality, low resource usage.',
        recommendedRamGB: 2,
        properties: {
            'max-players': 10,
            'view-distance': 14,
            'simulation-distance': 10,
            'network-compression-threshold': 512,
            'max-tick-time': 60000,
            'spawn-protection': 0,
            'entity-broadcast-range-percentage': 100,
        },
        paperConfig: {
            'chunk-loading.min-load-radius': 3,
            'chunk-loading.max-concurrent-sends': 4,
            'spawn-limits.monsters': 50,
            'spawn-limits.animals': 10,
            'spawn-limits.water-animals': 5,
            'spawn-limits.ambient': 5,
            'despawn-ranges.monster.soft': 28,
            'despawn-ranges.monster.hard': 96,
        }
    },
    {
        id: 'medium',
        name: 'Medium Server',
        tier: 'medium',
        playerRange: '6–25 players',
        description: 'Balanced settings for small communities. Good quality with reasonable performance.',
        recommendedRamGB: 4,
        properties: {
            'max-players': 30,
            'view-distance': 10,
            'simulation-distance': 8,
            'network-compression-threshold': 256,
            'max-tick-time': 60000,
            'spawn-protection': 16,
            'entity-broadcast-range-percentage': 75,
        },
        paperConfig: {
            'chunk-loading.min-load-radius': 2,
            'chunk-loading.max-concurrent-sends': 6,
            'spawn-limits.monsters': 40,
            'spawn-limits.animals': 8,
            'spawn-limits.water-animals': 3,
            'spawn-limits.ambient': 3,
            'despawn-ranges.monster.soft': 24,
            'despawn-ranges.monster.hard': 80,
        }
    },
    {
        id: 'large',
        name: 'Large Server',
        tier: 'large',
        playerRange: '26–50 players',
        description: 'Performance-focused for active communities. Reduced render distances to maintain TPS.',
        recommendedRamGB: 6,
        properties: {
            'max-players': 60,
            'view-distance': 8,
            'simulation-distance': 6,
            'network-compression-threshold': 128,
            'max-tick-time': 45000,
            'spawn-protection': 16,
            'entity-broadcast-range-percentage': 50,
        },
        paperConfig: {
            'chunk-loading.min-load-radius': 2,
            'chunk-loading.max-concurrent-sends': 8,
            'spawn-limits.monsters': 30,
            'spawn-limits.animals': 6,
            'spawn-limits.water-animals': 2,
            'spawn-limits.ambient': 1,
            'despawn-ranges.monster.soft': 20,
            'despawn-ranges.monster.hard': 64,
        }
    },
    {
        id: 'mega',
        name: 'Mega Server',
        tier: 'mega',
        playerRange: '50+ players',
        description: 'Maximum performance for large networks. Aggressive optimizations to maintain 20 TPS.',
        recommendedRamGB: 10,
        properties: {
            'max-players': 100,
            'view-distance': 6,
            'simulation-distance': 4,
            'network-compression-threshold': 64,
            'max-tick-time': 30000,
            'spawn-protection': 16,
            'entity-broadcast-range-percentage': 35,
        },
        paperConfig: {
            'chunk-loading.min-load-radius': 1,
            'chunk-loading.max-concurrent-sends': 10,
            'spawn-limits.monsters': 20,
            'spawn-limits.animals': 4,
            'spawn-limits.water-animals': 1,
            'spawn-limits.ambient': 0,
            'despawn-ranges.monster.soft': 16,
            'despawn-ranges.monster.hard': 48,
        }
    }
];

class ConfigPresetsService {

    /**
     * Get all available presets.
     */
    getPresets(): ConfigPreset[] {
        return PRESETS;
    }

    /**
     * Get a specific preset by tier.
     */
    getPreset(tier: PlayerTier): ConfigPreset | undefined {
        return PRESETS.find(p => p.tier === tier);
    }

    /**
     * Recommend a preset tier based on current player count.
     */
    recommendTier(currentPlayers: number): PlayerTier {
        if (currentPlayers <= 5) return 'small';
        if (currentPlayers <= 25) return 'medium';
        if (currentPlayers <= 50) return 'large';
        return 'mega';
    }

    /**
     * Apply a preset to a server's server.properties file.
     * Merges preset values with existing config (preset overrides conflicts).
     */
    async applyPreset(server: ServerConfig, tier: PlayerTier): Promise<{ applied: string[]; skipped: string[] }> {
        const preset = this.getPreset(tier);
        if (!preset) throw new Error(`Unknown preset tier: ${tier}`);

        const propsPath = path.join(server.workingDirectory, 'server.properties');
        const applied: string[] = [];
        const skipped: string[] = [];

        try {
            // Read existing properties
            let content = '';
            if (await fs.pathExists(propsPath)) {
                content = await fs.readFile(propsPath, 'utf-8');
            }

            // Parse into key-value map
            const props = new Map<string, string>();
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
                const [key, ...valueParts] = trimmed.split('=');
                props.set(key.trim(), valueParts.join('=').trim());
            }

            // Apply preset properties
            for (const [key, value] of Object.entries(preset.properties)) {
                const strValue = String(value);
                props.set(key, strValue);
                applied.push(`${key}=${strValue}`);
            }

            // Rebuild file content (preserve comments)
            const outputLines: string[] = [];
            const appliedKeys = new Set<string>();

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('#') || !trimmed.includes('=')) {
                    outputLines.push(line);
                    continue;
                }
                const [key] = trimmed.split('=');
                const k = key.trim();
                if (props.has(k)) {
                    outputLines.push(`${k}=${props.get(k)}`);
                    appliedKeys.add(k);
                } else {
                    outputLines.push(line);
                }
            }

            // Add any new keys that weren't in the original file
            for (const [key, value] of props) {
                if (!appliedKeys.has(key)) {
                    outputLines.push(`${key}=${value}`);
                }
            }

            await fs.writeFile(propsPath, outputLines.join('\n'), 'utf-8');
            logger.info(`[ConfigPresets] Applied "${preset.name}" to "${server.name}" — ${applied.length} properties set`);

        } catch (e: any) {
            logger.error(`[ConfigPresets] Failed to apply preset: ${e.message}`);
            throw e;
        }

        return { applied, skipped };
    }

    /**
     * Preview what a preset would change (diff against current config).
     */
    async previewPreset(server: ServerConfig, tier: PlayerTier): Promise<{ key: string; current: string; preset: string; changed: boolean }[]> {
        const preset = this.getPreset(tier);
        if (!preset) return [];

        const propsPath = path.join(server.workingDirectory, 'server.properties');
        const diff: { key: string; current: string; preset: string; changed: boolean }[] = [];

        try {
            let content = '';
            if (await fs.pathExists(propsPath)) {
                content = await fs.readFile(propsPath, 'utf-8');
            }

            const currentProps = new Map<string, string>();
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
                const [key, ...valueParts] = trimmed.split('=');
                currentProps.set(key.trim(), valueParts.join('=').trim());
            }

            for (const [key, value] of Object.entries(preset.properties)) {
                const presetValue = String(value);
                const currentValue = currentProps.get(key) || '(not set)';
                diff.push({
                    key,
                    current: currentValue,
                    preset: presetValue,
                    changed: currentValue !== presetValue
                });
            }
        } catch {
            // If we can't read the file, just show preset values
            for (const [key, value] of Object.entries(preset.properties)) {
                diff.push({ key, current: '(unknown)', preset: String(value), changed: true });
            }
        }

        return diff;
    }
}

export const configPresetsService = new ConfigPresetsService();
