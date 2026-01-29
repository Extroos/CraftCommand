

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Folder, File, FileCode, Archive, Home, ChevronRight, 
    Download, Trash2, Save, X, 
    UploadCloud, FolderPlus, FilePlus, Search, 
    CornerUpLeft, SortAsc, SortDesc, Loader2, Shield
} from 'lucide-react';
import { FileNode } from '@shared/types';
import { useToast } from '../UI/Toast';


import { API } from '../../services/api';


interface FileManagerProps {
    serverId: string;
}

const FileManager: React.FC<FileManagerProps> = ({ serverId }) => {
    // State
    const [fileSystem, setFileSystem] = useState<FileNode[]>([]);
    const [currentPath, setCurrentPath] = useState<string[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'size' | 'modified', direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
    const [isDragging, setIsDragging] = useState(false);
    
    // Lifecycle Refs
    const mountedRef = useRef(true);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { addToast } = useToast();
    
    // Modals & Actions
    const [editorFile, setEditorFile] = useState<{ node: FileNode, content: string } | null>(null);
    const [uploadProgress, setUploadProgress] = useState<{ visible: boolean, progress: number, filename: string }>({ visible: false, progress: 0, filename: '' });
    const [newItemModal, setNewItemModal] = useState<{ type: 'file' | 'folder' | null, value: string }>({ type: null, value: '' });

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // API Fetching
    useEffect(() => {
        const fetchFiles = async () => {
            try {
                const pathStr = currentPath.length > 0 ? currentPath.join('/') : '.';
                const files = await API.getFiles(serverId, pathStr);
                
                // Transform API response to FileNode
                const nodes: FileNode[] = files.map((f: any) => ({
                    id: f.path, // Use path as ID
                    name: f.name,
                    type: f.isDirectory ? 'folder' : (f.name.endsWith('.jar') ? 'archive' : 'file'),
                    size: f.isDirectory ? '-' : (f.size > 1024 * 1024 ? `${(f.size / (1024 * 1024)).toFixed(1)} MB` : `${(f.size / 1024).toFixed(1)} KB`),
                    modified: f.modified || 'Unknown', 
                    path: f.path,
                    isDirectory: f.isDirectory,
                    children: f.isDirectory ? [] : undefined 
                }));
                setFileSystem(nodes);
            } catch (e) {
                console.error(e);
                addToast('error', 'File Error', 'Failed to load files.');
            }
        };
        fetchFiles();
    }, [serverId, currentPath]);

    // Derived State (Flattened, since we fetch per folder now)
    const currentFiles = useMemo(() => {
        let files = fileSystem; // fileSystem now contains only current folder items
        if (searchTerm) {
            files = files.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        return [...files].sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [fileSystem, searchTerm, sortConfig]);

    // Helpers (Removed legacy recursive helpers)



    // Actions
    const handleNavigate = (folderName: string) => {
        setCurrentPath([...currentPath, folderName]);
        setSelectedIds(new Set());
        setSearchTerm('');
    };

    const handleUp = () => {
        setCurrentPath(currentPath.slice(0, -1));
        setSelectedIds(new Set());
    };

    const handleSelect = (id: string, multi: boolean) => {
        const newSet = new Set(multi ? selectedIds : []);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === currentFiles.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(currentFiles.map(f => f.id)));
        }
    };

    const handleCreateItem = async () => {
        if (!newItemModal.value || !newItemModal.type) return;
        
        try {
            const relPath = [...currentPath, newItemModal.value].join('/');
            if (newItemModal.type === 'folder') {
                await API.createFolder(serverId, relPath);
            } else {
                await API.saveFileContent(serverId, relPath, '');
            }
            
            addToast('success', `${newItemModal.type === 'folder' ? 'Folder' : 'File'} Created`, newItemModal.value);
            setNewItemModal({ type: null, value: '' });
            
            // Reload files
            const pathStr = currentPath.length > 0 ? currentPath.join('/') : '.';
            const files = await API.getFiles(serverId, pathStr);
            const nodes: FileNode[] = files.map((f: any) => ({
                id: f.path,
                name: f.name,
                type: f.isDirectory ? 'folder' : (f.name.endsWith('.jar') ? 'archive' : 'file'),
                size: f.isDirectory ? '-' : (f.size > 1024 * 1024 ? `${(f.size / (1024 * 1024)).toFixed(1)} MB` : `${(f.size / 1024).toFixed(1)} KB`),
                modified: f.modified || 'Just now',
                path: f.path,
                isDirectory: f.isDirectory,
                children: f.isDirectory ? [] : undefined 
            }));
            setFileSystem(nodes);

        } catch (e) {
            addToast('error', 'Creation Failed', 'Failed to create item on disk.');
        }
    };

    const handleDelete = async (idsToDelete?: Set<string>) => {
        const targets = idsToDelete || selectedIds;
        if (targets.size === 0) return;
        if (!confirm(`Are you sure you want to delete ${targets.size} items?`)) return;
        
        try {
            const paths = Array.from(targets);
            await API.deleteFiles(serverId, paths);
            
            addToast('success', 'Items Deleted', `Removed ${targets.size} files/folders.`);
            setSelectedIds(new Set());
            
            // Reload files
            const pathStr = currentPath.length > 0 ? currentPath.join('/') : '.';
            const files = await API.getFiles(serverId, pathStr);
            const nodes: FileNode[] = files.map((f: any) => ({
                id: f.path,
                name: f.name,
                type: f.isDirectory ? 'folder' : (f.name.endsWith('.jar') ? 'archive' : 'file'),
                size: f.isDirectory ? '-' : (f.size > 1024 * 1024 ? `${(f.size / (1024 * 1024)).toFixed(1)} MB` : `${(f.size / 1024).toFixed(1)} KB`),
                modified: f.modified || 'Just now',
                path: f.path,
                isDirectory: f.isDirectory,
                children: f.isDirectory ? [] : undefined 
            }));
            setFileSystem(nodes);
            
        } catch (e) {
            addToast('error', 'Delete Failed', 'Failed to remove items from disk.');
        }
    };

    const handleExtract = async (filePath: string, fileName: string) => {
        try {
            const { API } = await import('../../services/api');
            await API.extractFile(serverId, filePath);
            addToast('success', 'Extraction Complete', `${fileName} has been extracted.`);
            setTimeout(() => window.location.reload(), 1000);
        } catch (e) {
            addToast('error', 'Extraction Failed', 'Failed to extract ZIP file.');
        }
    };



    const processUpload = async (file: File) => {
        const fileSize = file.size > 1024 * 1024 
            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` 
            : `${(file.size / 1024).toFixed(1)} KB`;

        setUploadProgress({ visible: true, progress: 0, filename: file.name });
        
        try {
            // Actually upload the file
            const { API } = await import('../../services/api');
            await API.uploadFile(serverId, file);
            
            setUploadProgress({ visible: true, progress: 100, filename: file.name });
            addToast('success', 'Upload Complete', `${file.name} uploaded successfully.`);
            
            // Refresh file list after a short delay
            setTimeout(() => {
                setUploadProgress({ visible: false, progress: 0, filename: '' });
                window.location.reload();
            }, 1000);
        } catch (e) {
            setUploadProgress({ visible: false, progress: 0, filename: '' });
            addToast('error', 'Upload Failed', 'Failed to upload file.');
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processUpload(e.target.files[0]);
            e.target.value = '';
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processUpload(e.dataTransfer.files[0]);
        }
    };

    const handleSaveFile = async () => {
        if (!editorFile) return;
        try {
            const { API } = await import('../../services/api');
            await API.saveFileContent(serverId, editorFile.node.path, editorFile.content);
            addToast('success', 'File Saved', editorFile.node.name);
            setEditorFile(null);
            // Optional: refresh file list if name changed or something, but usually just close editor
        } catch (e) {
            addToast('error', 'Save Failed', 'Failed to save file content.');
        }
    };


    // Icons
    const getFileIcon = (type: string) => {
        switch (type) {
            case 'folder': return <Folder className="text-blue-400 fill-blue-400/20" size={20} />;
            case 'archive': return <Archive className="text-amber-500" size={20} />;
            case 'config': return <FileCode className="text-emerald-400" size={20} />;
            default: return <File className="text-muted-foreground" size={20} />;
        }
    };

    return (
        <div 
            className="h-[calc(100vh-120px)] flex flex-col gap-4 animate-fade-in relative"
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
        >
            {/* Header Toolbar */}
            <div className="bg-card border border-border rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar">
                    <button 
                        onClick={() => { setCurrentPath([]); setSelectedIds(new Set()); }}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-secondary/50 transition-colors ${currentPath.length === 0 ? 'text-primary font-bold' : 'text-muted-foreground'}`}
                    >
                        <Home size={16} />
                        <span className="text-sm">root</span>
                    </button>
                    {currentPath.map((folder, index) => (
                        <div key={folder} className="flex items-center gap-1 shrink-0">
                            <ChevronRight size={14} className="text-muted-foreground/40" />
                            <button 
                                onClick={() => {
                                    setCurrentPath(currentPath.slice(0, index + 1));
                                    setSelectedIds(new Set());
                                }}
                                className={`text-sm px-2 py-1 rounded-md hover:bg-secondary/50 transition-colors ${index === currentPath.length - 1 ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
                            >
                                {folder}
                            </button>
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-48">
                        <Search className="absolute left-2.5 top-2.5 text-muted-foreground h-4 w-4" />
                        <input 
                            type="text" 
                            placeholder="Filter files..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-secondary/30 border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <button onClick={() => setNewItemModal({ type: 'file', value: '' })} className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg border border-transparent hover:border-border transition-all" title="New File">
                            <FilePlus size={18} />
                        </button>
                        <button onClick={() => setNewItemModal({ type: 'folder', value: '' })} className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg border border-transparent hover:border-border transition-all" title="New Folder">
                            <FolderPlus size={18} />
                        </button>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            onChange={handleFileSelect} 
                        />
                        <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-all flex items-center gap-2 shadow-sm">
                            <UploadCloud size={16} /> <span>Upload</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* File List */}
            <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden shadow-sm relative flex flex-col">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-muted/30 text-xs uppercase text-muted-foreground font-semibold sticky top-0 backdrop-blur-sm z-10">
                            <tr>
                                <th className="px-4 py-3 w-10 border-b border-border">
                                    <input 
                                        type="checkbox" 
                                        checked={currentFiles.length > 0 && selectedIds.size === currentFiles.length}
                                        onChange={handleSelectAll}
                                        className="rounded border-border bg-secondary text-primary focus:ring-primary/50"
                                    />
                                </th>
                                <th className="px-4 py-3 border-b border-border cursor-pointer hover:text-foreground transition-colors group" onClick={() => setSortConfig({ key: 'name', direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}>
                                    <div className="flex items-center gap-1">
                                        Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <SortAsc size={12} /> : <SortDesc size={12} />)}
                                    </div>
                                </th>
                                <th className="px-4 py-3 border-b border-border w-32 cursor-pointer hover:text-foreground transition-colors" onClick={() => setSortConfig({ key: 'size', direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}>
                                    <div className="flex items-center gap-1">
                                        Size {sortConfig.key === 'size' && (sortConfig.direction === 'asc' ? <SortAsc size={12} /> : <SortDesc size={12} />)}
                                    </div>
                                </th>
                                <th className="px-4 py-3 border-b border-border w-48 cursor-pointer hover:text-foreground transition-colors" onClick={() => setSortConfig({ key: 'modified', direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}>
                                    <div className="flex items-center gap-1">
                                        Modified {sortConfig.key === 'modified' && (sortConfig.direction === 'asc' ? <SortAsc size={12} /> : <SortDesc size={12} />)}
                                    </div>
                                </th>
                                <th className="px-4 py-3 border-b border-border w-16"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {currentPath.length > 0 && (
                                <tr 
                                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                                    onClick={handleUp}
                                >
                                    <td className="px-4 py-3 text-center border-l-2 border-transparent"><CornerUpLeft size={16} className="text-muted-foreground/50 mx-auto" /></td>
                                    <td className="px-4 py-3 font-medium text-muted-foreground" colSpan={4}>..</td>
                                </tr>
                            )}
                            
                            {currentFiles.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-20 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <Folder className="h-10 w-10 opacity-20" />
                                            <p>This folder is empty</p>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {currentFiles.map((file) => {
                                const isSelected = selectedIds.has(file.id);
                                return (
                                    <tr 
                                        key={file.id} 
                                        className={`group transition-all ${isSelected ? 'bg-primary/5 border-l-2 border-primary' : 'hover:bg-muted/30 border-l-2 border-transparent'}`}
                                        onClick={(e) => {
                                            if (e.metaKey || e.ctrlKey) {
                                                handleSelect(file.id, true);
                                            }
                                        }}
                                    >
                                        <td className="px-4 py-3 text-center" onClick={(e) => { e.stopPropagation(); handleSelect(file.id, true); }}>
                                            <input 
                                                type="checkbox" 
                                                checked={isSelected}
                                                onChange={() => handleSelect(file.id, true)}
                                                className="rounded border-border bg-secondary text-primary focus:ring-primary/50"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div 
                                                className="flex items-center gap-3 cursor-pointer" 
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (file.isDirectory) {
                                                        handleNavigate(file.name);
                                                    } else {
                                                        try {
                                                            const { API } = await import('../../services/api');
                                                            const content = await API.getFileContent(serverId, file.path);
                                                            setEditorFile({ node: file, content });
                                                        } catch (e) {
                                                            addToast('error', 'Read Error', 'Could not read file content.');
                                                        }
                                                    }
                                                }}
                                            >
                                                {getFileIcon(file.type)}
                                                <span className={`font-medium transition-colors ${file.type === 'folder' ? 'text-foreground group-hover:text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                                    {file.name}
                                                </span>
                                                {file.isProtected && (
                                                    <span title="System File" className="ml-2 flex items-center">
                                                        <Shield size={12} className="text-emerald-500" />
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{file.size}</td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs">{file.modified}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Download">
                                                    <Download size={14} />
                                                </button>
                                                {file.name.endsWith('.zip') && (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const filePath = currentPath.length > 0 
                                                                ? [...currentPath, file.name].join('/') 
                                                                : file.name;
                                                            handleExtract(filePath, file.name);
                                                        }}
                                                        className="p-1.5 rounded hover:bg-blue-500/10 text-blue-400 hover:text-blue-300 transition-colors" 
                                                        title="Extract ZIP"
                                                    >
                                                        <Archive size={14} />
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDelete(new Set([file.id]));
                                                    }}
                                                    disabled={file.isProtected}
                                                    className={`p-1.5 rounded transition-colors ${file.isProtected ? 'text-muted-foreground/30 cursor-not-allowed' : 'hover:bg-destructive/10 text-muted-foreground hover:text-destructive'}`} title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Drag Overlay */}
                {isDragging && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-2 border-dashed border-primary m-4 rounded-xl animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
                        <UploadCloud size={64} className="text-primary animate-bounce" />
                        <h3 className="text-xl font-bold mt-4">Drop files to upload</h3>
                        <p className="text-muted-foreground">Files will be added to /{currentPath.join('/')}</p>
                    </div>
                )}
            </div>

            {/* Bottom Actions Bar (Selection) */}
            {selectedIds.size > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background px-6 py-3 rounded-full shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-10 fade-in duration-300 z-40">
                    <span className="font-bold text-sm">{selectedIds.size} selected</span>
                    <div className="h-4 w-[1px] bg-background/20"></div>
                    <div className="flex gap-2">
                         <button className="p-2 hover:bg-background/20 rounded-full transition-colors" title="Archive">
                            <Archive size={18} />
                        </button>
                         <button className="p-2 hover:bg-background/20 rounded-full transition-colors" title="Download">
                            <Download size={18} />
                        </button>
                         <button 
                            onClick={() => handleDelete()}
                            className="p-2 hover:bg-red-500 hover:text-white rounded-full transition-colors" title="Delete"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                    <div className="h-4 w-[1px] bg-background/20"></div>
                    <button onClick={() => setSelectedIds(new Set())}>
                        <X size={18} />
                    </button>
                </div>
            )}

            {/* Editor Modal */}
            {editorFile && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-[#0d0d0d] border border-border shadow-2xl rounded-xl w-full max-w-6xl h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 ring-1 ring-border/50">
                        <div className="flex items-center justify-between p-4 border-b border-border bg-[#09090b]">
                            <div className="flex items-center gap-3">
                                <FileCode size={20} className="text-emerald-400" />
                                <div>
                                    <span className="font-mono font-medium text-foreground block">{editorFile.node.name}</span>
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">/{currentPath.join('/')}/{editorFile.node.name}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={handleSaveFile}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/10"
                                >
                                    <Save size={16} /> Save Content
                                </button>
                                <button 
                                    onClick={() => setEditorFile(null)}
                                    className="p-2 hover:bg-secondary text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 flex overflow-hidden relative font-mono text-sm leading-6">
                            {/* Line Numbers */}
                            <div className="bg-[#09090b] text-muted-foreground/30 text-right pr-4 pt-4 select-none w-12 border-r border-border/50 shrink-0">
                                {editorFile.content.split('\n').map((_, i) => (
                                    <div key={i}>{i + 1}</div>
                                ))}
                            </div>
                            <textarea
                                value={editorFile.content}
                                onChange={(e) => setEditorFile({ ...editorFile, content: e.target.value })}
                                className="flex-1 w-full bg-transparent text-zinc-300 p-4 focus:outline-none resize-none whitespace-pre"
                                spellCheck={false}
                                onKeyDown={(e) => {
                                    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                                        e.preventDefault();
                                        handleSaveFile();
                                    }
                                }}
                            />
                        </div>
                        <div className="p-2 bg-[#09090b] border-t border-border flex justify-between text-xs text-muted-foreground px-4">
                             <span>UTF-8</span>
                             <span>{editorFile.content.length} characters</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Progress Toast */}
            {uploadProgress.visible && (
                <div className="fixed bottom-6 right-6 bg-card border border-border shadow-xl rounded-xl p-4 w-80 animate-in slide-in-from-bottom-5 fade-in z-50">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium flex items-center gap-2">
                            <Loader2 className="animate-spin text-primary" size={14} /> Uploading...
                        </span>
                        <span className="text-xs text-muted-foreground">{Math.round(uploadProgress.progress)}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-3">{uploadProgress.filename}</p>
                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-primary rounded-full transition-all duration-100 ease-out"
                            style={{ width: `${uploadProgress.progress}%` }}
                        ></div>
                    </div>
                </div>
            )}

            {/* Create Item Modal */}
            {newItemModal.type && (
                <div className="fixed inset-0 bg-background/50 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="bg-card border border-border p-6 rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                        <h3 className="text-lg font-bold mb-4">Create New {newItemModal.type === 'folder' ? 'Folder' : 'File'}</h3>
                        <input 
                            autoFocus
                            type="text" 
                            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-foreground mb-4 focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder={newItemModal.type === 'folder' ? 'folder_name' : 'filename.txt'}
                            value={newItemModal.value}
                            onChange={(e) => setNewItemModal({ ...newItemModal, value: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateItem()}
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setNewItemModal({ type: null, value: '' })} className="flex-1 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary rounded-lg transition-colors">Cancel</button>
                            <button onClick={handleCreateItem} className="flex-1 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">Create</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FileManager;
