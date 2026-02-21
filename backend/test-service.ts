import fs from 'fs-extra';
import { diagnoseServer, getServers } from './src/features/servers/ServerService';

async function run() {
    console.log('Fetching servers...');
    const servers = getServers();
    const modpack = servers.find(s => s.software === 'Modpack');
    if(!modpack) {
        console.log('No modpack server found.');
        return;
    }
    console.log(`Diagnosing ${modpack.id} (${modpack.name})...`);
    try {
        const results = await diagnoseServer(modpack.id);
        console.log('Diagnosis Results:', JSON.stringify(results, null, 2));
    } catch (e) {
        console.error('Diagnosis Failed:', e);
    }
}

run().catch(console.error);
