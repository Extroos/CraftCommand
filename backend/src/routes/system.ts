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
router.post('/cache/clear', async (req, res) => {
    const { type } = req.body;
    try {
        await systemService.clearCache(type);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Java Versions
router.get('/java', async (req, res) => {
    const versions = await javaManager.detectJavaVersions();
    res.json(versions);
});

// Login
// Audit Logs
router.get('/audit', verifyToken, requireRole(['OWNER', 'ADMIN']), (req, res) => {
    const { limit, action, userId } = req.query;
    let logs = auditService.getLogs(
        limit ? parseInt(limit as string) : 100,
        action as string
    );
    
    // Additional client-side filtering for userId if needed
    if (userId) {
        logs = logs.filter(log => log.userId === userId);
    }
    
    res.json(logs);
});

// User Profile
router.get('/user', verifyToken, (req, res) => {
    res.json(authService.getUser((req as any).user.id));
});

router.patch('/user', verifyToken, (req, res) => {
    const updated = authService.updateUser((req as any).user.id, req.body);
    res.json(updated);
});

// Global Settings
router.get('/settings', (req, res) => {
    console.log('[SystemRoute] GET /settings');
    res.json(systemSettingsService.getSettings());
});

router.patch('/settings', (req, res) => {
    const updated = systemSettingsService.updateSettings(req.body);
    res.json(updated);
});

// Discord Integration
router.get('/discord/status', (req, res) => {
    res.json(discordService.getStatus());
});

router.post('/discord/reconnect', async (req, res) => {
    try {
        await discordService.reconnect();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/discord/sync-commands', async (req, res) => {
    try {
        await discordService.deployCommands();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

import { updateService } from '../services/system/UpdateService';

// Updates
router.get('/updates/check', async (req, res) => {
    const { force } = req.query;
    const result = await updateService.checkForUpdates(force === 'true');
    res.json(result);
});

export default router;
