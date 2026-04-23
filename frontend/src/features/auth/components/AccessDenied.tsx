import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface AccessDeniedProps {
    title?: string;
    description?: string;
    onBack?: () => void;
    showBackButton?: boolean;
}

const AccessDenied: React.FC<AccessDeniedProps> = ({ 
    title, 
    description,
    onBack,
    showBackButton = true
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const displayTitle = title || t('common.access_denied');
    const displayDescription = description || t('common.permissions_error_desc');

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
            
            <h2 className="text-2xl font-bold mb-3 text-foreground">{displayTitle}</h2>
            <p className="text-muted-foreground max-w-md mb-8 leading-relaxed">
                {displayDescription}
            </p>
            
            {showBackButton && (
                <button 
                    onClick={handleBack}
                    className="flex items-center gap-2 px-6 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl transition-all font-semibold border border-border/50 group"
                >
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                    {t('common.return_home')}
                </button>
            )}
        </div>
    );
};

export default AccessDenied;
