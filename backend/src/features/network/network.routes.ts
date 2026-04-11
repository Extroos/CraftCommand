
import { Router } from 'express';
import { verifyToken, requireRole } from '../../middleware/authMiddleware';
import { networkService } from './NetworkService';
import { proxyService } from './ProxyService';
import { startupManager } from '../servers/StartupManager';
import { getServer, saveServer } from '../servers/ServerService';
import { ServerStatus } from '@shared/types';
import { auditService } from '../system/AuditService';
import { logger } from '../../utils/logger';

const router = Router();

// Proxy Linking
router.post('/proxy/link', verifyToken, requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
    const { proxyId, backendId, alias } = req.body;
    if (!proxyId || !backendId || !alias) {
        return res.status(400).json({ error: 'proxyId, backendId, and alias are required' });
    }
    try {
        proxyService.linkServer(proxyId, backendId, alias);
        res.json({ success: true });
        auditService.log(req.user.id, 'PROXY_LINK', backendId, { proxyId, alias });
    } catch (e) {
        res.status(500).json({ error: (e as Error).message });
    }
});

router.post('/proxy/unlink', verifyToken, requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
    const { proxyId, backendId } = req.body;
    if (!proxyId || !backendId) {
        return res.status(400).json({ error: 'proxyId and backendId are required' });
    }
    try {
        proxyService.unlinkServer(proxyId, backendId);
        
        // Trigger property enforcement to revert online-mode and forwarding
        const backend = getServer(backendId);
        if (backend) {
            await startupManager.enforceBackendProperties(backend);
            
            // If the server is online, mark it as needing restart to apply changes
            if (backend.status === ServerStatus.ONLINE) {
                saveServer({ ...backend, needsRestart: true });
            }
        }
        
        res.json({ success: true });
        auditService.log(req.user.id, 'PROXY_UNLINK', backendId, { proxyId });
    } catch (e) {
        res.status(500).json({ error: (e as Error).message });
    }
});

router.post('/proxy/unlink-by-server', verifyToken, requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
    const { serverId } = req.body;
    if (!serverId) {
        return res.status(400).json({ error: 'serverId is required' });
    }
    try {
        const proxy = proxyService.findProxyForServer(serverId);
        if (!proxy) {
            return res.json({ success: true, message: 'Server was not linked to any proxy' });
        }
        proxyService.unlinkServer(proxy.id, serverId);
        
        // Trigger property enforcement to revert online-mode and forwarding
        const backend = getServer(serverId);
        if (backend) {
            await startupManager.enforceBackendProperties(backend);
            
            // If the server is online, mark it as needing restart to apply changes
            if (backend.status === ServerStatus.ONLINE) {
                saveServer({ ...backend, needsRestart: true });
            }
        }

        res.json({ success: true });
        auditService.log(req.user.id, 'PROXY_UNLINK', serverId, { proxyId: proxy.id });
    } catch (e) {
        res.status(500).json({ error: (e as Error).message });
    }
});

// Debug middleware
router.use((req, res, next) => {
    logger.debug(`[NetworkRoutes] ${req.method} ${req.path}`);
    next();
});

// Dashboard-level status (Basic view)
router.get('/status', verifyToken, async (req, res) => {
    const { serverId } = req.query;
    const globalState = networkService.getState();
    
    if (serverId && typeof serverId === 'string') {
        const { getServer } = require('../servers/ServerService');
        const server = getServer(serverId);
        
        if (server && server.network?.hostname) {
            // Return cached status if available for instant UI
            const cached = networkService.getState().serverDdns?.[serverId];
            
            // If we have no cache or it's older than 1 minute, trigger a background refresh
            // This satisfies the "instant load" while keeping data fresh
            if (!cached || (Date.now() - (cached.lastVerifiedAt || 0) > 60000)) {
                // Background refresh
                networkService.verifyDdns(server.network.hostname).then(status => {
                    const state = networkService.getState();
                    if (!state.serverDdns) state.serverDdns = {};
                    state.serverDdns[serverId] = status;
                });
            }

            if (cached) {
                return res.json({
                    ...globalState,
                    ddns: cached
                });
            }

            // Fallback for first-time load
            const ddns = await networkService.verifyDdns(server.network.hostname);
            return res.json({
                ...globalState,
                ddns
            });
        }
    }
    
    res.json(globalState);
});

// Detailed Public IP Info
router.get('/public-ip', verifyToken, async (req, res) => {
    const ip = await networkService.getPublicIp();
    res.json({ ip });
});

router.get('/public-ip/history', verifyToken, requireRole(['OWNER', 'ADMIN']), (req, res) => {
    res.json(networkService.getState().publicIp.history);
});

// Diagnostics
router.post('/ddns/verify', verifyToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    const { hostname } = req.body;
    if (!hostname) {
        return res.status(400).json({ error: 'Hostname is required' });
    }
    const status = await networkService.verifyDdns(hostname);
    res.json(status);
});

router.post('/ddns/update', verifyToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    const { serverId } = req.body;
    if (!serverId) {
        return res.status(400).json({ error: 'Server ID is required' });
    }
    try {
        const status = await networkService.updateDdns(serverId);
        res.json(status);
        auditService.log(req.user.id, 'DDNS_UPDATE', serverId, { status });
    } catch (e) {
        res.status(500).json({ error: (e as Error).message });
    }
});

// GET version for easy debugging/manual trigger
router.get('/ddns/update', verifyToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    const { serverId } = req.query;
    if (!serverId || typeof serverId !== 'string') {
        return res.status(400).json({ error: 'Server ID is required' });
    }
    try {
        const status = await networkService.updateDdns(serverId);
        res.json(status);
        auditService.log(req.user.id, 'DDNS_UPDATE', serverId, { status, method: 'GET' });
    } catch (e) {
        res.status(500).json({ error: (e as Error).message });
    }
});

router.post('/port-check', verifyToken, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    const { port } = req.body;
    if (!port) {
        return res.status(400).json({ error: 'Port is required' });
    }
    const status = await networkService.checkPort(port);
    res.json(status);
});

router.post('/proxy/install-via-suite', verifyToken, requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
    const { proxyId } = req.body;
    if (!proxyId) return res.status(400).json({ error: 'Missing proxyId' });

    try {
        await proxyService.installViaSuite(proxyId);
        res.json({ success: true });
        auditService.log(req.user.id, 'PROXY_INSTALL', proxyId);
    } catch (e) {
        res.status(500).json({ error: (e as Error).message });
    }
});

export default router;
