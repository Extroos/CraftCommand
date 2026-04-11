export class AppError extends Error {
    public readonly statusCode: number;
    public readonly errorCode: string;
    public readonly isOperational: boolean;
    public readonly timestamp: string;
    public readonly details?: any;

    constructor(statusCode: number, errorCode: string, message: string, isOperational = true, details?: any) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.isOperational = isOperational;
        this.details = details;
        this.timestamp = new Date().toISOString();
        
        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this);
    }

    public static Internal(message = 'An internal system fault occurred.', details?: any) {
        return new AppError(500, 'E_INTERNAL_FAULT', message, false, details);
    }
}

export class NotFoundError extends AppError {
    constructor(message: string) {
        super(404, 'NOT_FOUND', message);
    }
}

export class ConflictError extends AppError {
    constructor(message: string) {
        super(409, 'CONFLICT', message);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message: string) {
        super(401, 'UNAUTHORIZED', message);
    }
}

export class ValidationError extends AppError {
    constructor(message: string) {
        super(400, 'VALIDATION_ERROR', message);
    }
}

export class ForbiddenError extends AppError {
    constructor(message: string) {
        super(403, 'FORBIDDEN', message);
    }
}
