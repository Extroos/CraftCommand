import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { createAuthSlice, AuthSlice } from './slices/authSlice';
import { createServerSlice, ServerSlice } from './slices/serverSlice';
import { createSystemSlice, SystemSlice } from './slices/systemSlice';
import { createUISlice, UISlice } from './slices/uiSlice';

import { createNotificationSlice, NotificationSlice } from './slices/notificationSlice';
import { createCollabSlice, CollabSlice } from './slices/collabSlice';

export type StoreState = AuthSlice & ServerSlice & SystemSlice & UISlice & NotificationSlice & CollabSlice;

export const useStore = create<StoreState>()(
    devtools(
        persist(
            (...a) => ({
                ...createAuthSlice(...a),
                ...createServerSlice(...a),
                ...createSystemSlice(...a),
                ...createUISlice(...a),
                ...createNotificationSlice(...a),
                ...createCollabSlice(...a),
            }),
            {
                name: 'cc-storage',
                // Only persist specific slices
                partialize: (state) => ({
                    token: state.token,
                    guestPrefs: state.guestPrefs,
                    theme: state.theme,
                    // backgroundTasks: state.backgroundTasks, // Optional: Persist background tasks
                }),
            }
        )
    )
);
