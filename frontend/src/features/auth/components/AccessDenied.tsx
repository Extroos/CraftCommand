import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AccessDeniedProps {
    title?: string;
    description?: string;
    onBack?: () => void;
    showBackButton?: boolean;
}

const AccessDenied: React.FC<AccessDeniedProps> = ({ 
    title = 'Access Denied', 
    description = 'You do not have the required permissions to access this feature. Please contact your system administrator if you believe this is an error.',
    onBack,
    showBackButton = true
}) => {
    const navigate = useNavigate();

    const handleBack = () => {
        if (onBack) {
            onBack();
        } else {
            navigate('/');
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] animate-fade-in text-center p-8 bg-card border border-border rounded-2xl shadow-sm mt-4">
            <div className="p-4 bg-destructive/10 text-destructive rounded-full mb-6 ring-8 ring-destructive/5">
                <ShieldAlert size={48} />
            </div>
            
            <h2 className="text-2xl font-bold mb-3 text-foreground">{title}</h2>
            <p className="text-muted-foreground max-w-md mb-8 leading-relaxed">
                {description}
            </p>
            
            {showBackButton && (
                <button 
                    onClick={handleBack}
                    className="flex items-center gap-2 px-6 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl transition-all font-semibold border border-border/50 group"
                >
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                    Return Home
                </button>
            )}
        </div>
    );
};

export default AccessDenied;
