
import path from 'path';
import fs from 'fs-extra';
import {  ServerConfig, ImportAnalysis, ServerStatus  } from '@shared/types';
import { SERVERS_ROOT } from '../../constants';
import { saveServer, getServers } from '../servers/ServerService';
import { javaManager } from '../processes/JavaManager';
import { logger } from '../../utils/logger';
import AdmZip from 'adm-zip';

class ImportService {

    /**
     * Import a server from an existing local folder.
     */
    async importLocal(name: string, absolutePath: string, configOverrides: Partial<ServerConfig> = {}): Promise<ServerConfig> {
        // 1. Validate Path
        const normalizedPath = path.resolve(absolutePath);
        if (!await fs.pathExists(normalizedPath)) {
            throw new Error(`Path does not exist: ${normalizedPath}`);
        }
        
        const stats = await fs.stat(normalizedPath);
        if (!stats.isDirectory()) {
            throw new Error(`Path is not a directory: ${normalizedPath}`);
        }

        // 1.1 Path Safety: Prevent importing system directories
        const restricted = [
            process.cwd(),
            path.join(process.cwd(), 'backend'),
            path.join(process.cwd(), 'frontend'),
            path.join(process.cwd(), 'data'),
            path.join(process.cwd(), 'node_modules')
        ];
        if (restricted.some(r => normalizedPath === r || normalizedPath.startsWith(path.join(r, path.sep)))) {
             throw new Error('Safety Protection: You cannot import a panel system directory as a server instance.');
        }

        // 2. Prevent Overlap: Check if any existing server uses this path
        const existing = getServers();
        const conflict = existing.find(s => path.resolve(s.workingDirectory) === normalizedPath);
        if (conflict) {
            throw new Error(`A server ("${conflict.name}") is already configured to use this folder.`);
        }

        // 3. Analyze for defaults if not provided in overrides
        const analysis = await this.analyzeFolder(normalizedPath);

        // 4. Create Config
        const id = `imported-local-${Date.now()}`;
        const newServer: ServerConfig = {
            id,
            name: name || `Imported Server`,
            software: (configOverrides.software as any) || analysis.software,
            version: configOverrides.version || analysis.version,
            status: ServerStatus.OFFLINE,
            port: configOverrides.port || analysis.port,
            workingDirectory: normalizedPath,
            executable: configOverrides.executable || analysis.executable,
            ram: configOverrides.ram || analysis.ram,
            autoStart: false,
            javaVersion: (configOverrides.javaVersion as any) || analysis.javaVersion
        };

        // 5. Save
        saveServer(newServer);
        
        logger.info(`[ImportService] Successfully imported local server "${name}" at ${normalizedPath}`);
        return newServer;
    }

    /**
     * Import a server from an uploaded ZIP archive.
     */
    async importArchive(name: string, zipPath: string, configOverrides: Partial<ServerConfig> = {}): Promise<ServerConfig> {
        const id = `imported-zip-${Date.now()}`;
        const installDir = path.join(SERVERS_ROOT, id);

        try {
            // 1. Create Directory
            await fs.ensureDir(installDir);

            // 2. Extract
            logger.info(`[ImportService] Extracting ${zipPath} to ${installDir}`);
            try {
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(installDir, true);
            } catch (e: any) {
                await fs.remove(installDir).catch(() => {});
                throw new Error(`Failed to extract archive: ${e.message}`);
            }

            // 3. Smart Flatten
            const files = await fs.readdir(installDir);
            if (files.length === 1) {
                const subPath = path.join(installDir, files[0]);
                if ((await fs.stat(subPath)).isDirectory()) {
                    logger.info(`[ImportService] Detected nested folder ${files[0]}, flattening...`);
                    const tempDir = path.join(path.dirname(SERVERS_ROOT), 'temp_uploads', `${id}-temp`);
                    await fs.move(subPath, tempDir);
                    await fs.emptyDir(installDir);
                    await fs.copy(tempDir, installDir);
                    await fs.remove(tempDir);
                }
            }

            // 4. Analyze after flattening
            const analysis = await this.analyzeFolder(installDir);

            // 5. Create Config
            const newServer: ServerConfig = {
                id,
                name: name || `Imported Server`,
                software: (configOverrides.software as any) || analysis.software,
                version: configOverrides.version || analysis.version,
                status: ServerStatus.OFFLINE,
                port: configOverrides.port || analysis.port,
                workingDirectory: installDir,
                executable: configOverrides.executable || analysis.executable,
                ram: configOverrides.ram || analysis.ram,
                autoStart: false,
                javaVersion: (configOverrides.javaVersion as any) || analysis.javaVersion
            };

            saveServer(newServer);
            logger.info(`[ImportService] Successfully imported archive server "${name}"`);
            return newServer;

        } finally {
            await fs.remove(zipPath).catch((err) => {
                logger.error(`[ImportService] Failed to cleanup ZIP at ${zipPath}: ${err.message}`);
            });
        }
    }

    /**
     * ephemeral analysis of a ZIP archive.
     */
    async analyzeArchive(zipPath: string): Promise<ImportAnalysis> {
        try {
            if (!await fs.pathExists(zipPath)) {
                throw new Error(`Archive file not found: ${zipPath}`);
            }

            const zip = new AdmZip(zipPath);
            let entries;
            try {
                entries = zip.getEntries();
            } catch (e: any) {
                throw new Error(`Corrupt or invalid ZIP archive: ${e.message}`);
            }

            if (entries.length === 0) {
                throw new Error('Archive is empty');
            }

            const filenames = entries.map(e => e.entryName);
            
            // Refined nesting detection: find common directory prefix
            let prefix = '';
            const topLevelEntries = entries.filter(e => {
                const parts = e.entryName.split('/').filter(p => p.length > 0);
                return parts.length === 1;
            });

            if (topLevelEntries.length === 1 && topLevelEntries[0].isDirectory) {
                prefix = topLevelEntries[0].entryName;
                if (!prefix.endsWith('/')) prefix += '/';
            }

            const relativeFilenames = filenames
                .filter(f => f.startsWith(prefix))
                .map(f => f.substring(prefix.length));

            // Logic to read server.properties from ZIP if it exists
            let serverProperties = '';
            const propsEntry = entries.find(e => e.entryName.toLowerCase() === `${prefix}server.properties`.toLowerCase());
            if (propsEntry) {
                serverProperties = propsEntry.getData().toString('utf8');
            }

            return this.analyzeFiles(relativeFilenames, serverProperties);
        } catch (e: any) {
            logger.error(`[ImportService] Fast ZIP Analysis failed: ${e.message}`);
            throw new Error(`Failed to analyze archive: ${e.message}`);
        }
    }

    /**
     * Analyze a folder to detect server software, version, and config.
     */
    async analyzeFolder(absolutePath: string): Promise<ImportAnalysis> {
        const normalizedPath = path.resolve(absolutePath);
        if (!await fs.pathExists(normalizedPath)) {
            throw new Error(`Path does not exist: ${normalizedPath}`);
        }

        const files = await fs.readdir(normalizedPath);
        
        // Try parsing server.properties for port
        let serverProperties = '';
        const propsPath = path.join(normalizedPath, 'server.properties');
        if (await fs.pathExists(propsPath)) {
            serverProperties = await fs.readFile(propsPath, 'utf-8');
        }

        return this.analyzeFiles(files, serverProperties);
    }

    /**
     * Core Analysis Logic (Shared between Local & Archive)
     */
    private analyzeFiles(files: string[], serverProperties: string): ImportAnalysis {
        const lowerFiles = files.map(f => f.toLowerCase());

        let software: any = 'Vanilla';
        let version = 'Unknown';
        let executable = 'server.jar';
        let port = 25565;
        let isModded = false;
        let pterodactylDetected = lowerFiles.includes('egg-server.json') || lowerFiles.includes('.pterodactyl');

        // 1. Detect Software & Executable (Specific Forks First)
        if (lowerFiles.includes('bedrock_server.exe') || lowerFiles.includes('bedrock_server')) {
            software = 'Bedrock';
            executable = files.find(f => f.toLowerCase() === 'bedrock_server.exe' || f.toLowerCase() === 'bedrock_server') || 'bedrock_server';
            port = 19132;
        } else if (lowerFiles.includes('velocity.jar') || lowerFiles.some(f => f.includes('velocity-'))) {
            software = 'Velocity';
            executable = files.find(f => f.toLowerCase().includes('velocity') && f.endsWith('.jar')) || 'velocity.jar';
            port = 25577;
        } else if (lowerFiles.includes('purpur.jar') || lowerFiles.some(f => f.includes('purpur-')) || lowerFiles.includes('purpur.yml') || lowerFiles.includes('config/purpur-global.yml')) {
            software = 'Purpur';
            executable = files.find(f => f.toLowerCase().includes('purpur') && f.endsWith('.jar')) || 'server.jar';
        } else if (lowerFiles.includes('paper.jar') || lowerFiles.some(f => f.includes('paper-')) || lowerFiles.includes('paper.yml') || lowerFiles.includes('config/paper-global.yml')) {
            software = 'Paper';
            executable = files.find(f => f.toLowerCase().includes('paper') && f.endsWith('.jar')) || 'paper.jar';
        } else if (lowerFiles.includes('spigot.jar') || lowerFiles.some(f => f.includes('spigot-'))) {
            software = 'Spigot';
            executable = files.find(f => f.toLowerCase().includes('spigot') && f.endsWith('.jar')) || 'spigot.jar';
        } else if (lowerFiles.some(f => f.includes('forge-')) || lowerFiles.includes('mods')) {
            software = 'Forge';
            isModded = true;
            executable = files.find(f => f.toLowerCase().includes('forge') && f.endsWith('.jar')) || 'forge.jar';
        } else if (lowerFiles.some(f => f.includes('fabric-server')) || lowerFiles.includes('fabric-server-launch.jar')) {
            software = 'Fabric';
            isModded = true;
            executable = files.find(f => f.toLowerCase().includes('fabric-server') && f.endsWith('.jar')) || 'fabric-server-launch.jar';
        }

        // 2. Detect Version from filename or manifest
        const versionMatch = executable.match(/(\d+\.\d+(\.\d+)?)/);
        if (versionMatch) {
            version = versionMatch[1];
        }

        // 3. Detailed Property Extraction
        let motd = 'A Minecraft Server';
        if (serverProperties) {
            const portMatch = serverProperties.match(/^server-port\s*=\s*(\d+)/m);
            if (portMatch) port = parseInt(portMatch[1]);

            const motdMatch = serverProperties.match(/^motd\s*=\s*(.*)/m);
            if (motdMatch) {
                // Quick unescape for analysis (v1.12.0)
                motd = motdMatch[1].trim().replace(/\\([!:=#\\])/g, '$1');
            }

            // Track if online-mode is disabled (useful for migration warnings)
            const onlineMatch = serverProperties.match(/^online-mode\s*=\s*(\w+)/m);
            if (onlineMatch && onlineMatch[1] === 'false') {
                // Potential cracked or proxy-backend server
            }
        }

        // 4. Heuristic for RAM & Java Version
        let ram = 2; 
        let javaVersion: any = 'Java 17';

        if (isModded) ram = 4;
        if (software === 'Velocity' || software === 'Bedrock') ram = 1;

        if (software !== 'Bedrock' && version !== 'Unknown') {
            javaVersion = javaManager.getRecommendedJavaVersion(version);
        } else if (software === 'Bedrock') {
            javaVersion = 'Java 17'; // Placeholder for type safety, runner will skip
        }

        return {
            software,
            version,
            executable,
            port,
            motd,
            ram,
            javaVersion,
            isModded,
            suggestions: pterodactylDetected ? ['Pterodactyl migration markers detected. Files will be managed locally.'] : [],
            pterodactylDetected
        };
    }
    /**
     * Rollback a recent import (Deletes the working directory and DB entry).
     */
    async rollbackImport(serverId: string): Promise<void> {
        const server = getServers().find(s => s.id === serverId);
        if (!server) throw new Error('Server not found to rollback');

        logger.info(`[ImportService] Rolling back import for server ${serverId}...`);
        
        // 1. Remove files
        if (server.workingDirectory && await fs.pathExists(server.workingDirectory)) {
            await fs.remove(server.workingDirectory);
        }

        // 2. Remove DB entry
        const { removeServer } = await import('../servers/ServerService');
        removeServer(serverId);
    }
}

export const importService = new ImportService();
