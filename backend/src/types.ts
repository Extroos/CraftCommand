
export interface UserProfile {
    email: string;
    username: string;
    role: 'Owner' | 'Admin' | 'Moderator';
    preferences: {
        accentColor: string;
        reducedMotion: boolean;
        notifications: {
            browser: boolean;
            sound: boolean;
            events: {
                onJoin: boolean;
                onCrash: boolean;
            }
        };
        terminal: {
            fontSize: number;
            fontFamily: string;
        }
    };
}
