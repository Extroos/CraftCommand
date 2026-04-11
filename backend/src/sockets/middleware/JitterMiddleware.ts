import { Socket } from 'socket.io';
import { logger } from '../../utils/logger';

/**
 * [!] INTERNAL TESTING ONLY
 * Jitter Middleware for Socket.IO
 * 
 * Introduces artificial latency to simulate real-world network conditions.
 * Used exclusively for verifying platform resilience and UI degradation.
 * Only active if NODE_ENV is NOT production and SOCKET_JITTER_MS is set.
 */

const JITTER_RANGE = process.env.SOCKET_JITTER_MS || '0'; // e.g. "100-300"
const [min, max] = JITTER_RANGE.split('-').map(v => parseInt(v));

export const jitterMiddleware = (socket: Socket, next: (err?: any) => void) => {
    if (!min || isNaN(min)) return next();

    logger.info(`[Jitter] Enabling artificial latency (${JITTER_RANGE}ms) for socket ${socket.id}`);

    // 1. Wrap incoming events
    const originalOnEvent = (socket as any).onevent;
    (socket as any).onevent = function(packet: any) {
        const delay = min + Math.random() * (max - min || 0);
        setTimeout(() => {
            originalOnEvent.call(this, packet);
        }, delay);
    };

    // 2. Wrap outgoing emits
    const originalEmit = socket.emit;
    socket.emit = function(event: string, ...args: any[]): any {
        const delay = min + Math.random() * (max - min || 0);
        setTimeout(() => {
            originalEmit.apply(this, [event, ...args]);
        }, delay);
        return true; // Return boolean to satisfy type
    };

    next();
};
