import express from 'express';
import { logger } from '../../../utils/logger';
import { verifyToken, requirePermission } from '../../../middleware/authMiddleware';
import { auditService } from '../../system/AuditService';
import { scheduleService } from '../../scheduling/ScheduleService';

const router = express.Router({ mergeParams: true });

// Optional: protect schedules with `requirePermission('server.settings')` if they modify config, 
// though the original routes were mostly unprotected or globally protected. I'll use standard protection.
router.use(verifyToken);
// router.use(requirePermission('server.settings')); // Assuming schedules fall under settings 

// Get Schedules
router.get('/', async (req, res) => {
    const { id } = req.params as { id: string };
    try {
        const schedules = await scheduleService.getSchedules(id);
        res.json(schedules);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get Schedule History
router.get('/history', async (req, res) => {
    const { id } = req.params as { id: string };
    try {
        const history = await scheduleService.getHistory(id);
        res.json(history);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Create Schedule
router.post('/', async (req, res) => {
    const { id } = req.params as { id: string };
    const task = req.body;
    try {
        await scheduleService.addTask(id, task);
        res.json({ success: true });
        if (req.user) {
            auditService.log(req.user.id, 'SCHEDULE_CREATE', id, { taskName: task.name, type: task.type });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Update Schedule
router.put('/:taskId', async (req, res) => {
    const { id, taskId } = req.params as { id: string, taskId: string };
    const task = req.body;
    try {
        await scheduleService.updateTask(id, task);
        res.json({ success: true });
        if (req.user) {
            auditService.log(req.user.id, 'SCHEDULE_UPDATE', id, { taskId: task.id, taskName: task.name });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete Schedule
router.delete('/:taskId', async (req, res) => {
    const { id, taskId } = req.params as { id: string, taskId: string };
    try {
        await scheduleService.removeTask(id, taskId);
        res.json({ success: true });
        if (req.user) {
            auditService.log(req.user.id, 'SCHEDULE_DELETE', id, { taskId });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Run Schedule Now (Manual Trigger)
router.post('/:taskId/run', async (req, res) => {
    const { id, taskId } = req.params as { id: string, taskId: string };
    try {
        await scheduleService.runTaskNow(id, taskId);
        res.json({ success: true });
        if (req.user) {
            auditService.log(req.user.id, 'SCHEDULE_RUN_NOW' as any, id, { taskId });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
