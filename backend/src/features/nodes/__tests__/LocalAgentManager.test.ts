import { EventEmitter } from 'events';

// Mock all dependencies
jest.mock('../../../utils/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../NodeRegistryService', () => ({
    nodeRegistryService: {
        getLocalNodeSecret: jest.fn().mockReturnValue('test-secret-123')
    }
}));

jest.mock('../../system/SystemSettingsService', () => {
    const EventEmitter = require('events').EventEmitter;
    const emitter = new EventEmitter();
    
    const settings = {
        app: {
            distributedNodes: { enabled: true }
        }
    };
    
    return {
        systemSettingsService: Object.assign(emitter, {
            getSettings: jest.fn().mockReturnValue(settings),
            _settings: settings
        })
    };
});

// Mock child_process.spawn
const mockProcess = new EventEmitter() as any;
mockProcess.stdout = new EventEmitter();
mockProcess.stderr = new EventEmitter();
mockProcess.kill = jest.fn();
mockProcess.pid = 12345;
mockProcess.unref = jest.fn();

jest.mock('child_process', () => ({
    spawn: jest.fn().mockReturnValue(mockProcess)
}));

jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true)
}));

import { localAgentManager } from '../LocalAgentManager';
import { spawn } from 'child_process';
import { logger } from '../../../utils/logger';
import { systemSettingsService } from '../../system/SystemSettingsService';

describe('LocalAgentManager', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        
        // Reset internal state by toggling off then on
        (localAgentManager as any).agentProcess = null;
        (localAgentManager as any).consecutiveFailures = 0;
        (localAgentManager as any).agentSafeMode = false;
        (localAgentManager as any).intentionalStop = false;
        (localAgentManager as any).restartTimer = null;
        (localAgentManager as any).stabilityTimer = null;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Exponential Backoff', () => {
        it('should calculate correct backoff delays', () => {
            const mgr = localAgentManager as any;
            
            mgr.consecutiveFailures = 0;
            expect(mgr.getRestartDelay()).toBe(1000);   // 1s
            
            mgr.consecutiveFailures = 1;
            expect(mgr.getRestartDelay()).toBe(2000);   // 2s
            
            mgr.consecutiveFailures = 2;
            expect(mgr.getRestartDelay()).toBe(4000);   // 4s
            
            mgr.consecutiveFailures = 3;
            expect(mgr.getRestartDelay()).toBe(8000);   // 8s
            
            mgr.consecutiveFailures = 4;
            expect(mgr.getRestartDelay()).toBe(16000);  // 16s
            
            // Should cap at MAX_RESTART_DELAY_MS (30000)
            mgr.consecutiveFailures = 10;
            expect(mgr.getRestartDelay()).toBe(30000);  // capped
        });
    });

    describe('Safe Mode', () => {
        it('should block startAgent when in safe mode', () => {
            const mgr = localAgentManager as any;
            mgr.agentSafeMode = true;
            
            mgr.startAgent('test-secret');
            
            expect(spawn).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Safe Mode')
            );
        });

        it('should enter safe mode after MAX_CONSECUTIVE_RESTARTS', () => {
            const mgr = localAgentManager as any;
            mgr.consecutiveFailures = mgr.MAX_CONSECUTIVE_RESTARTS - 1;
            
            // Start the agent so we have a process
            mgr.startAgent('test-secret');
            
            // Simulate crash
            mockProcess.emit('close', 1);
            
            expect(mgr.agentSafeMode).toBe(true);
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Agent Safe Mode')
            );
        });

        it('should reset safe mode and counter when settings are toggled', () => {
            const mgr = localAgentManager as any;
            mgr.agentSafeMode = true;
            mgr.consecutiveFailures = 5;
            
            // Simulate settings toggle (this calls checkAndApplyState)
            mgr.checkAndApplyState();
            
            expect(mgr.agentSafeMode).toBe(false);
            expect(mgr.consecutiveFailures).toBe(0);
        });
    });

    describe('Stability Timer', () => {
        it('should reset failure counter after 60s of stability', () => {
            const mgr = localAgentManager as any;
            mgr.consecutiveFailures = 3;
            
            // Start agent
            mgr.startAgent('test-secret');
            
            // Advance 60s
            jest.advanceTimersByTime(60000);
            
            // Counter should be reset
            expect(mgr.consecutiveFailures).toBe(0);
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Resetting failure counter')
            );
        });
    });

    describe('Graceful Stop', () => {
        it('should clear all timers on stop', () => {
            const mgr = localAgentManager as any;
            
            // Start agent so timers are set
            mgr.startAgent('test-secret');
            
            mgr.stop();
            
            expect(mgr.restartTimer).toBeNull();
            expect(mgr.stabilityTimer).toBeNull();
            expect(mgr.intentionalStop).toBe(true);
            expect(mockProcess.kill).toHaveBeenCalled();
        });

        it('should NOT restart when intentional stop is set', () => {
            const mgr = localAgentManager as any;
            
            mgr.startAgent('test-secret');
            mgr.intentionalStop = true;
            
            // Simulate crash
            mockProcess.emit('close', 0);
            
            // Should log graceful shutdown, not schedule restart
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('gracefully')
            );
            expect(mgr.consecutiveFailures).toBe(0); // Counter not incremented
        });
    });
});
