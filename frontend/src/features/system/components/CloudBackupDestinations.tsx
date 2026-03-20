import React, { useState, useEffect } from 'react';
import { Cloud, HardDrive, Server, Plus, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { API } from '@core/services/api';
import { useToast } from '../../ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfirm } from '../../ui/hooks/useConfirm';
import { ConfirmDialog } from '../../ui/ConfirmDialog';

export function CloudBackupDestinations() {
    const [destinations, setDestinations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [testState, setTestState] = useState<{ [name: string]: 'testing' | 'success' | 'failed' }>({});
    const { addToast } = useToast();
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm: requestConfirm, handleConfirm, handleCancel } = useConfirm();

    // New Destination Form State
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
            addToast('error', 'Cloud Backups', e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!newName) return addToast('error', 'Validation', 'Destination name is required');
        
        try {
            const payload = {
                type: newType,
                name: newName,
                enabled: true,
                config: newConfig
            };
            const updated = await API.addCloudDestination(payload);
            setDestinations(updated);
            setIsAdding(false);
            setNewName('');
            setNewConfig({});
            addToast('success', 'Cloud Backups', 'Destination added successfully');
        } catch (e: any) {
            addToast('error', 'Cloud Backups', e.message);
        }
    };

    const handleDelete = async (name: string) => {
        const isConfirmed = await requestConfirm({
            title: 'Remove Destination',
            description: `Are you sure you want to remove the cloud destination "${name}"? Backup files on the remote server will not be deleted, but no further backups will be sent there.`,
            confirmText: 'Remove Destination',
            cancelText: 'Cancel'
        });
        if (!isConfirmed) return;

        try {
            const updated = await API.deleteCloudDestination?.(name) || await fetch(`/api/servers/cloud-destinations/${name}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            }).then(r => r.json());
            
            if (updated.error) throw new Error(updated.error);
            setDestinations(updated);
            addToast('success', 'Cloud Backups', 'Destination removed');
        } catch (e: any) {
            addToast('error', 'Cloud Backups', e.message);
        }
    };

    const handleTest = async (dest: any) => {
        setTestState(prev => ({ ...prev, [dest.name]: 'testing' }));
        try {
            const res = await API.testCloudDestination?.(dest) || await fetch(`/api/servers/cloud-destinations/test`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}` 
                },
                body: JSON.stringify(dest)
            }).then(r => r.json());

            if (res.success) {
                setTestState(prev => ({ ...prev, [dest.name]: 'success' }));
                addToast('success', 'Connection Test', res.message);
            } else {
                setTestState(prev => ({ ...prev, [dest.name]: 'failed' }));
                addToast('error', 'Connection Test', res.message);
            }
        } catch (e: any) {
             setTestState(prev => ({ ...prev, [dest.name]: 'failed' }));
             addToast('error', 'Connection Test', e.message);
        }
        
        setTimeout(() => {
            setTestState(prev => {
                const copy = { ...prev };
                delete copy[dest.name];
                return copy;
            });
        }, 5000);
    };

    const renderIcon = (type: string) => {
        if (type === 's3') return <Cloud className="w-5 h-5 text-blue-400" />;
        if (type === 'local-copy') return <HardDrive className="w-5 h-5 text-gray-400" />;
        if (type === 'sftp') return <Server className="w-5 h-5 text-green-400" />;
        return <Cloud className="w-5 h-5" />;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium text-white flex items-center gap-2">
                        <Cloud className="w-5 h-5 text-blue-400" />
                        Cloud Backup Destinations
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Configure external storage providers to automatically mirror your server backups.
                    </p>
                </div>
                {!isAdding && (
                    <button 
                        onClick={() => setIsAdding(true)}
                        className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        Add Destination
                    </button>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Existing Destinations */}
                    {destinations.map(dest => (
                        <div key={dest.name} className="p-5 bg-black/20 border border-border/40 rounded-xl space-y-4">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-black/30 rounded-lg">
                                        {renderIcon(dest.type)}
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-white">{dest.name}</h4>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">{dest.type}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                     <button 
                                        onClick={() => handleTest(dest)}
                                        disabled={testState[dest.name] === 'testing'}
                                        className="p-2 text-muted-foreground hover:text-white hover:bg-white/5 rounded-lg transition-colors relative"
                                        title="Test Connection"
                                    >
                                        {testState[dest.name] === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                                         testState[dest.name] === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
                                         testState[dest.name] === 'failed' ? <AlertCircle className="w-4 h-4 text-red-400" /> :
                                         <Activity className="w-4 h-4" />}
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(dest.name)}
                                        className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                        title="Delete Destination"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="pt-4 border-t border-border/20 text-sm text-muted-foreground">
                                {dest.type === 's3' && <p>Bucket: <span className="text-gray-300">{dest.config.bucket}</span></p>}
                                {dest.type === 'local-copy' && <p>Path: <span className="text-gray-300">{dest.config.destPath}</span></p>}
                                {dest.type === 'sftp' && <p>Host: <span className="text-gray-300">{dest.config.host}:{dest.config.port || 22}</span></p>}
                            </div>
                        </div>
                    ))}

                    {/* Add New Destination Form */}
                    <AnimatePresence>
                        {isAdding && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="p-5 bg-blue-500/5 border border-blue-500/20 rounded-xl space-y-4 md:col-span-2"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="font-medium text-blue-400">Add New Destination</h4>
                                    <button onClick={() => setIsAdding(false)} className="text-muted-foreground hover:text-white">Cancel</button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Destination Name</label>
                                        <input 
                                            type="text"
                                            value={newName}
                                            onChange={e => setNewName(e.target.value)}
                                            placeholder="e.g. AWS S3 Oregon"
                                            className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Provider Type</label>
                                        <select 
                                            value={newType}
                                            onChange={e => {
                                                setNewType(e.target.value as any);
                                                setNewConfig({});
                                            }}
                                            className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-white"
                                        >
                                            <option value="s3">S3 Compatible (AWS, Backblaze, MinIO)</option>
                                            <option value="sftp">SFTP Server</option>
                                            <option value="local-copy">Local / Network Drive Copy</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="pt-4 mt-4 border-t border-border/20 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {newType === 's3' && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Endpoint URL</label>
                                                <input type="text" value={newConfig.endpoint || ''} onChange={e => setNewConfig({...newConfig, endpoint: e.target.value})} placeholder="s3.us-west-2.amazonaws.com" className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-2 text-sm" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Bucket Name</label>
                                                <input type="text" value={newConfig.bucket || ''} onChange={e => setNewConfig({...newConfig, bucket: e.target.value})} placeholder="my-craft-backups" className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-2 text-sm" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Region</label>
                                                <input type="text" value={newConfig.region || ''} onChange={e => setNewConfig({...newConfig, region: e.target.value})} placeholder="us-west-2" className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-2 text-sm" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Prefix / Path</label>
                                                <input type="text" value={newConfig.prefix || ''} onChange={e => setNewConfig({...newConfig, prefix: e.target.value})} placeholder="craft-commands/" className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-2 text-sm" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Access Key</label>
                                                <input type="text" value={newConfig.accessKey || ''} onChange={e => setNewConfig({...newConfig, accessKey: e.target.value})} className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-2 text-sm" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Secret Key</label>
                                                <input type="password" value={newConfig.secretKey || ''} onChange={e => setNewConfig({...newConfig, secretKey: e.target.value})} className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-2 text-sm" />
                                            </div>
                                        </>
                                    )}

                                    {newType === 'local-copy' && (
                                        <div className="space-y-2 md:col-span-2">
                                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Destination Path</label>
                                            <input type="text" value={newConfig.destPath || ''} onChange={e => setNewConfig({...newConfig, destPath: e.target.value})} placeholder="/mnt/nas/craft-backups or D:\Backups" className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-2 text-sm" />
                                        </div>
                                    )}

                                    {newType === 'sftp' && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Host & Port</label>
                                                <div className="flex gap-2">
                                                    <input type="text" value={newConfig.host || ''} onChange={e => setNewConfig({...newConfig, host: e.target.value})} placeholder="backup.example.com" className="w-2/3 bg-black/20 border border-border/40 rounded-xl px-4 py-2 text-sm" />
                                                    <input type="number" value={newConfig.port || ''} onChange={e => setNewConfig({...newConfig, port: Number(e.target.value)})} placeholder="22" className="w-1/3 bg-black/20 border border-border/40 rounded-xl px-4 py-2 text-sm" />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Remote Path</label>
                                                <input type="text" value={newConfig.remotePath || ''} onChange={e => setNewConfig({...newConfig, remotePath: e.target.value})} placeholder="/var/backups/craft" className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-2 text-sm" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Username</label>
                                                <input type="text" value={newConfig.username || ''} onChange={e => setNewConfig({...newConfig, username: e.target.value})} className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-2 text-sm" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Password (or use Private Key)</label>
                                                <input type="password" value={newConfig.password || ''} onChange={e => setNewConfig({...newConfig, password: e.target.value})} className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-2 text-sm" />
                                            </div>
                                            <div className="space-y-2 md:col-span-2">
                                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Private Key (Optional)</label>
                                                <textarea value={newConfig.privateKey || ''} onChange={e => setNewConfig({...newConfig, privateKey: e.target.value})} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..." rows={3} className="w-full bg-black/20 border border-border/40 rounded-xl px-4 py-2 text-sm font-mono text-xs" />
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="flex justify-end pt-4">
                                    <button 
                                        onClick={handleAdd}
                                        className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors font-medium shadow-lg shadow-blue-500/20"
                                    >
                                        Save Destination
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {destinations.length === 0 && !isAdding && (
                        <div className="md:col-span-2 p-12 text-center border-2 border-dashed border-border/40 rounded-2xl flex flex-col items-center gap-4 text-muted-foreground">
                            <Cloud className="w-12 h-12 text-muted-foreground/30" />
                            <div>
                                <h4 className="text-white font-medium mb-1">No Destinations Configured</h4>
                                <p className="text-sm max-w-sm mx-auto">
                                    Add an S3 bucket, SFTP server, or Local Copy path to automatically safeguard your server backups.
                                </p>
                            </div>
                        </div>
                    )}
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

// Activity icon for testing state
import { Activity } from 'lucide-react';
