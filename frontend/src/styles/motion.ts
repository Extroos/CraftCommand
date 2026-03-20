import { Variants, Transition } from 'framer-motion';

/**
 * Professional Spring Transition Configs
 * Optimized for a 'premium' and 'snappy' feel.
 */
export const MOTION_SPRINGS = {
    // Smooth and bouncy for landing/interaction
    premium: {
        type: 'spring',
        stiffness: 260,
        damping: 20,
        mass: 1
    },
    // Gentle and slow for ambiance
    ambient: {
        type: 'spring',
        stiffness: 100,
        damping: 30,
        mass: 1.5
    },
    // Snappy and fast for UI controls
    snappy: {
        type: 'spring',
        stiffness: 400,
        damping: 30,
        mass: 0.8
    }
} as const;

/**
 * Standardized Page transitions
 */
export const PAGE_VARIANTS: Variants = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -15 }
};

/**
 * Staggered Container Variants
 * Use these for lists of cards or form elements.
 */
export const STAGGER_CONTAINER: Variants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.08,
            delayChildren: 0.1
        }
    }
};

/**
 * Individual Item Entrance Variants (to be used with STAGGER_CONTAINER)
 */
export const STAGGER_ITEM: Variants = {
    hidden: { opacity: 0, y: 10, scale: 0.98 },
    show: { 
        opacity: 1, 
        y: 0, 
        scale: 1,
        transition: MOTION_SPRINGS.premium
    }
};

/**
 * Hover/Tap Effects for Quality Mode
 */
export const INTERACTION_VARIANTS = {
    hover: { 
        scale: 1.01, 
        y: -4,
        transition: MOTION_SPRINGS.snappy
    },
    tap: { 
        scale: 0.98,
        transition: MOTION_SPRINGS.snappy
    }
};

/**
 * Helper to determine motion transition based on user preferences
 */
export const getSafeTransition = (isQuality: boolean, isReduced: boolean): Transition | undefined => {
    if (isReduced) return { duration: 0 };
    if (!isQuality) return { duration: 0.2 };
    return MOTION_SPRINGS.premium;
};
/**
 * Modal Animation Variants
 */
export const MODAL_BACKDROP: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1 },
    exit: { opacity: 0 }
};

export const MODAL_CONTENT: Variants = {
    hidden: { opacity: 0, scale: 0.95, y: 10 },
    show: { 
        opacity: 1, 
        scale: 1, 
        y: 0,
        transition: MOTION_SPRINGS.premium 
    },
    exit: { 
        opacity: 0, 
        scale: 0.95, 
        y: 10,
        transition: { duration: 0.15 }
    }
};
