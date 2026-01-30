
import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertTriangle, Info, AlertOctagon } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
}

interface ToastContextType {
    addToast: (type: ToastType, title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((type: ToastType, title: string, message?: string) => {
        const id = Math.random().toString(36).substring(7);
        setToasts((prev) => [...prev, { id, type, title, message }]);

        // Auto remove after 5 seconds
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
                {toasts.map((toast) => (
                    <div 
                        key={toast.id}
                        className="pointer-events-auto min-w-[320px] max-w-[420px] bg-card border border-border shadow-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-right duration-300 ring-1 ring-border/50 rounded-xl"
                    >
                        <div className={`mt-0.5 p-1 rounded-full ${
                            toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
                            toast.type === 'error' ? 'bg-rose-500/10 text-rose-500' :
                            toast.type === 'warning' ? 'bg-amber-500/10 text-amber-500' :
                            'bg-blue-500/10 text-blue-500'
                        }`}>
                            {toast.type === 'success' && <CheckCircle size={18} />}
                            {toast.type === 'error' && <AlertOctagon size={18} />}
                            {toast.type === 'warning' && <AlertTriangle size={18} />}
                            {toast.type === 'info' && <Info size={18} />}
                        </div>
                        <div className="flex-1">
                            <h4 className="text-sm font-semibold text-foreground">{toast.title}</h4>
                            {toast.message && <p className="text-xs text-muted-foreground mt-1">{toast.message}</p>}
                        </div>
                        <button 
                            onClick={() => removeToast(toast.id)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
