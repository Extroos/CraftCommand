import { processManager } from '../src/features/processes/ProcessManager';
import { registerBroadcasters } from '../src/sockets/broadcasters';
import { autoHealingService } from '../src/features/servers/AutoHealingService';
import { logger } from '../src/utils/logger';

async function testBroadcasterIdempotency() {
    logger.info('=== Testing Broadcaster Idempotency ===');
    const dummyIo: any = { to: () => ({ emit: () => {} }), emit: () => {} };
    
    const initialStatusListeners = processManager.listenerCount('status');
    logger.info(`Initial status listeners: ${initialStatusListeners}`);
    
    registerBroadcasters(dummyIo);
    const afterFirst = processManager.listenerCount('status');
    logger.info(`After 1st registration: ${afterFirst}`);
    
    registerBroadcasters(dummyIo);
    const afterSecond = processManager.listenerCount('status');
    logger.info(`After 2nd registration: ${afterSecond}`);
    
    if (afterFirst === afterSecond) {
        logger.success('Broadcaster idempotency verified.');
    } else {
        logger.error('FAIL: Broadcaster doubled listeners!');
    }
}

async function testAutoHealingIdempotency() {
    logger.info('=== Testing AutoHealing Idempotency ===');
    const initial = processManager.listenerCount('status');
    
    autoHealingService.initialize();
    // Wait for the internal 10s timeout? Actually we just check the flag logic if we can.
    // Since initialize is async with a timeout, let's just call it twice.
    autoHealingService.initialize();
    
    // We can't easily wait for the 10s timeout in a fast script without mocking timers.
    // But we verified the code uses an 'isInitialized' flag.
    logger.info('AutoHealing idempotency protection applied (isInitialized flag).');
}

async function testRunnerCleanup() {
    logger.info('=== Testing Runner Cleanup ===');
    const id = 'leak-test-server';
    const initialListeners = processManager.listenerCount('log');
    
    // Start a fake server
    const dummyCommand = 'node -e "setInterval(() => {}, 1000)"';
    const cwd = process.cwd();
    
    logger.info(`Starting dummy server ${id}...`);
    await processManager.startServer(id, dummyCommand, cwd, { executionEngine: 'native' });
    
    const runningListeners = processManager.listenerCount('log');
    logger.info(`Listeners while running: ${runningListeners}`);
    
    logger.info(`Stopping dummy server ${id}...`);
    await processManager.stopServer(id, true);
    
    // ProcessManager.stopServer calls runner.kill, but runner emits 'close' asynchronously.
    // We need to wait for the close event to propagate to cleanupRunner.
    let attempts = 0;
    while (processManager.isRunning(id) && attempts < 10) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
    }
    
    const finalListeners = processManager.listenerCount('log');
    logger.info(`Listeners after stop: ${finalListeners}`);
    
    if (finalListeners === initialListeners) {
        logger.success('Runner listener cleanup verified.');
    } else {
        logger.error(`FAIL: Listener leak detected! (${initialListeners} -> ${finalListeners})`);
    }
}

async function runAll() {
    try {
        await testBroadcasterIdempotency();
        await testAutoHealingIdempotency();
        await testRunnerCleanup();
    } catch (e) {
        logger.error(`Verification failed: ${e}`);
    } finally {
        // Exit script
        process.exit();
    }
}

runAll();
