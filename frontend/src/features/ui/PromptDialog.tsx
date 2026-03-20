import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit3, X, Loader2 } from 'lucide-react';

export interface PromptDialogProps {
    isOpen: boolean;
    title: string;
    description: string;
    placeholder?: string;
    type?: 'text' | 'password';
    confirmText?: string;
    cancelText?: string;
    onConfirm: (value: string) => void | Promise<void>;
    onCancel: () => void;
}

export const PromptDialog: React.FC<PromptDialogProps> = ({
    isOpen,
    title,
    description,
    placeholder = 'Enter value...',
    type = 'text',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    onConfirm,
    onCancel
}) => {
    const [isPending, setIsPending] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setInputValue('');
            // Focus input smoothly after modal opens
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const handleConfirm = async () => {
        if (!inputValue.trim()) return;
        setIsPending(true);
        try {
            await onConfirm(inputValue);
        } finally {
            setIsPending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (!isPending) onCancel();
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
                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                    <Edit3 size={20} strokeWidth={2.5} />
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
                        
                        <div className="pl-[44px] space-y-3">
                            <p className="text-sm font-medium text-muted-foreground/80 leading-relaxed">
                                {description}
                            </p>
                            
                            <input
                                ref={inputRef}
                                type={type}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={placeholder}
                                disabled={isPending}
                                className="w-full bg-secondary/30 border border-border/50 text-foreground text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-muted-foreground/40 disabled:opacity-50"
                            />
                        </div>
                        
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
                                disabled={isPending || !inputValue.trim()}
                                className="px-4 py-2 rounded-md text-xs font-bold flex items-center gap-2 transition-all shadow-sm disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90"
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
