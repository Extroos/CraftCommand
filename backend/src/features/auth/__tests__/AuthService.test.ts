import { UserProfile } from '@shared/types';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('../../../storage/UserRepository', () => ({
    userRepository: {
        findAll: jest.fn().mockReturnValue([]),
        findById: jest.fn(),
        findByEmail: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findOwner: jest.fn()
    }
}));
jest.mock('../../../storage/SessionRepository', () => ({
    sessionRepository: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
    }
}));
jest.mock('../../system/SystemSettingsService', () => ({
    systemSettingsService: {
        getSettings: jest.fn().mockReturnValue({ app: { hostMode: true } })
    }
}));
jest.mock('../../system/AuditService', () => ({
    auditService: {
        log: jest.fn()
    }
}));
jest.mock('otplib', () => ({
    generateSecret: jest.fn(),
    generateURI: jest.fn(),
    verify: jest.fn()
}));
jest.mock('qrcode', () => ({
    toDataURL: jest.fn()
}));

process.env.JWT_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'test-encryption-key-that-is-32-chars!!';

import { userRepository } from '../../../storage/UserRepository';
import { authService } from '../AuthService';
import bcrypt from 'bcryptjs';

describe('AuthService', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should generate the default admin user if the database is completely empty', () => {
        (userRepository.findAll as jest.Mock).mockReturnValue([]);
        
        // Trigger constructor logic by forcing a private method directly for the test
        // Because the singleton init ran before the test, we'll manually invoke the check
        (authService as any).ensureAdminExists();

        expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({
            email: 'admin@craftcommand.io',
            role: 'OWNER',
            username: 'Administrator'
        }));
    });

    it('should fail login and not generate JWT if credentials are bad', async () => {
        const mockUser: UserProfile = {
            id: 'user-1',
            email: 'test@test.com',
            username: 'tester',
            role: 'ADMIN',
            passwordHash: bcrypt.hashSync('correct-password', 10),
            preferences: { notifications: {}, terminal: {} } as any
        };
        (userRepository.findByEmail as jest.Mock).mockReturnValue(mockUser);

        const result = await authService.login('test@test.com', 'wrong-password');
        
        expect(result).toBeNull();
    });

    it('should succeed login, generate session, and return a JWT', async () => {
        const mockUser: UserProfile = {
            id: 'user-2',
            email: 'valid@test.com',
            username: 'ValidTester',
            role: 'OWNER',
            passwordHash: bcrypt.hashSync('correct-password', 10),
            preferences: { notifications: {}, terminal: {} } as any
        };
        (userRepository.findByEmail as jest.Mock).mockReturnValue(mockUser);

        const result = await authService.login('valid@test.com', 'correct-password');
        
        expect(result).not.toBeNull();
        expect(result!.user.id).toBe('user-2');
        expect(result!.token).toBeDefined();

        // Verify the JWT holds the correct claims
        const decoded = jwt.verify(result!.token, process.env.JWT_SECRET as string) as any;
        expect(decoded.email).toBe('valid@test.com');
        expect(decoded.role).toBe('OWNER');
    });

    it('should validate role hierarchy explicitly', () => {
        expect(authService.canManage('OWNER', 'ADMIN')).toBe(true);
        expect(authService.canManage('ADMIN', 'MANAGER')).toBe(true);
        expect(authService.canManage('MANAGER', 'OWNER')).toBe(false);
        expect(authService.canManage('VIEWER', 'ADMIN')).toBe(false);
    });

});
