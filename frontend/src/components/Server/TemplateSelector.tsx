import React from 'react';
import { ServerTemplate } from '@shared/types';
import { Box, Layers, Zap, Command, Hammer, Cpu } from 'lucide-react';

interface TemplateSelectorProps {
    templates: ServerTemplate[];
    selectedId: string | undefined;
    onSelect: (id: string) => void;
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ templates, selectedId, onSelect }) => {
    
    // Split templates
    const gameServers = templates;

    const getIcon = (type: string) => {
        switch (type) {
            case 'Paper': return <Zap className="text-blue-400" size={24} />;
            case 'Fabric': return <Layers className="text-emerald-400" size={24} />;
            case 'Vanilla': return <Box className="text-zinc-400" size={24} />;
            case 'Forge': return <Hammer className="text-amber-600" size={24} />;
            case 'NeoForge': return <Cpu className="text-orange-500" size={24} />;
            default: return <Box size={24} />;
        }
    };

    const TemplateCard = ({ template }: { template: ServerTemplate }) => (
        <div 
            onClick={() => onSelect(template.id)}
            className={`
                cursor-pointer border rounded-xl p-4 transition-all duration-200 relative group
                flex items-start gap-4 hover:shadow-lg hover:-translate-y-0.5
                ${selectedId === template.id 
                    ? 'border-primary ring-1 ring-primary bg-primary/5 shadow-md' 
                    : 'border-border bg-card hover:bg-muted/30'}
            `}
        >
            <div className={`p-3 rounded-xl bg-background border border-border shadow-sm group-hover:scale-105 transition-transform ${selectedId === template.id ? 'ring-2 ring-primary/20' : ''}`}>
                {getIcon(template.type)}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-foreground truncate">{template.name}</h3>

                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {template.description}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                    <span className="text-[10px] font-mono px-2 py-1 rounded bg-muted text-muted-foreground border border-border/50">
                        {template.version}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-1 rounded bg-muted text-muted-foreground border border-border/50">
                        Java {template.javaVersion}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-1 rounded bg-muted text-muted-foreground border border-border/50">
                        {template.recommendedRam}MB+
                    </span>
                </div>
            </div>
            
            {selectedId === template.id && (
                <div className="absolute top-3 right-3 text-primary animate-in zoom-in-50 duration-200">
                    <div className="w-2 h-2 rounded-full bg-primary shadow-lg shadow-primary/50"></div>
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-8">
            {/* Game Servers */}
            <div className="space-y-3">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest pl-1">Game Servers</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {gameServers.map(t => <TemplateCard key={t.id} template={t} />)}
                </div>
            </div>


        </div>
    );
};

export default TemplateSelector;
