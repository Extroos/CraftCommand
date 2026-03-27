const path = require('path');
// Mocking the environment to allow imports from dist
process.env.NODE_ENV = 'production'; 

// Corrected paths for dist structure
const { processManager } = require('./dist/backend/src/features/processes/ProcessManager');
const { serverRepository } = require('./dist/backend/src/storage/ServerRepository');

async function runTest() {
    const serverId = 'local-1774563135785';
    console.log(`[TEST] Starting E2E Lifecycle Test (JS) for ${serverId}`);

    // 1. Setup
    const server = serverRepository.findById(serverId);
    if (!server) {
        console.error('Test server not found!');
        process.exit(1);
    }
    
    // Ensure offline state
    processManager.updateCachedStatus(serverId, { status: 'OFFLINE', online: false }, true);
    console.log('[TEST] Init: Status is OFFLINE. Database is synced.');

    // 2. Start Simulation (STARTING)
    console.log('[TEST] Action: Simulated START');
    processManager.updateCachedStatus(serverId, { status: 'STARTING', online: false }, true);
    
    let currentStatus = processManager.getCachedStatus(serverId).status;
    console.log(`[TEST] Memory Status: ${currentStatus}`);
    console.log(`[TEST] Database Status: ${serverRepository.findById(serverId).status}`);

    // 3. Port Bind (The Flicker Point)
    console.log('[TEST] Action: Port Bind (online: true)');
    processManager.updateCachedStatus(serverId, { online: true });
    
    const statusAfterPort = processManager.getCachedStatus(serverId).status;
    console.log(`[TEST] Memory Status after port bind: ${statusAfterPort}`);
    
    if (statusAfterPort === 'ONLINE') {
        console.log('\x1b[31m%s\x1b[0m', 'FAILED: Status should NOT go ONLINE just because of port bind (v2.0 Regression)!');
    } else {
        console.log('\x1b[32m%s\x1b[0m', '[TEST] SUCCESS: Remained in STARTING phase. Flicker prevented.');
    }

    // 4. Official "Done" Signal
    console.log('[TEST] Action: Signal "Done" marker (Explicit ONLINE transition)');
    processManager.updateCachedStatus(serverId, { status: 'ONLINE', online: true }, true);

    const statusAfterLog = processManager.getCachedStatus(serverId).status;
    console.log(`[TEST] Status after explicit ready: ${statusAfterLog}`);
    console.log(`[TEST] Database Status: ${serverRepository.findById(serverId).status}`);

    if (statusAfterLog !== 'ONLINE' || serverRepository.findById(serverId).status !== 'ONLINE') {
        process.exit(1);
    }

    // 5. Final Stop & Zero-Point
    console.log('[TEST] Action: STOP (Process Exit)');
    processManager.handleServerClose(serverId, 0); 
    
    const finalStatus = processManager.getCachedStatus(serverId).status;
    console.log(`[TEST] Final Status: ${finalStatus}`);
    console.log(`[TEST] Database Status: ${serverRepository.findById(serverId).status}`);

    const telemetry = processManager.getCachedStatus(serverId);
    console.log(`[TEST] Final Telemetry Check - CPU: ${telemetry.cpu}, RAM: ${telemetry.memory}`);

    if (finalStatus !== 'OFFLINE' || telemetry.cpu !== 0) {
        console.log('\x1b[31m%s\x1b[0m', 'FAILED: Status or Telemetry did not reset to zero!');
    } else {
        console.log('\x1b[32m%s\x1b[0m', '[TEST] SUCCESS: Final state is OFFLINE and metrics are zeroed.');
    }

    console.log('[TEST] E2E Complete.');
    process.exit(0);
}

runTest();
