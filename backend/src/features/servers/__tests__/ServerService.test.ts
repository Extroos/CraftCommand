import { ServerStatus } from '@shared/types';

// Declare Mocks
jest.mock('../../../utils/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn() }
}));

jest.mock('../diagnosis/DiagnosisService', () => ({ diagnosisService: {} }));
jest.mock('../system/SafetyService', () => ({ safetyService: {} }));
jest.mock('../system/SystemService', () => ({ systemService: {} }));
jest.mock('./ServerConfigService', () => ({ serverConfigService: {} }));
jest.mock('../installer/InstallerService', () => ({ installerService: {} }));


const mockProcessManager = {
    isRunning: jest.fn().mockReturnValue(false),
    startServer: jest.fn().mockResolvedValue(undefined),
    stopServer: jest.fn().mockResolvedValue(undefined),
    updateCachedStatus: jest.fn()
};
jest.mock('../../processes/ProcessManager', () => ({
    processManager: mockProcessManager
}));

const mockStartupManager = {
    startServer: jest.fn().mockImplementation((server, cb, force) => {
        cb(server); // simulate callback
        return Promise.resolve();
    })
};
jest.mock('../StartupManager', () => ({
    startupManager: mockStartupManager
}));

const mockServer = { id: 'srv-1', status: ServerStatus.OFFLINE, name: 'Test Server', port: 25565 };
const mockRepo = {
    findById: jest.fn().mockReturnValue(mockServer),
    findAll: jest.fn().mockReturnValue([mockServer]),
    update: jest.fn()
};
jest.mock('../../../storage/ServerRepository', () => ({
    serverRepository: mockRepo
}));

// Load Service after mocks
import * as serverService from '../ServerService';

describe('ServerService', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        mockProcessManager.isRunning.mockReturnValue(false);
    });

    it('should successfully initiate startServer', async () => {
        const result = await serverService.startServer('srv-1');
        
        expect(result.success).toBe(true);
        expect(mockStartupManager.startServer).toHaveBeenCalled();
        expect(mockRepo.update).toHaveBeenCalledWith('srv-1', mockServer);
    });

    it('should prevent startServer if already running', async () => {
        mockProcessManager.isRunning.mockReturnValue(true);
        
        const result = await serverService.startServer('srv-1');
        
        expect(result.success).toBe(true);
        expect(result.alreadyRunning).toBe(true);
        expect(mockStartupManager.startServer).not.toHaveBeenCalled();
    });

    it('should recover stuck servers on stopServer if they are not actually running', async () => {
        // Server is OFFLINE in mockServer initially, let's change it
        mockRepo.findById.mockReturnValueOnce({ ...mockServer, status: ServerStatus.STARTING });
        mockProcessManager.isRunning.mockReturnValue(false);

        await serverService.stopServer('srv-1');

        // It should have forced it OFFLINE
        expect(mockRepo.update).toHaveBeenCalledWith('srv-1', { status: ServerStatus.OFFLINE });
        expect(mockProcessManager.updateCachedStatus).toHaveBeenCalledWith('srv-1', { status: ServerStatus.OFFLINE, online: false });
        expect(mockProcessManager.stopServer).not.toHaveBeenCalled();
    });

    it('should call ProcessManager if the server is actually running during stopServer', async () => {
        mockProcessManager.isRunning.mockReturnValue(true);

        await serverService.stopServer('srv-1', false);

        expect(mockProcessManager.stopServer).toHaveBeenCalledWith('srv-1', false);
    });
});
