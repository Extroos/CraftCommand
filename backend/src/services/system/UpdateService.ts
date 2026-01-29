import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { authService } from '../auth/AuthService';

const REMOTE_VERSION_URL = 'https://raw.githubusercontent.com/Extroos/craftCommand/main/version.json';

interface VersionInfo {
    version: string;
    title: string;
    notes: string[];
}

interface UpdateCheckResult {
    available: boolean;
    currentVersion: string;
    latestVersion: string;
    title?: string;
    notes?: string[];
    error?: string;
}

class UpdateService {
    private localVersionFile = path.join(process.cwd(), '../version.json');
    private lastCheck = 0;
    private cachedResult: UpdateCheckResult | null = null;
    private CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

    public async checkForUpdates(force = false): Promise<UpdateCheckResult> {
        // 1. Check User Preference
        const user = authService.getOwner();
        const updatesEnabled = user.preferences?.updates?.check ?? true; // Default true if missing
        
        if (!updatesEnabled && !force) {
            return { available: false, currentVersion: this.getLocalVersion(), latestVersion: this.getLocalVersion() };
        }

        // 2. Check Cache (One check per day)
        const now = Date.now();
        if (!force && this.cachedResult && (now - this.lastCheck < this.CHECK_INTERVAL)) {
            return this.cachedResult;
        }

        const currentVersion = this.getLocalVersion();

        try {
            // 3. Fetch Remote
            const response = await axios.get<VersionInfo>(REMOTE_VERSION_URL, { timeout: 5000 });
            const remoteData = response.data;
            
            // 4. Compare
            const available = this.compareVersions(currentVersion, remoteData.version) < 0; // current < remote

            this.cachedResult = {
                available,
                currentVersion,
                latestVersion: remoteData.version,
                title: remoteData.title,
                notes: remoteData.notes
            };
            this.lastCheck = now;
            
            return this.cachedResult;
        } catch (e: any) {
            console.error('[UpdateService] Update check failed:', e.message);
            // Return "no update" on failure to stay silent
            return { 
                available: false, 
                currentVersion, 
                latestVersion: currentVersion,
                error: e.message 
            };
        }
    }

    private getLocalVersion(): string {
        try {
            if (fs.existsSync(this.localVersionFile)) {
                const data = fs.readJSONSync(this.localVersionFile);
                return data.version;
            }
        } catch (e) {
            console.warn('[UpdateService] Could not read local version.json');
        }
        return '0.0.0';
    }

    private compareVersions(v1: string, v2: string): number {
        // Strip leading 'v' if present
        const clean1 = v1.replace(/^v/, '');
        const clean2 = v2.replace(/^v/, '');
        
        // Split by dots and compare numeric parts
        const parts1 = clean1.split('.');
        const parts2 = clean2.split('.');
        
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            // Extract numeric part of segment (e.g. "0-unstable" -> 0)
            const p1 = parseInt(parts1[i] || '0', 10);
            const p2 = parseInt(parts2[i] || '0', 10);
            
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        
        // If numeric parts are equal, consider them equal for our purposes.
        // We aren't implementing a full semver parser (which would say 1.5.0-unstable < 1.5.0).
        // For update notifications, we mostly care if the numeric version is HIGHER.
        return 0;
    }
}

export const updateService = new UpdateService();
