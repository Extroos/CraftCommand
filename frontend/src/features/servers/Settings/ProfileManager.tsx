import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Upload, AlertTriangle, Check, FileJson, ArrowRight, Loader2, Info, Share2, FileUp } from 'lucide-react';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '../../../styles/motion';

import { API } from '@core/services/api';
import { useToast } from '../../ui/Toast';
import { ServerProfile } from '@shared/types';

interface ProfileManagerProps {
    serverId: string;
}

export const ProfileManager: React.FC<ProfileManagerProps> = ({ serverId }) => {
    const { addToast } = useToast();
    const [isExporting, setIsExporting] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [importData, setImportData] = useState<ServerProfile | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            await API.exportProfile(serverId);
            addToast('success', 'Profile Exported', 'Server configuration downloaded successfully.');
        } catch (e: any) {
            addToast('error', 'Export Failed', e.message || 'Failed to export profile');
        } finally {
            setIsExporting(false);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsValidating(true);
        setValidationError(null);
        setImportData(null);

        try {
            const text = await file.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch (err) {
                throw new Error('Invalid JSON file');
            }

            const res = await API.validateProfile(json);
            
            if (res.valid && res.profile) {
                setImportData(res.profile);
            } else {
                setValidationError(res.error || 'Invalid profile structure');
            }
        } catch (e: any) {
            setValidationError(e.message || 'Failed to validate profile');
        } finally {
            setIsValidating(false);
            // Reset input so same file can be selected again if needed
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleApplyImport = async () => {
        if (!importData) return;

        try {
            // Apply the profile settings to the server
            // We map ServerProfile to ServerConfig updates
            const updates: any = {
                // We don't change the name/id, but we apply the rest
                version: importData.version,
                software: importData.software,
                javaVersion: importData.javaVersion,
                ram: importData.ram,
                advancedFlags: importData.advancedFlags
            };

            await API.updateServer(serverId, updates);
            addToast('success', 'Profile Applied', 'Restart server to take effect.');
            setImportData(null);
        } catch (e: any) {
            addToast('error', 'Import Failed', e.message || 'Failed to apply profile');
        }
    };

    return (
        <motion.div 
            variants={STAGGER_CONTAINER}
            initial="hidden"
            animate="show"
            className="space-y-4"
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Export Card */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className="border border-border/80 p-6 transition-all duration-300 glass-morphism quality-shadow rounded-2xl bg-card/50"
                >
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner">
                            <Share2 size={14} className="text-primary/70" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground/90 uppercase tracking-wider">Export Configuration</h3>
                        </div>
                    </div>
                    
                    <p className="text-[11px] text-muted-foreground/60 mb-6 leading-relaxed">
                        Generate a portable JSON profile containing all server flags, software metadata, and memory settings for easy migration or sharing.
                    </p>

                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-md text-[10px] font-bold tracking-tight disabled:opacity-30 transition-all shadow-sm flex items-center gap-2 w-full justify-center"
                    >
                        {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        {isExporting ? 'Exporting...' : 'Export Server Profile'}
                    </button>
                </motion.div>

                {/* Import Card */}
                <motion.div 
                    variants={STAGGER_ITEM}
                    className="border border-border/80 p-6 transition-all duration-300 glass-morphism quality-shadow rounded-2xl bg-card/50"
                >
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border shadow-inner">
                            <FileUp size={14} className="text-emerald-500/70" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground/90 uppercase tracking-wider">Import Configuration</h3>
                        </div>
                    </div>
                    
                    <p className="text-[11px] text-muted-foreground/60 mb-6 leading-relaxed">
                        Restore or apply settings from a previously exported `.json` profile. This will update software, versions, and advanced flags.
                    </p>

                    <div className="relative">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            onChange={handleFileSelect}
                            className="hidden"
                            id="profile-upload"
                        />
                        <label
                            htmlFor="profile-upload"
                            className={`bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 px-5 py-2 rounded-md text-[10px] font-bold tracking-tight transition-all shadow-sm flex items-center gap-2 w-full justify-center cursor-pointer ${isValidating ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                            {isValidating ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                            {isValidating ? 'Validating Profile...' : 'Select Profile JSON'}
                        </label>
                    </div>
                </motion.div>
            </div>

            {/* Validation Result / Import Confirmation */}
            <AnimatePresence>
                {validationError && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3"
                    >
                        <AlertTriangle className="text-rose-400 shrink-0 mt-0.5" size={16} />
                        <div>
                            <h4 className="text-[11px] font-bold text-rose-400 uppercase">Profile Integrity Failure</h4>
                            <p className="text-[10px] text-rose-300/80 mt-1">{validationError}</p>
                        </div>
                    </motion.div>
                )}

                {importData && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="border border-border/80 bg-card/60 glass-morphism rounded-2xl overflow-hidden"
                    >
                        <div className="p-4 bg-primary/5 border-b border-border/40 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Check className="text-primary" size={14} />
                                <span className="text-[11px] font-bold text-foreground">Validated Profile Ready</span>
                            </div>
                            <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">Profile: {importData.version}</span>
                        </div>
                        
                        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="space-y-1">
                                <div className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-wider">Software</div>
                                <div className="text-[11px] font-mono font-bold text-primary">{importData.software}</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-wider">Minecraft Ver</div>
                                <div className="text-[11px] font-mono font-bold text-foreground/80">{importData.version}</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-wider">Java Runtime</div>
                                <div className="text-[11px] font-mono font-bold text-foreground/80">{importData.javaVersion}</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-wider">Allocation</div>
                                <div className="text-[11px] font-mono font-bold text-foreground/80">{importData.ram} GB</div>
                            </div>
                        </div>

                        {importData.modpackUrl && (
                             <div className="px-6 pb-6">
                                <div className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-wider mb-1.5">Origin Modpack / Bundle</div>
                                <div className="text-[10px] font-mono text-muted-foreground bg-muted/20 px-3 py-2 rounded border border-border/40 truncate">
                                    {importData.modpackUrl}
                                </div>
                             </div>
                        )}

                        <div className="p-3 bg-muted/10 border-t border-border/40 flex items-center justify-end gap-2">
                            <button
                                onClick={() => setImportData(null)}
                                className="px-4 py-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Discard
                            </button>
                            <button
                                onClick={handleApplyImport}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-1.5 rounded-md text-[10px] font-bold tracking-tight shadow-sm flex items-center gap-2 group transition-all"
                            >
                                Apply Configuration
                                <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

