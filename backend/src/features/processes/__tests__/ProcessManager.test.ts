import { EventEmitter } from 'events';
import { ServerStatus } from '@shared/types';

// Declare a mock event emitter factory
jest.mock('../runners/RunnerFactory', () => {
    const EventEmitter = require('events').EventEmitter;
    const runner = new EventEmitter();
    runner.start = jest.fn().mockResolvedValue(undefined);
    runner.stop = jest.fn().mockResolvedValue(undefined);
    runner.kill = jest.fn().mockResolvedValue(undefined);
    runner.getStats = jest.fn().mockResolvedValue({ cpu: 0, memory: 0 });
    runner.syncActiveContainers = jest.fn().mockResolvedValue(undefined);

    return {
        runnerFactory: {
            getRunner: jest.fn().mockReturnValue(runner),
            getAllRunners: jest.fn().mockReturnValue([])
        }
    };
});

jest.mock('../../../utils/NetUtils', () => ({
    NetUtils: {
        checkPort: jest.fn().mockResolvedValue(false),
        killProcessOnPort: jest.fn().mockResolvedValue(false),
        queryBedrock: jest.fn().mockResolvedValue(null)
    }
}));

jest.mock('../../../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }
}));

jest.mock('../../diagnosis/AutomaticRepairService', () => ({
    automaticRepairService: {
        handleServerCrash: jest.fn(),
        diagnoseAndFix: jest.fn(),
        resetStabilityMarker: jest.fn()
    }
}));

// We need a stable test-server object
const mockServer = { id: 'test-server', port: 25565, status: ServerStatus.OFFLINE };

jest.mock('../../servers/ServerService', () => ({
    getServer: jest.fn((id) => { if (id === 'test-server') return mockServer; return null; }),
    getServers: jest.fn().mockReturnValue([mockServer]),
    saveServer: jest.fn()
}), { virtual: true });

// Import system under test AFTER mocks
import { processManager } from '../ProcessManager';
import { runnerFactory } from '../runners/RunnerFactory';

describe('ProcessManager', () => {
    let runner: any;

    beforeEach(() => {
        jest.clearAllMocks();
        runner = runnerFactory.getRunner('native');
        
        // Reset processManager state cleanly between tests
        // (Since it's a singleton, we clear its maps directly for testing isolation if needed, 
        // or just rely on new IDs)
    });

    it('should successfully start a server and mark it as STARTING', async () => {
        const serverId = 'test-server';
        
        expect(processManager.isRunning(serverId)).toBe(false);

        await processManager.startServer(serverId, 'java -jar server.jar', '/cwd', { SERVER_PORT: 25565 });

        expect(runnerFactory.getRunner).toHaveBeenCalledWith('native');
        expect(runner.start).toHaveBeenCalledWith(serverId, 'java -jar server.jar', '/cwd', { SERVER_PORT: 25565 });
        expect(processManager.isRunning(serverId)).toBe(true);
        expect(processManager.isStarting(serverId)).toBe(true);
    });

    it('should handle startup failures gracefully without silent hanging', async () => {
        const serverId = 'fail-server';
        
        runner.start.mockRejectedValueOnce(new Error('Spawn failed ENOTFOUND'));

        await expect(
            processManager.startServer(serverId, 'bad-command', '/cwd', {})
        ).rejects.toThrow('Spawn failed ENOTFOUND');

        expect(processManager.isRunning(serverId)).toBe(false);
    });

    it('should attempt to stop a server normally first, then force if required', async () => {
        const serverId = 'stop-server';
        
        // Start it first
        await processManager.startServer(serverId, 'java -jar server.jar', '/cwd', {});
        expect(processManager.isRunning(serverId)).toBe(true);
        
        // Simulate successful boot to clear startup lock
        runner.emit('log', { id: serverId, line: 'Done (', type: 'stdout' });

        // Stop it
        await processManager.stopServer(serverId, false);
        
        expect(runner.stop).toHaveBeenCalledWith(serverId, false);
        expect(processManager.isStopping(serverId)).toBe(true);
        
        // Simulate close event from runner (which cleans up activeRunners)
        runner.emit('close', { id: serverId, code: 0 });
        
        expect(processManager.isRunning(serverId)).toBe(false);
    });

    it('should force a SIGKILL if the server hangs and becomes a zombie', async () => {
        jest.useFakeTimers();
        const serverId = 'zombie-server';
        
        // Start it first
        await processManager.startServer(serverId, 'java -jar server.jar', '/cwd', {});
        expect(processManager.isRunning(serverId)).toBe(true);
        
        // Simulate successful boot to clear startup lock
        runner.emit('log', { id: serverId, line: 'Done (', type: 'stdout' });

        // Stop it normally
        await processManager.stopServer(serverId, false);
        expect(runner.stop).toHaveBeenCalledWith(serverId, false);
        expect(runner.kill).not.toHaveBeenCalled();

        // Fast-forward exactly 30000ms to trigger the zombie fallback
        jest.advanceTimersByTime(30000);

        expect(runner.kill).toHaveBeenCalledWith(serverId, 'SIGKILL');
        jest.useRealTimers();
    });
});
