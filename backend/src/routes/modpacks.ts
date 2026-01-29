import express from 'express';
import { modpackService } from '../services/servers/ModpackService';

const router = express.Router();

// Search Modpacks
router.get('/search', async (req, res) => {
    const { q, loader, version } = req.query;
    try {
        const results = await modpackService.searchModpacks(
            (q as string) || '', 
            (loader as string) || 'fabric',
            (version as string) || undefined
        );
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: 'Failed to search modpacks' });
    }
});

// Get Modpack Version Info
router.get('/:id/version', async (req, res) => {
    const { id } = req.params;
    const { versionId } = req.query;
    try {
        const version = await modpackService.getVersionFile(id, versionId as string);
        res.json(version);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch modpack version info' });
    }
});

export default router;
