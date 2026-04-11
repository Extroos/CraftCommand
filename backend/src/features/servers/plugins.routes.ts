import express from 'express';
import { pluginService } from '../plugins/PluginService';
import { pluginConfigService } from '../plugins/PluginConfigService';
import { verifyToken, requirePermission, requireCapability } from '../../middleware/authMiddleware';
import { auditService } from '../system/AuditService';
import { logger } from '../../utils/logger';

import {  PluginSearchQuery, PluginSource  } from '@shared/types';

const router = express.Router();

// All routes require authentication and plugin support
router.use(verifyToken);
router.use(requireCapability('supportsPlugins'));


// ===================
// Marketplace Search
// ===================

// GET /api/plugins/search?query=X&source=modrinth&page=1&sort=downloads&serverId=xxx
router.get('/search', requirePermission('server.view'), async (req, res) => {
    try {
        const serverId = req.query.serverId as string;
        if (!serverId) {
            return res.status(400).json({ error: 'serverId query param is required' });
        }

        const query: PluginSearchQuery = {
            query: (req.query.query as string) || '',
            category: req.query.category as string,
            source: req.query.source as PluginSource | undefined,
            gameVersion: req.query.gameVersion as string,
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 20,
            sort: (req.query.sort as PluginSearchQuery['sort']) || 'downloads',
        };

        const result = await pluginService.search(query, serverId);
        res.json(result);
    } catch (err: any) {
        logger.error(`[PluginRoutes] ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// ===================
// Installed Plugins
// ===================

// GET /api/plugins/servers/:id - List installed plugins for a server
router.get('/servers/:id', requirePermission('server.view'), async (req, res) => {
    try {
        const plugins = pluginService.getInstalled(req.params.id);
        res.json(plugins);
    } catch (err: any) {
        logger.error(`[PluginRoutes] List error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/plugins/servers/:id/scan - Scan plugins dir and reconcile with DB
router.get('/servers/:id/scan', requirePermission('server.files.read'), async (req, res) => {
    try {
        const plugins = await pluginService.scanInstalled(req.params.id);
        res.json(plugins);
    } catch (err: any) {
        logger.error(`[PluginRoutes] Scan error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/plugins/servers/:id/install - Install a plugin from marketplace
router.post('/servers/:id/install', requirePermission('server.files.write'), async (req, res) => {
    try {
        const { sourceId, source } = req.body;
        if (!sourceId || !source) {
            return res.status(400).json({ error: 'sourceId and source are required' });
        }

        const validSources = ['modrinth', 'spiget', 'hangar'];
        if (!validSources.includes(source)) {
            return res.status(400).json({ error: `Invalid source. Must be one of: ${validSources.join(', ')}` });
        }

        const plugin = await pluginService.install(req.params.id, sourceId, source as PluginSource);
        res.json(plugin);
        auditService.log(req.user.id, 'PLUGIN_INSTALL', req.params.id, { 
            pluginName: plugin.name, 
            source, 
            sourceId 
        });
    } catch (err: any) {
        logger.error(`[PluginRoutes] Install error: ${err.message}`);
        const msg = err.message || 'Install failed';
        
        if (msg.includes('not found') || msg.includes('not exist')) {
            return res.status(404).json({ error: msg });
        }
        if (msg.includes('not support') || msg.includes('Invalid')) {
            return res.status(400).json({ error: msg });
        }
        // Download/marketplace failures — use 502 (Bad Gateway) to indicate upstream issue
        if (msg.includes('download') || msg.includes('marketplace') || msg.includes('compatible')) {
            return res.status(502).json({ error: msg });
        }
        res.status(500).json({ error: msg });
    }
});

// DELETE /api/plugins/servers/:id/:pluginId - Uninstall a plugin
router.delete('/servers/:id/:pluginId', requirePermission('server.files.write'), async (req, res) => {
    try {
        await pluginService.uninstall(req.params.id, req.params.pluginId);
        res.json({ success: true });
        auditService.log(req.user.id, 'PLUGIN_UNINSTALL', req.params.id, { pluginId: req.params.pluginId });
    } catch (err: any) {
        logger.error(`[PluginRoutes] Uninstall error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/plugins/servers/:id/:pluginId/toggle - Enable/disable plugin
router.patch('/servers/:id/:pluginId/toggle', requirePermission('server.files.write'), async (req, res) => {
    try {
        const plugin = await pluginService.toggle(req.params.id, req.params.pluginId);
        res.json(plugin);
        auditService.log(req.user.id, 'PLUGIN_TOGGLE', req.params.id, { 
            pluginId: req.params.pluginId, 
            pluginName: plugin.name,
            enabled: plugin.enabled 
        });
    } catch (err: any) {
        logger.error(`[PluginRoutes] Toggle error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/plugins/servers/:id/:pluginId/update - Update plugin to latest
router.post('/servers/:id/:pluginId/update', requirePermission('server.files.write'), async (req, res) => {
    try {
        const plugin = await pluginService.update(req.params.id, req.params.pluginId);
        res.json(plugin);
        auditService.log(req.user.id, 'PLUGIN_UPDATE', req.params.id, { 
            pluginId: req.params.pluginId, 
            pluginName: plugin.name,
            version: plugin.version 
        });
    } catch (err: any) {
        logger.error(`[PluginRoutes] Update error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/plugins/servers/:id/bulk-update - Update multiple plugins
router.post('/servers/:id/bulk-update', requirePermission('server.files.write'), async (req, res) => {
    try {
        const { pluginIds } = req.body;
        if (!Array.isArray(pluginIds) || pluginIds.length === 0) {
            return res.status(400).json({ error: 'pluginIds array is required and cannot be empty' });
        }
        
        const results = await pluginService.bulkUpdate(req.params.id, pluginIds);
        res.json(results);
        auditService.log(req.user.id, 'PLUGIN_BULK_UPDATE', req.params.id, { 
            pluginIds,
            count: results.length 
        });
    } catch (err: any) {
        logger.error(`[PluginRoutes] Bulk update error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/plugins/servers/:id/updates - Check for available updates
router.get('/servers/:id/updates', requirePermission('server.view'), async (req, res) => {
    try {
        const updates = await pluginService.checkUpdates(req.params.id);
        res.json(updates);
    } catch (err: any) {
        logger.error(`[PluginRoutes] Update check error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// ===================
// Plugin Config Editor
// ===================

// GET /api/plugins/servers/:id/:pluginId/config/files - List config files
router.get('/servers/:id/:pluginId/config/files', requirePermission('server.files.read'), async (req, res) => {
    try {
        const subPath = (req.query.path as string) || '';
        const files = await pluginConfigService.listFiles(req.params.id, req.params.pluginId, subPath);
        res.json(files);
    } catch (err: any) {
        logger.error(`[PluginRoutes] Config list error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/plugins/servers/:id/:pluginId/config/read - Read a config file
router.get('/servers/:id/:pluginId/config/read', requirePermission('server.files.read'), async (req, res) => {
    try {
        const filePath = req.query.path as string;
        if (!filePath) return res.status(400).json({ error: 'path query param is required' });
        
        const content = await pluginConfigService.readFile(req.params.id, req.params.pluginId, filePath);
        res.json({ content });
    } catch (err: any) {
        logger.error(`[PluginRoutes] Config read error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/plugins/servers/:id/:pluginId/config/save - Save a config file
router.post('/servers/:id/:pluginId/config/save', requirePermission('server.files.write'), async (req, res) => {
    try {
        const { path: filePath, content } = req.body;
        if (!filePath || content === undefined) {
            return res.status(400).json({ error: 'path and content are required' });
        }
        
        await pluginConfigService.saveFile(req.params.id, req.params.pluginId, filePath, content);
        res.json({ success: true });
        auditService.log(req.user.id, 'PLUGIN_CONFIG_SAVE', req.params.id, { 
            pluginId: req.params.pluginId, 
            path: filePath 
        });
    } catch (err: any) {
        logger.error(`[PluginRoutes] Config save error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

export default router;
