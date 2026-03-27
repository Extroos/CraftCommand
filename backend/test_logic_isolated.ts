import 'tsconfig-paths/register';
// We use a mock-like approach by importing the class directly if possible, 
// but since it's a singleton 'processManager' export, we'll use that.
import { processManager } from './src/features/processes/ProcessManager';
import { ServerStatus } from './src/shared/types';

async function verifyLogic() {
    const id = 'test-id';
    console.log('[LOGIC_TEST] Verifying Lifecycle v2.0 Protection...');

    // 1. Initial State: STARTING
    // We bypass the actual process spawning and just set the status in cache
    processManager.updateCachedStatus(id, { status: ServerStatus.STARTING, online: false }, true);
    console.log(`[LOGIC_TEST] State 1: ${processManager.getCachedStatus(id).status} (online: false) - OK`);

    // 2. The Flicker Trigger: Port binds while STARTING
    console.log('[LOGIC_TEST] Action: Simulating Port Reachability (Sync Loop)...');
    processManager.updateCachedStatus(id, { online: true });
    
    const statusAtFlickerPoint = processManager.getCachedStatus(id).status;
    console.log(`[LOGIC_TEST] State 2 (Flicker Point): ${statusAtFlickerPoint}`);

    if (statusAtFlickerPoint === ServerStatus.ONLINE) {
        console.error('\x1b[31m%s\x1b[0m', '!!! REGRESSION DETECTED: Port bind promoted STARTING to ONLINE !!!');
        process.exit(1);
    } else {
        console.log('\x1b[32m%s\x1b[0m', '>>> SUCCESS: Flicker Prevented. Server stayed in STARTING phase.');
    }

    // 3. The Real Ready Phase: Log Parser hits "Done"
    console.log('[LOGIC_TEST] Action: Simulating Log Marker "Done"...');
    processManager.updateCachedStatus(id, { status: ServerStatus.ONLINE, online: true }, true);
    
    const statusResult = processManager.getCachedStatus(id).status;
    console.log(`[LOGIC_TEST] State 3: ${statusResult}`);
    
    if (statusResult !== ServerStatus.ONLINE) {
        console.error('FAILED: Log marker did not promote to ONLINE!');
        process.exit(1);
    }

    // 4. The Stop Phase: Zero-Point Reset
    console.log('[LOGIC_TEST] Action: Simulating Process Exit (handleServerClose)...');
    // Set some dummy telemetry first
    processManager.updateCachedStatus(id, { cpu: 50, memory: 1024 });
    
    // Simulate close
    // @ts-ignore
    await processManager.handleServerClose(id, 0);
    
    const final = processManager.getCachedStatus(id);
    console.log(`[LOGIC_TEST] State 4: ${final.status}, CPU: ${final.cpu}, RAM: ${final.memory}`);

    if (final.status === ServerStatus.OFFLINE && final.cpu === 0 && final.memory === 0) {
        console.log('\x1b[32m%s\x1b[0m', '>>> SUCCESS: Zero-Point Resets and OFFLINE transition verified.');
    } else {
        console.error('FAILED: Final cleanup was incomplete!');
        process.exit(1);
    }

    console.log('[LOGIC_TEST] All Lifecycle Stabilization v2.0 invariants verified.');
    process.exit(0);
}

verifyLogic().catch(err => {
    console.error(err);
    process.exit(1);
});
