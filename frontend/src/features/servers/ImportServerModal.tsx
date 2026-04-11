import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FolderOpen, Archive, Upload, AlertCircle, CheckCircle2, Search, Settings2, Loader2, Sparkles, Cpu, Globe, Server, Save, ArrowRight } from 'lucide-react';
import { API } from '@core/services/api';
import { useToast } from '../ui/Toast';
import { ImportAnalysis, ServerConfig } from '@shared/types';

interface ImportServerModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

type Step = 'SELECT' | 'ANALYZE' | 'CONFIGURE' | 'IMPORTING';

const ImportServerModal: React.FC<ImportServerModalProps> = ({ onClose, onSuccess }) => {
    const [step, setStep] = useState<Step>('SELECT');
    const [mode, setMode] = useState<'local' | 'archive'>('archive');
    const [name, setName] = useState('');
    const [localPath, setLocalPath] = useState('');
    const [archiveFile, setArchiveFile] = useState<File | null>(null);
    const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
    const [loading, setLoading] = useState(false);
    
    // Config Edits (Pre-filled from Analysis)
    const [config, setConfig] = useState<Partial<ServerConfig>>({
        software: 'Vanilla',
        version: 'Unknown',
        ram: 2,
        port: 25565,
        javaVersion: 'Java 17',
        executable: 'server.jar'
    });

    const { addToast } = useToast();

    const handleStartAnalysis = async () => {
        if (!name.trim()) {
            addToast('error', 'Validation Error', 'Server name is required.');
            return;
        }

        if (mode === 'local' && !localPath.trim()) {
            addToast('error', 'Validation Error', 'Local path is required.');
            return;
        }

        if (mode === 'archive' && !archiveFile) {
            addToast('error', 'Validation Error', 'Archive file is required.');
            return;
        }

        setStep('ANALYZE');
        setLoading(true);

        try {
            let res: ImportAnalysis;
            if (mode === 'local') {
                res = await API.analyzeLocal(localPath);
            } else {
                res = await API.analyzeArchive(archiveFile!);
            }
            
            setAnalysis(res);
            setConfig({
                software: res.software,
                version: res.version,
                ram: res.ram,
                port: res.port,
                javaVersion: res.javaVersion,
                executable: res.executable
            });
            
            // Auto-fill name from folder if empty
            if (!name && mode === 'local') {
                const folderName = localPath.split(/[\\/]/).pop();
                if (folderName) setName(folderName);
            }
            
            setStep('CONFIGURE');
            setLoading(false);

        } catch (e: any) {
            addToast('error', 'Analysis Failed', e.message);
            setStep('SELECT');
            setLoading(false);
        }
    };

    const handleFinalImport = async () => {
        setStep('IMPORTING');
        setLoading(true);

        try {
            if (mode === 'local') {
                await API.importLocal(name, localPath, config);
                addToast('success', 'Import Complete', `Server "${name}" linked successfully.`);
            } else {
                await API.importArchive(name, archiveFile!, config);
                addToast('success', 'Import Complete', `Server "${name}" uploaded and configured.`);
            }
            onSuccess();
            onClose();
        } catch (e: any) {
            addToast('error', 'Import Failed', e.message);
            setStep('CONFIGURE');
            setLoading(false);
        }
    };

    const softwareIcons: Record<string, any> = {
        'Paper': <Sparkles className="text-amber-400" size={16} />,
        'Forge': <Cpu className="text-red-400" size={16} />,
        'Fabric': <Sparkles className="text-blue-400" size={16} />,
        'Spigot': <Sparkles className="text-amber-500" size={16} />,
        'Vanilla': <Server className="text-muted-foreground" size={16} />,
        'Purpur': <Sparkles className="text-purple-400" size={16} />,
        'Bedrock': <Globe className="text-emerald-400" size={16} />,
        'Velocity': <Sparkles className="text-blue-500" size={16} />
    };

    return (
        <div className="fixed inset-0 bg-background/80 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                {/* Simplified Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/20">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary">
                            <Server size={18} />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-foreground">Import Instance</h2>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">Step {step === 'SELECT' ? '1' : step === 'CONFIGURE' ? '2' : '3'} of 3</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 md:p-8">
                    <AnimatePresence mode="wait">
                        {step === 'SELECT' && (
                            <motion.div
                                key="select"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-8"
                            >
                                {/* Source Card Style - Matching Server Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button 
                                        onClick={() => setMode('archive')}
                                        className={`flex items-center gap-4 p-5 rounded-lg border transition-all text-left ${
                                            mode === 'archive' 
                                            ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                                            : 'border-border bg-secondary/10 hover:border-border-strong hover:bg-secondary/20'
                                        }`}
                                    >
                                        <div className={`p-3 rounded-md ${mode === 'archive' ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                                            <Archive size={20} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-bold text-foreground">ZIP Archive</div>
                                            <div className="text-[11px] text-muted-foreground">Upload existing backup</div>
                                        </div>
                                        {mode === 'archive' && <CheckCircle2 size={16} className="text-primary" />}
                                    </button>

                                    <button 
                                        onClick={() => setMode('local')}
                                        className={`flex items-center gap-4 p-5 rounded-lg border transition-all text-left ${
                                            mode === 'local' 
                                            ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                                            : 'border-border bg-secondary/10 hover:border-border-strong hover:bg-secondary/20'
                                        }`}
                                    >
                                        <div className={`p-3 rounded-md ${mode === 'local' ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                                            <FolderOpen size={20} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-bold text-foreground">Local Folder</div>
                                            <div className="text-[11px] text-muted-foreground">Path on this machine</div>
                                        </div>
                                        {mode === 'local' && <CheckCircle2 size={16} className="text-primary" />}
                                    </button>
                                </div>

                                <div className="space-y-5">
                                    <div className="group">
                                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Instance Name</label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Survival Proxy, Modded SMP..."
                                            className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-3 text-sm text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-muted-foreground/30"
                                        />
                                    </div>

                                    {mode === 'local' ? (
                                        <div className="animate-in fade-in slide-in-from-top-2">
                                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Directory Path</label>
                                            <input
                                                type="text"
                                                value={localPath}
                                                onChange={(e) => setLocalPath(e.target.value)}
                                                placeholder="/home/minecraft/servers/origin"
                                                className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-3 text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                                            />
                                        </div>
                                    ) : (
                                        <div className="animate-in fade-in slide-in-from-top-2">
                                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Payload Archive</label>
                                            <label className="flex flex-col items-center justify-center w-full h-32 bg-secondary/30 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-secondary/50 hover:border-primary/30 transition-all group">
                                                <Upload className="text-muted-foreground mb-2 group-hover:text-primary transition-colors" size={24} />
                                                <span className="text-xs font-bold text-foreground truncate max-w-[80%]">
                                                    {archiveFile ? archiveFile.name : 'Select .zip archive'}
                                                </span>
                                                {!archiveFile && <span className="text-[10px] text-muted-foreground mt-1">Maximum 5GB recommended</span>}
                                                <input type="file" className="hidden" accept=".zip" onChange={e => setArchiveFile(e.target.files?.[0] || null)} />
                                            </label>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-4">
                                    <button
                                        onClick={handleStartAnalysis}
                                        disabled={loading || (mode === 'local' ? !localPath : !archiveFile)}
                                        className="w-full py-3.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-white/5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? <Loader2 className="animate-spin" size={16} /> : <>Initialize Analysis <ArrowRight size={16} /></>}
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {step === 'ANALYZE' && (
                            <motion.div
                                key="analyze"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center justify-center py-16 space-y-6"
                            >
                                <div className="relative">
                                    <div className="h-20 w-20 border-2 border-primary/20 rounded-full animate-ping absolute" />
                                    <div className="h-20 w-20 border-2 border-primary/10 rounded-full flex items-center justify-center relative">
                                        <Loader2 className="animate-spin text-primary" size={32} />
                                    </div>
                                </div>
                                <div className="text-center">
                                    <h3 className="text-lg font-bold">Scanning Anatomy...</h3>
                                    <p className="text-[11px] text-muted-foreground mt-2 font-mono uppercase tracking-[0.2em]">Scanning server files...</p>
                                </div>
                                <div className="w-full max-w-xs h-1 bg-secondary rounded-full overflow-hidden">
                                    <motion.div 
                                        className="h-full bg-primary"
                                        initial={{ width: 0 }}
                                        animate={{ width: '100%' }}
                                        transition={{ duration: 1 }}
                                    />
                                </div>
                            </motion.div>
                        )}

                        {step === 'CONFIGURE' && (
                            <motion.div
                                key="configure"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-6"
                            >
                                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 flex items-center gap-4">
                                    <div className="p-2 bg-emerald-500/10 rounded overflow-hidden text-emerald-500">
                                        <CheckCircle2 size={18} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-emerald-400">Scanner Match Found</div>
                                        <div className="text-[11px] text-muted-foreground">Detection confirmed: <span className="text-foreground font-bold">{analysis?.software} {analysis?.version}</span></div>
                                    </div>
                                </div>

                                {analysis?.pterodactylDetected && (
                                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 flex items-center gap-4 animate-in fade-in slide-in-from-left-2">
                                        <div className="p-2 bg-blue-500/10 rounded text-blue-500">
                                            <AlertCircle size={18} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-xs font-bold text-blue-400">Pterodactyl Migration Detected</div>
                                            <div className="text-[10px] text-muted-foreground">We found panel metadata. Files will be managed locally after import.</div>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                    <div className="space-y-5">
                                        <div>
                                            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Detected Software</label>
                                            <div className="flex items-center gap-3 bg-secondary/30 p-3 rounded-lg border border-border">
                                                <div className="p-1">{softwareIcons[config.software || 'Vanilla']}</div>
                                                <span className="text-sm font-bold text-foreground">{config.software}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Game Version</label>
                                            <input 
                                                type="text" 
                                                value={config.version}
                                                onChange={e => setConfig({...config, version: e.target.value})}
                                                className="w-full bg-secondary/30 border border-border rounded-lg p-3 text-xs font-mono focus:ring-1 focus:ring-primary outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Binding Port</label>
                                            <input 
                                                type="number" 
                                                value={config.port}
                                                onChange={e => setConfig({...config, port: parseInt(e.target.value)})}
                                                className="w-full bg-secondary/30 border border-border rounded-lg p-3 text-xs font-mono focus:ring-1 focus:ring-primary outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-5">
                                        <div>
                                            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Resource Allocation</label>
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between text-[11px] px-1 font-mono">
                                                    <span className="text-muted-foreground">Threshold</span>
                                                    <span className="text-primary font-bold">{config.ram}GB RAM</span>
                                                </div>
                                                <input 
                                                    type="range" min="1" max="32" step="1"
                                                    value={config.ram}
                                                    onChange={e => setConfig({...config, ram: parseInt(e.target.value)})}
                                                    className="w-full accent-primary h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
                                                />
                                            </div>
                                        </div>
                                        
                                        {config.software !== 'Bedrock' && (
                                            <>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Java Runtime Environment</label>
                                                    <select 
                                                        value={config.javaVersion}
                                                        onChange={e => setConfig({...config, javaVersion: e.target.value as any})}
                                                        className="w-full bg-secondary/30 border border-border rounded-lg p-3 text-[11px] font-bold focus:ring-1 focus:ring-primary outline-none appearance-none cursor-pointer"
                                                    >
                                                        <option value="Java 8">Java 8 (Legacy)</option>
                                                        <option value="Java 11">Java 11 (Standard)</option>
                                                        <option value="Java 17">Java 17 (Recommended)</option>
                                                        <option value="Java 21">Java 21 (Latest)</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Server Executable (JAR)</label>
                                                    <input 
                                                        type="text" 
                                                        value={config.executable}
                                                        onChange={e => setConfig({...config, executable: e.target.value})}
                                                        className="w-full bg-secondary/30 border border-border rounded-lg p-3 text-xs font-mono focus:ring-1 focus:ring-primary outline-none"
                                                    />
                                                </div>
                                            </>
                                        )}
                                        
                                        {config.software === 'Bedrock' && (
                                            <div className="bg-secondary/20 p-4 rounded-lg border border-border/50">
                                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Native Runtime</div>
                                                <div className="text-[11px] text-foreground font-mono">Bedrock does not require Java. Running via native binary.</div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-6">
                                    <button
                                        onClick={() => setStep('SELECT')}
                                        disabled={loading}
                                        className="flex-1 py-3 px-4 bg-secondary/50 border border-border rounded-lg text-xs font-bold hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
                                    >
                                        Step Back
                                    </button>
                                    <button
                                        onClick={handleFinalImport}
                                        disabled={loading}
                                        className="flex-[2] py-3 px-4 bg-foreground text-background rounded-lg text-xs font-bold hover:bg-foreground/90 transition-transform active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {loading ? <Loader2 className="animate-spin" size={14} /> : <>Deploy & Interface <ArrowRight size={14} /></>}
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {step === 'IMPORTING' && (
                            <motion.div
                                key="importing"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex flex-col items-center justify-center py-20 space-y-6"
                            >
                                <div className="relative">
                                    <div className="h-16 w-16 border-t-2 border-primary rounded-full animate-spin" />
                                </div>
                                <div className="text-center">
                                    <h3 className="text-lg font-bold">Importing server...</h3>
                                    <p className="text-[10px] text-muted-foreground mt-2 font-mono uppercase tracking-[0.3em]">Writing configuration & zipping layers</p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};
export default ImportServerModal;
