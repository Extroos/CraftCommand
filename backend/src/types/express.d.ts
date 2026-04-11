import { UserProfile } from '@shared/types';
import { Server } from 'socket.io';

declare global {
    namespace Express {
        export interface Request {
            user?: UserProfile;
            io?: Server;
        }
    }
}
