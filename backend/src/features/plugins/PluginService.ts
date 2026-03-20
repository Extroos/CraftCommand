import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { InstalledPlugin, PluginSource, PluginSearchQuery, PluginSearchResult, PluginUpdateInfo, PluginPlatform, ServerStatus } from '@shared/types';
import { marketplaceRegistry, SOFTWARE_TO_PLATFORMS, getTargetDir, supportsPlugins } from './MarketplaceRegistry';
import { installerService } from '../installer/InstallerService';
import { serverRepository } from '../../storage/ServerRepository';
import { pluginRepository } from '../../storage/PluginRepository';
import { logger } from '../../utils/logger';
import AdmZip from 'adm-zip';

export class PluginService {

    /**
     * Search the marketplace for plugins compatible with a server's software.
     */
    async search(query: PluginSearchQuery, serverId: string): Promise<PluginSearchResult> {
        const server = serverRepository.findById(serverId);
        if (!server) throw new Error('Server not found');
        
        if (!supportsPlugins(server.software)) {
            return { plugins: [], total: 0, page: 1, pages: 0 };
        }

        return marketplaceRegistry.search(query, server.software);
    }

    /**
     * Get all installed plugins for a server.
     */
    getInstalled(serverId: string): InstalledPlugin[] {
        return pluginRepository.findByServer(serverId);
    }

    /**
     * Install a plugin from a marketplace source.
     */
    async install(serverId: string, sourceId: string, source: PluginSource): Promise<InstalledPlugin> {
        const server = serverRepository.findById(serverId);
        if (!server) throw new Error('Server not found');

        if (!supportsPlugins(server.software)) {
            throw new Error(`${server.software} servers do not support plugins.`);
        }

        // Validate working directory
        if (!server.workingDirectory || !(await fs.pathExists(server.workingDirectory))) {
            throw new Error('Server directory does not exist. Please install or configure the server first.');
        }

        // Check if already installed
        const existing = pluginRepository.findBySourceId(sourceId, serverId);
        if (existing) {
            // Hardening: Verify the file actually exists on DISK.
            // If the record exists but the file is missing (Ghost Installation), clear the record and proceed.
            const targetDir = path.join(server.workingDirectory, getTargetDir(server.software));
            const jarPath = path.join(targetDir, existing.fileName);
            
            if (await fs.pathExists(jarPath)) {
                logger.warn(`[PluginService] Plugin already installed: ${existing.name}. Returning existing record.`);
                return existing;
            } else {
                logger.warn(`[PluginService] Ghost record found for ${existing.name} (DB entry exists but file missing). Clearing record and re-installing...`);
                pluginRepository.delete(existing.id);
            }
        }

        // Resolve download URL with clear error handling
        let downloadInfo;
        try {
            const platforms = SOFTWARE_TO_PLATFORMS[server.software] || [];
            downloadInfo = await marketplaceRegistry.getDownloadUrl(sourceId, source, server.version, platforms);
        } catch (err: any) {
            logger.error(`[PluginService] Failed to resolve download URL for ${sourceId} (${source}): ${err.message}`);
            throw new Error(`Could not find a compatible download for this plugin from ${source}. ${err.message}`);
        }

        // Determine target directory
        const targetDir = path.join(server.workingDirectory, getTargetDir(server.software));
        await fs.ensureDir(targetDir);

        const destPath = path.join(targetDir, downloadInfo.fileName);

        // --- Conflict Management (Hardening) ---
        if (await fs.pathExists(destPath)) {
            const existingInDb = pluginRepository.findByFileName(downloadInfo.fileName, serverId);
            if (!existingInDb) {
                const bakPath = `${destPath}.bak_${Date.now()}`;
                logger.warn(`[PluginService] Untracked file conflict at ${destPath}. Moving to ${bakPath}`);
                await fs.move(destPath, bakPath);
            }
        }

        // Download with error recovery — clean up partial file on failure
        logger.info(`[PluginService] Downloading ${downloadInfo.fileName} to ${destPath}...`);
        try {
            await installerService.downloadFile(downloadInfo.url, destPath);
        } catch (err: any) {
            // Clean up partial/corrupted download
            try { await fs.remove(destPath); } catch (_) {}
            logger.error(`[PluginService] Download failed for ${downloadInfo.fileName}: ${err.message}`);
            throw new Error(`Failed to download plugin. The marketplace may be temporarily unavailable. (${err.message})`);
        }

        // Validate downloaded file (integrity check)
        try {
            this.validateJarIntegrity(destPath);
        } catch (err: any) {
            await fs.remove(destPath);
            throw new Error(`Downloaded plugin is corrupted or invalid: ${err.message}`);
        }

        logger.success(`[PluginService] Downloaded ${downloadInfo.fileName}`);

        // Create record in DB
        const plugin = pluginRepository.create({
            id: crypto.randomUUID(),
            serverId,
            sourceId,
            source,
            name: downloadInfo.fileName.replace('.jar', ''),
            fileName: downloadInfo.fileName,
            version: downloadInfo.version,
            installedAt: Date.now(),
            autoUpdate: false,
            enabled: true,
            // Capture rich metadata
            description: (downloadInfo as any).description,
            author: (downloadInfo as any).author,
            iconUrl: (downloadInfo as any).iconUrl,
            category: (downloadInfo as any).category,
            externalUrl: (downloadInfo as any).externalUrl
        });

        // Mark server as needing restart
        serverRepository.update(serverId, { needsRestart: true } as any);
        
        // --- Dependency Resolution ---
        const deps = (downloadInfo as any).dependencies || [];
        if (deps.length > 0) {
            logger.info(`[PluginService] Resolving dependencies for ${plugin.name}...`);
            for (const dep of deps) {
                if (dep.required) {
                    const depExisting = pluginRepository.findBySourceId(dep.id, serverId);
                    if (!depExisting) {
                        logger.info(`[PluginService] Auto-installing required dependency: ${dep.id} from ${source}`);
                        try {
                            // Recursively install the dependency.
                            await this.install(serverId, dep.id, source);
                        } catch (depErr: any) {
                            logger.error(`[PluginService] Failed to auto-install dependency ${dep.id}: ${depErr.message}`);
                        }
                    } else {
                        logger.info(`[PluginService] Dependency ${dep.id} is already installed.`);
                    }
                }
            }
        }

        if (server.status === ServerStatus.ONLINE || server.status === ServerStatus.STARTING) {
            logger.info(`[PluginService] Plugin ${plugin.name} installed while server is ${server.status}. It will load on the next restart.`);
        } else {
            logger.info(`[PluginService] Plugin ${plugin.name} installed for server ${serverId}. Restart required.`);
        }
        
        return plugin;
    }

    /**
     * Uninstall a plugin from a server.
     */
    async uninstall(serverId: string, pluginId: string): Promise<void> {
        const server = serverRepository.findById(serverId);
        if (!server) throw new Error('Server not found');

        const plugin = pluginRepository.findById(pluginId);
        if (!plugin || plugin.serverId !== serverId) {
            throw new Error('Plugin not found on this server');
        }

        // Delete the JAR file
        const targetDir = path.join(server.workingDirectory, getTargetDir(server.software));
        const jarPath = path.join(targetDir, plugin.fileName);
        const disabledPath = path.join(targetDir, `${plugin.fileName}.disabled`);

        if (await fs.pathExists(jarPath)) {
            await fs.remove(jarPath);
        } else if (await fs.pathExists(disabledPath)) {
            await fs.remove(disabledPath);
        }

        // Remove DB record
        pluginRepository.delete(pluginId);
        
        // Mark server as needing restart
        serverRepository.update(serverId, { needsRestart: true } as any);
        
        logger.info(`[PluginService] Uninstalled ${plugin.name} from server ${serverId}. Restart required.`);
    }

    /**
     * Toggle a plugin (enable/disable by renaming .jar <-> .jar.disabled).
     */
    async toggle(serverId: string, pluginId: string): Promise<InstalledPlugin> {
        const server = serverRepository.findById(serverId);
        if (!server) throw new Error('Server not found');

        const plugin = pluginRepository.findById(pluginId);
        if (!plugin || plugin.serverId !== serverId) {
            throw new Error('Plugin not found on this server');
        }

        const targetDir = path.join(server.workingDirectory, getTargetDir(server.software));
        const jarPath = path.join(targetDir, plugin.fileName);
        const disabledName = `${plugin.fileName}.disabled`;
        const disabledPath = path.join(targetDir, disabledName);

        if (plugin.enabled) {
            // Disable: rename .jar -> .jar.disabled
            if (await fs.pathExists(jarPath)) {
                await fs.rename(jarPath, disabledPath);
            }
            pluginRepository.update(pluginId, { enabled: false, fileName: disabledName });
            logger.info(`[PluginService] Disabled ${plugin.name} on server ${serverId}`);
        } else {
            // Enable: rename .jar.disabled -> .jar
            const enabledName = plugin.fileName.replace(/\.disabled$/, '');
            const enabledPath = path.join(targetDir, enabledName);
            if (await fs.pathExists(disabledPath)) {
                await fs.rename(disabledPath, enabledPath);
            }
            pluginRepository.update(pluginId, { enabled: true, fileName: enabledName });
            logger.info(`[PluginService] Enabled ${plugin.name} on server ${serverId}`);
        }

        // Mark server as needing restart
        serverRepository.update(serverId, { needsRestart: true } as any);

        return pluginRepository.findById(pluginId)!;
    }

    /**
     * Check for available updates across all installed plugins.
     */
    async checkUpdates(serverId: string): Promise<PluginUpdateInfo[]> {
        const installed = pluginRepository.findByServer(serverId);
        const updates: PluginUpdateInfo[] = [];

        const toCheck = installed.filter(p => p.sourceId && p.source !== 'manual');
        const limit = 5; // Concurrency limit
        
        for (let i = 0; i < toCheck.length; i += limit) {
            const batch = toCheck.slice(i, i + limit);
            await Promise.all(batch.map(async (plugin) => {
                try {
                    const downloadInfo = await marketplaceRegistry.getDownloadUrl(plugin.sourceId!, plugin.source);
                    
                    if (downloadInfo.version !== plugin.version) {
                        updates.push({
                            pluginId: plugin.id,
                            name: plugin.name,
                            currentVersion: plugin.version,
                            latestVersion: downloadInfo.version,
                            source: plugin.source,
                            sourceId: plugin.sourceId,
                        });
                    }
                } catch (err: any) {
                    logger.warn(`[PluginService] Update check failed for ${plugin.name}: ${err.message}`);
                }
            }));
        }

        return updates;
    }

    /**
     * Update a plugin to the latest version.
     */
    async update(serverId: string, pluginId: string): Promise<InstalledPlugin> {
        const server = serverRepository.findById(serverId);
        if (!server) throw new Error('Server not found');

        const plugin = pluginRepository.findById(pluginId);
        if (!plugin || plugin.serverId !== serverId) {
            throw new Error('Plugin not found on this server');
        }

        if (!plugin.sourceId || plugin.source === 'manual') {
            throw new Error('Cannot update manually installed plugins');
        }

        // Resolve new download
        const downloadInfo = await marketplaceRegistry.getDownloadUrl(plugin.sourceId, plugin.source, server.version);

        const targetDir = path.join(server.workingDirectory, getTargetDir(server.software));
        
        // Remove old JAR
        const oldPath = path.join(targetDir, plugin.fileName);
        const oldDisabledPath = path.join(targetDir, `${plugin.fileName}.disabled`);
        if (await fs.pathExists(oldPath)) await fs.remove(oldPath);
        if (await fs.pathExists(oldDisabledPath)) await fs.remove(oldDisabledPath);

        // Download new version
        const destPath = path.join(targetDir, downloadInfo.fileName);
        await installerService.downloadFile(downloadInfo.url, destPath);

        // Validate integrity
        try {
            this.validateJarIntegrity(destPath);
        } catch (err: any) {
            await fs.remove(destPath);
            throw new Error(`Update download is corrupted: ${err.message}`);
        }

        // Update record
        const newFileName = plugin.enabled ? downloadInfo.fileName : `${downloadInfo.fileName}.disabled`;
        
        // Rename if disabled
        if (!plugin.enabled) {
            await fs.rename(destPath, path.join(targetDir, newFileName));
        }

        pluginRepository.update(pluginId, {
            fileName: newFileName,
            version: downloadInfo.version,
            updatedAt: Date.now(),
            // Refresh metadata
            description: (downloadInfo as any).description,
            author: (downloadInfo as any).author,
            iconUrl: (downloadInfo as any).iconUrl,
            category: (downloadInfo as any).category,
            externalUrl: (downloadInfo as any).externalUrl
        });

        // Mark server as needing restart
        serverRepository.update(serverId, { needsRestart: true } as any);

        logger.success(`[PluginService] Updated ${plugin.name} from ${plugin.version} to ${downloadInfo.version}. Restart required.`);
        return pluginRepository.findById(pluginId)!;
    }

    /**
     * Bulk update multiple plugins for a server.
     */
    async bulkUpdate(serverId: string, pluginIds: string[]): Promise<Array<{ pluginId: string; success: boolean; error?: string }>> {
        const results: Array<{ pluginId: string; success: boolean; error?: string }> = [];
        const limit = 3; // Max 3 concurrent downloads to avoid overwhelming network/APIs
        
        for (let i = 0; i < pluginIds.length; i += limit) {
            const batch = pluginIds.slice(i, i + limit);
            await Promise.all(batch.map(async (pluginId) => {
                try {
                    await this.update(serverId, pluginId);
                    results.push({ pluginId, success: true });
                } catch (e: any) {
                    logger.error(`[PluginService] Bulk update failed for plugin ${pluginId}: ${e.message}`);
                    results.push({ pluginId, success: false, error: e.message });
                }
            }));
        }

        return results;
    }

    /**
     * Scan the plugins/mods directory and reconcile with DB records.
     * Discovers manually installed plugins.
     */
    async scanInstalled(serverId: string): Promise<InstalledPlugin[]> {
        const server = serverRepository.findById(serverId);
        if (!server) throw new Error('Server not found');

        if (!supportsPlugins(server.software)) return [];

        const targetDir = path.join(server.workingDirectory, getTargetDir(server.software));
        if (!(await fs.pathExists(targetDir))) return [];

        const files = await fs.readdir(targetDir);
        const jarFiles = files.filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled'));

        const discovered: InstalledPlugin[] = [];

        for (const file of jarFiles) {
            const existing = pluginRepository.findByFileName(file, serverId);
            if (existing) continue; // Already tracked

            // Try to extract metadata from JAR
            const jarPath = path.join(targetDir, file);
            const metadata = await this.extractMetadataFromJar(jarPath);

            // Discover this as a manual plugin
            const isDisabled = file.endsWith('.disabled');
            const cleanName = metadata.name || file
                .replace(/\.jar(\.disabled)?$/, '')
                .replace(/[-_]\d+.*$/, '')
                .replace(/[._-]/g, ' ')
                .trim();

            const plugin: InstalledPlugin = {
                id: crypto.randomUUID(),
                serverId,
                source: 'manual',
                name: cleanName || file,
                fileName: file,
                version: metadata.version || 'Unknown',
                description: metadata.description,
                author: metadata.author,
                dependencies: metadata.dependencies,
                installedAt: Date.now(),
                autoUpdate: false,
                enabled: !isDisabled,
            };

            pluginRepository.create(plugin);
            discovered.push(plugin);
        }

        // Also remove records where the JAR no longer exists
        const existing = pluginRepository.findByServer(serverId);
        for (const plugin of existing) {
            const jarPath = path.join(targetDir, plugin.fileName);
            const altPath = plugin.enabled 
                ? path.join(targetDir, `${plugin.fileName}.disabled`)
                : path.join(targetDir, plugin.fileName.replace(/\.disabled$/, ''));
            
            if (!(await fs.pathExists(jarPath)) && !(await fs.pathExists(altPath))) {
                pluginRepository.delete(plugin.id);
            }
        }

        return pluginRepository.findByServer(serverId);
    }

    async extractMetadataFromJar(jarPath: string): Promise<{ 
        name?: string, 
        version?: string, 
        description?: string, 
        author?: string,
        dependencies?: string[]
    }> {
        try {
            const zip = new AdmZip(jarPath);
            
            // 1. Check for Bukkit/Spigot (plugin.yml)
            const pluginYml = zip.getEntry('plugin.yml');
            if (pluginYml) {
                const content = pluginYml.getData().toString('utf8').replace(/^\uFEFF/, ''); // Remove BOM
                const nameMatch = content.match(/^name:\s*(['"]?)(.*?)\1\s*$/m);
                const versionMatch = content.match(/^version:\s*(['"]?)(.*?)\1\s*$/m);
                const descMatch = content.match(/^description:\s*(['"]?)(.*?)\1\s*$/m);
                const authorMatch = content.match(/^author:\s*(['"]?)(.*?)\1\s*$/m);
                const dependMatch = content.match(/^depend:\s*\[?(.*?)\]?\s*$/m);
                const softDependMatch = content.match(/^softdepend:\s*\[?(.*?)\]?\s*$/m);
                
                const deps: string[] = [];
                if (dependMatch) deps.push(...dependMatch[1].split(',').map((s: string) => s.trim()).filter(Boolean));
                if (softDependMatch) deps.push(...softDependMatch[1].split(',').map((s: string) => s.trim()).filter(Boolean));

                return {
                    name: nameMatch ? nameMatch[2].trim() : undefined,
                    version: versionMatch ? versionMatch[2].trim() : undefined,
                    description: descMatch ? descMatch[2].trim() : undefined,
                    author: authorMatch ? authorMatch[2].trim() : undefined,
                    dependencies: deps.length > 0 ? deps : undefined
                };
            }

            // 2. Check for Fabric (fabric.mod.json)
            const fabricJson = zip.getEntry('fabric.mod.json');
            if (fabricJson) {
                const content = JSON.parse(fabricJson.getData().toString('utf8').replace(/^\uFEFF/, ''));
                return {
                    name: content.name || content.id,
                    version: content.version,
                    description: content.description,
                    author: Array.isArray(content.authors) ? content.authors[0] : (content.authors || content.contact?.sources)
                };
            }

            // 3. Check for Forge (mods.toml)
            const modsToml = zip.getEntry('META-INF/mods.toml');
            if (modsToml) {
                const content = modsToml.getData().toString('utf8').replace(/^\uFEFF/, '');
                const nameMatch = content.match(/displayName\s*=\s*(['"])(.*?)\1/);
                const versionMatch = content.match(/version\s*=\s*(['"])(.*?)\1/);
                // Better Forge description regex (handles multi-line triple-quotes)
                const descMatch = content.match(/description\s*=\s*'''([\s\S]*?)'''/) || content.match(/description\s*=\s*"""([\s\S]*?)"""/) || content.match(/description\s*=\s*(['"])(.*?)\1/);
                
                return {
                    name: nameMatch ? nameMatch[2].trim() : undefined,
                    version: versionMatch ? versionMatch[2].trim() : undefined,
                    description: descMatch ? descMatch[1].trim() : undefined
                };
            }
        } catch (err: any) {
            logger.warn(`[PluginService] Failed to extract metadata from ${path.basename(jarPath)}: ${err.message}`);
        }
        return {};
    }

    validateJarIntegrity(jarPath: string): void {
        try {
            const zip = new AdmZip(jarPath);
            // Basic check: must have entries
            if (zip.getEntries().length === 0) throw new Error('JAR is empty');
        } catch (err: any) {
            throw new Error(`ZIP error: ${err.message}`);
        }
    }
}

export const pluginService = new PluginService();
