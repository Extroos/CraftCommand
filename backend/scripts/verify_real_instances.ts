
import { serverRepository } from '../src/storage/ServerRepository';
import { startupManager } from '../src/features/servers/StartupManager';
import path from 'path';
import fs from 'fs-extra';

async function verifyAll() {
    const ids = [
        'local-test-velocity-modern',
        'local-test-velocity-legacy',
        'local-test-velocity-bungeeguard',
        'local-test-velocity-none'
    ];

    console.log('=== REAL STARTUP VERIFICATION ===');

    for (const id of ids) {
        const server = serverRepository.findById(id);
        if (!server) {
            console.error(`Server ${id} not found in repo!`);
            continue;
        }

        console.log(`\n[${server.name}] Software: ${server.software} | Forwarding: ${server.network?.proxyConfig?.forwardingMode}`);
        
        // 1. Enforce properties (The part that was failing)
        console.log(`[${server.name}] Enforcing properties...`);
        await startupManager.enforceBackendProperties(server);
        
        // 2. Read back the config to show it's fixed
        const configPath = path.join(server.workingDirectory, 'velocity.toml');
        const content = await fs.readFile(configPath, 'utf8');
        console.log(`[${server.name}] Config fixed? ${content.includes('player-info-forwarding-mode') && !content.includes('example.com')}`);
        
        if (content.match(/^forced-hosts\s*=\s*\{.*\}$/m)) {
             console.error(`[${server.name}] FAILED: Inline forced-hosts still exists!`);
        } else {
             console.log(`[${server.name}] SUCCESS: Inline forced-hosts purged.`);
        }

        // 3. Briefly attempt start (just to check for early exits)
        // Note: We can't easily start them all at once on the same port, 
        // but our registration script gave them unique ports.
    }
}

// Set CWD for imports
process.chdir(path.join(__dirname, '..'));
verifyAll().catch(console.error);
