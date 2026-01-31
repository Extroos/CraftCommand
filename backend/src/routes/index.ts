
import { Express } from 'express';
import authRoutes from './auth';
import serverRoutes from './servers';
import systemRoutes from './system';
import modpackRoutes from './modpacks';
import templateRoutes from './templates';
import settingsRoutes from './settings';



export const setupRoutes = (app: Express) => {
    console.log('[Routes] Registering /api/auth');
    app.use('/api/auth', authRoutes);
    console.log('[Routes] Registering /api/servers');
    app.use('/api/servers', serverRoutes);
    console.log('[Routes] Registering /api/system');
    app.use('/api/system', systemRoutes);
    console.log('[Routes] Registering /api/modpacks');
    app.use('/api/modpacks', modpackRoutes);
    console.log('[Routes] Registering /api/templates');
    app.use('/api/templates', templateRoutes);
    console.log('[Routes] Registering /api/settings');
    app.use('/api/settings', settingsRoutes);
    
    // Status Route
    app.get('/api/status', (req, res) => {
        res.json({ status: 'online', version: '1.7.0', app: 'Craft Commands' });
    });
};


