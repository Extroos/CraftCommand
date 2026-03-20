import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

export interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDestructive = true,
    onConfirm,
    onCancel
}) => {
    const [isPending, setIsPending] = useState(false);

    const handleConfirm = async () => {
        setIsPending(true);
        try {
            await onConfirm();
        } finally {
            setIsPending(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full space-y-5"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${isDestructive ? 'bg-rose-500/10 text-rose-500' : 'bg-primary/10 text-primary'}`}>
                                    <AlertTriangle size={20} strokeWidth={2.5} />
                                </div>
                                <h3 className="text-base font-bold text-foreground tracking-tight">{title}</h3>
                            </div>
                            <button 
                                onClick={onCancel}
                                disabled={isPending}
                                className="text-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-50"
                            >
                                <X size={16} strokeWidth={3} />
                            </button>
                        </div>
                        
                        <p className="text-sm font-medium text-muted-foreground/80 leading-relaxed pl-[44px]">
                            {description}
                        </p>
                        
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button 
                                onClick={onCancel}
                                disabled={isPending}
                                className="px-4 py-2 rounded-md text-xs font-bold text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors disabled:opacity-50"
                            >
                                {cancelText}
                            </button>
                            <button 
                                onClick={handleConfirm}
                                disabled={isPending}
                                className={`px-4 py-2 rounded-md text-xs font-bold flex items-center gap-2 transition-all shadow-sm disabled:opacity-50 ${
                                    isDestructive 
                                        ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20' 
                                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                                }`}
                            >
                                {isPending && <Loader2 size={12} className="animate-spin" />}
                                {confirmText}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
