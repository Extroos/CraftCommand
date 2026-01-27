import express from 'express';
import { getSystemStats } from '../services/SystemStats';
import { javaManager } from '../services/JavaManager';
import { authService } from '../services/AuthService';
import { systemSettingsService } from '../services/SystemSettingsService';
import { discordService } from '../services/DiscordService';

const router = express.Router();

// System Stats
router.get('/stats', async (req, res) => {
    console.log('[SystemRoute] GET /stats');
    const stats = await getSystemStats();
    res.json(stats);
});

import { systemService } from '../services/SystemService';

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
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    const success = authService.verifyCredentials(email, password);
    if (!success) {
         return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    res.json({ success: true });
});

// User Profile
router.get('/user', (req, res) => {
    res.json(authService.getUser());
});

router.patch('/user', (req, res) => {
    const updated = authService.updateUser(req.body);
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

import { updateService } from '../services/UpdateService';

// Updates
router.get('/updates/check', async (req, res) => {
    const { force } = req.query;
    const result = await updateService.checkForUpdates(force === 'true');
    res.json(result);
});

export default router;
