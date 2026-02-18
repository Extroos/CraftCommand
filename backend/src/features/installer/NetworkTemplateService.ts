
import { logger } from '../../utils/logger';

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║         NETWORK TEMPLATE SERVICE                    ║
 * ║  Pre-built multi-server network configurations      ║
 * ║  One-click deploy entire network topologies         ║
 * ╚══════════════════════════════════════════════════════╝
 */

export interface NetworkServerDef {
    role: 'proxy' | 'backend';
    software: 'Paper' | 'Velocity' | 'Bedrock' | 'Fabric' | 'Forge' | 'Vanilla';
    name: string;
    version: string;
    ram: number;         // GB
    maxPlayers: number;
    proxyAlias?: string; // Alias used in Velocity config
}

export interface NetworkTemplate {
    id: string;
    name: string;
    description: string;
    icon: string;
    servers: NetworkServerDef[];
    defaultGamemode?: string;
}

const NETWORK_TEMPLATES: NetworkTemplate[] = [
    {
        id: 'skyblock-network',
        name: 'SkyBlock Network',
        description: 'Classic SkyBlock setup: Velocity proxy + Hub + SkyBlock gamemode server.',
        icon: '🏝️',
        servers: [
            { role: 'proxy', software: 'Velocity', name: 'Proxy', version: '3.4.0', ram: 1, maxPlayers: 100 },
            { role: 'backend', software: 'Paper', name: 'Hub', version: '1.21.11', ram: 2, maxPlayers: 100, proxyAlias: 'hub' },
            { role: 'backend', software: 'Paper', name: 'SkyBlock', version: '1.21.11', ram: 4, maxPlayers: 50, proxyAlias: 'skyblock' },
        ],
        defaultGamemode: 'survival'
    },
    {
        id: 'survival-hub',
        name: 'Survival + Hub',
        description: 'Small network: Velocity proxy with a hub lobby and survival world.',
        icon: '⚔️',
        servers: [
            { role: 'proxy', software: 'Velocity', name: 'Proxy', version: '3.4.0', ram: 1, maxPlayers: 60 },
            { role: 'backend', software: 'Paper', name: 'Lobby', version: '1.21.11', ram: 2, maxPlayers: 60, proxyAlias: 'lobby' },
            { role: 'backend', software: 'Paper', name: 'Survival', version: '1.21.11', ram: 4, maxPlayers: 30, proxyAlias: 'survival' },
        ],
        defaultGamemode: 'survival'
    },
    {
        id: 'practice-network',
        name: 'PvP Practice Network',
        description: 'Competitive PvP: proxy + lobby + duels + FFA arenas.',
        icon: '🗡️',
        servers: [
            { role: 'proxy', software: 'Velocity', name: 'Proxy', version: '3.4.0', ram: 1, maxPlayers: 200 },
            { role: 'backend', software: 'Paper', name: 'Lobby', version: '1.21.11', ram: 2, maxPlayers: 200, proxyAlias: 'lobby' },
            { role: 'backend', software: 'Paper', name: 'Duels', version: '1.21.11', ram: 3, maxPlayers: 100, proxyAlias: 'duels' },
            { role: 'backend', software: 'Paper', name: 'FFA', version: '1.21.11', ram: 3, maxPlayers: 100, proxyAlias: 'ffa' },
        ],
        defaultGamemode: 'adventure'
    },
    {
        id: 'modded-friends',
        name: 'Modded Friends Server',
        description: 'Simple modded setup: single Fabric or Forge server behind Velocity for future expansion.',
        icon: '🔧',
        servers: [
            { role: 'proxy', software: 'Velocity', name: 'Proxy', version: '3.4.0', ram: 1, maxPlayers: 20 },
            { role: 'backend', software: 'Fabric', name: 'Modded', version: '1.21.11', ram: 6, maxPlayers: 10, proxyAlias: 'modded' },
        ],
        defaultGamemode: 'survival'
    },
    {
        id: 'bungeecord-classic',
        name: 'BungeeCord Classic',
        description: 'Traditional multi-server layout: Velocity + Lobby + multiple game servers.',
        icon: '🌐',
        servers: [
            { role: 'proxy', software: 'Velocity', name: 'BungeeCord', version: '3.4.0', ram: 1, maxPlayers: 500 },
            { role: 'backend', software: 'Paper', name: 'Hub', version: '1.21.11', ram: 2, maxPlayers: 500, proxyAlias: 'hub' },
            { role: 'backend', software: 'Paper', name: 'Creative', version: '1.21.11', ram: 3, maxPlayers: 50, proxyAlias: 'creative' },
            { role: 'backend', software: 'Paper', name: 'Survival', version: '1.21.11', ram: 4, maxPlayers: 100, proxyAlias: 'survival' },
            { role: 'backend', software: 'Paper', name: 'MiniGames', version: '1.21.11', ram: 3, maxPlayers: 50, proxyAlias: 'minigames' },
        ],
        defaultGamemode: 'adventure'
    }
];

class NetworkTemplateService {
    /**
     * Get all available network templates.
     */
    getTemplates(): NetworkTemplate[] {
        return NETWORK_TEMPLATES;
    }

    /**
     * Get a specific network template.
     */
    getTemplate(id: string): NetworkTemplate | undefined {
        return NETWORK_TEMPLATES.find(t => t.id === id);
    }

    /**
     * Calculate total resource requirements for a template.
     */
    getResourceRequirements(templateId: string): { totalRamGB: number; serverCount: number; requiresProxy: boolean } | null {
        const template = this.getTemplate(templateId);
        if (!template) return null;

        return {
            totalRamGB: template.servers.reduce((sum, s) => sum + s.ram, 0),
            serverCount: template.servers.length,
            requiresProxy: template.servers.some(s => s.role === 'proxy')
        };
    }

    /**
     * Generate server creation payloads from a network template.
     * Returns ordered creation instructions — proxy first, then backends.
     */
    generateCreatePayloads(templateId: string): NetworkServerDef[] | null {
        const template = this.getTemplate(templateId);
        if (!template) return null;

        // Order: proxy → backends (proxy must exist first for linking)
        return [
            ...template.servers.filter(s => s.role === 'proxy'),
            ...template.servers.filter(s => s.role === 'backend'),
        ];
    }
}

export const networkTemplateService = new NetworkTemplateService();
