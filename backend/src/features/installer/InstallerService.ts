import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import AdmZip from 'adm-zip';
import extract from 'extract-zip';
import { EventEmitter } from 'events';
import { SafeFileOperation } from '../../utils/fs';
import { logger } from '../../utils/logger';

const CACHE_DIR = path.join(process.cwd(), 'cache');
const BEDROCK_CACHE_DIR = path.join(CACHE_DIR, 'bedrock');

export class InstallerService extends EventEmitter {
    
    // Phase 56.3: Track active progress for session recovery
    private activeProgress: Map<string, { percent: number, message: string }> = new Map();

    public getActiveProgress() {
        return Object.fromEntries(this.activeProgress);
    }

    private updateProgress(serverId: string, message: string, percent?: number) {
        if (!serverId) return;
        const current = this.activeProgress.get(serverId) || { percent: 0, message: '' };
        const newPercent = percent !== undefined ? percent : current.percent;
        this.activeProgress.set(serverId, { percent: newPercent, message });
        this.emit('status', { serverId, message, percent: newPercent });
    }

    private clearProgress(serverId: string) {
        if (!serverId) return;
        this.activeProgress.delete(serverId);
    }

    // Download a file with progress events
    async downloadFile(url: string, destPath: string, onProgress?: (msg: string, percent?: number) => void, serverId?: string) {
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

            const totalLength = parseInt(response.headers['content-length'] || '0', 10);
            
            this.emit('progress', {
                total: totalLength,
                current: 0,
                percent: 0
            });

            let current = 0;
            const dataStream = response.data as any;
            dataStream.on('data', (chunk: any) => {
                current += chunk.length;
                const percent = totalLength > 0 ? Math.round((current / totalLength) * 100) : 0;
                
                this.emit('progress', {
                    total: totalLength,
                    current: current,
                    percent: percent
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
                const buildsRes = await axios.get(buildsUrl);
                const builds = (buildsRes.data as any).builds;
                build = builds[builds.length - 1].build;
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
            console.error('Paper install failed', e);
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
            await this.downloadFile(downloadUrl, dest, onProgress, serverId);
            
            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
            
            const cMsg = 'Installation Complete';
            this.updateProgress(serverId, cMsg, 100);
            onProgress?.(cMsg);
            setTimeout(() => this.clearProgress(serverId), 2000);
            return true;

        } catch (e) {
            console.error('Purpur install failed', e);
            this.clearProgress(serverId);
            throw e;
        }
    }

    // Install CurseForge/Modrinth Modpack or Single Mod
    async installModpackFromZip(serverId: string, serverDir: string, zipUrl: string, mcVersion?: string, onProgress?: (msg: string, percent?: number) => void) {
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
                const vRes = await axios.get(`https://api.modrinth.com/v2/project/${projectId}/version`);
                const version = (vRes.data as any)[0];
                const file = version.files.find((f: any) => f.primary) || version.files[0];
                zipUrl = file.url;
                downloadFileName = file.filename || zipUrl.split('/').pop() || 'modpack.zip';
                this.emit('status', `Resolved to: ${version.name} (${downloadFileName})`);
            } else {
                downloadFileName = zipUrl.split('?')[0].split('/').pop() || 'modpack.zip';
            }

            const isSingleMod = downloadFileName.endsWith('.jar');
            const isMrpack = downloadFileName.endsWith('.mrpack');

            if (isSingleMod) {
                // --- SINGLE MOD INSTALLATION ---
                this.emit('status', `Detected Single Mod Jar. Installing into mods/ ...`);
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
                
                this.emit('status', `Single Mod installed. Detected Loader: ${loader}`);
                
                if (mcVersion) {
                    this.emit('status', `Auto-Installing ${loader} for ${mcVersion}...`);
                    if (loader === 'Fabric') await this.installFabric(serverId, serverDir, mcVersion);
                    else if (loader === 'NeoForge') await this.installNeoForge(serverId, serverDir, mcVersion);
                    else if (loader === 'Forge') await this.installForge(serverId, serverDir, mcVersion);
                } else {
                    this.emit('status', `WARNING: Minecraft version not provided. Base server not installed.`);
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

                this.emit('status', `Detected Modrinth Pack: Minecraft ${mrpackMcVersion}, Loader ${loader}`);

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
                            const res = await axios({ method: 'GET', url: f.downloads[0], responseType: 'stream' });
                            const writer = fs.createWriteStream(destPath);
                            (res.data as any).pipe(writer);
                            await new Promise((resolve, reject) => {
                                writer.on('finish', () => resolve(true));
                                writer.on('error', reject);
                            });
                        } catch (err: any) {
                             console.log(`[Installer] Failed to download ${f.path}:`, err.message);
                             this.emit('status', `Warning: Failed to download ${f.path}`);
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
                this.emit('status', overridesMsg);
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
                    this.emit('status', `Auto-Installing ${loader} for ${mrpackMcVersion}...`);
                    if (loader === 'Fabric') await this.installFabric(serverId, serverDir, mrpackMcVersion);
                    else if (loader === 'NeoForge') await this.installNeoForge(serverId, serverDir, mrpackMcVersion);
                    else if (loader === 'Forge') await this.installForge(serverId, serverDir, mrpackMcVersion);
                    
                    this.emit('status', `${loader} Installed. Modrinth Pack Ready.`);
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
                        this.emit('status', msg);
                        onProgress?.(msg, percent);
                    }
                }
            });

            // ANALYZE PACK TYPE
            const packType = await this.scanModpackType(tempExtractDir);
            console.log(`[Installer] Detected Modpack Type: ${packType.type} (${packType.loader || 'None'})`);

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
            this.emit('status', iMsg);
            onProgress?.(iMsg);
            await fs.copy(rootContentDir, serverDir, { overwrite: true });

            // Cleanup temp
            await fs.remove(tempExtractDir);
            await fs.remove(zipPath);

            // SMART INSTALLER LOGIC
            if (packType.type === 'CLIENT_PACK') {
                this.emit('status', `Detected Client-Only Modpack (${packType.loader}). Checking Version...`);
                
                if (mcVersion) {
                    this.emit('status', `Auto-Installing ${packType.loader} for ${mcVersion}...`);
                    
                    if (packType.loader === 'Fabric') {
                        await this.installFabric(serverId, serverDir, mcVersion);
                    } else if (packType.loader === 'NeoForge') {
                        await this.installNeoForge(serverId, serverDir, mcVersion);
                    } else if (packType.loader === 'Forge') {
                        await this.installForge(serverId, serverDir, mcVersion);
                    }
                    
                    this.emit('status', `${packType.loader} Installed. Client Pack Ready.`);

                } else {
                    this.emit('status', `WARNING: Client Pack detected (${packType.loader}) but no Minecraft version provided.`);
                    this.emit('status', `Please manually install ${packType.loader} if the server fails to start.`);
                }
            } 
            
            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
            const cMsg = 'Modpack Installed.';
            this.updateProgress(serverId, cMsg, 100);
            onProgress?.(cMsg);
            setTimeout(() => this.clearProgress(serverId), 2000);
            
        } catch (e) {
             console.error('Modpack install failed', e);
             this.clearProgress(serverId);
             await fs.remove(path.join(serverDir, 'temp_extract')).catch(() => {});
             throw e;
        }
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
            if (!versionData) throw new Error(`Version ${version} not found in Mojang manifest`);

            const versionMetaRes = await axios.get(versionData.url);
            const downloadUrl = (versionMetaRes.data as any).downloads.server.url;
            
            const dest = path.join(serverDir, 'server.jar');
            await fs.ensureDir(serverDir);
            
            this.updateProgress(serverId, 'Downloading Vanilla Jar...', 20);
            onProgress?.('Downloading Vanilla Jar...', 0);
            await this.downloadFile(downloadUrl, dest, onProgress, serverId);
            
            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
            this.updateProgress(serverId, 'Installation Complete', 100);
            setTimeout(() => this.clearProgress(serverId), 2000);
            
        } catch (e) {
            console.error('Vanilla install failed', e);
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

        } catch (e) {
            console.error('Fabric install failed', e);
            this.clearProgress(serverId);
            throw e;
        }
    }
    // Install Forge
    async installForge(serverId: string, serverDir: string, version: string, localModpack?: string, build?: string, onProgress?: (msg: string, percent?: number) => void) {
        try {
            await SafeFileOperation.checkDiskSpace(serverDir, 1000); // Modded servers need 1GB min
            const { javaManager } = await import('../processes/JavaManager');
            const { validateBuildId } = await import('../../utils/validation');

            if (build && !validateBuildId(build)) {
                throw new Error('Invalid Build ID format.');
            }
            console.log(`[Installer:Forge] Starting install for ${version}. LocalModpack: ${localModpack || 'None'}`);

            // Determine Java version for installer (Modern Forge needs modern java)
            const mcMajor = parseInt(version.split('.')[1]);
            let requiredJava = 'Java 17';
            if (mcMajor >= 21) requiredJava = 'Java 21';
            else if (mcMajor >= 17) requiredJava = 'Java 17';
            else if (mcMajor <= 16 && mcMajor >= 12) requiredJava = 'Java 11'; // Forge 1.12-1.16 usually prefer 8 but some work with 11
            else requiredJava = 'Java 8';

            console.log(`[Installer:Forge] Ensuring ${requiredJava} exists...`);
            const javaPath = await javaManager.ensureJava(requiredJava);
            console.log(`[Installer:Forge] Java ready at: ${javaPath}`);

            // Extract Local Modpack if provided
            if (localModpack) {
                const msg = `Extracting custom modpack: ${localModpack}...`;
                console.log(`[Installer:Forge] ${msg}`);
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
                            this.emit('status', msg);
                            onProgress?.(msg, percent);
                        }
                    }
                    });
                    const msg = `Modpack extracted successfully (${entryCount} files installed).`;
                    console.log(`[Installer:Forge] ${msg}`);
                    this.emit('status', msg);
                    onProgress?.(msg);
                }

                // --- Smart-Flatten Logic ---
                const entries = await fs.readdir(serverDir);
                const candidates = entries.filter(e => e !== localModpack && e !== '__MACOSX' && !e.startsWith('.'));
                
                if (candidates.length === 1) {
                    const singleDir = path.join(serverDir, candidates[0]);
                    const stats = await fs.stat(singleDir);
                    if (stats.isDirectory()) {
                        const msg = `Detected nested modpack structure. Flattening...`;
                        console.log(`[Installer:Forge] ${msg}`);
                        this.emit('status', msg);
                        onProgress?.(msg);
                        
                        const subEntries = await fs.readdir(singleDir);
                        for (const sub of subEntries) {
                            await fs.move(path.join(singleDir, sub), path.join(serverDir, sub), { overwrite: true });
                        }
                        await fs.remove(singleDir);
                        console.log(`[Installer:Forge] Modpack flattened successfully.`);
                        onProgress?.('Modpack flattened.');
                    }
                }
            }

            this.emit('status', `Fetching Forge version for ${version}...`);
            
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
            console.log(`[Installer:Forge] Downloading Installer...`);
            onProgress?.(`Downloading Forge Installer...`, 80); // Extraction was at 80%
            await this.downloadFile(installerUrl, installerPath, (msg, pct) => {
                // Map download percentage (0-100) to sub-range 80-95
                const mappedPercent = 80 + Math.round((pct || 0) * 0.15);
                this.updateProgress(serverId, msg, mappedPercent);
                onProgress?.(msg, mappedPercent);
            }, serverId);

            this.emit('status', 'Running Forge Installer (This may take a minute)...');
            console.log(`[Installer:Forge] Running Forge Installer...`);
            
            // Run the installer with the resolved java path
            const { spawn } = await import('child_process');
            
            await new Promise((resolve, reject) => {
                const child = spawn(javaPath, ['-jar', 'forge-installer.jar', '--installServer'], {
                    cwd: serverDir,
                    stdio: 'pipe'
                });

                child.stdout.on('data', (data) => console.log(`[Forge] ${data}`));
                child.stderr.on('data', (data) => console.error(`[Forge Error] ${data}`));

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
                this.emit('status', 'Forge installed. Using run.bat');
                return 'run.bat';
            }

            // Priority 2: forge-*.jar (Older Forge)
            const forgeJar = files.find(f => f.startsWith('forge-') && f.endsWith('.jar') && !f.includes('installer'));
            if (forgeJar) {
                 this.emit('status', `Forge installed. Using ${forgeJar}`);
                 return forgeJar;
            }

            this.updateProgress(serverId, 'Forge installed.', 100);
            setTimeout(() => this.clearProgress(serverId), 2000);
            return 'run.bat'; // Default fallback

        } catch (e) {
            console.error('Forge install failed', e);
            this.clearProgress(serverId);
            throw e;
        }
    }

    // Install NeoForge
    async installNeoForge(serverId: string, serverDir: string, version: string, build?: string, onProgress?: (msg: string, percent?: number) => void) {
        try {
            await SafeFileOperation.checkDiskSpace(serverDir, 1000); // Modded servers need 1GB min
            const { javaManager } = await import('../processes/JavaManager');
            const { validateBuildId } = await import('../../utils/validation');

            if (build && !validateBuildId(build)) {
                throw new Error('Invalid Build ID format.');
            }

            // NeoForge is almost exclusively Java 21+ for 1.20.6+, or 17 for 1.20.1
            const mcMajor = parseInt(version.split('.')[1]);
            const mcMinor = parseInt(version.split('.')[2] || '0');
            
            let requiredJava = 'Java 21';
            // 1.20.4 and below use Java 17, 1.20.5+ use Java 21
            if (mcMajor === 20 && mcMinor <= 4) requiredJava = 'Java 17';

            const jMsg = `Ensuring ${requiredJava} exists...`;
            this.emit('status', jMsg);
            onProgress?.(jMsg);
            const javaPath = await javaManager.ensureJava(requiredJava);

            const vMsg = `Fetching NeoForge version for ${version}...`;
            this.emit('status', vMsg);
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

        } catch (e) {
            console.error('NeoForge install failed', e);
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
                this.emit('status', 'Spigot Downloaded successfully.');
            } catch (e) {
                this.emit('status', 'Mirror failed. Falling back to BuildTools (Slow)...');
                // BuildTools logic would go here... for now we'll throw
                throw new Error('Spigot download failed. No mirror found for this version.');
            }

            this.updateProgress(serverId, 'Installation Complete', 100);
            setTimeout(() => this.clearProgress(serverId), 2000);

        } catch (e) {
            console.error('Spigot install failed', e);
            this.clearProgress(serverId);
            throw e;
        }
    }
    // Install Spark Profiler
    async installSpark(serverDir: string) {
        console.log('[Installer] Installing Spark Profiler...');
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
        console.log('[Installer] Spark installed.');
    }

    // --- Bedrock Specific (P2) ---

    private bedrockVersionCache: { latest: string, versions: string[], timestamp: number } | null = null;
    private readonly BEDROCK_CACHE_TTL = 1000 * 60 * 60; // 1 hour

    /**
     * Scrapes the official Minecraft download page for the latest BDS versions.
     */
    async fetchBedrockVersions(): Promise<{ latest: string, versions: string[] }> {
        if (this.bedrockVersionCache && (Date.now() - this.bedrockVersionCache.timestamp < this.BEDROCK_CACHE_TTL)) {
            return this.bedrockVersionCache;
        }

        /* 
        // Scraping disabled due to inconsistent Minecraft.net manifest updates causing 404s.
        // Transitioning to hardcoded verified versions (v1.11.8).
        // Primary source: Scrape from multiple locales to ensure we hit the latest manifest
        const locales = ['en-us', 'fr-fr'];
        
        for (const locale of locales) {
            try {
                this.emit('status', `Consulting official Bedrock manifest (${locale})...`);
                const response = await axios.get(`https://www.minecraft.net/${locale}/download/server/bedrock`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    timeout: 5000
                });

                const html = response.data as string;
                const matches = html.match(/bedrock-server-([0-9\.]+)\.zip/g);
                if (matches) {
                    let versions = [...new Set(matches.map((m: string) => m.match(/bedrock-server-([0-9\.]+)\.zip/)![1]))] as string[];
                    
                    const stableVersions = versions.filter(v => {
                        const isPreview = html.includes(`bedrock-server-${v}.zip`) && 
                                         (html.split(`bedrock-server-${v}.zip`)[1].split('>')[0].toLowerCase().includes('preview') ||
                                          html.split(`bedrock-server-${v}.zip`)[1].substring(0, 100).toLowerCase().includes('preview'));
                        return !isPreview;
                    });

                    if (stableVersions.length > 0) {
                        versions = stableVersions;
                    }

                    versions.sort((a, b) => {
                       const pa = a.split('.').map(Number);
                       const pb = b.split('.').map(Number);
                       for(let i=0; i<Math.max(pa.length, pb.length); i++) {
                           if ((pa[i] || 0) > (pb[i] || 0)) return -1;
                           if ((pa[i] || 0) < (pb[i] || 0)) return 1;
                       }
                       return 0;
                    });

                    this.bedrockVersionCache = {
                        latest: versions[0],
                        versions: versions,
                        timestamp: Date.now()
                    };
                    return this.bedrockVersionCache;
                }
            } catch (e) {
                console.warn(`[Installer] Bedrock version scrape failed for ${locale}:`, e.message);
            }
        }
        */

        // Verified stable version for v1.11.8
        return {
            latest: '1.26.1.1',
            versions: ['1.26.1.1', '1.26.0.2', '1.21.11.01']
        };
    }

    async installBedrock(serverId: string, serverDir: string, version: string, onProgress?: (msg: string, percent?: number) => void) {
    // Phase 11.8: Resolve 'latest' to verified working link version
    if (version === 'latest') version = '1.26.1.1';
    
    try {
            await SafeFileOperation.checkDiskSpace(serverDir);
            console.log(`[Installer] Starting Bedrock install for v${version}. Platform: ${process.platform}`);
            const pMsg = `Preparing Bedrock ${version} installation...`;
            this.updateProgress(serverId, pMsg, 0);
            onProgress?.(pMsg);
            
            const platform = process.platform === 'win32' ? 'win' : 'linux';
            const downloadUrl = `https://www.minecraft.net/bedrockdedicatedserver/bin-${platform}/bedrock-server-${version}.zip`;
            
            console.log(`[Installer] Bedrock Download Link: ${downloadUrl}`);
            const zipPath = path.join(serverDir, 'bedrock.zip');
            const cacheZipPath = path.join(BEDROCK_CACHE_DIR, `bedrock-server-${version}-${platform}.zip`);
            
            await fs.ensureDir(serverDir);
            await fs.ensureDir(BEDROCK_CACHE_DIR);

            // --- Cache Handling ---
            if (!await fs.pathExists(cacheZipPath)) {
                console.log(`[Installer] Bedrock Cache MISS: Downloading to ${cacheZipPath}`);
                this.updateProgress(serverId, `Downloading Bedrock ${version} (${platform})...`, 0);
                onProgress?.(`Downloading Bedrock ${version} (${platform})...`, 0);
                try {
                    await this.downloadFile(downloadUrl, cacheZipPath, onProgress, serverId);
                } catch (err: any) {
                    console.error(`[Installer] Bedrock download failed: ${err.message}`);
                    if (err.message.includes('DNS Resolution failed')) throw err;
                    throw new Error(`Failed to download Bedrock server from ${downloadUrl}. Error: ${err.message}. Please check your internet connection or try a manual binary upload via the "Files" tab.`);
                }
            } else {
                console.log(`[Installer] Bedrock Cache HIT: ${cacheZipPath}`);
                this.updateProgress(serverId, `Using cached Bedrock ${version} binaries...`, 20);
            }
            
            const eMsg = 'Extracting Bedrock binaries...';
            this.updateProgress(serverId, eMsg, 30);
            onProgress?.(eMsg);

            logger.info('[Installer] Extracting Java runtime...');
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

            // --- Smart Flattening (v1.10.1) ---
            // Some zip versions might contain a subfolder. Let's check.
            const exeName = process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server';
            const exePath = path.join(serverDir, exeName);

            if (!(await fs.pathExists(exePath))) {
                console.log(`[Installer] ${exeName} not found in root. Checking for nested folder...`);
                const items = await fs.readdir(serverDir);
                const subDirs = items.filter(f => !['eula.txt', 'server.properties', 'bedrock.zip'].includes(f));
                
                if (subDirs.length === 1) {
                    const nestedDir = path.join(serverDir, subDirs[0]);
                    if ((await fs.stat(nestedDir)).isDirectory()) {
                        console.log(`[Installer] Found single subfolder: ${subDirs[0]}. Flattening...`);
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
                    console.log(`[Installer] Set executable permissions on bedrock_server (755)`);
                }
            } else {
                 const winExePath = path.join(serverDir, 'bedrock_server.exe');
                 if (await fs.pathExists(winExePath)) {
                      console.log(`[Installer] Bedrock Executable verified at: ${winExePath}`);
                 } else {
                      console.warn(`[Installer] CRITICAL: Bedrock Executable (bedrock_server.exe) NOT FOUND after extraction/flattening!`);
                 }
            }

            const cMsg = 'Bedrock Installation Complete';
            this.updateProgress(serverId, 'Bedrock installation complete.', 100);
            onProgress?.('Bedrock installation complete.', 100);
            setTimeout(() => this.clearProgress(serverId), 2000);

        } catch (e) {
            console.error('Bedrock install failed', e);
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
                        const buildsUrl = `https://api.papermc.io/v2/projects/velocity/versions/${version}/builds`;
                        const buildsRes = await axios.get(buildsUrl, { timeout: 10000 });
                        const builds = (buildsRes.data as any).builds;
                        if (!builds || builds.length === 0) throw new Error('No builds found for this version');
                        targetBuild = builds[builds.length - 1].build;
                    }

                    const jarName = `velocity-${version}-${targetBuild}.jar`;
                    const downloadUrl = `https://api.papermc.io/v2/projects/velocity/versions/${version}/builds/${targetBuild}/downloads/${jarName}`;
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
                    setTimeout(() => this.clearProgress(serverId), 2000);
                    return true;

                } catch (e: any) {
                    console.error(`Velocity install attempt ${attempt} failed`, e.message);
                    if (attempt >= maxRetries) {
                        throw new Error(`Failed to install Velocity after ${maxRetries} attempts: ${e.message}`);
                    }
                    await new Promise(r => setTimeout(r, 2000 * attempt)); // Exponential backoff
                }
            }
        } catch (e) {
            console.error('Velocity install failed', e);
            this.clearProgress(serverId);
            throw e;
        }
        return false;
    }
}

export const installerService = new InstallerService();
