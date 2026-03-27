import { processManager } from './src/features/processes/ProcessManager';
import { serverRepository } from './src/storage/ServerRepository';

// Manually defining ServerStatus to avoid @shared import issues
enum ServerStatus {
    ONLINE = 'ONLINE',
    OFFLINE = 'OFFLINE',
    STARTING = 'STARTING',
    STOPPING = 'STOPPING',
    CRASHED = 'CRASHED',
    RESTARTING = 'RESTARTING'
}

async function runTest() {
    const serverId = 'local-1774563135785';
    console.log(`[TEST] Starting E2E Lifecycle Test (v3) for ${serverId}`);

    // @ts-ignore
    processManager.updateCachedStatus(serverId, { status: ServerStatus.OFFLINE, online: false }, true);
    console.log('[TEST] Step 1: Init OFFLINE - OK');

    // 2. Start
    console.log('[TEST] Step 2: Simulated STARTING');
    // @ts-ignore
    processManager.updateCachedStatus(serverId, { status: ServerStatus.STARTING, online: false }, true);
    
    // 3. Port Check (The Flicker Test)
    console.log('[TEST] Step 3: Triggering Port Bind (online: true)...');
    processManager.updateCachedStatus(serverId, { online: true });
    
    const statusAfterPort = processManager.getCachedStatus(serverId).status;
    console.log(`[TEST] Result: Status is ${statusAfterPort}`);
    
    if (statusAfterPort === ServerStatus.ONLINE) {
        console.log('\x1b[31m%s\x1b[0m', 'FAILED: Port bind caused premature ONLINE promotion!');
        process.exit(1);
    } else {
        console.log('\x1b[32m%s\x1b[0m', 'SUCCESS: Flicker Prevented. Server stayed in STARTING.');
    }

    // 4. Persistence Test
    const dbStatus = serverRepository.findById(serverId)?.status;
    console.log(`[TEST] Step 4: Database Status: ${dbStatus}`);
    if (dbStatus !== ServerStatus.STARTING) {
        console.log('\x1b[31m%s\x1b[0m', 'FAILED: Database was not updated to STARTING!');
        process.exit(1);
    } else {
        console.log('\x1b[32m%s\x1b[0m', 'SUCCESS: Database/Memory Synchronized.');
    }

    // 5. Official Transition
    console.log('[TEST] Step 5: Official Log Marker "Done" detected');
    // @ts-ignore
    processManager.updateCachedStatus(serverId, { status: ServerStatus.ONLINE, online: true }, true);
    console.log(`[TEST] Result: Status is now ${processManager.getCachedStatus(serverId).status}`);

    // 6. Stop/Zero Test
    console.log('[TEST] Step 6: Simulated STOP');
    // @ts-ignore
    processManager.handleServerClose(serverId, 0);
    const final = processManager.getCachedStatus(serverId);
    console.log(`[TEST] Result: Status is ${final.status}, CPU: ${final.cpu}`);

    if (final.status === ServerStatus.OFFLINE && final.cpu === 0) {
        console.log('\x1b[32m%s\x1b[0m', 'SUCCESS: Lifecycle Stabilization Verified.');
    } else {
        console.log('\x1b[31m%s\x1b[0m', 'FAILED: Final cleanup failed.');
        process.exit(1);
    }

    console.log('[TEST] E2E Lifecycle Verification Complete.');
    process.exit(0);
}

runTest();
