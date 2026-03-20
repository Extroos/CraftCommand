import fs from 'fs-extra';
import path from 'path';
import {  ServerTemplate  } from '@shared/types';
import { logger } from '../../utils/logger';

const DATA_DIR = path.join(__dirname, '../../data');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');

const DEFAULT_TEMPLATES: ServerTemplate[] = [
    {
        id: 'paper-latest',
        name: 'Paper',
        type: 'Paper',
        version: '1.21.11',
        description: 'High-performance Spigot fork. Recommended for most servers.',
        recommendedRam: 4096,
        javaVersion: 21
    },
    {
        id: 'vanilla-latest',
        name: 'Vanilla',
        type: 'Vanilla',
        version: '1.21.11',
        description: 'Official Minecraft Server software.',
        recommendedRam: 2048,
        javaVersion: 21
    },
    {
        id: 'fabric-latest',
        name: 'Fabric',
        type: 'Fabric',
        version: '1.21.11',
        description: 'Lightweight mod loader.',
        recommendedRam: 4096,
        javaVersion: 21
    },

    {
        id: 'forge-1.21.11',
        name: 'Forge',
        type: 'Forge',
        version: '1.21.11',
        description: 'The classic mod loader for heavy modpacks.',
        recommendedRam: 6144, // Increased recommendation for Forge
        javaVersion: 21
    },
    {
        id: 'neoforge-1.21.11',
        name: 'NeoForge',
        type: 'NeoForge',
        version: '1.21.11',
        description: 'Modern fork of Forge. Better performance & compatibility.',
        recommendedRam: 4096,
        javaVersion: 21
    },
    {
        id: 'modpack-1.20.1',
        name: 'Modpack',
        type: 'Modpack',
        version: '1.20.1',
        description: 'CurseForge & Modrinth modpacks.',
        recommendedRam: 6144,
        javaVersion: 17
    },
    {
        id: 'bedrock-latest',
        name: 'Bedrock',
        type: 'Bedrock',
        version: '1.26.1.1',
        description: 'Official Bedrock Dedicated Server. Cross-play with mobile & console.',
        recommendedRam: 2048,
        javaVersion: 0 // Not Java-based
    },
    {
        id: 'velocity-latest',
        name: 'Velocity Proxy',
        type: 'Velocity',
        version: '3.4.0-SNAPSHOT',
        description: 'High-performance Minecraft proxy. Link multiple servers together.',
        recommendedRam: 1024,
        javaVersion: 21,
        executable: 'velocity.jar'
    }
];

export class TemplateService {
    private templates: ServerTemplate[] = [];

    constructor() {
        this.loadTemplates();
    }

    private loadTemplates() {
        if (fs.existsSync(TEMPLATES_FILE)) {
            try {
                this.templates = fs.readJSONSync(TEMPLATES_FILE);
            } catch (e) {
                console.error('[TemplateService] Failed to load templates, using defaults:', e);
                this.templates = DEFAULT_TEMPLATES;
            }
        } else {
            this.templates = DEFAULT_TEMPLATES;
            // Optionally write defaults to disk so user can edit them?
            // fs.writeJSONSync(TEMPLATES_FILE, DEFAULT_TEMPLATES, { spaces: 2 });
        }
    }

    getTemplates(): ServerTemplate[] {
        return this.templates;
    }

    getTemplate(id: string): ServerTemplate | undefined {
        return this.templates.find(t => t.id === id);
    }

    async installTemplate(serverId: string, templateId: string, options?: { customUrl?: string }) {
        const { getServer } = await import('../servers/ServerService');
        const { installerService } = await import('./InstallerService');
        
        const server = getServer(serverId);
        if (!server) throw new Error('Server not found');

        const template = this.getTemplate(templateId);
        if (!template) throw new Error('Template not found');

        logger.info(`[TemplateService] Installing ${template.name} on ${server.name}...`);

        if (template.downloadUrl) {
            await installerService.installModpackFromZip(serverId, server.workingDirectory, template.downloadUrl, template.version, undefined, template.type);
            return;
        }

        switch (template.type) {
            case 'Paper':
                await installerService.installPaper(serverId, server.workingDirectory, template.version, template.build || 'latest');
                break;
            case 'Fabric':
                await installerService.installFabric(serverId, server.workingDirectory, template.version);
                break;
            case 'Vanilla':
                await installerService.installVanilla(serverId, server.workingDirectory, template.version);
                break;
            case 'Forge':
                await installerService.installForge(serverId, server.workingDirectory, template.version);
                break;
            case 'NeoForge':
                await installerService.installNeoForge(serverId, server.workingDirectory, template.version);
                break;
            case 'Spigot':
                await installerService.installSpigot(serverId, server.workingDirectory, template.version);
                break;
            case 'Bedrock':
                await installerService.installBedrock(serverId, server.workingDirectory, template.version);
                break;
            case 'Velocity':
                await installerService.installVelocity(serverId, server.workingDirectory, { version: template.version, build: template.build });
                break;
            case 'Modpack':
                const modpackUrl = options?.customUrl || template.downloadUrl;
                if (!modpackUrl) throw new Error('Modpack installation requires a custom URL or project ID.');
                await installerService.installModpackFromZip(serverId, server.workingDirectory, modpackUrl, template.version, undefined, template.type);
                break;
            default:
                throw new Error(`Unsupported template type: ${template.type}`);
        }
    }

    /**
     * Create a reusable template from an existing server's configuration.
     * Captures the server's software, version, RAM, Java, and startup flags.
     */
    async createFromServer(serverId: string, templateName: string, description?: string): Promise<ServerTemplate> {
        const { getServer } = await import('../servers/ServerService');
        const server = getServer(serverId);
        if (!server) throw new Error('Server not found');

        const id = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        const template: ServerTemplate = {
            id,
            name: templateName || `${server.name} Template`,
            type: server.software as ServerTemplate['type'],
            version: server.version,
            build: server.loaderBuild,
            description: description || `Custom template based on ${server.name}. ${server.software} ${server.version}.`,
            recommendedRam: server.ram * 1024, // GB → MB
            javaVersion: parseInt(server.javaVersion.replace('Java ', ''), 10) || 21,
            startupFlags: server.advancedFlags?.aikarFlags ? ['aikar'] : undefined,
        };

        this.templates.push(template);
        this.saveTemplates();

        logger.success(`[TemplateService] Created custom template "${template.name}" from server "${server.name}"`);
        return template;
    }

    /**
     * Delete a custom template. Built-in (default) templates cannot be removed.
     */
    deleteTemplate(templateId: string): boolean {
        const isDefault = DEFAULT_TEMPLATES.some(t => t.id === templateId);
        if (isDefault) throw new Error('Cannot delete built-in templates');

        const before = this.templates.length;
        this.templates = this.templates.filter(t => t.id !== templateId);

        if (this.templates.length < before) {
            this.saveTemplates();
            logger.info(`[TemplateService] Deleted custom template: ${templateId}`);
            return true;
        }
        return false;
    }

    /**
     * Persist current templates to disk.
     */
    private saveTemplates(): void {
        try {
            fs.ensureDirSync(DATA_DIR);
            fs.writeJSONSync(TEMPLATES_FILE, this.templates, { spaces: 2 });
        } catch (e: any) {
            logger.error(`[TemplateService] Failed to save templates: ${e.message}`);
        }
    }
}

export const templateService = new TemplateService();
