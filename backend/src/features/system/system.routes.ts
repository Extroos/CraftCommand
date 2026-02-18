import express from 'express';
import { getSystemStats } from './SystemStats';
import { javaManager } from '../processes/JavaManager';
import { authService } from '../auth/AuthService';
import { systemSettingsService } from './SystemSettingsService';
import { discordService } from '../integrations/DiscordService';
import { auditService } from './AuditService';
import { verifyToken, requireRole, requirePermission } from '../../middleware/authMiddleware';
import { installerService } from '../installer/InstallerService';
import { autoHealingService } from '../servers/AutoHealingService';

const router = express.Router();

// System Stats
router.get('/stats', async (req, res) => {
    console.log('[SystemRoute] GET /stats');
    const stats = await getSystemStats();
    res.json(stats);
});

// Real-time Health Telemetry (AutoHealing v3)
router.get('/health', verifyToken, async (req, res) => {
    try {
        const stats = await getSystemStats(); // Basic stats
        const hostHealth = await autoHealingService.checkHostHealth(); // Detailed IO/Sentinel stats
        const stabilityMarkers = autoHealingService.getAllStabilityMarkers();
        
        res.json({
            ...hostHealth,
            stabilityMarkers,
            uptime: process.uptime(),
            timestamp: Date.now()
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

import { systemService } from './SystemService';

// Cache Stats
router.get('/cache', async (req, res) => {
    try {
        const stats = await systemService.getCacheStats();
        res.json(stats);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Clear Cache
router.post('/cache/clear', verifyToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    const { type } = req.body;
    try {
        await systemService.clearCache(type);
        res.json({ success: true });
        auditService.log((req as any).user.id, 'SYSTEM_CACHE_CLEAR', 'system', { type });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Java Versions (Authenticated)
router.get('/java', verifyToken, async (req, res) => {
    const versions = await javaManager.detectJavaVersions();
    res.json(versions);
});

// Bedrock Versions (Authenticated)
router.get('/bedrock/versions', verifyToken, async (req, res) => {
    try {
        const result = await installerService.fetchBedrockVersions();
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ... Login / Audit ...

// Global Settings - READ (Authenticated for basic settings, maybe mask secrets?)
router.get('/settings', verifyToken, (req, res) => {
    // console.log('[SystemRoute] GET /settings');
    const settings = systemSettingsService.getSettings();
    // Safety: Mask Discord Token in response? 
    // For now we assume only trusted users get tokens? 
    // Actually, settings page needs it to edit.
    // Let's enforce ADMIN for this route to be safe.
    // Wait, viewer might need theme? 
    // Theme is in user preferences usually. Global settings are system-wide.
    // Safe to require ADMIN for global config.
    if ((req as any).user.role !== 'OWNER' && (req as any).user.role !== 'ADMIN') {
        const safe = { app: { theme: settings.app.theme } }; // Only expose theme
        return res.json(safe);
    }
    res.json(settings);
});

// Global Settings - WRITE (Strict)
router.patch('/settings', verifyToken, requireRole(['OWNER', 'ADMIN']), (req, res) => {
    const updated = systemSettingsService.updateSettings(req.body);
    res.json(updated);
    auditService.log((req as any).user.id, 'SYSTEM_SETTINGS_UPDATE', 'system', { updates: Object.keys(req.body) });
});

// Discord Integration (Strict)
router.get('/discord/status', verifyToken, requireRole(['OWNER', 'ADMIN']), (req, res) => {
    res.json(discordService.getStatus());
});

router.post('/discord/reconnect', verifyToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    try {
        await discordService.reconnect();
        res.json({ success: true });
        auditService.log((req as any).user.id, 'DISCORD_RECONNECT', 'system');
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/discord/sync-commands', verifyToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    try {
        await discordService.deployCommands();
        res.json({ success: true });
        auditService.log((req as any).user.id, 'DISCORD_SYNC', 'system');
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

import { remoteAccessService } from './RemoteAccessService';

// Remote Access Status
router.get('/remote-access/status', verifyToken, requireRole(['OWNER', 'ADMIN']), (req, res) => {
    res.json(remoteAccessService.getStatus());
});

// Enable Remote Access
router.post('/remote-access/enable', verifyToken, requirePermission('system.remote_access.manage'), async (req, res) => {
    const { method } = req.body;
    try {
        if (!['vpn', 'proxy', 'direct', 'cloudflare'].includes(method)) {
            throw new Error('Invalid method');
        }
        await remoteAccessService.enable(method);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Audit Log
router.get('/audit', verifyToken, requireRole(['OWNER', 'ADMIN']), (req, res) => {
    const { limit, offset, action, userId, resourceId, search } = req.query;
    const result = auditService.getLogs({
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
        action: action as string,
        userId: userId as string,
        resourceId: resourceId as string,
        search: search as string
    });
    res.json(result);
});

// Disable Remote Access
router.post('/remote-access/disable', verifyToken, requirePermission('system.remote_access.manage'), async (req, res) => {
    try {
        await remoteAccessService.disable();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Docker Status Check
import { exec } from 'child_process';
import util from 'util';
const execAsync = util.promisify(exec);

router.get('/docker/status', verifyToken, async (req, res) => {
    try {
        const { stdout } = await execAsync('docker info --format "{{.ServerVersion}}"');
        res.json({ online: true, version: stdout.trim() });
    } catch (e: any) {
        res.json({ online: false, error: 'Docker Daemon not reachable' });
    }
});

export default router;
