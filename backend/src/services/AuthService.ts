
import fs from 'fs-extra';
import path from 'path';
import { UserProfile } from '../types';

const DATA_DIR = path.join(__dirname, '../../data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

// Default Admin Profile
const DEFAULT_USER = {
    email: 'admin@craftcommand.io',
    username: 'Administrator',
    avatarUrl: 'https://mc-heads.net/avatar/Administrator/64',
    password: 'admin', // Default password
    role: 'Owner',
    preferences: {
        accentColor: 'emerald',
        reducedMotion: false,
        notifications: { browser: true, sound: true, events: { onJoin: true, onCrash: true } },
        terminal: { fontSize: 13, fontFamily: 'monospace' }
    }
};

export class AuthService {
    constructor() {
        fs.ensureDirSync(DATA_DIR);
        if (!fs.existsSync(AUTH_FILE)) {
            fs.writeJSONSync(AUTH_FILE, DEFAULT_USER);
        }
    }

    getUser() {
        const user = fs.readJSONSync(AUTH_FILE);
        if (!user.avatarUrl && user.username) {
            user.avatarUrl = `https://mc-heads.net/avatar/${user.username}/64`;
        }
        return user;
    }

    updateUser(updates: any) {
        const current = this.getUser();
        const updated = { ...current, ...updates };

        // Auto-update avatar if name changes and avatar isn't explicitly changed
        if (updates.username && !updates.avatarUrl) {
            updated.avatarUrl = `https://mc-heads.net/avatar/${updates.username}/64`;
        }
        
        fs.writeJSONSync(AUTH_FILE, updated);
        return updated;
    }

    verifyCredentials(email: string, pass: string): boolean {
        const user = this.getUser();
        // In production, use bcrypt. For local app, direct compare is acceptable but not ideal.
        return user.email === email && user.password === pass;
    }
}

export const authService = new AuthService();
