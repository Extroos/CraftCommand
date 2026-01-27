
import { Express } from 'express';
import serverRoutes from './servers';
import systemRoutes from './system';
import modpackRoutes from './modpacks';



export const setupRoutes = (app: Express) => {
    console.log('[Routes] Registering /api/servers');
    app.use('/api/servers', serverRoutes);
    console.log('[Routes] Registering /api/system');
    app.use('/api/system', systemRoutes);
    console.log('[Routes] Registering /api/modpacks');
    app.use('/api/modpacks', modpackRoutes);
    
    // Status Route
    app.get('/api/status', (req, res) => {
        res.json({ status: 'online', version: '1.0.0', app: 'CraftCommand' });
    });
};


