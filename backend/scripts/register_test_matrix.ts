
import { serverRepository } from '../src/storage/ServerRepository';
import { getServer, deleteServer } from '../src/features/servers/ServerService';
import { startupManager } from '../src/features/servers/StartupManager';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../src/utils/logger';

async function createTestMatrix() {
    const modes = ['modern', 'legacy', 'bungeeguard', 'none'];
    const serversRoot = path.join(process.cwd(), 'minecraft_servers');
    
    // Find existing Velocity server to clone its JAR if needed
    const existing = serverRepository.findAll().find(s => s.software === 'Velocity');
    if (!existing) {
        console.error('No existing Velocity server found to use as template!');
        return;
    }

    for (const mode of modes) {
        const id = `test-velocity-${mode}`;
        const name = `Velocity-Test-${mode.toUpperCase()}`;
        const workDir = path.join(serversRoot, id);

        console.log(`[Matrix] Creating ${name} in ${workDir}...`);

        // 1. Register in Repo
        const config: any = {
            id,
            name,
            software: 'Velocity',
            version: '3.3.0-SNAPSHOT',
            port: 25570 + modes.indexOf(mode),
            ram: 1,
            nodeId: 'local',
            cpuPriority: 'normal',
            motd: `Testing mode: ${mode}`,
            maxPlayers: 100,
            javaVersion: 'Java 21',
            onlineMode: true,
            workingDirectory: workDir,
            executable: 'velocity.jar',
            status: 'OFFLINE',
            network: {
                updateEnabled: false,
                monitoringEnabled: true,
                updateInterval: 60,
                proxyConfig: {
                    links: [],
                    forwardingMode: mode,
                    secret: mode === 'modern' ? 'test-secret-4321' : undefined
                }
            }
        };

        serverRepository.create(config);

        // 2. Prepare files
        await fs.ensureDir(workDir);
        const jarDest = path.join(workDir, 'velocity.jar');
        if (await fs.pathExists(existing.workingDirectory)) {
            const jarSrc = path.join(existing.workingDirectory, 'velocity.jar');
            if (await fs.pathExists(jarSrc)) {
                await fs.copy(jarSrc, jarDest);
            }
        }

        // 3. Create a dummy/malformed velocity.toml to test the "Robust Sync"
        const malformed = `
bind = "0.0.0.0:25565"
online-mode = true
forwarding-mode = "legacy"
servers = {}
forced-hosts = { "lobby.example.com" = ["lobby"] }
        `.trim();
        await fs.writeFile(path.join(workDir, 'velocity.toml'), malformed);

        // 4. Force synchronization
        console.log(`[Matrix] Testing synchronization for ${mode}...`);
        try {
            await startupManager.enforceBackendProperties(config);
            console.log(`[Matrix] Synced successfully.`);
        } catch (e: any) {
            console.error(`[Matrix] Sync failed: ${e.message}`);
        }
    }

    console.log('[Matrix] Done. Check your Server selection screen!');
}

// Set CWD for imports to work correctly
process.chdir(path.join(__dirname, '..'));
createTestMatrix().catch(console.error);
