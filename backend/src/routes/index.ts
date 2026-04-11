
import { Express } from 'express';
import { logger } from '../utils/logger';
import authRoutes from '../features/auth/auth.routes';
import profileRoutes from '../features/auth/profiles.routes';
import serverRoutes from '../features/servers/servers.routes';
import pluginRoutes from '../features/servers/plugins.routes';
import systemRoutes from '../features/system/system.routes';
import settingsRoutes from '../features/system/settings.routes';
import assetsRoutes from '../features/system/assets.routes';
import { notificationRoutes } from '../features/system/notifications.routes';
import modpackRoutes from '../features/installer/modpacks.routes';
import templateRoutes from '../features/installer/templates.routes';
import importRoutes from '../features/installer/import.routes';
import installRoutes from '../features/installer/install.routes';
import nodesRoutes from '../features/nodes/nodes.routes';
import networkRoutes from '../features/network/network.routes';
import crossplayRoutes from '../features/network/crossplay.routes';
import updateRoutes from '../features/system/update.routes';
import extensionsRoutes from '../features/system/extensions.routes';
import mapRoutes from '../features/servers/map.routes';



export const setupRoutes = (app: Express) => {
    logger.info('[Routes] Registering /api/auth');
    app.use('/api/auth', authRoutes);
    app.use('/api/profiles', profileRoutes);

    logger.info('[Routes] Registering /api/servers');
    app.use('/api/servers', serverRoutes);
    app.use('/api/plugins', pluginRoutes);

    logger.info('[Routes] Registering /api/system');
    app.use('/api/system/update', updateRoutes); // Register specific routes before generic /api/system
    app.use('/api/system', systemRoutes);
    app.use('/api/settings', settingsRoutes);
    app.use('/api/assets', assetsRoutes);
    app.use('/api/notifications', notificationRoutes);

    logger.info('[Routes] Registering /api/installer');
    app.use('/api/modpacks', modpackRoutes);
    app.use('/api/templates', templateRoutes);
    app.use('/api/import', importRoutes);
    app.use('/api/install', installRoutes);

    logger.info('[Routes] Registering /api/nodes');
    app.use('/api/nodes', nodesRoutes);
    app.use('/api/network', networkRoutes);
    app.use('/api/crossplay', crossplayRoutes);

    logger.info('[Routes] Registering /api/webhooks');
    app.use('/api/webhooks', extensionsRoutes);

    // Map routes are nested under /api/servers/:id/map
    app.use('/api/servers/:id/map', mapRoutes);
    
    // Status Route
    app.get('/api/status', (req, res) => {
        const { protocol, sslStatus, version } = require('../features/system/SystemStatusState');
        const { NetUtils } = require('../utils/NetUtils');
        res.json({ 
            status: 'online', 
            version: version || '1.11.9', 
            app: 'CraftCommand',
            protocol,
            sslStatus,
            localIP: NetUtils.getLocalIP()
        });
    });
};


