import { Router } from 'express';
import { notificationService } from './NotificationService';
import { verifyToken } from '../../middleware/authMiddleware';
import { logger } from '../../utils/logger';

export const notificationRoutes = Router();

// Apply verifyToken to all routes
notificationRoutes.use(verifyToken);

// Get all notifications for the current user
notificationRoutes.get('/', (req, res) => {
    const user = req.user;
    logger.debug(`[NotificationRoute] GET / called. req.user: ${user?.id || 'null/undefined'}`);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    const limit = parseInt(req.query.limit as string) || 50;
    const unreadOnly = req.query.unreadOnly === 'true';

    const notifications = notificationService.getAll(user.id, limit, unreadOnly);
    res.json(notifications);
});

// Mark a single notification as read
notificationRoutes.post('/:id/read', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    notificationService.markRead(req.params.id);
    res.json({ success: true });
});

// Mark all notifications as read
notificationRoutes.post('/read-all', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    notificationService.markAllRead(user.id);
    res.json({ success: true });
});

// Delete a notification
notificationRoutes.delete('/:id', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const success = notificationService.delete(req.params.id);
    if (!success) {
        return res.status(403).json({ error: 'Notification cannot be deleted' });
    }
    res.json({ success: true });
});

// DEV ONLY: Trigger a test notification
notificationRoutes.post('/test', async (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });

    const { type, title, message } = req.body;
    await notificationService.create(user.id, type || 'INFO', title || 'Test Notification', message || 'This is a test notification triggered via API.');
    res.json({ success: true });
});
