import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { authService } from '../auth/AuthService';
import { discordService } from '../integrations/DiscordService';
import { logger } from '../../utils/logger';
import { notificationService } from './NotificationService';
import { nodeRegistryService } from '../nodes/NodeRegistryService';

import { updateVerifier } from './UpdateVerifier';
import AdmZip from 'adm-zip';

const REMOTE_VERSION_URL = 'https://raw.githubusercontent.com/Extroos/Craft-Commands/main/version.json';
const GITHUB_RELEASES_API = 'https://api.github.com/repos/Extroos/Craft-Commands/releases/tags';

export type UpdateStatus = 'IDLE' | 'CHECKING' | 'DOWNLOADING' | 'VERIFYING' | 'READY_TO_INSTALL' | 'ERROR';

export interface UpdateStateInfo {
    status: UpdateStatus;
    progress: number; // 0-100
    currentStep?: string;
    error?: string;
    targetVersion?: string;
}

type UpdateLevel = 'MAJOR' | 'MINOR' | 'PATCH';

interface VersionInfo {
    version: string;
    title: string;
    notes: string[];
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    breaking?: boolean;
    minNodeVersion?: string;
    minAgentVersion?: string;
}

interface UpdateCheckResult {
    available: boolean;
    currentVersion: string;
    latestVersion: string;
    title?: string;
    notes?: string[];
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    breaking?: boolean;
    incompatible?: boolean;
    incompatibleNodes?: { id: string; name: string; version: string }[];
    level?: UpdateLevel;
    error?: string;
}

interface InternalUpdateState {
    lastNotifiedVersion?: string;
}

class UpdateService {
    private localVersionFile = path.join(process.cwd(), '../version.json');
    private stateFile = path.join(process.cwd(), 'data/update_state.json');
    private lastCheck = 0;
    private cachedResult: UpdateCheckResult | null = null;
    private CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
    private checkIntervalId: NodeJS.Timeout | null = null;

    // Phase 2: Update Lifecycle State
    private updateStatus: UpdateStateInfo = { status: 'IDLE', progress: 0 };
    private TEMP_DIR = path.join(process.cwd(), '../temp_update');
    private EXTRACT_DIR = path.join(process.cwd(), '../temp_update', 'extracted');
    private PLAN_FILE = path.join(process.cwd(), '../update-plan.json');

    public initialize() {
        // Initial check after short delay to allow server to fully boot
        setTimeout(() => {
            this.checkForUpdates();
        }, 60000); // 1 minute delay

        // Periodic check
        this.checkIntervalId = setInterval(() => {
            this.checkForUpdates();
        }, this.CHECK_INTERVAL);
        
        logger.info('[UpdateService] Initialized with auto-check enabled.');
    }

    /**
     * Checks for application updates with advanced infrastructure awareness.
     * Ensures perfect backward compatibility with older Dashboard versions.
     * @param force - If true, bypasses the cache and user preferences.
     */
    public async checkForUpdates(force = false): Promise<UpdateCheckResult> {
        const currentVersion = this.getLocalVersion();

        try {
            const owner = authService.getOwner();
            const updatesEnabled = owner?.preferences?.updates?.check ?? true;
            
            if (!updatesEnabled && !force) {
                return { available: false, currentVersion, latestVersion: currentVersion };
            }

            const now = Date.now();
            if (!force && this.cachedResult && (now - this.lastCheck < this.CHECK_INTERVAL)) {
                return this.cachedResult;
            }

            const remoteData = await this.fetchRemoteVersion(3);
            const level = this.getUpdateLevel(currentVersion, remoteData.version);
            const available = level !== null;

            // Check Distributed Nodes Compatibility
            const nodes = nodeRegistryService.getAllNodes();
            const incompatibleNodes: { id: string; name: string; version: string }[] = [];
            
            if (remoteData.minAgentVersion) {
                 for (const node of nodes) {
                    // Local node shares version with backend, so it's always compatible after update
                    if (node.id === 'local') continue; 
                    
                    if (node.agentVersion && this.compareVersions(node.agentVersion, remoteData.minAgentVersion) < 0) {
                        incompatibleNodes.push({ 
                            id: node.id, 
                            name: node.name, 
                            version: node.agentVersion 
                        });
                    }
                 }
            }

            const isNodeIncompatible = incompatibleNodes.length > 0;
            const isSystemIncompatible = remoteData.minNodeVersion 
                ? this.compareVersions(process.versions.node, remoteData.minNodeVersion) < 0 
                : false;

            const incompatible = isSystemIncompatible || isNodeIncompatible;

            // Smart Breaking: Major and Minor jumps are always considered breaking
            const breaking = (level === 'MAJOR' || level === 'MINOR') || (remoteData.breaking || false);

            this.cachedResult = {
                available,
                currentVersion,
                latestVersion: remoteData.version,
                title: remoteData.title,
                notes: remoteData.notes,
                priority: remoteData.priority || (level === 'MAJOR' ? 'CRITICAL' : (level === 'MINOR' ? 'HIGH' : 'LOW')),
                breaking,
                incompatible, // General flag
                incompatibleNodes, // Specific details
                level: level || undefined
            };
            this.lastCheck = now;

            if (available) {
                this.handleUpdateNotifications(this.cachedResult);
            }
            
            return this.cachedResult;
        } catch (e: any) {
            logger.error(`[UpdateService] Check failed: ${e.message}`);
            return { 
                available: false, 
                currentVersion, 
                latestVersion: currentVersion,
                error: e.message 
            };
        }
    }

    /**
     * Categorizes the jump level between two semver strings.
     * Only returns a level if latest is strictly greater than current.
     */
    private getUpdateLevel(current: string, latest: string): UpdateLevel | null {
        if (this.compareVersions(latest, current) <= 0) return null;

        const cParts = current.replace(/^v/, '').split('.').map(n => parseInt(n || '0', 10));
        const lParts = latest.replace(/^v/, '').split('.').map(n => parseInt(n || '0', 10));

        if (lParts[0] > cParts[0]) return 'MAJOR';
        if (lParts[1] > cParts[1]) return 'MINOR';
        if (lParts[2] > cParts[2]) return 'PATCH';
        
        return null;
    }

    private async fetchRemoteVersion(retries: number): Promise<VersionInfo> {
        let lastError: any;
        for (let i = 0; i < retries; i++) {
            try {
                const response = await axios.get(REMOTE_VERSION_URL, { timeout: 8000 });
                const data = response.data as VersionInfo;
                if (data && typeof data.version === 'string') {
                    return data;
                }
                throw new Error('Malformed remote version metadata');
            } catch (e: any) {
                lastError = e;
                if (i < retries - 1) {
                    // Exponential backoff: 2s, 4s, 8s...
                    const delay = 2000 * Math.pow(2, i);
                    logger.warn(`[UpdateService] Check failed, retrying in ${delay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError;
    }

    private async handleUpdateNotifications(result: UpdateCheckResult) {
        try {
            const state = this.getInternalState();
            if (state.lastNotifiedVersion === result.latestVersion) return;

            const priorityColor = result.priority === 'CRITICAL' ? 0xff0000 : (result.priority === 'HIGH' ? 0xffa500 : 0x3b82f6);
            let description = `A new version of CraftCommand is available: **v${result.latestVersion}**\n\n`;
            
            if (result.level === 'MAJOR' || result.breaking) {
                description += `⚠️ **CRITICAL**: This is a major update at a different protocol level.\n`;
            } else if (result.level === 'MINOR') {
                description += `📢 **MAJOR UPDATE**: New features and stabilization.\n`;
            }

            if (result.incompatible) {
                description += `🚫 **INCOMPATIBLE**: Your Node.js version (${process.versions.node}) is below the required v${result.latestVersion}'s minimum.\n`;
            }
            
            description += `\n**Changelog**: ${result.title || 'General improvements'}`;

            await discordService.sendNotification(
                `System Update: ${result.priority} Priority`,
                description,
                priorityColor
            );

            this.saveInternalState({ lastNotifiedVersion: result.latestVersion });
        } catch (e) {
            logger.error(`[UpdateService] Notification failed: ${e}`);
        }
        
        try {
             // System Notification (In-App) - Target Admins/Owners ONLY
             let notifType = 'INFO';
             let dismissible = true;

             if (result.level === 'MAJOR') {
                 notifType = 'ERROR';
                 dismissible = false;
             } else if (result.level === 'MINOR') {
                 notifType = 'WARNING';
             }

             // Fetch all users and filter for high-privilege roles
             // We import userRepository here to avoid circular dependency issues at top level if any
             const { userRepository } = await import('../../storage/UserRepository');
             const allUsers = userRepository.findAll();
             const targetUsers = allUsers.filter(u => u.role === 'OWNER' || u.role === 'ADMIN');

             if (targetUsers.length === 0) {
                 logger.debug('[UpdateService] No admins found to notify.');
                 return;
             }

             logger.info(`[UpdateService] Sending update notification to ${targetUsers.length} administrators.`);

             for (const user of targetUsers) {
                await notificationService.create(
                    user.id, 
                    notifType as any, 
                    `System Update: v${result.latestVersion}`, 
                    `A new ${result.level || 'PATCH'} update is available.\n${result.title || ''}`,
                    { version: result.latestVersion, breaking: result.breaking, level: result.level },
                    '/settings/system', // Internal link to Global Settings > Update System
                    { dismissible, actionLabel: 'Review & Install' }
                );
             }

        } catch (e) {
            logger.error(`[UpdateService] System Notification failed: ${e}`);
        }
    }

    private getLocalVersion(): string {
        try {
            if (fs.existsSync(this.localVersionFile)) {
                const data = fs.readJSONSync(this.localVersionFile);
                return data?.version || '0.0.0';
            }
        } catch (e) {
            logger.warn('[UpdateService] Failed to read version.json, defaulting to 0.0.0');
        }
        return '0.0.0';
    }

    private getInternalState(): InternalUpdateState {
        try {
            if (fs.existsSync(this.stateFile)) {
                return fs.readJSONSync(this.stateFile);
            }
        } catch (e) {}
        return {};
    }

    private saveInternalState(state: InternalUpdateState) {
        try {
            fs.ensureDirSync(path.dirname(this.stateFile));
            fs.writeJSONSync(this.stateFile, state, { spaces: 2 });
        } catch (e) {}
    }



    // ========================================================================
    // PHASE 2: UPDATE EXECUTION (Download -> Verify -> Prepare)
    // ========================================================================

    public getStatus(): UpdateStateInfo {
        return this.updateStatus;
    }

    public resetStatus() {
        this.updateStatus = { status: 'IDLE', progress: 0 };
    }

    /**
     * Step 1: Download the update bundle and signature from GitHub
     */
    public async downloadUpdate(version: string): Promise<void> {
        if (this.updateStatus.status !== 'IDLE' && this.updateStatus.status !== 'ERROR') {
            throw new Error('Update already in progress.');
        }

        this.updateStatus = { 
            status: 'DOWNLOADING', 
            progress: 0, 
            targetVersion: version,
            currentStep: 'Fetching release metadata...' 
        };

        try {
            // 1. Get Release Assets
            const releaseUrl = `${GITHUB_RELEASES_API}/v${version}`;
            logger.info(`[UpdateService] Fetching release metadata from ${releaseUrl}`);
            
            const metaResponse = await axios.get(releaseUrl, { 
                headers: { 'User-Agent': 'CraftCommand-Backend' } 
            });
            
            const assets = (metaResponse.data as any).assets;
            if (!assets) throw new Error('No assets found for this release.');

            const bundleAsset = assets.find((a: any) => a.name.endsWith('.zip'));
            const manifestAsset = assets.find((a: any) => a.name === 'manifest.json');
            const signatureAsset = assets.find((a: any) => a.name === 'manifest.sig');

            if (!bundleAsset || !manifestAsset || !signatureAsset) {
                throw new Error('Release is missing required artifacts (bundle, manifest, or signature).');
            }

            // 2. Clear Temp
            await fs.emptyDir(this.TEMP_DIR);

            // 3. Download Artifacts
            this.updateStatus.currentStep = 'Downloading manifest...';
            await this.downloadFile(manifestAsset.browser_download_url, path.join(this.TEMP_DIR, 'manifest.json'));

            this.updateStatus.currentStep = 'Downloading signature...';
            await this.downloadFile(signatureAsset.browser_download_url, path.join(this.TEMP_DIR, 'manifest.sig'));

            this.updateStatus.currentStep = 'Downloading bundle...';
            this.updateStatus.progress = 10;
            // Pass progress callback if we want granular progress
            await this.downloadFile(bundleAsset.browser_download_url, path.join(this.TEMP_DIR, 'update.zip'));
            
            this.updateStatus.progress = 50;
            this.updateStatus.status = 'VERIFYING';
            this.updateStatus.currentStep = 'Verifying signature...';

            await this.verifyUpdate(path.join(this.TEMP_DIR, 'update.zip'));

        } catch (e: any) {
            logger.error(`[UpdateService] Download failed: ${e.message}`);
            this.updateStatus = { 
                status: 'ERROR', 
                progress: 0, 
                error: e.message,
                targetVersion: version 
            };
            throw e;
        }
    }

    /**
     * Step 2: Verify integrity and signature
     */
    private async verifyUpdate(bundlePath: string): Promise<void> {
        try {
            const manifestPath = path.join(this.TEMP_DIR, 'manifest.json');
            const sigPath = path.join(this.TEMP_DIR, 'manifest.sig');

            if (!fs.existsSync(manifestPath) || !fs.existsSync(sigPath)) {
                throw new Error('Manifest or signature file missing.');
            }

            // 1. Verify Signature
            const manifestContent = await fs.readFile(manifestPath); // Buffer
            const signatureBase64 = await fs.readFile(sigPath, 'utf-8');

            const isValid = updateVerifier.verifySignature(manifestContent, signatureBase64);
            if (!isValid) {
                throw new Error('CRITICAL: Manifest signature verification failed! The update may be tampered with.');
            }
            logger.info('[UpdateService] Manifest signature VERIFIED.');

            // 2. Parse Manifest
            const manifest = updateVerifier.parseManifest(manifestContent.toString());
            
            // 3. Verify Bundle Hash
            // Assuming manifest.files contains keys like "craftcommand-v1.2.0.zip"
            // We need to match the downloaded 'update.zip' against the hash in manifest
            // For simplicity, we assume the manifest has one zip entry or we blindly check values.
            // Better: Check based on filename. But we renamed to update.zip.
            // Let's check if manifest has ANY zip file hash that matches our file.
            
            const bundleBuffer = await fs.readFile(bundlePath);
            const bundleHash = crypto.createHash('sha256').update(bundleBuffer).digest('hex');
            
            const match = Object.values(manifest.files).find(h => h.toLowerCase() === bundleHash.toLowerCase());
            
            if (!match) {
                 throw new Error(`Bundle hash mismatch! Computed: ${bundleHash}`);
            }
            logger.info('[UpdateService] Bundle hash VERIFIED.');

            this.updateStatus.progress = 75;
            this.updateStatus.status = 'READY_TO_INSTALL';
            this.updateStatus.currentStep = 'Ready to install.';

            // Prepare Plan automatically?
            await this.prepareUpdate(manifest);

        } catch (e: any) {
             logger.error(`[UpdateService] Verification failed: ${e.message}`);
             this.updateStatus = { 
                status: 'ERROR', 
                progress: 0, 
                error: e.message 
            };
            throw e;
        }
    }

    /**
     * Step 3: Prepare for Launcher
     */
    private async prepareUpdate(manifest: any): Promise<void> {
        try {
            this.updateStatus.currentStep = 'Preparing update plan...';
            
            // Unzip to extracted
            const zip = new AdmZip(path.join(this.TEMP_DIR, 'update.zip'));
            zip.extractAllTo(this.EXTRACT_DIR, true);

            // Create Plan
            const plan = {
                version: manifest.version,
                sourceDir: this.EXTRACT_DIR,
                backupDir: path.join(process.cwd(), '../backups', `v${this.getLocalVersion()}`),
                restart: true
            };

            await fs.writeJSON(this.PLAN_FILE, plan, { spaces: 2 });
            logger.info('[UpdateService] Update plan written to ' + this.PLAN_FILE);

            this.updateStatus.progress = 100;
            this.updateStatus.currentStep = 'Waiting for user to restart.';
        } catch (e: any) {
             throw new Error(`Failed to prepare update: ${e.message}`);
        }
    }

    private async downloadFile(url: string, dest: string): Promise<void> {
        const writer = fs.createWriteStream(dest);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });
        
        (response.data as NodeJS.ReadableStream).pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    }

    private compareVersions(v1: string, v2: string): number {
        const clean1 = v1.replace(/^v/, '').split('-')[0];
        const clean2 = v2.replace(/^v/, '').split('-')[0];
        
        const parts1 = clean1.split('.').map(n => parseInt(n || '0', 10));
        const parts2 = clean2.split('.').map(n => parseInt(n || '0', 10));
        
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        
        return 0;
    }

    shutdown() {
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
            this.checkIntervalId = null;
        }
        logger.info('[UpdateService] Service stopped.');
    }
}

export const updateService = new UpdateService();



