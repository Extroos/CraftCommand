import fs from 'fs-extra';
import path from 'path';
import { ServerTemplate } from '../../../../shared/types';

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
        id: 'forge-1.21.1',
        name: 'Forge',
        type: 'Forge',
        version: '1.21.1',
        description: 'The classic mod loader for heavy modpacks.',
        recommendedRam: 6144, // Increased recommendation for Forge
        javaVersion: 21
    },
    {
        id: 'neoforge-1.21.1',
        name: 'NeoForge',
        type: 'NeoForge',
        version: '1.21.1',
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

    async installTemplate(serverId: string, templateId: string) {
        const { getServer } = await import('./ServerService');
        const { installerService } = await import('./InstallerService');
        
        const server = getServer(serverId);
        if (!server) throw new Error('Server not found');

        const template = this.getTemplate(templateId);
        if (!template) throw new Error('Template not found');

        console.log(`[TemplateService] Installing ${template.name} on ${server.name}...`);

        // Update server metadata (Java version, recommended RAM if needed? No, user set RAM in wizard)
        // We might want to save *which* template was used.
        // For now, just install.

        if (template.downloadUrl) {
            // Assume zip modpack for now
            await installerService.installModpackFromZip(server.workingDirectory, template.downloadUrl);
            return;
        }

        switch (template.type) {
            case 'Paper':
                await installerService.installPaper(server.workingDirectory, template.version, template.build || 'latest');
                break;
            case 'Fabric':
                await installerService.installFabric(server.workingDirectory, template.version);
                break;
            case 'Vanilla':
                await installerService.installVanilla(server.workingDirectory, template.version);
                break;

            case 'Forge':
                await installerService.installForge(server.workingDirectory, template.version);
                break;
            case 'NeoForge':
                await installerService.installNeoForge(server.workingDirectory, template.version);
                break;
            case 'Spigot':
                await installerService.installSpigot(server.workingDirectory, template.version);
                break;
            default:
                throw new Error(`Unsupported template type: ${template.type}`);
        }
    }
}

export const templateService = new TemplateService();
