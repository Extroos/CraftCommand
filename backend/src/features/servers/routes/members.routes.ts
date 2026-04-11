import express from 'express';
import { verifyToken, requirePermission } from '../../../middleware/authMiddleware';
import { auditService } from '../../system/AuditService';

import { serverRepository } from '../../../storage/ServerRepository';

const router = express.Router({ mergeParams: true });

// Protect all member routes
router.use(verifyToken);

// Get Server Members
router.get('/', requirePermission('server.view'), async (req, res) => {
    const { id } = req.params as { id: string };
    try {
        const members = await serverRepository.getMembers(id);
        res.json(members);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Add Server Member
router.post('/', requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params as { id: string };
    const { email, role } = req.body;
    try {
        await serverRepository.addMember(id, email, role);
        res.json({ success: true });
        if (req.user) auditService.log(req.user.id, 'USER_UPDATE', id, { action: 'MEMBER_ADD', email, role });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Remove Server Member
router.delete('/:userId', requirePermission('server.settings'), async (req, res) => {
    const { id, userId } = req.params as { id: string, userId: string };
    try {
        await serverRepository.removeMember(id, userId);
        res.json({ success: true });
        if (req.user) auditService.log(req.user.id, 'USER_UPDATE', id, { action: 'MEMBER_REMOVE', userId });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
