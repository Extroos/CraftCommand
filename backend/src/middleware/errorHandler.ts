import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    const isDev = process.env.NODE_ENV === 'development';
    const timestamp = new Date().toISOString();

    if (err instanceof AppError) {
        if (err.isOperational) {
            logger.warn(`[Fault] ${err.errorCode}: ${err.message} (${req.method} ${req.path})`);
        } else {
            logger.error(`[SystemFault] ${err.errorCode}: ${err.message} | ${err.stack || ''}`);
        }

        return res.status(err.statusCode).json({
            status: 'error',
            code: err.errorCode,
            message: err.message,
            timestamp: err.timestamp || timestamp,
            details: isDev ? err.details : undefined,
            stack: isDev ? err.stack : undefined
        });
    }

    // Unhandled errors
    const errorMsg = err instanceof Error ? err.stack || err.message : String(err);
    logger.error(`[CriticalUnhandled] ${req.method} ${req.path} | ${errorMsg}`);
    
    return res.status(500).json({
        status: 'error',
        code: 'E_SYSTEM_CRASH',
        message: 'A critical internal system fault has occurred.',
        timestamp,
        stack: isDev ? errorMsg : undefined
    });
};
