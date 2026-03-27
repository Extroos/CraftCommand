import 'tsconfig-paths/register';
import { processManager } from './src/features/processes/ProcessManager';
import { serverRepository } from './src/storage/ServerRepository';
import { ServerStatus } from './src/shared/types';
// @ts-ignore
import { ServerStatus as SharedStatus } from '@shared/types';

async function runTest() {
    const serverId = 'local-1774563135785';
    console.log(`[TEST] Starting E2E Lifecycle Test for ${serverId}`);

    // 1. Setup
    const server = serverRepository.findById(serverId);
    if (!server) {
        console.error('Test server not found!');
        process.exit(1);
    }
    
    // Ensure offline
    // @ts-ignore
    serverRepository.update(serverId, { status: ServerStatus.OFFLINE });
    processManager.updateCachedStatus(serverId, { status: ServerStatus.OFFLINE, online: false }, true);

    console.log('[TEST] Init: Status is OFFLINE. Database is synced.');

    // 2. Start
    console.log('[TEST] Action: START');
    await processManager.startServer(serverId, 'echo starting', process.cwd(), { SERVER_PORT: server.port });
    
    let currentStatus = processManager.getCachedStatus(serverId).status;
    console.log(`[TEST] Current Status: ${currentStatus}`);
    
    if (currentStatus !== ServerStatus.STARTING) {
        console.error('FAILED: Status should be STARTING immediately after start!');
    }

    // 3. Simulate Port Bind (Early)
    console.log('[TEST] Simulating Early Port Bind...');
    processManager.updateCachedStatus(serverId, { online: true });
    
    const statusAfterPort = processManager.getCachedStatus(serverId).status;
    console.log(`[TEST] Status after port bind: ${statusAfterPort}`);
    
    if (statusAfterPort === ServerStatus.ONLINE) {
        console.warn('FAILED: Status should NOT go ONLINE just because of port bind (v2.0 Regression)!');
    } else {
        console.log('[TEST] SUCCESS: Remained in STARTING phase despite port bind.');
    }

    // 4. Verify Database Persistence during STARTING
    const dbServer = serverRepository.findById(serverId);
    console.log(`[TEST] Database Status: ${dbServer?.status}`);
    if (dbServer?.status !== ServerStatus.STARTING) {
        console.error('FAILED: Database is not synced with STARTING state!');
    }

    // 5. Simulate Log "Done"
    console.log('[TEST] Action: Signal Log "Done"');
    // @ts-ignore
    processManager.handleServerLog(serverId, 'Done (5.0s)! For help, type "help"', 'stdout');

    const statusAfterLog = processManager.getCachedStatus(serverId).status;
    console.log(`[TEST] Status after log marker: ${statusAfterLog}`);
    
    if (statusAfterLog !== ServerStatus.ONLINE) {
        console.error('FAILED: Status should be ONLINE after "Done" marker!');
    }

    // 6. Verify Database Persistence ONLINE
    const dbServerOnline = serverRepository.findById(serverId);
    console.log(`[TEST] Database Status: ${dbServerOnline?.status}`);
    if (dbServerOnline?.status !== ServerStatus.ONLINE) {
        console.error('FAILED: Database did not persist ONLINE status!');
    }

    // 7. Stop
    console.log('[TEST] Action: STOP');
    // @ts-ignore
    await processManager.handleServerClose(serverId, 0); // Simulate process exit
    
    const finalStatus = processManager.getCachedStatus(serverId).status;
    console.log(`[TEST] Final Status: ${finalStatus}`);
    
    const telemetry = processManager.getCachedStatus(serverId);
    console.log(`[TEST] Final Telemetry - CPU: ${telemetry.cpu}, RAM: ${telemetry.memory}`);

    if (finalStatus !== ServerStatus.OFFLINE || telemetry.cpu !== 0) {
        console.warn('FAILED: Status or Telemetry did not reset on stop!');
    } else {
        console.log('[TEST] SUCCESS: Lifecycle complete and zeroed.');
    }

    console.log('[TEST] E2E Complete.');
    process.exit(0);
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
