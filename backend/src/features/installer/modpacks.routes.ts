import express from 'express';
import { modpackService } from './ModpackService';
import { verifyToken } from '../../middleware/authMiddleware';

const router = express.Router();

// Unified Search — supports type=mod|modpack|all (default: all)
router.get('/search', async (req, res) => {
    const { q, loader, version, type } = req.query;
    try {
        const results = await modpackService.searchAll(
            (q as string) || '', 
            (loader as string) || 'fabric',
            (version as string) || undefined,
            (type as 'all' | 'mod' | 'modpack') || 'all'
        );
        res.json(results);
    } catch (e) {
        console.error('[modpacks.routes] Search failed:', e);
        res.status(500).json({ error: 'Failed to search mods/modpacks' });
    }
});

// Get Modpack/Mod Version Info
router.get('/:id/version', async (req, res) => {
    const { id } = req.params;
    const { versionId } = req.query;
    try {
        const version = await modpackService.getVersionFile(id, versionId as string);
        res.json(version);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch version info' });
    }
});

export default router;
