
import React, { useEffect, useState } from 'react';
import { Plus, Server, Hash, Cpu, ArrowRight, HardDrive, Command, LogOut, Trash2, AlertTriangle, Stethoscope } from 'lucide-react';
import { ServerConfig, ServerStatus } from '../../types';

import { API } from '../../services/api';
import { useToast } from '../UI/Toast';

interface ServerSelectionProps {
    onSelectServer: (server: ServerConfig) => void;
    onCreateNew: () => void;
    onLogout: () => void;
}

const ServerSelection: React.FC<ServerSelectionProps> = ({ onSelectServer, onCreateNew, onLogout }) => {
    const [servers, setServers] = useState<ServerConfig[]>([]);
    const { addToast } = useToast();

    const loadServers = async () => {
         const data = await API.getServers();
         setServers(data);
    };

    useEffect(() => {
        loadServers();
    }, []);

    const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation(); 
        if (window.confirm(`Are you sure you want to delete "${name}"?\nThis action cannot be undone.`)) {
            try {
                await API.deleteServer(id);
                addToast('success', 'Deleted', 'Server has been removed.');
                loadServers();
            } catch (err: any) {
                addToast('error', 'Delete Failed', err.message);
            }
        }
    };


    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6 animate-fade-in relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900/50 via-background to-background pointer-events-none"></div>
            
            <div className="max-w-4xl w-full relative z-10">
                <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Command className="text-foreground" size={24} />
                            <h1 className="text-2xl font-bold tracking-tight text-foreground">Instance Manager</h1>
                        </div>
                        <p className="text-muted-foreground text-sm">Select a deployment to interface with.</p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                         <button 
                             onClick={onLogout}
                             className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors border border-transparent hover:border-border"
                             title="Sign Out"
                        >
                            <LogOut size={20} />
                        </button>
                        <button 
                            onClick={onCreateNew}
                            className="bg-foreground text-background hover:bg-foreground/90 px-5 py-2.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all shadow-lg shadow-white/5"
                        >
                            <Plus size={16} />
                            Deploy New Instance
                        </button>
                    </div>
                </div>

                <div className="space-y-3">
                    {servers.map((server) => (
                        <div 
                            key={server.id}
                            onClick={() => onSelectServer(server)}
                            className="group relative bg-card/50 backdrop-blur-sm border border-border hover:border-foreground/30 rounded-lg p-4 transition-all cursor-pointer overflow-hidden"
                        >
                            <div className="flex items-center gap-6">
                                {/* Icon / Status */}
                                <div className="relative">
                                    <div className={`w-12 h-12 rounded-md flex items-center justify-center border ${
                                        server.status === ServerStatus.ONLINE ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                                        server.status === ServerStatus.OFFLINE ? 'bg-secondary border-border text-muted-foreground' :
                                        'bg-amber-500/10 border-amber-500/20 text-amber-500'
                                    }`}>
                                        <Server size={24} />
                                    </div>
                                    {server.status === ServerStatus.ONLINE && (
                                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background animate-pulse"></div>
                                    )}
                                </div>

                                {/* Details */}
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                                    <div>
                                        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{server.name}</h3>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 font-mono">
                                            <span>{server.id}</span>
                                        </div>
                                    </div>

                                    <div className="hidden md:flex gap-6 text-xs text-muted-foreground font-mono border-l border-border pl-6">
                                        <div>
                                            <span className="block text-foreground/50 text-[10px] uppercase tracking-wider mb-0.5">Port</span>
                                            <span className="text-foreground">{server.port}</span>
                                        </div>
                                        <div>
                                            <span className="block text-foreground/50 text-[10px] uppercase tracking-wider mb-0.5">Memory</span>
                                            <span className="text-foreground">{server.ram} GB</span>
                                        </div>
                                        <div>
                                            <span className="block text-foreground/50 text-[10px] uppercase tracking-wider mb-0.5">Version</span>
                                            <span className="text-foreground">{server.version}</span>
                                        </div>
                                    </div>

                                    {/* Diagnosis Alert */}
                                    {server.status === 'CRASHED' && (
                                        <div className="flex items-center gap-2 text-rose-500 bg-rose-500/10 px-3 py-1.5 rounded-md border border-rose-500/20 animate-pulse">
                                            <Stethoscope size={14} />
                                            <span className="text-xs font-bold uppercase tracking-wider">Diagnosis Needed</span>
                                        </div>
                                    )}

                                    <div className="flex justify-end items-center gap-3">
                                        {/* Delete Button (Visible on Hover) */}
                                        <button 
                                            onClick={(e) => handleDelete(e, server.id, server.name)}
                                            className="p-2 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                                            title="Delete Instance"
                                        >
                                            <Trash2 size={16} />
                                        </button>

                                        <div className="px-3 py-1.5 rounded bg-secondary border border-border group-hover:bg-foreground group-hover:text-background transition-colors text-xs font-medium flex items-center gap-2">
                                            Connect <ArrowRight size={12} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Empty State / Create Prompt */}
                    {servers.length === 0 && (
                        <div className="text-center py-20 border border-dashed border-border rounded-lg">
                            <HardDrive className="mx-auto text-muted-foreground mb-4 opacity-50" size={48} />
                            <p className="text-muted-foreground">No local instances found.</p>
                        </div>
                    )}
                </div>
                
                {/* Footer Info */}
                <div className="mt-8 flex justify-between items-center text-[10px] text-muted-foreground uppercase tracking-widest font-mono opacity-50">
                    <span>CraftCommand Pro</span>
                    <span>System Ready</span>
                </div>
            </div>
        </div>
    );
};

export default ServerSelection;
