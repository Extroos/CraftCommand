import express from 'express';
import { getSystemStats } from '../services/system/SystemStats';
import { javaManager } from '../services/servers/JavaManager';
import { authService } from '../services/auth/AuthService';
import { systemSettingsService } from '../services/system/SystemSettingsService';
import { discordService } from '../services/integrations/DiscordService';
import { auditService } from '../services/system/AuditService';
import { verifyToken, requireRole } from '../middleware/authMiddleware';

const router = express.Router();

// System Stats
router.get('/stats', async (req, res) => {
    console.log('[SystemRoute] GET /stats');
    const stats = await getSystemStats();
    res.json(stats);
});

import { systemService } from '../services/system/SystemService';

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

import { updateService } from '../services/system/UpdateService';

// Updates
router.get('/updates/check', verifyToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    const { force } = req.query;
    const result = await updateService.checkForUpdates(force === 'true');
    res.json(result);
});

import { remoteAccessService } from '../services/system/RemoteAccessService';
import { requirePermission } from '../middleware/authMiddleware';

// Remote Access Status
router.get('/remote-access/status', verifyToken, requireRole(['OWNER', 'ADMIN']), (req, res) => {
    res.json(remoteAccessService.getStatus());
});

// Enable Remote Access
router.post('/remote-access/enable', verifyToken, requirePermission('system.remote_access.manage'), (req, res) => {
    const { method } = req.body;
    try {
        if (!['vpn', 'proxy', 'direct'].includes(method)) {
            throw new Error('Invalid method');
        }
        remoteAccessService.enable(method);
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
router.post('/remote-access/disable', verifyToken, requirePermission('system.remote_access.manage'), (req, res) => {
    try {
        remoteAccessService.disable();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
