import { AppError } from './AppError';

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
