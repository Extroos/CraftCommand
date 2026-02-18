
import { proxyService } from '../src/features/network/ProxyService';
import { logger } from '../src/utils/logger';
import fs from 'fs-extra';
import path from 'path';

const SERVERS_JSON = path.join(__dirname, '../data/servers.json');

async function run() {
    console.log('--- INSTALLING VIA SUITE ON TEST PROXIES ---');
    
    if (!await fs.pathExists(SERVERS_JSON)) {
        console.error('servers.json not found!');
        return;
    }

    const servers = await fs.readJson(SERVERS_JSON);
    const proxies = servers.filter((s: any) => s.software === 'Velocity');

    for (const proxy of proxies) {
        console.log(`\nProcessing ${proxy.name} (${proxy.id})...`);
        try {
            await proxyService.installViaSuite(proxy.id);
            console.log(`SUCCESS: Via Suite installation triggered for ${proxy.name}`);
        } catch (e: any) {
            console.error(`FAILED: ${proxy.name}: ${e.message}`);
        }
    }

    console.log('\n--- INSTALLATION SEQUENCE COMPLETE ---');
}

run().catch(console.error);
