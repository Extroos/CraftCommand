import React, { useState, useEffect } from 'react';
import { Cloud, HardDrive, Server, Plus, Trash2, CheckCircle2, AlertCircle, Loader2, Save, X, Activity } from 'lucide-react';
import { API } from '@core/services/api';
import { useToast } from '../../ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import { useConfirm } from '../../ui/hooks/useConfirm';
import { ConfirmDialog } from '../../ui/ConfirmDialog';

const CloudInputField = ({ label, value, onChange, type = 'text', placeholder = '', mono = false, suffix = '', disabled = false }: any) => (
    <div className="space-y-1.5 group">
        <label className="text-[11px] font-bold text-muted-foreground/80 flex justify-between items-center h-4 tracking-normal">
            {label}
        </label>
        <div className={`relative flex items-center bg-background border border-border/60 group-hover:border-primary/40 focus-within:border-primary rounded-md transition-all group-focus-within:ring-1 group-focus-within:ring-primary/20 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input 
                type={type} 
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className={`flex-1 w-full bg-transparent px-2.5 py-1.5 text-[11px] outline-none ${
                    mono ? 'font-mono text-primary/80' : 'font-semibold text-foreground'
                } placeholder:text-muted-foreground/30`}
                placeholder={placeholder}
            />
            {suffix && <span className="text-[9px] text-muted-foreground/40 font-bold pr-2 ml-auto pointer-events-none select-none uppercase tracking-tighter">{suffix}</span>}
        </div>
    </div>
);

export function CloudDestinationsWidget({ serverId }: { serverId: string }) {
    const [destinations, setDestinations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [testState, setTestState] = useState<{ [name: string]: 'testing' | 'success' | 'failed' }>({});
    const { addToast } = useToast();
    const { can } = usePermissions();
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm: requestConfirm, handleConfirm, handleCancel } = useConfirm();

    const [newType, setNewType] = useState<'local-copy' | 's3' | 'sftp'>('s3');
    const [newName, setNewName] = useState('');
    const [newConfig, setNewConfig] = useState<any>({});

    useEffect(() => {
        fetchDestinations();
    }, []);

    const fetchDestinations = async () => {
        try {
            const data = await API.getCloudDestinations();
            setDestinations(data);
        } catch (e: any) {
            addToast('error', 'Sync', 'Failed to load destinations: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!newName) return addToast('error', 'Validation', 'Destination name is required');
        try {
            const payload = { type: newType, name: newName, enabled: true, config: newConfig };
            const updated = await API.addCloudDestination(payload);
            setDestinations(updated);
            setIsAdding(false);
            setNewName('');
            setNewConfig({});
            addToast('success', 'Sync', 'Destination added successfully');
        } catch (e: any) {
            addToast('error', 'Sync', e.message);
        }
    };

    const handleDelete = async (name: string) => {
        const isConfirmed = await requestConfirm({
            title: 'Remove Destination',
            description: `Are you sure you want to remove remote destination "${name}"?`,
            confirmText: 'Remove',
            cancelText: 'Cancel'
        });
        if (!isConfirmed) return;

        try {
            const updated = await API.deleteCloudDestination(name);
            setDestinations(updated);
            addToast('info', 'Sync', 'Destination securely removed.');
        } catch (e: any) {
            addToast('error', 'Sync', e.message);
        }
    };

    const handleTest = async (dest: any) => {
        setTestState(prev => ({ ...prev, [dest.name]: 'testing' }));
        try {
            const res = await API.testCloudDestination(dest);

            if (res.success) {
                setTestState(prev => ({ ...prev, [dest.name]: 'success' }));
                addToast('success', 'Test', res.message);
            } else {
                setTestState(prev => ({ ...prev, [dest.name]: 'failed' }));
                addToast('error', 'Test', res.message);
            }
        } catch (e: any) {
             setTestState(prev => ({ ...prev, [dest.name]: 'failed' }));
             addToast('error', 'Test', e.message);
        }
        setTimeout(() => setTestState(prev => { const copy = { ...prev }; delete copy[dest.name]; return copy; }), 4000);
    };

    const renderIcon = (type: string) => {
        if (type === 's3') return <Cloud size={14} className="text-blue-500" />;
        if (type === 'local-copy') return <HardDrive size={14} className="text-amber-500" />;
        return <Server size={14} className="text-emerald-500" />;
    };

    return (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg"><Cloud size={20} /></div>
                <div>
                    <h2 className="text-lg font-bold">Cloud Sync</h2>
                    <p className="text-xs text-muted-foreground">External archive targets.</p>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
            ) : (
                <div className="space-y-3">
                    {/* List */}
                    {destinations.map(dest => (
                        <div key={dest.name} className="flex flex-col gap-2 p-3 bg-secondary/30 border border-border/50 rounded-lg group transition-all hover:bg-secondary/50">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-background border border-border/40 rounded shadow-sm flex items-center justify-center">
                                        {renderIcon(dest.type)}
                                    </div>
                                    <div>
                                        <div className="text-[12px] font-bold text-foreground leading-tight">{dest.name}</div>
                                        <div className="text-[10px] text-muted-foreground font-semibold mt-0.5 uppercase tracking-wider">{dest.type}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleTest(dest)} disabled={testState[dest.name] === 'testing'} className="p-1.5 hover:bg-background rounded text-muted-foreground hover:text-primary transition-colors cursor-pointer" title="Test Connection">
                                        {testState[dest.name] === 'testing' ? <Loader2 size={14} className="animate-spin" /> : testState[dest.name] === 'success' ? <CheckCircle2 size={14} className="text-emerald-500" /> : testState[dest.name] === 'failed' ? <AlertCircle size={14} className="text-rose-500" /> : <Activity size={14} />}
                                    </button>
                                    <button onClick={() => handleDelete(dest.name)} className="p-1.5 hover:bg-rose-500/10 rounded text-muted-foreground hover:text-rose-500 transition-colors cursor-pointer" title="Remove Destination">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {destinations.length === 0 && !isAdding && (
                        <div className="text-center py-6 border-2 border-dashed border-border/50 rounded-xl">
                            <p className="text-xs text-muted-foreground font-medium">No storage destinations.</p>
                        </div>
                    )}

                    {!isAdding && (
                        <button onClick={() => setIsAdding(true)} className="w-full mt-2 py-2.5 bg-secondary/30 hover:bg-secondary/60 border border-border/40 rounded-xl transition-colors flex items-center justify-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground cursor-pointer">
                            <Plus size={14} /> Add Remote Sinks
                        </button>
                    )}

                    {/* Fixed Screen-Level Overlay Modal */}
                    <AnimatePresence>
                        {isAdding && (
                            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsAdding(false)} />
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }} 
                                    animate={{ opacity: 1, scale: 1, y: 0 }} 
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }} 
                                    className="bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-[500px] overflow-hidden flex flex-col relative z-10 max-h-[90vh]"
                                >
                                    <div className="p-5 border-b border-border/40 flex items-center justify-between bg-muted/10">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-primary/10 text-primary rounded-lg border border-primary/20 shadow-inner">
                                                <Cloud size={16} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-bold text-foreground">Configure Storage Destination</h3>
                                                <p className="text-[10px] text-muted-foreground font-medium">Set up an external backup target.</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-rose-500/10 hover:text-rose-500 text-muted-foreground rounded-lg transition-colors cursor-pointer">
                                            <X size={16} />
                                        </button>
                                    </div>
                                    
                                    <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 bg-card">
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-bold text-muted-foreground/80 tracking-normal flex items-center justify-between">
                                                Provider Type
                                            </label>
                                            <div className="grid grid-cols-3 gap-2">
                                                <button onClick={() => {setNewType('s3'); setNewConfig({});}} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all cursor-pointer ${newType === 's3' ? 'bg-primary/5 border-primary text-primary shadow-sm' : 'bg-secondary/30 border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-secondary/50'}`}>
                                                    <Cloud size={18} />
                                                    <span className="text-[10px] font-bold uppercase tracking-wider">S3 Protocol</span>
                                                </button>
                                                <button onClick={() => {setNewType('local-copy'); setNewConfig({});}} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all cursor-pointer ${newType === 'local-copy' ? 'bg-primary/5 border-primary text-primary shadow-sm' : 'bg-secondary/30 border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-secondary/50'}`}>
                                                    <HardDrive size={18} />
                                                    <span className="text-[10px] font-bold uppercase tracking-wider">Local/NAS</span>
                                                </button>
                                                <button onClick={() => {setNewType('sftp'); setNewConfig({});}} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all cursor-pointer ${newType === 'sftp' ? 'bg-primary/5 border-primary text-primary shadow-sm' : 'bg-secondary/30 border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-secondary/50'}`}>
                                                    <Server size={18} />
                                                    <span className="text-[10px] font-bold uppercase tracking-wider">SFTP Server</span>
                                                </button>
                                            </div>
                                        </div>

                                        <div className="bg-secondary/20 p-5 rounded-xl border border-border/40 space-y-4 shadow-sm">
                                            <CloudInputField label="Identifier Alias" value={newName} onChange={setNewName} placeholder="e.g. AWS US-East Main" />
                                            
                                            {newType === 's3' && (
                                                <>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <CloudInputField label="Endpoint URL" mono value={newConfig.endpoint} onChange={(val: string) => setNewConfig({...newConfig, endpoint: val})} placeholder="s3.us-east-1.amazonaws.com" />
                                                        <CloudInputField label="Region" mono value={newConfig.region} onChange={(val: string) => setNewConfig({...newConfig, region: val})} placeholder="us-east-1" />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <CloudInputField label="Bucket Name" mono value={newConfig.bucket} onChange={(val: string) => setNewConfig({...newConfig, bucket: val})} placeholder="craft-backups" />
                                                        <CloudInputField label="Path Prefix" mono value={newConfig.prefix} onChange={(val: string) => setNewConfig({...newConfig, prefix: val})} placeholder="server-1/" />
                                                    </div>
                                                    <CloudInputField label="Access Key ID" mono value={newConfig.accessKey} onChange={(val: string) => setNewConfig({...newConfig, accessKey: val})} />
                                                    <CloudInputField label="Secret Access Key" type="password" mono value={newConfig.secretKey} onChange={(val: string) => setNewConfig({...newConfig, secretKey: val})} />
                                                </>
                                            )}

                                            {newType === 'local-copy' && (
                                                <CloudInputField label="Absolute Target Path" mono value={newConfig.destPath} onChange={(val: string) => setNewConfig({...newConfig, destPath: val})} placeholder="/mnt/nas/craft-backups" />
                                            )}

                                            {newType === 'sftp' && (
                                                <>
                                                    <div className="grid grid-cols-4 gap-3">
                                                        <div className="col-span-3"><CloudInputField label="Host Address" mono value={newConfig.host} onChange={(val: string) => setNewConfig({...newConfig, host: val})} placeholder="backup.example.com" /></div>
                                                        <div className="col-span-1"><CloudInputField label="Port" type="number" mono value={newConfig.port} onChange={(val: string) => setNewConfig({...newConfig, port: Number(val)})} placeholder="22" /></div>
                                                    </div>
                                                    <CloudInputField label="Remote Directory Path" mono value={newConfig.remotePath} onChange={(val: string) => setNewConfig({...newConfig, remotePath: val})} placeholder="/var/backups/craft" />
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <CloudInputField label="SSH Username" mono value={newConfig.username} onChange={(val: string) => setNewConfig({...newConfig, username: val})} />
                                                        <CloudInputField label="SSH Password" type="password" mono value={newConfig.password} onChange={(val: string) => setNewConfig({...newConfig, password: val})} />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-5 border-t border-border/40 bg-muted/5 flex items-center justify-end gap-3 z-10">
                                        <button onClick={() => setIsAdding(false)} className="px-5 py-2 rounded-lg text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors cursor-pointer border border-transparent hover:border-border/40">
                                            Cancel
                                        </button>
                                        <button onClick={handleAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-lg text-[11px] font-bold tracking-tight shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer">
                                            <Save size={14} /> Finish Setup
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            <ConfirmDialog 
                isOpen={isConfirmOpen}
                {...confirmConfig}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
        </div>
    );
}
