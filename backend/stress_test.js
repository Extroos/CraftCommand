const fs = require('fs-extra');
const path = require('path');

/**
 * 1,000 Server Stress Test Simulator (v1.13.0)
 * Generates 1,000 server fragments in data/servers/ to verify platform responsiveness.
 */
async function runStressTest() {
    const serversDir = path.join(__dirname, '../data/servers');
    const legacyFile = path.join(__dirname, '../data/servers.json');

    console.log(`[STRESS TEST] Purging existing servers and initializing 1,000 fragments...`);
    await fs.ensureDir(serversDir);
    await fs.emptyDir(serversDir);

    if (await fs.exists(legacyFile)) {
        await fs.remove(legacyFile);
    }

    const startTime = Date.now();
    const serverCount = 1000;

    for (let i = 1; i <= serverCount; i++) {
        const id = `stress-node-${i.toString().padStart(4, '0')}`;
        const server = {
            id,
            name: `Enterprise Node ${i}`,
            status: 'OFFLINE',
            port: 25565 + i,
            ram: 4,
            software: 'Paper',
            version: '1.21.1',
            workingDirectory: path.join(__dirname, `../servers/${id}`),
            createdAt: new Date().toISOString()
        };

        const filePath = path.join(serversDir, `${id}.json`);
        await fs.writeJson(filePath, server);

        if (i % 100 === 0) {
            console.log(`  - Provisioned ${i} servers...`);
        }
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log(`\n[SUCCESS] 1,000 servers provisioned in ${duration.toFixed(2)}s.`);
    console.log(`[INFO] Architecture: Fragmented JSON ($O(1) Writes)`);
    console.log(`[INFO] Start the backend and frontend to verify UI virtualization and watcher performance.`);
}

runStressTest().catch(console.error);
