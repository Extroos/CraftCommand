
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import AdmZip from 'adm-zip';
import extract from 'extract-zip';
import { EventEmitter } from 'events';

export class InstallerService extends EventEmitter {
    
    // Download a file with progress events
    async downloadFile(url: string, destPath: string) {
        console.log(`[Installer] Downloading ${url} to ${destPath}`);
        const writer = fs.createWriteStream(destPath);
        
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        const totalLength = response.headers['content-length'];

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            let downloaded = 0;
            response.data.on('data', (chunk: Buffer) => {
                downloaded += chunk.length;
                if (totalLength) {
                    const progress = Math.round((downloaded / parseInt(totalLength)) * 100);
                    this.emit('progress', { type: 'download', progress, file: path.basename(destPath) });
                }
            });

            writer.on('finish', () => resolve(null));
            writer.on('error', reject);
        });
    }

    // Install PaperMC
    async installPaper(serverDir: string, version: string, build: string = 'latest') {
        try {
            this.emit('status', 'Fetching PaperMC builds...');
            if (build === 'latest') {
                const buildsUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds`;
                const buildsRes = await axios.get(buildsUrl);
                const builds = buildsRes.data.builds;
                build = builds[builds.length - 1].build;
            }

            const jarName = `paper-${version}-${build}.jar`;
            const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${build}/downloads/${jarName}`;
            const dest = path.join(serverDir, 'server.jar');

            await fs.ensureDir(serverDir);
            await this.downloadFile(downloadUrl, dest);
            
            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
            
            this.emit('status', 'Installation Complete');
            return true;

        } catch (e) {
            console.error('Paper install failed', e);
            throw e;
        }
    }

    // Install Purpur
    async installPurpur(serverDir: string, version: string, build: string = 'latest') {
        try {
            this.emit('status', 'Fetching Purpur builds...');
            
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
            this.emit('status', `Downloading Purpur ${version}...`);
            await this.downloadFile(downloadUrl, dest);
            
            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
            
            this.emit('status', 'Installation Complete');
            return true;

        } catch (e) {
            console.error('Purpur install failed', e);
            throw e;
        }
    }

    // Install CurseForge/Modrinth Modpack
    async installModpackFromZip(serverDir: string, zipUrl: string) {
        try {
            await fs.ensureDir(serverDir);
            
            // Resolve Modrinth ID if needed
            if (zipUrl.startsWith('modrinth:')) {
                const projectId = zipUrl.split(':')[1];
                this.emit('status', `Resolving Modrinth Project ${projectId}...`);
                // Get versions
                const vRes = await axios.get(`https://api.modrinth.com/v2/project/${projectId}/version`);
                // Find a valid modpack file (usually the first one that is a zip and has correct loaders)
                const version = vRes.data[0]; // Naive 'latest'
                const file = version.files.find((f: any) => f.primary) || version.files[0];
                zipUrl = file.url;
                this.emit('status', `Resolved to: ${version.name}`);
            }

            const zipPath = path.join(serverDir, 'modpack.zip');
            
            this.emit('status', 'Downloading Modpack...');
            await this.downloadFile(zipUrl, zipPath);
            
            this.emit('status', 'Extracting Modpack...');
            const zip = new AdmZip(zipPath);
            
            // Extract files individually to preserve encoding
            const entries = zip.getEntries();
            for (const entry of entries) {
                if (!entry.isDirectory) {
                    const targetPath = path.join(serverDir, entry.entryName);
                    await fs.ensureDir(path.dirname(targetPath));
                    // Extract as buffer to preserve binary data
                    const data = entry.getData();
                    await fs.writeFile(targetPath, data);
                }
            }
            
            await fs.remove(zipPath);
            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');

            this.emit('status', 'Modpack Extracted. You may need to run the Forge Installer manually if not included.');
            
        } catch (e) {
             console.error('Modpack install failed', e);
             throw e;
        }
    }

    // Install Vanilla (Mojang)
    async installVanilla(serverDir: string, version: string) {
        try {
            this.emit('status', 'Fetching Vanilla manifest...');
            const manifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
            const manifestRes = await axios.get(manifestUrl);
            
            const versionData = manifestRes.data.versions.find((v: any) => v.id === version);
            if (!versionData) throw new Error(`Version ${version} not found in Mojang manifest`);

            const versionMetaRes = await axios.get(versionData.url);
            const downloadUrl = versionMetaRes.data.downloads.server.url;
            
            const dest = path.join(serverDir, 'server.jar');
            await fs.ensureDir(serverDir);
            
            this.emit('status', 'Downloading Vanilla Jar...');
            await this.downloadFile(downloadUrl, dest);
            
            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
            this.emit('status', 'Installation Complete');
            
        } catch (e) {
            console.error('Vanilla install failed', e);
            throw e;
        }
    }

    // Install Fabric
    async installFabric(serverDir: string, version: string) {
        try {
            this.emit('status', 'Fetching Fabric versions...');
            const loaderRes = await axios.get('https://meta.fabricmc.net/v2/versions/loader');
            const loaderVersion = loaderRes.data[0].version; 
            const installerVersion = '1.0.1';

            const downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${version}/${loaderVersion}/${installerVersion}/server/jar`;
            
            const dest = path.join(serverDir, 'server.jar');
            await fs.ensureDir(serverDir);
            
            this.emit('status', `Downloading Fabric for ${version}...`);
            await this.downloadFile(downloadUrl, dest);
            
            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
            this.emit('status', 'Installation Complete');

        } catch (e) {
            console.error('Fabric install failed', e);
            throw e;
        }
    }
    // Install Forge
    async installForge(serverDir: string, version: string, localModpack?: string) {
        try {
            const { javaManager } = await import('./JavaManager');
            // Determine Java version for installer (Modern Forge needs modern java)
            const mcMajor = parseInt(version.split('.')[1]);
            let requiredJava = 'Java 17';
            if (mcMajor >= 21) requiredJava = 'Java 21';
            else if (mcMajor >= 17) requiredJava = 'Java 17';
            else if (mcMajor <= 16 && mcMajor >= 12) requiredJava = 'Java 11'; // Forge 1.12-1.16 usually prefer 8 but some work with 11
            else requiredJava = 'Java 8';

            const javaPath = await javaManager.ensureJava(requiredJava);

            // Extract Local Modpack if provided
            if (localModpack) {
                this.emit('status', `Extracting custom modpack: ${localModpack}...`);
                const zipPath = path.join(serverDir, localModpack);
                if (await fs.pathExists(zipPath)) {
                    await extract(zipPath, { dir: serverDir });
                    this.emit('status', 'Modpack extracted successfully.');
                }
            }

            this.emit('status', `Fetching Forge version for ${version}...`);
            const promoRes = await axios.get('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
            const promos = promoRes.data.promos;
            
            const forgeVersion = promos[`${version}-recommended`] || promos[`${version}-latest`];
            if (!forgeVersion) {
                throw new Error(`No Forge version found for Minecraft ${version}`);
            }

            const longVersion = `${version}-${forgeVersion}`;
            const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${longVersion}/forge-${longVersion}-installer.jar`;
            
            const installerPath = path.join(serverDir, 'forge-installer.jar');
            await fs.ensureDir(serverDir);

            this.emit('status', `Downloading Forge ${forgeVersion}...`);
            await this.downloadFile(installerUrl, installerPath);

            this.emit('status', 'Running Forge Installer (This may take a minute)...');
            
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

            this.emit('status', 'Forge installed.');
            return 'run.bat'; // Default fallback

        } catch (e) {
            console.error('Forge install failed', e);
            throw e;
        }
    }

    // Install NeoForge
    async installNeoForge(serverDir: string, version: string) {
        try {
            const { javaManager } = await import('./JavaManager');
            // NeoForge is almost exclusively Java 21+ for 1.20.6+, or 17 for 1.20.1
            const mcMajor = parseInt(version.split('.')[1]);
            const mcMinor = parseInt(version.split('.')[2] || '0');
            
            let requiredJava = 'Java 21';
            // 1.20.4 and below use Java 17, 1.20.5+ use Java 21
            if (mcMajor === 20 && mcMinor <= 4) requiredJava = 'Java 17';

            const javaPath = await javaManager.ensureJava(requiredJava);

            this.emit('status', `Fetching NeoForge version for ${version}...`);
            
            // Use NeoForge metadata API
            const metaUrl = `https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge`;
            const metaRes = await axios.get(metaUrl);
            const allVersions = metaRes.data.versions;
            
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
            const matchingVersion = allVersions.reverse().find((v: string) => v.includes(version));
            
            if (!matchingVersion) {
                throw new Error(`No NeoForge version found for ${version}`);
            }

            const downloadUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${matchingVersion}/neoforge-${matchingVersion}-installer.jar`;
            
            const installerPath = path.join(serverDir, 'neoforge-installer.jar');
            await fs.ensureDir(serverDir);

            this.emit('status', `Downloading NeoForge ${matchingVersion}...`);
            await this.downloadFile(downloadUrl, installerPath);

            this.emit('status', 'Running NeoForge Installer...');
            
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

            this.emit('status', 'NeoForge installed.');
            return 'run.bat';

        } catch (e) {
            console.error('NeoForge install failed', e);
            throw e;
        }
    }

    // Install Spigot (Using a common mirror for speed, or BuildTools)
    async installSpigot(serverDir: string, version: string) {
        try {
            this.emit('status', `Searching for Spigot ${version} mirror...`);
            
            // Note: Official Spigot requires BuildTools, but many mirrors exist.
            // For a better UX, we'll try a common one, or provide instructions.
            // Using a generic mirror URL pattern (example: getspigot.org pattern)
            const downloadUrl = `https://download.getspigot.org/spigot/spigot-${version}.jar`;
            
            const dest = path.join(serverDir, 'server.jar');
            await fs.ensureDir(serverDir);
            
            try {
                await this.downloadFile(downloadUrl, dest);
                this.emit('status', 'Spigot Downloaded successfully.');
            } catch (e) {
                this.emit('status', 'Mirror failed. Falling back to BuildTools (Slow)...');
                // BuildTools logic would go here... for now we'll throw
                throw new Error('Spigot download failed. No mirror found for this version.');
            }

            await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
            this.emit('status', 'Installation Complete');

        } catch (e) {
            console.error('Spigot install failed', e);
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
            console.log('[Installer] Spark is already installed. Skipping.');
            return;
        }
        
        // Direct download from Lucko's CI (stable link pattern)
        const url = 'https://ci.lucko.me/job/spark/lastSuccessfulBuild/artifact/spark-bukkit/build/libs/spark-bukkit.jar';
        await this.downloadFile(url, dest);
        console.log('[Installer] Spark installed.');
    }

    // Configure Proxy Support (Velocity/Bungee)
    async configureProxy(serverDir: string) {
        console.log('[Installer] Configuring Proxy Support...');
        
        // 1. server.properties (Base Requirement)
        const propsPath = path.join(serverDir, 'server.properties');
        if (!await fs.pathExists(propsPath)) {
            await fs.writeFile(propsPath, 'server-port=25565\nonline-mode=false\n');
        } else {
            let content = await fs.readFile(propsPath, 'utf8');
            if (content.includes('online-mode=')) {
                content = content.replace(/online-mode=(true|false)/, 'online-mode=false');
            } else {
                content += '\nonline-mode=false';
            }
            await fs.writeFile(propsPath, content);
        }

        // 2. spigot.yml (BungeeCord)
        const spigotYml = path.join(serverDir, 'spigot.yml');
        if (await fs.pathExists(spigotYml)) {
            let content = await fs.readFile(spigotYml, 'utf8');
            if (content.includes('bungeecord: false')) {
                content = content.replace('bungeecord: false', 'bungeecord: true');
                await fs.writeFile(spigotYml, content);
                console.log('[Installer] Enabled BungeeCord in spigot.yml');
            }
        }

        // 3. config/paper-global.yml (Velocity)
        // Modern Paper uses config/paper-global.yml for Velocity support
        const paperGlobalPath = path.join(serverDir, 'config', 'paper-global.yml');
        if (await fs.pathExists(paperGlobalPath)) {
             let content = await fs.readFile(paperGlobalPath, 'utf8');
             // Naive replacement for now, robust YAML parsing preferred in future
             if (content.includes('velocity:\n    enabled: false') || content.includes('velocity:\n      enabled: false')) {
                 content = content.replace('enabled: false', 'enabled: true');
                 content = content.replace('online-mode: false', 'online-mode: true'); // Velocity usually wants this true inside its own config block
                 await fs.writeFile(paperGlobalPath, content);
                 console.log('[Installer] Enabled Velocity in paper-global.yml');
             }
        }
        
        console.log('[Installer] Proxy mode configuration complete.');
    }
    // Disable Proxy Support (Revert to Online Mode)
    async disableProxy(serverDir: string) {
        console.log('[Installer] Disabling Proxy Support (Reverting to Online Mode)...');
        
        // 1. server.properties
        const propsPath = path.join(serverDir, 'server.properties');
        if (await fs.pathExists(propsPath)) {
            let content = await fs.readFile(propsPath, 'utf8');
            if (content.includes('online-mode=false')) {
                content = content.replace('online-mode=false', 'online-mode=true');
                await fs.writeFile(propsPath, content);
                console.log('[Installer] Set online-mode=true in server.properties');
            }
        }

        // 2. spigot.yml
        const spigotYml = path.join(serverDir, 'spigot.yml');
        if (await fs.pathExists(spigotYml)) {
            let content = await fs.readFile(spigotYml, 'utf8');
            if (content.includes('bungeecord: true')) {
                content = content.replace('bungeecord: true', 'bungeecord: false');
                await fs.writeFile(spigotYml, content);
                console.log('[Installer] Disabled BungeeCord in spigot.yml');
            }
        }

        // 3. paper-global.yml
        const paperGlobalPath = path.join(serverDir, 'config', 'paper-global.yml');
        if (await fs.pathExists(paperGlobalPath)) {
             let content = await fs.readFile(paperGlobalPath, 'utf8');
             if (content.includes('velocity:\n    enabled: true') || content.includes('velocity:\n      enabled: true')) {
                 content = content.replace('enabled: true', 'enabled: false');
                 content = content.replace('online-mode: true', 'online-mode: false'); 
                 await fs.writeFile(paperGlobalPath, content);
                 console.log('[Installer] Disabled Velocity in paper-global.yml');
             }
        }
    }
}

export const installerService = new InstallerService();
