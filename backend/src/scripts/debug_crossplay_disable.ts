
import { CrossPlayService } from '../features/network/CrossPlayService';
import { ServerRepository } from '../storage/ServerRepository';
import path from 'path';

const serverId = 'test-server-crossplay-debug';
const serverRepo = new ServerRepository();
const service = new CrossPlayService();

async function run() {
    console.log('--- Debugging Cross-Play Disable ---');

    // 1. Setup Dummy Server
    console.log('Creating dummy server...');
    const server = await serverRepo.create({
        id: 'test-server-crossplay-debug',
        name: 'Debug CrossPlay Server',
        software: 'Paper',
        version: '1.20.4',
        port: 25565,
        javaVersion: 'Java 21',
        status: 'OFFLINE',
        ram: 4,
        executionEngine: 'native',
        workingDirectory: path.resolve('test_servers', serverId)
    } as any);
    // Manually force ID for consistency if needed, but create returns a new one.
    // Let's use the one returned.
    const id = server.id;
    console.log(`Server created with ID: ${id}`);

    try {
        // 2. Enable Cross-Play
        console.log('Enabling Cross-Play...');
        const enableRes = await service.enable(id);
        console.log('Enable Result:', enableRes);

        // Verify config
        let s = serverRepo.findById(id);
        console.log('CrossPlay Config (after enable):', s?.crossPlay);

        if (!s?.crossPlay?.enabled) {
            console.error('FAILED: CrossPlay not enabled in config!');
            process.exit(1);
        }

        // 3. Disable Cross-Play
        console.log('Disabling Cross-Play...');
        const disableRes = await service.disable(id);
        console.log('Disable Result:', disableRes);

        // Verify config again
        s = serverRepo.findById(id);
        console.log('CrossPlay Config (after disable):', s?.crossPlay);

        if (s?.crossPlay) {
            console.error('FAILED: CrossPlay config still exists after disable!', s.crossPlay);
            process.exit(1);
        } else {
            console.log('SUCCESS: CrossPlay config removed.');
        }

    } catch (e) {
        console.error('Error during test:', e);
    } finally {
        // Cleanup
        console.log('Cleaning up...');
        serverRepo.delete(id);
    }
}

run();
