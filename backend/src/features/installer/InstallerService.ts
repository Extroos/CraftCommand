import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import AdmZip from 'adm-zip';
import extract from 'extract-zip';
import { EventEmitter } from 'events';
import { SafeFileOperation } from '../../utils/fs';
import { logger } from '../../utils/logger';
import { bedrockVersionService } from '../system/BedrockVersionService';
import { auditService } from '../system/AuditService';
import { userRepository } from '../../storage/UserRepository';

const CACHE_DIR = path.join(process.cwd(), 'cache');
const BEDROCK_CACHE_DIR = path.join(CACHE_DIR, 'bedrock');

export class InstallerService extends EventEmitter {
    
    // Track active progress for session recovery
    private activeProgress: Map<string, { percent: number, message: string, phase: string }> = new Map();

    public getActiveProgress() {
        return Object.fromEntries(this.activeProgress);
    }

    private updateProgress(serverId: string, message: string, percent?: number) {
        if (!serverId) return;
        const current = this.activeProgress.get(serverId) || { percent: 0, message: '', phase: 'installing' };
        const newPercent = percent !== undefined ? percent : current.percent;
        const phase = newPercent >= 100 ? 'complete' : 'installing';
        
        this.activeProgress.set(serverId, { percent: newPercent, message, phase });
        this.emit('status', { serverId, message, percent: newPercent, phase });
    }

    private clearProgress(serverId: string) {
        if (!serverId) return;
        this.activeProgress.delete(serverId);
        this.emit('complete', { serverId });
    }

    /**
     * Purges all volatile and temporary installation state for a server.
     * Prevents storage leaks if a server is deleted during an active install.
     */
    public async purgeTempState(serverId: string, serverDir: string) {
        logger.info(`[Installer] Purging installation state for ${serverId}`);
        
        // 1. Clear progress Map
        this.activeProgress.delete(serverId);

        // 2. Clean temporary files in server directory
        const tempPaths = [
            path.join(serverDir, 'temp_extract'),
            path.join(serverDir, 'modpack.zip'),
            path.join(serverDir, 'modpack.mrpack'),
            path.join(serverDir, 'server.jar.tmp')
        ];

        for (const p of tempPaths) {
            try {
                if (await fs.pathExists(p)) {
                    await fs.remove(p);
                    logger.debug(`[Installer] Cleaned temp artifact: ${p}`);
                }
            } catch (e) {
                logger.warn(`[Installer] Failed to cleanup temp path ${p}: ${e}`);
            }
        }
    }

    // Download a file with progress events
    async downloadFile(url: string, destPath: string, onProgress?: (msg: string, percent?: number) => void, serverId?: string) {
        // v1.13.2 Security Validation
        SafeFileOperation.validatePath(destPath);
        
        logger.info(`[Installer] Downloading ${url} to ${destPath}`);
        const writer = fs.createWriteStream(destPath);
        
        try {
            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.minecraft.net/en-us/download/server/bedrock'
                },
                timeout: 30000 // 30s timeout
            });

            const totalLength = parseInt(String(response.headers['content-length'] || '0'), 10);
            
            this.emit('progress', {
                serverId,
                total: totalLength,
                current: 0,
                percent: 0,
                phase: 'downloading'
            });

            let current = 0;
            const dataStream = response.data as any;
            dataStream.on('data', (chunk: any) => {
                current += chunk.length;
                const percent = totalLength > 0 ? Math.round((current / totalLength) * 100) : 0;
                
                this.emit('progress', {
                    serverId,
                    total: totalLength,
                    current: current,
                    percent: percent,
                    phase: 'downloading'
                });

                // Periodic progress message updates
                if (totalLength > 0) {
                    if (current === chunk.length || percent % 10 === 0 || percent === 100) {
                         const msg = `Downloading... ${percent}%`;
                         onProgress?.(msg, percent);
                         if (serverId) this.updateProgress(serverId, msg, percent);
                    }
                }
            });

            dataStream.pipe(writer);

            return new Promise<void>((resolve, reject) => {
                writer.on('finish', () => resolve());
                writer.on('error', reject);
            });
        } catch (err: any) {
            // Enhanced DNS error reporting
            if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
                const domain = new URL(url).hostname;
                throw new Error(`DNS Resolution failed for ${domain}. Your network might be blocking Minecraft downloads, or your DNS provider is currently issues. Please check your internet connection.`);
            }
            throw err;
        }
    }

    // Install PaperMC
    async installPaper(serverId: string, serverDir: string, version: string, build: string = 'latest', onProgress?: (msg: string, percent?: number) => void) {
        try {
            await SafeFileOperation.checkDiskSpace(serverDir);
            const msg = 'Fetching PaperMC builds...';
            this.updateProgress(serverId, msg, 0);
            onProgress?.(msg);
            if (build === 'latest') {
                const buildsUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds`;
                try {
                    const buildsRes = await axios.get(buildsUrl);
                    const builds = (buildsRes.data as any).builds;
                    if (!builds || builds.length === 0) throw new Error('NO_BUILDS');
                    build = builds[builds.length - 1].build;
                } catch (err: any) {
                    if (err.response?.status === 404 || err.message === 'NO_BUILDS') {
                        throw new Error(`PaperMC has not released builds for version ${version} yet. This is common for very new Minecraft releases (like ${version}). Please try Vanilla if you need it immediately.`);
                    }
                    throw err;
                }
            }

            const jarName = `paper-${version}-${build}.jar`;
            const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${build}/downloads/${jarName}`;
            const dest = path.join(serverDir, 'server.jar');

            await fs.ensureDir(serverDir);
            const dMsg = `Downloading Paper ${version}...`;
            this.updateProgress(serverId, dMsg, 0);
            onProgress?.(dMsg, 0);
            await this.downloadFile(downloadUrl, dest, onProgress, serverId);
            
            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
            
            const cMsg = 'Installation Complete';
            this.updateProgress(serverId, cMsg, 100);
            onProgress?.(cMsg);
            
            // Wait a sec before clearing so UI shows it's done
            setTimeout(() => this.clearProgress(serverId), 2000);
            return true;

        } catch (e) {
            logger.error(`Paper install failed: ${e}`);
            this.clearProgress(serverId);
            throw e;
        }
    }

    // Install Purpur
    async installPurpur(serverId: string, serverDir: string, version: string, build: string = 'latest', onProgress?: (msg: string, percent?: number) => void) {
        try {
            await SafeFileOperation.checkDiskSpace(serverDir);
            const msg = 'Fetching Purpur builds...';
            this.updateProgress(serverId, msg, 0);
            onProgress?.(msg);
            
            // Purpur API: https://api.purpurmc.org/v2/purpur/{version}/latest/download
            // Or specific build: https://api.purpurmc.org/v2/purpur/{version}/{build}/download
            
            let downloadUrl;
            if (build === 'latest') {
                downloadUrl = `https://api.purpurmc.org/v2/purpur/${version}/latest/download`;
            } else {
                 downloadUrl = `https://api.purpurmc.org/v2/purpur/${version}/${build}/download`;
            }
            
            const dest = path.join(serverDir, 'server.jar');

            await fs.ensureDir(serverDir);
            const dMsg = `Downloading Purpur ${version}...`;
            this.updateProgress(serverId, dMsg, 0);
            onProgress?.(dMsg, 0);
            
            try {
                await this.downloadFile(downloadUrl, dest, onProgress, serverId);
            } catch (err: any) {
                if (err.response?.status === 404) {
                     throw new Error(`Purpur has not released builds for version ${version} yet. This is common for very new Minecraft releases (like ${version}). Please try Vanilla if you need it immediately.`);
                }
                throw err;
            }
            
            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
            
            const cMsg = 'Installation Complete';
            this.updateProgress(serverId, cMsg, 100);
            onProgress?.(cMsg);
            setTimeout(() => this.clearProgress(serverId), 2000);
            return true;

        } catch (e) {
            logger.error(`Purpur install failed: ${e}`);
            this.clearProgress(serverId);
            throw e;
        }
    }

    // Install CurseForge/Modrinth Modpack or Single Mod
    async installModpackFromZip(serverId: string, serverDir: string, zipUrl: string, mcVersion?: string, onProgress?: (msg: string, percent?: number) => void, intendedSoftware?: string) {
        try {
            await SafeFileOperation.checkDiskSpace(serverDir, 1000); // Modpacks need more space (1GB min)
            await fs.ensureDir(serverDir);
            
            let downloadFileName = 'modpack.zip';

            // Resolve Modrinth ID if needed
            if (zipUrl.startsWith('modrinth:')) {
                const projectId = zipUrl.split(':')[1];
                const rMsg = `Resolving Modrinth Project ${projectId}...`;
                this.updateProgress(serverId, rMsg, 0);
                onProgress?.(rMsg);

                // PRE-CHECK: Fetch project metadata to check server compatibility
                try {
                    const projectRes = await axios.get(`https://api.modrinth.com/v2/project/${projectId}`);
                    const project = projectRes.data as any;
                    
                    if (project.server_side === 'unsupported') {
                        const warnMsg = `⚠️ Warning: "${project.title}" is marked as client-only on Modrinth. It may not work on a dedicated server.`;
                        logger.warn(`[Installer] ${warnMsg}`);
                        this.updateProgress(serverId, warnMsg);
                        onProgress?.(warnMsg);
                    } else if (project.server_side === 'optional') {
                        this.updateProgress(serverId, `ℹ️ "${project.title}" has optional server support.`);
                    }
                } catch (e) {
                    // Non-fatal — if we can't check, continue with the install
                    logger.warn(`[Installer] Could not fetch project metadata for ${projectId}: ${(e as Error).message}`);
                }

                // Fetch versions with filters for version and loader (Layer 1 Stabilization)
                let versionUrl = `https://api.modrinth.com/v2/project/${projectId}/version`;
                if (mcVersion && intendedSoftware) {
                    const mappedLoader = intendedSoftware.toLowerCase();
                    versionUrl += `?loaders=["${mappedLoader}"]&game_versions=["${mcVersion}"]`;
                }
                try {
                    let vRes = await axios.get(versionUrl);
                    let versions = vRes.data as any[];
                    
                    // Fallback Logic: If no version found for current loader, try without loader filter (Layer 2 Stabilization)
                    if (versions.length === 0 && mcVersion && intendedSoftware?.toLowerCase() === 'modpack') {
                        logger.info(`[Installer] No 'modpack' versions for ${projectId}. Retrying without loader filter for Minecraft ${mcVersion}...`);
                        const fallbackUrl = `https://api.modrinth.com/v2/project/${projectId}/version?game_versions=["${mcVersion}"]`;
                        const fallbackRes = await axios.get(fallbackUrl);
                        versions = fallbackRes.data as any[];
                    }
                    
                    if (versions && versions.length > 0) {
                        await processVersion(versions[0], this);
                    } else {
                        throw new Error(`Incompatible mod: ${projectId} does not support ${mcVersion}/${intendedSoftware || 'any'}`);
                    }
                } catch (err: any) {
                    logger.error(`[Installer] Modrinth resolution failed for ${projectId}: ${err.message}`);
                    throw err;
                }

                async function processVersion(version: any, service: any) {
                    // Backend Safety Net: Check if the loader matches (if mcVersion and intendedSoftware are provided)
                    if (mcVersion && intendedSoftware) {
                        const supportedLoaders = version.loaders || [];
                        const normalizedSupported = supportedLoaders.map((l: string) => l.toLowerCase());
                        const normalizedIntended = intendedSoftware.toLowerCase();

                        const mismatch = !normalizedSupported.includes(normalizedIntended);
                        
                        if (mismatch && supportedLoaders.length > 0) {
                            const warnMsg = `[MATCH_WARNING] Server is '${intendedSoftware}' but mod supports: ${supportedLoaders.join(', ')}`;
                            logger.warn(`[Installer] ${warnMsg} for server ${serverId}`);
                            service.updateProgress(serverId, warnMsg);
                            onProgress?.(warnMsg);
                        } else {
                            service.updateProgress(serverId, `Verifying compatibility... OK (${supportedLoaders.join(', ')})`);
                        }
                    }

                    const file = version.files.find((f: any) => f.primary) || version.files[0];
                    zipUrl = file.url;
                    downloadFileName = file.filename || zipUrl.split('/').pop() || 'modpack.zip';
                    const statusMsg = `Resolved to: ${version.name} (${downloadFileName})`;
                    service.updateProgress(serverId, statusMsg);
                }
            } else {
                downloadFileName = zipUrl.split('?')[0].split('/').pop() || 'modpack.zip';
            }

            const isSingleMod = downloadFileName.endsWith('.jar');
            const isMrpack = downloadFileName.endsWith('.mrpack');

            if (isSingleMod) {
                // --- SINGLE MOD INSTALLATION ---
                this.updateProgress(serverId, `Detected Single Mod Jar. Installing into mods/ ...`);
                const modsDir = path.join(serverDir, 'mods');
                await fs.ensureDir(modsDir);
                const dest = path.join(modsDir, downloadFileName);
                
                const dMsg = 'Downloading Mod...';
                this.updateProgress(serverId, dMsg, 20);
                onProgress?.(dMsg, 20);
                await this.downloadFile(zipUrl, dest, onProgress, serverId);
                
                // Scan the mods dir to detect the loader (Fabric, Forge, NeoForge)
                const packType = await this.scanModpackType(serverDir);
                let loader = packType.loader || 'Fabric';
                
                this.updateProgress(serverId, `Single Mod installed. Detected Loader: ${loader}`);
                
                if (mcVersion) {
                    this.updateProgress(serverId, `Auto-Installing ${loader} for ${mcVersion}...`);
                    if (loader === 'Fabric') await this.installFabric(serverId, serverDir, mcVersion);
                    else if (loader === 'NeoForge') await this.installNeoForge(serverId, serverDir, mcVersion);
                    else if (loader === 'Forge') await this.installForge(serverId, serverDir, mcVersion);
                } else {
                    this.updateProgress(serverId, `WARNING: Minecraft version not provided. Base server not installed.`);
                }
                
                // MOD MANAGEMENT: Filter client-side projects + resolve dependencies
                if (mcVersion) {
                    await this.verifyServerCompatibility(serverId, serverDir, onProgress);
                    await this.resolveModDependencies(serverId, serverDir, mcVersion, loader, onProgress);
                }

                await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
                const cMsg = 'Mod Installed.';
                this.updateProgress(serverId, cMsg, 100);
                onProgress?.(cMsg, 100);
                setTimeout(() => this.clearProgress(serverId), 2000);
                return;

            } else if (isMrpack) {
                // --- MODRINTH MRPACK INSTALLATION ---
                const zipPath = path.join(serverDir, 'modpack.mrpack');
                const tempExtractDir = path.join(serverDir, 'temp_extract');
                
                const dMsg = 'Downloading Modrinth Pack...';
                this.updateProgress(serverId, dMsg, 5);
                onProgress?.(dMsg, 5);
                await this.downloadFile(zipUrl, zipPath, onProgress, serverId);
                
                const eMsg = 'Extracting Mrpack...';
                this.updateProgress(serverId, eMsg, 40);
                onProgress?.(eMsg, 40);
                await fs.ensureDir(tempExtractDir);
                await extract(zipPath, { dir: tempExtractDir });

                // Process modrinth.index.json
                const indexPath = path.join(tempExtractDir, 'modrinth.index.json');
                if (!await fs.pathExists(indexPath)) {
                    throw new Error('Invalid .mrpack: Missing modrinth.index.json');
                }
                
                const index = await fs.readJson(indexPath);
                const mrpackMcVersion = index.dependencies?.minecraft || mcVersion;
                let loader = 'Fabric';
                if (index.dependencies?.forge) loader = 'Forge';
                if (index.dependencies?.['fabric-loader']) loader = 'Fabric';
                if (index.dependencies?.['quilt-loader']) loader = 'Quilt';
                if (index.dependencies?.['neoforge']) loader = 'NeoForge';

                this.updateProgress(serverId, `Detected Modrinth Pack: Minecraft ${mrpackMcVersion}, Loader ${loader}`);

                // Download files sequentially to avoid rate limits
                if (index.files && Array.isArray(index.files)) {
                    let dlCount = 0;
                    const totalFiles = index.files.length;
                    
                    for (const f of index.files) {
                        dlCount++;
                        // Environment filter: skip client-only mods
                        if (f.env && f.env.server === 'unsupported') continue;
                        
                        const destPath = path.join(serverDir, f.path);
                        await fs.ensureDir(path.dirname(destPath));
                        
                        try {
                            const res = await axios({ 
                                method: 'GET', 
                                url: f.downloads[0], 
                                responseType: 'stream',
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                    'Accept': '*/*'
                                },
                                timeout: 15000 
                            });
                            const writer = fs.createWriteStream(destPath);
                            (res.data as any).pipe(writer);
                            await new Promise((resolve, reject) => {
                                writer.on('finish', () => resolve(true));
                                writer.on('error', reject);
                            });
                        } catch (err: any) {
                             logger.error(`[Installer] Failed to download pack file ${f.path} from ${f.downloads[0]}: ${err.message}`);
                             this.updateProgress(serverId, `Warning: Failed to download mod ${path.basename(f.path)}`);
                        }
                        
                        if (dlCount % 5 === 0) {
                            const p = 40 + Math.round((dlCount / totalFiles) * 40);
                            const msg = `Downloading Mods... (${dlCount}/${totalFiles})`;
                            this.updateProgress(serverId, msg, p);
                            onProgress?.(msg, p);
                        }
                    }
                }

                // Copy overrides
                const overridesMsg = 'Applying Overrides...';
                this.updateProgress(serverId, overridesMsg);
                if (await fs.pathExists(path.join(tempExtractDir, 'overrides'))) {
                    await fs.copy(path.join(tempExtractDir, 'overrides'), serverDir, { overwrite: true });
                }
                if (await fs.pathExists(path.join(tempExtractDir, 'server-overrides'))) {
                    await fs.copy(path.join(tempExtractDir, 'server-overrides'), serverDir, { overwrite: true });
                }

                // Cleanup
                await fs.remove(tempExtractDir);
                await fs.remove(zipPath);

                // Install base server software
                if (mrpackMcVersion) {
                    this.updateProgress(serverId, `Auto-Installing ${loader} for ${mrpackMcVersion}...`);
                    if (loader === 'Fabric') await this.installFabric(serverId, serverDir, mrpackMcVersion);
                    else if (loader === 'NeoForge') await this.installNeoForge(serverId, serverDir, mrpackMcVersion);
                    else if (loader === 'Forge') await this.installForge(serverId, serverDir, mrpackMcVersion);
                    
                    this.updateProgress(serverId, `${loader} Installed. Modrinth Pack Ready.`);
                }
                
                // MOD MANAGEMENT: Filter client-side projects + resolve dependencies
                const mrpackMcVer = mrpackMcVersion || mcVersion;
                if (mrpackMcVer) {
                    await this.verifyServerCompatibility(serverId, serverDir, onProgress);
                    await this.resolveModDependencies(serverId, serverDir, mrpackMcVer, loader || 'Fabric', onProgress);
                }

                await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
                const cMsg = 'Modrinth Pack Installed.';
                this.updateProgress(serverId, cMsg, 100);
                onProgress?.(cMsg, 100);
                setTimeout(() => this.clearProgress(serverId), 2000);
                return;
            }

            // --- CURSEFORGE / STANDARD ZIP INSTALLATION ---
            const zipPath = path.join(serverDir, 'modpack.zip');
            const tempExtractDir = path.join(serverDir, 'temp_extract');
            
            const dMsg = 'Downloading Modpack...';
            this.updateProgress(serverId, dMsg, 5);
            onProgress?.(dMsg, 0);
            await this.downloadFile(zipUrl, zipPath, onProgress, serverId);
            
            const eMsg = 'Extracting Modpack for Analysis...';
            this.updateProgress(serverId, eMsg, 40);
            onProgress?.(eMsg);
            // Extract to temp dir first to analyze
            await fs.ensureDir(tempExtractDir);
            
            // Use extract-zip for better async performance and safety
            let extractedCount = 0;
            await extract(zipPath, { 
                dir: tempExtractDir,
                onEntry: (entry) => {
                    extractedCount++;
                    // Reporting extraction progress (capped at 99% until fully done)
                    if (extractedCount % 100 === 0) {
                        const percent = Math.min(99, Math.round((extractedCount / 5000) * 100)); // Rough estimate if total unknown
                        const msg = `Extracting Modpack... (${extractedCount} files)`;
                        this.updateProgress(serverId, msg, percent);
                        onProgress?.(msg, percent);
                    }
                }
            });

            // ANALYZE PACK TYPE
            const packType = await this.scanModpackType(tempExtractDir);
            logger.info(`[Installer] Detected Modpack Type: ${packType.type} (${packType.loader || 'None'})`);

            // Normalize content (Handle overrides folder for simple client packs)
            let rootContentDir = tempExtractDir;
            const subDirs = await fs.readdir(tempExtractDir);
            if (subDirs.includes('overrides') && (await fs.stat(path.join(tempExtractDir, 'overrides'))).isDirectory()) {
                // CurseForge Standard: effective content is in 'overrides'
                rootContentDir = path.join(tempExtractDir, 'overrides');
            } else if (subDirs.length === 1 && (await fs.stat(path.join(tempExtractDir, subDirs[0]))).isDirectory()) {
                 // Nested single folder (common user error)
                 rootContentDir = path.join(tempExtractDir, subDirs[0]);
            }

            // Move files to server root
            const iMsg = 'Installing Modpack Files...';
            this.updateProgress(serverId, iMsg);
            onProgress?.(iMsg);
            await fs.copy(rootContentDir, serverDir, { overwrite: true });

            // Cleanup temp
            await fs.remove(tempExtractDir);
            await fs.remove(zipPath);

            // INSTALLER LOGIC
            if (packType.type === 'CLIENT_PACK') {
                this.updateProgress(serverId, `Detected Client-Only Modpack (${packType.loader}). Checking Version...`);
                
                if (mcVersion) {
                    this.updateProgress(serverId, `Auto-Installing ${packType.loader} for ${mcVersion}...`);
                    
                    if (packType.loader === 'Fabric') {
                        await this.installFabric(serverId, serverDir, mcVersion);
                    } else if (packType.loader === 'NeoForge') {
                        await this.installNeoForge(serverId, serverDir, mcVersion);
                    } else if (packType.loader === 'Forge') {
                        await this.installForge(serverId, serverDir, mcVersion);
                    }
                    
                    this.updateProgress(serverId, `${packType.loader} Installed. Client Pack Ready.`);

                } else {
                    this.updateProgress(serverId, `WARNING: Client Pack detected (${packType.loader}) but no Minecraft version provided.`);
                    this.updateProgress(serverId, `Please manually install ${packType.loader} if the server fails to start.`);
                }
            } 
            
            // SMART MOD MANAGEMENT: Filter client-side projects + resolve dependencies
            if (mcVersion) {
                await this.verifyServerCompatibility(serverId, serverDir, onProgress);
                const cfLoader = packType?.loader || 'Fabric';
                await this.resolveModDependencies(serverId, serverDir, mcVersion, cfLoader, onProgress);
            }

            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
            const cMsg = 'Modpack Installed.';
            this.updateProgress(serverId, cMsg, 100);
            onProgress?.(cMsg);
            setTimeout(() => this.clearProgress(serverId), 2000);
            
        } catch (e: any) {
             logger.error(`[Installer] Modpack install failed: ${e.message}`);
             this.clearProgress(serverId);
             await fs.remove(path.join(serverDir, 'temp_extract')).catch(() => {});
             throw e;
        }
    }

    /**
     * Modrinth API-based Server Compatibility Verification
     * 1. Scans jars for mod IDs (slugs)
     * 2. Batch queries Modrinth API for "server_side" status
     * 3. Moves "unsupported" mods to mods/_client_mods/
     * 4. Fallback to fabric.mod.json metadata if not on Modrinth
     */
    async verifyServerCompatibility(serverId: string, serverDir: string, onProgress?: (msg: string, percent?: number) => void, onLog?: (line: string) => void): Promise<string[]> {
        const modsDir = path.join(serverDir, 'mods');
        if (!await fs.pathExists(modsDir)) return [];

        const files = await fs.readdir(modsDir);
        const jarFiles = files.filter(f => f.endsWith('.jar'));
        if (jarFiles.length === 0) return [];

        this.updateProgress(serverId, `🔍 Verifying ${jarFiles.length} mods against Modrinth API...`);
        onProgress?.(`🔍 Verifying ${jarFiles.length} mods against Modrinth API...`);
        onLog?.(`[ModManager] Verifying ${jarFiles.length} mods against Modrinth API...`);

        // Scan local metadata to get IDs
        const modMeta: Map<string, { file: string; name: string; env: string; deps: string[] }> = new Map();
        const modIdToFile = new Map<string, string>();
        
        for (const jarFile of jarFiles) {
            const jarPath = path.join(modsDir, jarFile);
            try {
                const zip = new AdmZip(jarPath);
                const fabricEntry = zip.getEntry('fabric.mod.json');
                const forgeEntry = zip.getEntry('META-INF/mods.toml');
                const neoEntry = zip.getEntry('META-INF/neoforge.mods.toml');

                if (fabricEntry) {
                    const content = JSON.parse(fabricEntry.getData().toString('utf8'));
                    const modId = content.id || jarFile;
                    const env = content.environment || '*';
                    const deps = Object.keys(content.depends || {}).filter(d => 
                        !['minecraft', 'java', 'fabricloader', 'fabric-api'].includes(d) && !d.startsWith('fabric-')
                    );
                    modMeta.set(modId, { file: jarFile, name: content.name || modId, env, deps });
                    modIdToFile.set(modId, jarFile);
                } else if (forgeEntry || neoEntry) {
                    const content = (forgeEntry || neoEntry)!.getData().toString('utf8');
                    // Simple regex fallback for TOML parsing since 'toml' lib is not available
                    const modIdMatch = content.match(/modId\s*=\s*"([^"]+)"/) || content.match(/modId\s*=\s*'([^']+)'/);
                    const modId = modIdMatch ? modIdMatch[1] : jarFile;
                    
                    // Check for common client-only hints in Forge/NeoForge
                    const isClientOnly = content.includes('displayClientOnly=true') || content.includes('displayClientOnly = true');
                    const env = isClientOnly ? 'client' : '*';
                    
                    // Dependencies in Forge TOML are complex — skip deep parsing for now, rely on Modrinth API
                    modMeta.set(modId, { file: jarFile, name: modId, env, deps: [] });
                    modIdToFile.set(modId, jarFile);
                }
            } catch (e) { /* Jar may be corrupted or not a mod jar — skip silently */ }
        }

        const idsToCheck = [...modMeta.keys()];
        const clientOnlyIds = new Set<string>();

        // Query Modrinth API for server-side compatibility
        try {
            // Modrinth allows querying by IDs/slugs in batches
            const chunkSize = 50;
            const chunks = [];
            for (let i = 0; i < idsToCheck.length; i += chunkSize) {
                chunks.push(idsToCheck.slice(i, i + chunkSize));
            }

            for (const chunk of chunks) {
                try {
                    const response = await axios.get(`https://api.modrinth.com/v2/projects`, {
                        params: { ids: JSON.stringify(chunk) },
                        headers: { 'User-Agent': 'CraftCommand/1.0' },
                        timeout: 10000
                    });

                    if (Array.isArray(response.data)) {
                        for (const project of response.data) {
                            if (project.server_side === 'unsupported') {
                                clientOnlyIds.add(project.id);
                                if (project.slug) clientOnlyIds.add(project.slug);
                            }
                        }
                    }
                } catch (apiErr: any) {
                    logger.warn(`[Installer] Modrinth batch query failed for chunk: ${apiErr.message}`);
                }
            }

            // Local Fallback (modrinth_env.json)
            const envPath = path.join(process.cwd(), 'modrinth_env.json');
            if (await fs.pathExists(envPath)) {
                try {
                    const fallbackData = await fs.readJson(envPath);
                    if (Array.isArray(fallbackData)) {
                        for (const mod of fallbackData) {
                            if (mod.ss === 'unsupported' || (mod.ss === 'optional' && mod.cs === 'required')) {
                                if (mod.slug) {
                                    const modIdMatches = [...modMeta.keys()].filter(id => id.toLowerCase() === mod.slug.toLowerCase());
                                    for (const id of modIdMatches) clientOnlyIds.add(id);
                                }
                            }
                        }
                    }
                } catch (e) { logger.debug(`[Installer] Could not read local modrinth_env.json fallback: ${e}`); }
            }
        } catch (err: any) {
            logger.error(`[Installer] Modrinth verification process failed: ${err.message}`);
        }

        // Check local metadata for direct client-only environment flags
        for (const [modId, meta] of modMeta) {
            if (meta.env === 'client') {
                clientOnlyIds.add(modId);
            }
        }

        // Resolve dependencies of client-only mods
        for (const [modId, meta] of modMeta) {
            if (clientOnlyIds.has(modId)) continue;
            for (const dep of meta.deps) {
                if (clientOnlyIds.has(dep)) {
                    clientOnlyIds.add(modId);
                    logger.info(`[Installer] ${meta.name} depends on client-only mod "${dep}" — marking as client-only`);
                    break;
                }
            }
        }

        // Block known server-incompatible mods (Final safety net)
        const KNOWN_CLIENT_ONLY_IDS = new Set([
            'slyde', 'slydemore', 'libjf', 'fancymenu', 'konkrete', 'melody', 
            'iris', 'replaymod', 'optifine', 'command-block-ide', 'sodiumcoreshadersupport',
            'utility' // Undertale Utility Engine — crashes server with "supposed to play to Undertale"
        ]);
        
        for (const [modId, meta] of modMeta) {
            if (!clientOnlyIds.has(modId) && KNOWN_CLIENT_ONLY_IDS.has(modId)) {
                clientOnlyIds.add(modId);
            }
        }

        // Execute move
        const clientDir = path.join(modsDir, '_client_mods');
        await fs.ensureDir(clientDir);

        const filtered: string[] = [];
        for (const modId of clientOnlyIds) {
            const meta = modMeta.get(modId);
            if (!meta) continue;
            try {
                const src = path.join(modsDir, meta.file);
                const dest = path.join(clientDir, meta.file);
                if (await fs.pathExists(src)) {
                    await fs.move(src, dest, { overwrite: true });
                    filtered.push(meta.name);
                }
            } catch (e) { logger.warn(`[Installer] Failed to quarantine client mod ${meta.file}: ${e}`); }
        }

        if (filtered.length > 0) {
            const msg = `🚫 Moved ${filtered.length} client-side projects to _client_mods/: ${filtered.join(', ')}`;
            this.updateProgress(serverId, msg, 100);
            onProgress?.(msg, 100);
            onLog?.(`[ModManager] ${msg}`);
            logger.success(`[Installer] Server ${serverId}: ${msg}`);
            
            // Log quarantined mods to audit trail
            try {
                const { userRepository } = require('../../storage/UserRepository');
                const admin = userRepository.findAll().find((u: any) => u.role === 'ADMIN');
                if (admin) {
                    await auditService.log(admin.id, 'MOD_QUARANTINE' as any, serverId, { mods: filtered, count: filtered.length });
                }
            } catch (auditErr) {
                logger.warn(`[Installer] Failed to log mod quarantine audit: ${auditErr}`);
            }

            setTimeout(() => this.clearProgress(serverId), 3000);
        } else {
            const msg = `✅ All ${jarFiles.length} mods are server-compatible.`;
            this.updateProgress(serverId, msg, 100);
            onProgress?.(msg, 100);
            onLog?.(`[ModManager] ${msg}`);
            setTimeout(() => this.clearProgress(serverId), 3000);
        }

        return filtered;
    }

    /**
     * Auto-Dependency Resolution
     * Scans all mod jars in mods/ for required dependencies (fabric.mod.json, mods.toml),
     * determines what's missing, and auto-installs them from Modrinth.
     * Also scans JiJ (Jar-in-Jar) embedded mods to know what's already bundled.
     * Runs 2 passes to handle transitive dependencies.
     * NEVER deletes anything — only adds missing mods.
     */
    async resolveModDependencies(serverId: string, serverDir: string, mcVersion: string, loader: string, onProgress?: (msg: string, percent?: number) => void, onLog?: (line: string) => void): Promise<string[]> {
        const modsDir = path.join(serverDir, 'mods');
        if (!await fs.pathExists(modsDir)) return [];

        // Built-in mod IDs that are provided by the loader/game itself — never try to install these
        const BUILTIN_IDS = new Set([
            'minecraft', 'java', 'fabricloader', 'fabric', 'fabric-api', 
            'fabric-language-kotlin', 'forge', 'neoforge', 'quilt_loader',
            'mixinextras', 'cloth-config', 'cloth-config2',
        ]);
        
        // Fabric API provides 70+ sub-modules — match any ID starting with "fabric-"
        const isFabricApiSubmodule = (id: string) => id.startsWith('fabric-') || id.startsWith('fabric_');

        const installedMods: string[] = [];
        const MAX_PASSES = 2;

        for (let pass = 0; pass < MAX_PASSES; pass++) {
            const files = await fs.readdir(modsDir);
            const jarFiles = files.filter(f => f.endsWith('.jar'));
            
            if (jarFiles.length === 0) break;

            // STEP 1: Build a set of all mod IDs provided by installed jars
            const providedIds = new Set<string>();
            const missingDeps = new Map<string, string>(); // dep ID → required by mod name
            
            const scanMsg = pass === 0 
                ? `🔍 Scanning ${jarFiles.length} mods for dependencies...`
                : `🔍 Checking transitive dependencies (pass ${pass + 1})...`;
            this.updateProgress(serverId, scanMsg);
            onProgress?.(scanMsg);

            for (const jarFile of jarFiles) {
                const jarPath = path.join(modsDir, jarFile);
                try {
                    const zip = new AdmZip(jarPath);
                    
                    // Read Fabric metadata
                    const fabricEntry = zip.getEntry('fabric.mod.json');
                    if (fabricEntry) {
                        const content = JSON.parse(fabricEntry.getData().toString('utf8'));
                        const modId = content.id;
                        const modName = content.name || modId;
                        if (modId) providedIds.add(modId);
                        
                        // Also register any "provides" aliases
                        if (Array.isArray(content.provides)) {
                            for (const alias of content.provides) providedIds.add(alias);
                        }
                        
                        // Scan JiJ (Jar-in-Jar) embedded mods — these are bundled deps
                        const jijEntries = zip.getEntries().filter(e => 
                            e.entryName.startsWith('META-INF/jars/') && e.entryName.endsWith('.jar')
                        );
                        for (const jijEntry of jijEntries) {
                            try {
                                const jijZip = new AdmZip(jijEntry.getData());
                                const jijFabric = jijZip.getEntry('fabric.mod.json');
                                if (jijFabric) {
                                    const jijContent = JSON.parse(jijFabric.getData().toString('utf8'));
                                    if (jijContent.id) providedIds.add(jijContent.id);
                                    if (Array.isArray(jijContent.provides)) {
                                        for (const alias of jijContent.provides) providedIds.add(alias);
                                    }
                                }
                            } catch (e) { /* nested jar unreadable, skip */ }
                        }
                        
                        // Collect required dependencies
                        const depends = content.depends || {};
                        for (const depId of Object.keys(depends)) {
                            if (!BUILTIN_IDS.has(depId) && !isFabricApiSubmodule(depId) && !providedIds.has(depId)) {
                                missingDeps.set(depId, modName);
                            }
                        }
                        continue;
                    }
                    
                    // Read Forge/NeoForge metadata
                    const modsToml = zip.getEntry('META-INF/mods.toml') || zip.getEntry('META-INF/neoforge.mods.toml');
                    if (modsToml) {
                        const content = modsToml.getData().toString('utf8');
                        const modIdMatch = content.match(/modId\s*=\s*["']([^"']+)["']/);
                        if (modIdMatch) providedIds.add(modIdMatch[1]);
                        
                        // Parse required dependencies from [[dependencies.modId]] sections
                        const depRegex = /\[\[dependencies\.[^\]]+\]\][^[]*?modId\s*=\s*["']([^"']+)["'][^[]*?mandatory\s*=\s*true/gis;
                        let depMatch;
                        while ((depMatch = depRegex.exec(content)) !== null) {
                            const depId = depMatch[1];
                            if (!BUILTIN_IDS.has(depId)) {
                                missingDeps.set(depId, modIdMatch?.[1] || jarFile);
                            }
                        }
                    }
                } catch (e) {
                    // Can't read jar, skip
                }
            }

            // Remove deps that ARE provided by installed mods
            for (const depId of missingDeps.keys()) {
                if (providedIds.has(depId)) {
                    missingDeps.delete(depId);
                }
            }

            if (missingDeps.size === 0) {
                if (pass === 0) {
                    const msg = `✅ All mod dependencies are satisfied.`;
                    this.updateProgress(serverId, msg, 100);
                    onProgress?.(msg, 100);
                    setTimeout(() => this.clearProgress(serverId), 3000);
                }
                break;
            }

            // STEP 2: Install missing dependencies from Modrinth
            const { pluginService } = require('../plugins/PluginService');
            
            const depMsg = `📦 Installing ${missingDeps.size} missing dependenc${missingDeps.size === 1 ? 'y' : 'ies'}...`;
            this.updateProgress(serverId, depMsg);
            onProgress?.(depMsg);
            onLog?.(`[ModManager] ${depMsg}`);
            logger.info(`[Installer] Auto-resolving ${missingDeps.size} missing dependencies: ${[...missingDeps.keys()].join(', ')}`);

            const failedDeps: { id: string; reason: string }[] = [];

            for (const [depId, requiredBy] of missingDeps) {
                try {
                    const installMsg = `📦 Installing dependency: ${depId} (required by ${requiredBy})`;
                    this.updateProgress(serverId, installMsg);
                    onProgress?.(installMsg);
                    
                    await pluginService.install(serverId, depId, 'modrinth');
                    installedMods.push(depId);
                    onLog?.(`[ModManager] ✅ Auto-installed dependency: ${depId}`);
                    logger.success(`[Installer] Auto-installed dependency: ${depId}`);
                } catch (e: any) {
                    const errMsg = e.message || '';
                    let reason: string;
                    let warnMsg: string;
                    
                    if (errMsg.includes('404') || errMsg.includes('Not Found') || errMsg.includes('Request failed with status code 404')) {
                        reason = 'Deleted from Modrinth';
                        warnMsg = `❌ "${depId}" was deleted from Modrinth (required by ${requiredBy}). The mod author removed it — you need to find it elsewhere.`;
                    } else if (errMsg.includes('No compatible versions') || errMsg.includes('No versions found')) {
                        reason = `No version for MC ${mcVersion}`;
                        warnMsg = `⚠️ "${depId}" has no version compatible with Minecraft ${mcVersion}. Check for a different version of ${requiredBy}.`;
                    } else {
                        reason = errMsg.substring(0, 80);
                        warnMsg = `⚠️ Could not install "${depId}" — ${reason}`;
                    }
                    
                    failedDeps.push({ id: depId, reason });
                    logger.warn(`[Installer] Dependency "${depId}" failed: ${reason}`);
                    this.updateProgress(serverId, warnMsg);
                    onProgress?.(warnMsg);
                }
            }
        }

        if (installedMods.length > 0) {
            // Build final summary
            const parts: string[] = [];
            if (installedMods.length > 0) {
                parts.push(`✅ Auto-installed ${installedMods.length} dep${installedMods.length === 1 ? '' : 's'}: ${installedMods.join(', ')}`);
            }
            if (parts.length > 0) {
                const successMsg = parts.join(' | ');
                this.updateProgress(serverId, successMsg);
                onProgress?.(successMsg);
                onLog?.(`[ModManager] ${successMsg}`);
                logger.success(`[Installer] Server ${serverId}: ${successMsg}`);
            }
        }

        return installedMods;
    }

    private async scanModpackType(dir: string): Promise<{ type: 'SERVER_PACK' | 'CLIENT_PACK' | 'UNKNOWN', loader?: string }> {
        // recursive search ? No, usually top level or one deep.
        // Let's checking for server starters
        const files = await fs.readdir(dir);
        
        // 1. Check for Server Starters (Strong indicator of Server Pack)
        if (files.some(f => f === 'run.bat' || f === 'run.sh' || f === 'start.bat' || (f.endsWith('.jar') && f.includes('server')))) {
            return { type: 'SERVER_PACK' };
        }
        
        // 2. Check for Libraries (Strong indicator of Server Pack / Installer ran)
        if (files.includes('libraries') && (await fs.stat(path.join(dir, 'libraries'))).isDirectory()) {
             return { type: 'SERVER_PACK' };
        }
        
        // 3. Check for Mods folder (Client Pack indicator)
        // Note: CurseForge packs have 'overrides/mods' or just 'mods'
        let modsDir = path.join(dir, 'mods');
        if (!await fs.pathExists(modsDir)) {
            if (await fs.pathExists(path.join(dir, 'overrides', 'mods'))) {
                modsDir = path.join(dir, 'overrides', 'mods');
            } else {
                 return { type: 'UNKNOWN' };
            }
        }
        
        // It has mods but no server files -> CLIENT PACK.
        // Identify Loader
        const modFiles = await fs.readdir(modsDir);
        for (const file of modFiles) {
             if (file.endsWith('.jar')) {
                 // Open jar and check for fabric.mod.json or META-INF/mods.toml
                 try {
                     const jarPath = path.join(modsDir, file);
                     const zip = new AdmZip(jarPath);
                     
                     if (zip.getEntry('fabric.mod.json')) {
                         return { type: 'CLIENT_PACK', loader: 'Fabric' };
                     }
                     if (zip.getEntry('META-INF/mods.toml') || zip.getEntry('mcmod.info')) {
                         return { type: 'CLIENT_PACK', loader: 'Forge' };
                     }
                     if (zip.getEntry('META-INF/neoforge.mods.toml')) { // NeoForge specific
                          return { type: 'CLIENT_PACK', loader: 'NeoForge' };
                     }
                 } catch (e) {
                     // ignore corrupted jars
                 }
             }
        }

        return { type: 'CLIENT_PACK', loader: 'Forge' }; // Default to Forge if ambiguous (safest bet for legacy)
    }

    // Install Vanilla (Mojang)
    async installVanilla(serverId: string, serverDir: string, version: string, onProgress?: (msg: string, percent?: number) => void) {
        try {
            await SafeFileOperation.checkDiskSpace(serverDir);
            const mMsg = 'Fetching Vanilla manifest...';
            this.updateProgress(serverId, mMsg, 0);
            onProgress?.(mMsg);
            const manifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
            const manifestRes = await axios.get(manifestUrl);
            
            const versionData = (manifestRes.data as any).versions.find((v: any) => v.id === version);
            if (!versionData) throw new Error(`Version ${version} not found in Mojang manifest. Please check if it's a valid release or snapshot.`);

            const versionMetaRes = await axios.get(versionData.url);
            const downloads = (versionMetaRes.data as any).downloads;
            if (!downloads?.server?.url) {
                throw new Error(`Vanilla Server binary NOT found for version ${version}. Some very old versions or experimental snapshots may not have a standalone server jar.`);
            }
            const downloadUrl = downloads.server.url;
            
            const dest = path.join(serverDir, 'server.jar');
            await fs.ensureDir(serverDir);
            
            this.updateProgress(serverId, 'Downloading Vanilla Jar...', 20);
            onProgress?.('Downloading Vanilla Jar...', 0);
            await this.downloadFile(downloadUrl, dest, onProgress, serverId);
            
            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
            this.updateProgress(serverId, 'Installation Complete', 100);
            setTimeout(() => this.clearProgress(serverId), 2000);
            
        } catch (e) {
            logger.error(`Vanilla install failed: ${e}`);
            this.clearProgress(serverId);
            throw e;
        }
    }

    // Install Fabric
    async installFabric(serverId: string, serverDir: string, version: string, onProgress?: (msg: string, percent?: number) => void) {
        try {
            await SafeFileOperation.checkDiskSpace(serverDir);
            const fMsg = 'Fetching Fabric versions...';
            this.updateProgress(serverId, fMsg, 0);
            onProgress?.(fMsg);
            const loaderRes = await axios.get('https://meta.fabricmc.net/v2/versions/loader');
            const loaderVersion = loaderRes.data[0].version; 
            const installerVersion = '1.0.1';

            const downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${version}/${loaderVersion}/${installerVersion}/server/jar`;
            
            const dest = path.join(serverDir, 'server.jar');
            await fs.ensureDir(serverDir);
            
            const dMsg = `Downloading Fabric for ${version}...`;
            this.updateProgress(serverId, dMsg, 30);
            onProgress?.(dMsg, 0);
            await this.downloadFile(downloadUrl, dest, onProgress, serverId);
            
            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
            this.updateProgress(serverId, 'Installation Complete', 100);
            setTimeout(() => this.clearProgress(serverId), 2000);

        } catch (e: any) {
            logger.error(`Fabric install failed: ${e.message}`);
            this.clearProgress(serverId);
            throw e;
        }
    }
    // Install Forge
    async installForge(serverId: string, serverDir: string, version: string, localModpack?: string, build?: string, onProgress?: (msg: string, percent?: number) => void) {
        try {
            await SafeFileOperation.checkDiskSpace(serverDir, 1000); // Modded servers need 1GB min
            const { javaManager } = await import('../processes/JavaManager');
            const { ValidationUtils } = await import('../../utils/ValidationUtils');
            const buildId = build;

            if (buildId && !ValidationUtils.validateBuildId(buildId)) {
                throw new Error('Invalid Build ID format.');
            }
            logger.info(`[Installer:Forge] Starting install for ${version}. LocalModpack: ${localModpack || 'None'}`);

            // Determine Java version for installer (Modern Forge needs modern java)
            const mcMajor = parseInt(version.split('.')[1]);
            let requiredJava = 'Java 17';
            if (mcMajor >= 21) requiredJava = 'Java 21';
            else if (mcMajor >= 17) requiredJava = 'Java 17';
            else if (mcMajor <= 16 && mcMajor >= 12) requiredJava = 'Java 11'; // Forge 1.12-1.16 usually prefer 8 but some work with 11
            else requiredJava = 'Java 8';

            logger.info(`[Installer:Forge] Ensuring ${requiredJava} exists...`);
            const { path: javaPath } = await javaManager.ensureJava(requiredJava);
            logger.info(`[Installer:Forge] Java ready at: ${javaPath}`);

            // Extract Local Modpack if provided
            if (localModpack) {
                const msg = `Extracting custom modpack: ${localModpack}...`;
                logger.info(`[Installer:Forge] ${msg}`);
                this.updateProgress(serverId, msg, 5);
                onProgress?.(msg);
                const zipPath = path.join(serverDir, localModpack);
                if (await fs.pathExists(zipPath)) {
                    let entryCount = 0;
                    await extract(zipPath, { 
                        dir: serverDir,
                    onEntry: (entry) => {
                        entryCount++;
                        if (entryCount % 100 === 0) {
                            const percent = Math.min(80, Math.round((entryCount / 5000) * 100)); // Cap at 80 for extraction
                            const msg = `Extracting modpack... (${entryCount} files)`;
                            this.updateProgress(serverId, msg, percent);
                            onProgress?.(msg, percent);
                        }
                    }
                    });
                    const msg = `Modpack extracted successfully (${entryCount} files installed).`;
                    logger.info(`[Installer:Forge] ${msg}`);
                    this.updateProgress(serverId, msg);
                    onProgress?.(msg);
                }

                // --- Flatten Logic ---
                const entries = await fs.readdir(serverDir);
                const candidates = entries.filter(e => e !== localModpack && e !== '__MACOSX' && !e.startsWith('.'));
                
                if (candidates.length === 1) {
                    const singleDir = path.join(serverDir, candidates[0]);
                    const stats = await fs.stat(singleDir);
                    if (stats.isDirectory()) {
                        const msg = `Detected nested modpack structure. Flattening...`;
                        logger.info(`[Installer:Forge] ${msg}`);
                        this.updateProgress(serverId, msg);
                        onProgress?.(msg);
                        
                        const subEntries = await fs.readdir(singleDir);
                        for (const sub of subEntries) {
                            await fs.move(path.join(singleDir, sub), path.join(serverDir, sub), { overwrite: true });
                        }
                        await fs.remove(singleDir);
                        logger.info(`[Installer:Forge] Modpack flattened successfully.`);
                        onProgress?.('Modpack flattened.');
                    }
                }
            }

            this.updateProgress(serverId, `Fetching Forge version for ${version}...`);
            
            let forgeVersion = build;
            if (!forgeVersion || forgeVersion === 'latest' || forgeVersion === 'recommended') {
                const promoRes = await axios.get('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
                const promos = (promoRes.data as any).promos;
                forgeVersion = promos[`${version}-recommended`] || promos[`${version}-latest`];
            }

            if (!forgeVersion) {
                throw new Error(`No Forge version found for Minecraft ${version}`);
            }

            const longVersion = `${version}-${forgeVersion}`;
            const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${longVersion}/forge-${longVersion}-installer.jar`;
            
            const installerPath = path.join(serverDir, 'forge-installer.jar');
            await fs.ensureDir(serverDir);

            this.updateProgress(serverId, `Downloading Forge ${forgeVersion}...`, 70);
            logger.info(`[Installer:Forge] Downloading Installer...`);
            onProgress?.(`Downloading Forge Installer...`, 80); // Extraction was at 80%
            await this.downloadFile(installerUrl, installerPath, (msg, pct) => {
                // Map download percentage (0-100) to sub-range 80-95
                const mappedPercent = 80 + Math.round((pct || 0) * 0.15);
                this.updateProgress(serverId, msg, mappedPercent);
                onProgress?.(msg, mappedPercent);
            }, serverId);

            this.updateProgress(serverId, 'Running Forge Installer (This may take a minute)...', 95);
            logger.info(`[Installer:Forge] Running Forge Installer...`);
            
            // Run the installer with the resolved java path
            const { spawn } = await import('child_process');
            
            await new Promise((resolve, reject) => {
                const child = spawn(javaPath, ['-jar', 'forge-installer.jar', '--installServer'], {
                    cwd: serverDir,
                    stdio: 'pipe'
                });

                child.stdout.on('data', (data) => logger.debug(`[Forge] ${data}`));
                child.stderr.on('data', (data) => logger.error(`[Forge Error] ${data}`));

                child.on('close', (code) => {
                    if (code === 0) resolve(null);
                    else reject(new Error(`Forge installer exited with code ${code}`));
                });
                
                child.on('error', reject);
            });

            // Cleanup & EULA
            await fs.remove(installerPath);
            await fs.remove(path.join(serverDir, 'forge-installer.jar.log'));
            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');

            // Detect executable
            const files = await fs.readdir(serverDir);
            
            // Priority 1: run.bat (Modern Forge)
            if (files.includes('run.bat')) {
                this.updateProgress(serverId, 'Forge installed. Using run.bat', 100);
                return 'run.bat';
            }

            // Priority 2: forge-*.jar (Older Forge)
            const forgeJar = files.find(f => f.startsWith('forge-') && f.endsWith('.jar') && !f.includes('installer'));
            if (forgeJar) {
                 this.updateProgress(serverId, `Forge installed. Using ${forgeJar}`, 100);
                 return forgeJar;
            }

            this.updateProgress(serverId, 'Forge installed.', 100);
            setTimeout(() => this.clearProgress(serverId), 2000);
            return 'run.bat'; // Default fallback

        } catch (e: any) {
            logger.error(`Forge install failed: ${e.message}`);
            this.clearProgress(serverId);
            throw e;
        }
    }

    // Install NeoForge
    async installNeoForge(serverId: string, serverDir: string, version: string, build?: string, onProgress?: (msg: string, percent?: number) => void) {
        try {
            await SafeFileOperation.checkDiskSpace(serverDir, 1000); // Modded servers need 1GB min
            const { javaManager } = await import('../processes/JavaManager');
            const { ValidationUtils } = await import('../../utils/ValidationUtils');
            const buildId = build;

            if (buildId && !ValidationUtils.validateBuildId(buildId)) {
                throw new Error('Invalid Build ID format.');
            }

            // NeoForge is almost exclusively Java 21+ for 1.20.6+, or 17 for 1.20.1
            const mcMajor = parseInt(version.split('.')[1]);
            const mcMinor = parseInt(version.split('.')[2] || '0');
            
            let requiredJava = 'Java 21';
            // 1.20.4 and below use Java 17, 1.20.5+ use Java 21
            if (mcMajor === 20 && mcMinor <= 4) requiredJava = 'Java 17';

            const jMsg = `Ensuring ${requiredJava} exists...`;
            this.updateProgress(serverId, jMsg);
            onProgress?.(jMsg);
            const { path: javaPath } = await javaManager.ensureJava(requiredJava);

            const vMsg = `Fetching NeoForge version for ${version}...`;
            this.updateProgress(serverId, vMsg);
            onProgress?.(vMsg);
            
            let matchingVersion = build;

            if (!matchingVersion || matchingVersion === 'latest') {
                 // Use NeoForge metadata API
                const metaUrl = `https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge`;
                const metaRes = await axios.get(metaUrl);
                const allVersions = (metaRes.data as any).versions;
                
                // Filter versions that match the MC version prefix (e.g. 21.1.X for 1.21.1)
                // NeoForge versioning: [MC_MINOR].[PATCH] - but recently changed.
                // Actually, checking their maven, it seems to be [MC_VER].[BUILD] often.
                // Let's rely on exact match or latest. 
                // For robustness, let's just grab the latest that contains the MC version.
                
                // Allow override? No, simple logic: Find latest version that *starts* with or *contains* MC version if possible.
                // Actually, simpler: Search XML metadata or assume latest compatible.
                // BETTER: Use `https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml`
                
                // Quick approach: Just try downloading the installer for known pattern or scrape?
                // Let's iterate versions reversed.
                matchingVersion = allVersions.reverse().find((v: string) => v.includes(version));
            }
            
            if (!matchingVersion) {
                throw new Error(`No NeoForge version found for ${version}`);
            }

            const downloadUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${matchingVersion}/neoforge-${matchingVersion}-installer.jar`;
            
            const installerPath = path.join(serverDir, 'neoforge-installer.jar');
            await fs.ensureDir(serverDir);

            this.updateProgress(serverId, `Downloading NeoForge ${matchingVersion}...`, 30);
            onProgress?.(`Downloading NeoForge Installer...`, 0);
            await this.downloadFile(downloadUrl, installerPath, onProgress, serverId);

            const eMsg = 'Running NeoForge Installer...';
            this.updateProgress(serverId, eMsg, 60);
            onProgress?.(eMsg);
            
            const { spawn } = await import('child_process');
            
            await new Promise((resolve, reject) => {
                const child = spawn(javaPath, ['-jar', 'neoforge-installer.jar', '--installServer'], {
                    cwd: serverDir,
                    stdio: 'pipe'
                });
                
                child.stdout.on('data', (d) => process.stdout.write(`[NeoForge] ${d}`));
                child.stderr.on('data', (d) => process.stderr.write(`[NeoForge Error] ${d}`));

                child.on('close', (code) => {
                    if (code === 0) resolve(null);
                    else reject(new Error(`NeoForge installer exited with code ${code}`));
                });
            });

            // Cleanup & EULA
            await fs.remove(installerPath);
            await fs.remove(path.join(serverDir, 'neoforge-installer.jar.log'));
            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
            
            // NeoForge almost always uses run.bat / run.sh
            // But let's check args file
            const argsFile = path.join(serverDir, 'user_jvm_args.txt');
            if (!await fs.pathExists(argsFile)) {
                // Create default args if missing
                await fs.writeFile(argsFile, '# Put your custom JVM arguments here\n-Xms4G\n-Xmx4G\n');
            }

            const cMsg = 'NeoForge installed.';
            this.updateProgress(serverId, cMsg, 100);
            onProgress?.(cMsg);
            setTimeout(() => this.clearProgress(serverId), 2000);
            return 'run.bat';

        } catch (e: any) {
            logger.error(`NeoForge install failed: ${e.message}`);
            this.clearProgress(serverId);
            throw e;
        }
    }

    // Install Spigot (Using a common mirror for speed, or BuildTools)
    async installSpigot(serverId: string, serverDir: string, version: string, onProgress?: (msg: string, percent?: number) => void) {
        try {
            await SafeFileOperation.checkDiskSpace(serverDir);
            const sMsg = `Searching for Spigot ${version} mirror...`;
            this.updateProgress(serverId, sMsg, 0);
            onProgress?.(sMsg);
            
            // Note: Official Spigot requires BuildTools, but many mirrors exist.
            // For a better UX, we'll try a common one, or provide instructions.
            // Using a generic mirror URL pattern (example: getspigot.org pattern)
            const downloadUrl = `https://download.getspigot.org/spigot/spigot-${version}.jar`;
            
            const dest = path.join(serverDir, 'server.jar');
            await fs.ensureDir(serverDir);
            
            try {
                onProgress?.('Downloading Spigot Jar...', 0);
                await this.downloadFile(downloadUrl, dest, onProgress);
                this.updateProgress(serverId, 'Spigot Downloaded successfully.');
            } catch (e) {
                this.updateProgress(serverId, 'Mirror failed. Falling back to BuildTools (Slow)...');
                // BuildTools logic would go here... for now we'll throw
                throw new Error('Spigot download failed. No mirror found for this version.');
            }

            this.updateProgress(serverId, 'Installation Complete', 100);
            setTimeout(() => this.clearProgress(serverId), 2000);

        } catch (e: any) {
            logger.error(`Spigot install failed: ${e.message}`);
            this.clearProgress(serverId);
            throw e;
        }
    }
    // Install Spark Profiler
    async installSpark(serverDir: string) {
        logger.info('[Installer] Installing Spark Profiler...');
        const pluginsDir = path.join(serverDir, 'plugins');
        await fs.ensureDir(pluginsDir);
        
        const dest = path.join(pluginsDir, 'spark.jar');

        // Check availability
        if (await fs.pathExists(dest)) {
            logger.success('[Installer] Bedrock Java pre-requisite met.');
            return;
        }
        
        // Direct download from Lucko's CI (stable link pattern)
        const url = 'https://ci.lucko.me/job/spark/lastSuccessfulBuild/artifact/spark-bukkit/build/libs/spark-bukkit.jar';
        await this.downloadFile(url, dest);
        logger.info('[Installer] Spark installed.');
    }

    // --- Bedrock Specific (P2) ---

    private bedrockVersionCache: { latest: string, versions: string[], timestamp: number } | null = null;
    private readonly BEDROCK_CACHE_TTL = 1000 * 60 * 60; // 1 hour

    /**
     * Resolves dynamic Bedrock versions from the version service.
     */
    async fetchBedrockVersions(): Promise<{ latest: string, versions: string[] }> {
        return bedrockVersionService.getVersions();
    }

    async installBedrock(serverId: string, serverDir: string, version: string, onProgress?: (msg: string, percent?: number) => void) {
        // Resolve 'latest' to verified working binary version
        if (version === 'latest') {
            const bv = await bedrockVersionService.getVersions();
            version = bv.latest;
        }
    
        try {
            await SafeFileOperation.checkDiskSpace(serverDir);
            logger.info(`[Installer] Starting Bedrock install for v${version}. Platform: ${process.platform}`);
            const pMsg = `Preparing Bedrock ${version} installation...`;
            this.updateProgress(serverId, pMsg, 0);
            onProgress?.(pMsg);
            
            const platform = process.platform === 'win32' ? 'win' : 'linux';
            const downloadUrl = `https://www.minecraft.net/bedrockdedicatedserver/bin-${platform}/bedrock-server-${version}.zip`;
            
            logger.info(`[Installer] Bedrock Download Link: ${downloadUrl}`);
            const zipPath = path.join(serverDir, 'bedrock.zip');
            const cacheZipPath = path.join(BEDROCK_CACHE_DIR, `bedrock-server-${version}-${platform}.zip`);
            
            await fs.ensureDir(serverDir);
            await fs.ensureDir(BEDROCK_CACHE_DIR);

            // --- Cache Handling ---
            if (!await fs.pathExists(cacheZipPath)) {
                logger.info(`[Installer] Bedrock Cache MISS: Downloading to ${cacheZipPath}`);
                this.updateProgress(serverId, `Downloading Bedrock ${version} (${platform})...`, 0);
                onProgress?.(`Downloading Bedrock ${version} (${platform})...`, 0);
                try {
                    await this.downloadFile(downloadUrl, cacheZipPath, onProgress, serverId);
                } catch (err: any) {
                    logger.error(`[Installer] Bedrock download failed: ${err.message}`);
                    if (err.message.includes('DNS Resolution failed')) throw err;
                    throw new Error(`Failed to download Bedrock server from ${downloadUrl}. Error: ${err.message}. Please check your internet connection or try a manual binary upload via the "Files" tab.`);
                }
            } else {
                logger.info(`[Installer] Bedrock Cache HIT: ${cacheZipPath}`);
                this.updateProgress(serverId, `Using cached Bedrock ${version} binaries...`, 20);
            }
            
            const eMsg = 'Extracting Bedrock binaries...';
            this.updateProgress(serverId, eMsg, 30);
            onProgress?.(eMsg);

            logger.info('[Installer] Extracting Bedrock binaries...');
            const zip = new AdmZip(cacheZipPath);
            const totalEntries = zip.getEntries().length;
            let extractedCount = 0;

            await extract(cacheZipPath, { 
                dir: serverDir,
                onEntry: (entry) => {
                    extractedCount++;
                    if (extractedCount % 50 === 0 || extractedCount === totalEntries) {
                        const percent = 30 + Math.round((extractedCount / totalEntries) * 70);
                        const msg = `Extracting Bedrock binaries... (${extractedCount}/${totalEntries})`;
                        this.updateProgress(serverId, msg, percent);
                        onProgress?.(msg, percent);
                    }
                }
            });

            // --- Flattening ---
            // Some zip versions might contain a subfolder. Let's check.
            const exeName = process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server';
            const exePath = path.join(serverDir, exeName);

            if (!(await fs.pathExists(exePath))) {
                logger.info(`[Installer] ${exeName} not found in root. Checking for nested folder...`);
                const items = await fs.readdir(serverDir);
                const subDirs = items.filter(f => !['eula.txt', 'server.properties', 'bedrock.zip'].includes(f));
                
                if (subDirs.length === 1) {
                    const nestedDir = path.join(serverDir, subDirs[0]);
                    if ((await fs.stat(nestedDir)).isDirectory()) {
                        logger.info(`[Installer] Found single subfolder: ${subDirs[0]}. Flattening...`);
                        const nestedFiles = await fs.readdir(nestedDir);
                        const protectedFiles = ['server.properties', 'allowlist.json', 'permissions.json', 'whitelist.json', 'valid_known_packs.json', 'world_behavior_packs.json', 'world_resource_packs.json'];
                        
                        for (const file of nestedFiles) {
                            const targetPath = path.join(serverDir, file);
                            const shouldOverwrite = !protectedFiles.includes(file) || !(await fs.pathExists(targetPath));
                            
                            if (shouldOverwrite) {
                                await fs.move(path.join(nestedDir, file), targetPath, { overwrite: true });
                            } else {
                                logger.info(`[Installer] Protecting existing config file: ${file}`);
                                await fs.remove(path.join(nestedDir, file)); // Clean up the source even if skipped
                            }
                        }
                        await fs.remove(nestedDir);
                    }
                }
            }
            
            // Platform Specific Hardening
            if (process.platform !== 'win32') {
                const execPath = path.join(serverDir, 'bedrock_server');
                if (await fs.pathExists(execPath)) {
                    await fs.chmod(execPath, '755');
                    logger.info(`[Installer] Set executable permissions on bedrock_server (755)`);
                }
            } else {
                 const winExePath = path.join(serverDir, 'bedrock_server.exe');
                 if (await fs.pathExists(winExePath)) {
                      logger.info(`[Installer] Bedrock Executable verified at: ${winExePath}`);
                 } else {
                      logger.warn(`[Installer] CRITICAL: Bedrock Executable (bedrock_server.exe) NOT FOUND after extraction/flattening!`);
                 }
            }

            const cMsg = 'Bedrock Installation Complete';
            this.updateProgress(serverId, 'Bedrock installation complete.', 100);
            onProgress?.('Bedrock installation complete.', 100);
            setTimeout(() => this.clearProgress(serverId), 2000);

        } catch (e) {
            logger.error(`Bedrock install failed: ${e}`);
            this.clearProgress(serverId);
            throw e;
        }
    }

    /**
     * Installs Velocity Proxy
     */
    async installVelocity(serverId: string, serverDir: string, options: { version: string, build?: string }, onProgress?: (msg: string, percent?: number) => void) {
        const { version, build = 'latest' } = options;
        try {
            await SafeFileOperation.checkDiskSpace(serverDir, 200); // Proxies are light
            this.updateProgress(serverId, `Preparing Velocity ${version}...`, 0);
            const vMsg = `Preparing Velocity ${version} installation...`;
            onProgress?.(vMsg);

            const maxRetries = 3;
            let attempt = 0;

            while (attempt < maxRetries) {
                try {
                    attempt++;
                    const msg = `Fetching Velocity builds (Attempt ${attempt})...`;
                    this.updateProgress(serverId, msg);
                    onProgress?.(msg);
                    
                    let targetBuild = build;
                    if (build === 'latest') {
                        let buildsUrl = `https://api.papermc.io/v2/projects/velocity/versions/${version}/builds`;
                        let buildsRes;
                        try {
                            buildsRes = await axios.get(buildsUrl, { timeout: 10000 });
                        } catch (err: any) {
                            // If version 404s and doesn't have -SNAPSHOT, try with -SNAPSHOT
                            if (err.response?.status === 404 && !version.includes('-SNAPSHOT')) {
                                logger.warn(`[Installer] Velocity ${version} 404'd. Retrying with ${version}-SNAPSHOT...`);
                                buildsUrl = `https://api.papermc.io/v2/projects/velocity/versions/${version}-SNAPSHOT/builds`;
                                buildsRes = await axios.get(buildsUrl, { timeout: 10000 });
                                // Update version for the jarName construction below
                                (options as any).version = `${version}-SNAPSHOT`;
                            } else {
                                throw err;
                            }
                        }
                        const builds = (buildsRes.data as any).builds;
                        if (!builds || builds.length === 0) throw new Error('No builds found for this version');
                        targetBuild = builds[builds.length - 1].build;
                    }

                    const currentVersion = (options as any).version || version;
                    const jarName = `velocity-${currentVersion}-${targetBuild}.jar`;
                    const downloadUrl = `https://api.papermc.io/v2/projects/velocity/versions/${currentVersion}/builds/${targetBuild}/downloads/${jarName}`;
                    const dest = path.join(serverDir, 'velocity.jar');

                    await fs.ensureDir(serverDir);
                    const dMsg = `Downloading Velocity ${version} (Build ${targetBuild})...`;
                    this.updateProgress(serverId, dMsg, 10);
                    onProgress?.(dMsg, 0);
                    await this.downloadFile(downloadUrl, dest, onProgress, serverId);
                    
                    // Generate basic velocity.toml
                    const configPath = path.join(serverDir, 'velocity.toml');
                    if (!(await fs.pathExists(configPath))) {
                        const defaultConfig = `
# Velocity Configuration
# Generated by CraftCommand

bind = "0.0.0.0:25565"
motd = "A Velocity Proxy"
show-max-players = 500
online-mode = true
player-info-forwarding-mode = "modern"

[servers]
# Backends will be synced here automatically by CraftCommand

[forced-hosts]
# Forced hosts will be synced here automatically

[advanced]
        `;
                        await fs.writeFile(configPath, defaultConfig.trim());
                    }

                    const cMsg = 'Installation Complete';
                    this.updateProgress(serverId, cMsg, 100);
                    onProgress?.(cMsg);

                    // Update server config to use velocity.jar as the executable
                    try {
                        const { getServer, saveServer } = await import('../servers/ServerService');
                        const server = getServer(serverId);
                        if (server) {
                            server.executable = 'velocity.jar';
                            saveServer(server);
                            logger.info(`[Installer:${serverId}] Updated executable to velocity.jar`);
                        }
                    } catch (err) {
                        logger.error(`[Installer:${serverId}] Failed to update executable: ${err}`);
                    }

                    setTimeout(() => this.clearProgress(serverId), 2000);
                    return true;

                } catch (e: any) {
                    logger.error(`Velocity install attempt ${attempt} failed: ${e.message}`);
                    if (attempt >= maxRetries) {
                        throw new Error(`Failed to install Velocity after ${maxRetries} attempts: ${e.message}`);
                    }
                    await new Promise(r => setTimeout(r, 2000 * attempt)); // Exponential backoff
                }
            }
        } catch (e) {
            logger.error(`Velocity install failed: ${e}`);
            this.clearProgress(serverId);
            throw e;
        }
        return false;
    }
}

export const installerService = new InstallerService();
