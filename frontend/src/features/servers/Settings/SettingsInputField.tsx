import React from 'react';
import { AlertCircle, Plus, Minus } from 'lucide-react';

export interface InputFieldProps {
    label: string;
    propKey: string;
    config: any;
    errors: Record<string, string>;
    handleChange: (key: string, value: any) => void;
    type?: string;
    placeholder?: string;
    mono?: boolean;
    note?: string;
    suffix?: string;
}

export const SettingsInputField: React.FC<InputFieldProps> = ({ 
    label, propKey, config, errors, handleChange, 
    type = 'text', placeholder = '', mono = false, note = '', suffix = ''
}) => {
    const isNumber = type === 'number';
    
    // Recursive property access for nested config (e.g. advancedFlags.socketBuffer)
    const getVal = (obj: any, path: string): any => {
        if (!obj) return undefined;
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    };

    const setVal = (path: string, val: any) => {
        const parts = path.split('.');
        if (parts.length === 1) {
            handleChange(path, val);
        } else {
            // Special handling for advancedFlags
            if (parts[0] === 'advancedFlags') {
                const newFlags = { ...config.advancedFlags, [parts[1]]: val };
                handleChange('advancedFlags', newFlags);
            }
            // Add other nested objects here if needed
        }
    };

    const currentVal = getVal(config, propKey);

    const increment = () => {
        const val = parseInt(currentVal || 0, 10);
        setVal(propKey, val + 1);
    };

    const decrement = () => {
        const val = parseInt(currentVal || 0, 10);
        setVal(propKey, Math.max(0, val - 1));
    };

    return (
        <div className="space-y-1.5 group">
            <label className="text-[11px] font-bold text-muted-foreground/80 group-hover:text-foreground transition-colors flex justify-between items-center h-4 tracking-normal">
                {label}
                {errors[propKey] && <span className="text-rose-500 flex items-center gap-1 text-[10px] font-medium"><AlertCircle size={10} /> {errors[propKey]}</span>}
            </label>
            <div className={`relative flex items-center bg-background border rounded-md transition-all group-focus-within:ring-1 group-focus-within:ring-primary/20 ${
                errors[propKey] 
                ? 'border-rose-500/50 focus-within:border-rose-500' 
                : 'border-border/60 group-hover:border-primary/40 focus-within:border-primary'
            }`}>
                <input 
                    type={type} 
                    value={currentVal ?? ''}
                    onChange={(e) => {
                         let val = e.target.value;
                         if (type === 'number') {
                             const parsed = parseInt(val, 10);
                             setVal(propKey, isNaN(parsed) ? 0 : parsed);
                         } else {
                             setVal(propKey, val);
                         }
                    }}
                    className={`flex-1 min-w-0 bg-transparent px-2.5 py-1.5 text-[11px] outline-none ${
                        mono || isNumber ? 'font-mono text-primary/80 tabular-nums' : 'font-semibold text-foreground'
                    } placeholder:text-muted-foreground/30`}
                    placeholder={placeholder}
                />
                
                {suffix && (
                    <span className="text-[9px] text-muted-foreground/40 font-bold pr-2 ml-auto pointer-events-none select-none uppercase tracking-tighter">{suffix}</span>
                )}

                {isNumber && (
                    <div className="flex items-stretch border-l border-border/40 h-8 overflow-hidden rounded-r-md bg-muted/5">
                        <button 
                            type="button"
                            onClick={decrement}
                            className="hover:bg-rose-500/10 px-2.5 flex items-center justify-center text-muted-foreground/40 hover:text-rose-500 transition-colors cursor-pointer border-r border-border/20"
                        >
                            <Minus size={10} strokeWidth={3} />
                        </button>
                        <button 
                            type="button"
                            onClick={increment}
                            className="hover:bg-emerald-500/10 px-2.5 flex items-center justify-center text-muted-foreground/40 hover:text-emerald-500 transition-colors cursor-pointer"
                        >
                            <Plus size={10} strokeWidth={3} />
                        </button>
                    </div>
                )}
            </div>
            {note && <p className="text-[9px] text-muted-foreground/50 font-medium leading-tight">{note}</p>}
        </div>
    );
};
