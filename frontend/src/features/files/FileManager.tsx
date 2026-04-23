
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Folder, File as FileIcon, FileCode, Archive, Home, ChevronRight, 
    Download, Trash2, Save, X, Pencil,
    UploadCloud, FolderPlus, FilePlus, Search, 
    CornerUpLeft, SortAsc, SortDesc, Loader2, Shield, Copy
} from 'lucide-react';
import { FileNode } from '@shared/types';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';

import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { properties } from '@codemirror/legacy-modes/mode/properties';


import { API } from '@core/services/api';
import { useUser } from '@features/auth/context/UserContext';
import { useCollaboration } from '@features/collaboration/context/CollaborationContext';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import AccessDenied from '@features/auth/components/AccessDenied';


interface FileManagerProps {
    serverId: string;
}

export const getFileIcon = (type: string) => {
    switch (type) {
        case 'folder': return <Folder className="text-blue-400 fill-blue-400/20" size={20} />;
        case 'archive': return <Archive className="text-amber-500" size={20} />;
        case 'config': return <FileCode className="text-emerald-400" size={20} />;
        case 'code': return <FileCode className="text-blue-500" size={20} />;
        default: return <FileIcon className="text-muted-foreground/60" size={20} />;
    }
};

export const getSmallFileIcon = (type: string) => {
    switch (type) {
        case 'folder': return <Folder className="text-blue-400 fill-blue-400/20" size={14} />;
        case 'archive': return <Archive className="text-amber-500" size={14} />;
        case 'config': return <FileCode className="text-emerald-400" size={14} />;
        case 'code': return <FileCode className="text-blue-500" size={14} />;
        default: return <FileIcon className="text-muted-foreground/60" size={14} />;
    }
};

interface FileTreeNodeProps {
    node: FileNode;
    level: number;
    treeCache: Record<string, FileNode[]>;
    expandedFolders: Set<string>;
    onToggle: (pathStr: string) => void;
    onSelect: (node: FileNode) => void;
    currentPath: string[];
    editorFile: any;
    presence: any;
    serverId: string;
    userId?: string;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({ node, level, treeCache, expandedFolders, onToggle, onSelect, currentPath, editorFile, presence, serverId, userId }) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = currentPath.join('/') === node.path || editorFile?.node.path === node.path;
    const children = treeCache[node.path];
    
    // Check for collaboration presence
    const isCollabActive = !node.isDirectory && presence[serverId]?.some((p: any) => p.activeView === `files:${node.name}` && p.userId !== userId);

    return (
        <div className="w-full">
            <div 
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors cursor-pointer group select-none hover:bg-muted/50 ${isSelected ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                style={{ paddingLeft: `${ Math.max(8, level * 16 + 8)}px` }}
                onClick={(e) => {
                    e.stopPropagation();
                    if (node.isDirectory) {
                        onToggle(node.path);
                        onSelect(node);
                    } else {
                        onSelect(node);
                    }
                }}
            >
                {node.isDirectory ? (
                    <div className={`transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-90' : ''}`} onClick={(e) => { e.stopPropagation(); onToggle(node.path); }}>
                        <ChevronRight size={14} className="opacity-60 group-hover:opacity-100 hover:text-primary transition-colors" />
                    </div>
                ) : (
                    <div className="w-[14px] shrink-0" />
                )}
                
                <div className={`shrink-0 opacity-80 group-hover:opacity-100 transition-opacity ${isSelected ? 'opacity-100' : ''}`}>
                    {getSmallFileIcon(node.type)}
                </div>
                <span className={`text-xs truncate font-medium transition-colors ${node.type === 'folder' ? 'text-foreground/90' : ''} ${isSelected ? 'text-primary font-semibold' : ''}`} title={node.name}>
                    {node.name}
                </span>

                {isCollabActive && (
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-auto shrink-0" title="Being edited by others" />
                )}
            </div>
            
            {isExpanded && children && (
                <div className="flex flex-col mt-0.5">
                    {children.map(child => (
                        <FileTreeNode 
                            key={child.id}
                            node={child}
                            level={level + 1}
                            treeCache={treeCache}
                            expandedFolders={expandedFolders}
                            onToggle={onToggle}
                            onSelect={onSelect}
                            currentPath={currentPath}
                            editorFile={editorFile}
                            presence={presence}
                            serverId={serverId}
                            userId={userId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const FileManager: React.FC<FileManagerProps> = ({ serverId }) => {
    // State
    const [fileSystem, setFileSystem] = useState<FileNode[]>([]);
    const [currentPath, setCurrentPath] = useState<string[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const { user } = useUser();
    const { can } = usePermissions();
    const canManage = can('server.files.write', serverId);
    const canRead = can('server.files.read', serverId);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'size' | 'modified', direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
    const [isDragging, setIsDragging] = useState(false);
    const { updateActiveView, presence } = useCollaboration();
    const [treeCache, setTreeCache] = useState<Record<string, FileNode[]>>({});
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));
    
    // Lifecycle Refs
    const mountedRef = useRef(true);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { addToast } = useToast();
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm: requestConfirm, handleConfirm, handleCancel } = useConfirm();
    
    // Modals & Actions
    const [editorFile, setEditorFile] = useState<{ node: FileNode, content: string, originalContent?: string } | null>(null);
    const [uploadProgress, setUploadProgress] = useState<{ visible: boolean, progress: number, filename: string }>({ visible: false, progress: 0, filename: '' });
    const [newItemModal, setNewItemModal] = useState<{ type: 'file' | 'folder' | null, value: string }>({ type: null, value: '' });
    const [deletingItemIds, setDeletingItemIds] = useState<Set<string>>(new Set());
    const [extractingItemIds, setExtractingItemIds] = useState<Set<string>>(new Set());
    const [renamingFile, setRenamingFile] = useState<{ id: string; name: string; path: string } | null>(null);
    const [searchResults, setSearchResults] = useState<any[] | null>(null);
    const [isSearchingServer, setIsSearchingServer] = useState(false);
    const [searchInContent, setSearchInContent] = useState(false);

    useEffect(() => {
        mountedRef.current = true;
        updateActiveView(serverId, 'files'); // Set initial view
        return () => { 
            mountedRef.current = false; 
        };
    }, [serverId]);

    const fetchNodes = async (pathStr: string): Promise<FileNode[]> => {
        const fetchPath = pathStr === '' ? '.' : pathStr;
        const files = await API.getFiles(serverId, fetchPath);
        
        return files.map((f: any) => {
            const isConfig = f.name.endsWith('.json') || f.name.endsWith('.yml') || f.name.endsWith('.properties') || f.name.endsWith('.conf');
            const isCode = f.name.endsWith('.js') || f.name.endsWith('.ts') || f.name.endsWith('.py') || f.name.endsWith('.sh');
            
            return {
                id: f.path,
                name: f.name,
                type: f.isDirectory ? 'folder' : (f.name.endsWith('.jar') || f.name.endsWith('.zip') ? 'archive' : (isConfig ? 'config' : (isCode ? 'code' : 'file'))),
                size: f.isDirectory ? '-' : (f.size > 1024 * 1024 ? `${(f.size / (1024 * 1024)).toFixed(1)} MB` : `${(f.size / 1024).toFixed(1)} KB`),
                modified: f.modified || 'Unknown', 
                path: f.path,
                isDirectory: f.isDirectory,
                isProtected: f.isProtected || false,
                children: f.isDirectory ? [] : undefined 
            };
        }).sort((a: FileNode, b: FileNode) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
    };

    const fetchFiles = async () => {
        if (!canRead) return;
        try {
            const pathStr = currentPath.length > 0 ? currentPath.join('/') : '';
            const nodes = await fetchNodes(pathStr);
            setFileSystem(nodes);
            setTreeCache(prev => ({ ...prev, [pathStr]: nodes }));
        } catch (e) {
            console.error(e);
            addToast('error', 'File Error', 'Failed to load files.');
        }
    };

    const handleTreeToggle = async (folderPath: string) => {
        const newExpanded = new Set(expandedFolders);
        if (newExpanded.has(folderPath)) {
            newExpanded.delete(folderPath);
            setExpandedFolders(newExpanded);
        } else {
            newExpanded.add(folderPath);
            setExpandedFolders(newExpanded);
            if (!treeCache[folderPath]) {
                try {
                    const nodes = await fetchNodes(folderPath);
                    setTreeCache(prev => ({ ...prev, [folderPath]: nodes }));
                } catch (e) {
                    addToast('error', 'Fetch Error', `Failed to load folder contents.`);
                }
            }
        }
    };

    const handleTreeSelect = async (node: FileNode) => {
        if (node.isDirectory) {
            const newPath = node.path ? node.path.split('/') : [];
            setCurrentPath(newPath);
            setSelectedIds(new Set());
            setEditorFile(null);
        } else {
            try {
                const content = await API.getFileContent(serverId, node.path);
                setEditorFile({ node: node, content, originalContent: content });
                updateActiveView(serverId, `files:${node.name}`);
            } catch (e) {
                addToast('error', 'Read Error', 'Could not read file content.');
            }
        }
    };

    // API Fetching
    useEffect(() => {
        fetchFiles();
    }, [serverId, currentPath]);

    // Derived State (Flattened, since we fetch per folder now)
    const currentFiles = useMemo(() => {
        if (searchResults) {
             return searchResults.map(f => ({
                id: f.path,
                name: f.name,
                type: f.isDirectory ? 'folder' : (f.name.endsWith('.jar') || f.name.endsWith('.zip') ? 'archive' : 'file'),
                size: f.isDirectory ? '-' : (f.size > 1024 * 1024 ? `${(f.size / (1024 * 1024)).toFixed(1)} MB` : `${(f.size / 1024).toFixed(1)} KB`),
                modified: f.modified || 'Unknown', 
                path: f.path,
                isDirectory: f.isDirectory,
                snippet: f.snippet
             }));
        }

        let files = fileSystem;
        if (searchTerm && !searchResults) {
            files = files.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        // Filter out optimistically deleted items
        files = files.filter(f => !deletingItemIds.has(f.id));
        
        return [...files].sort((a, b) => {
            // Folders always at top
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];

            if (sortConfig.key === 'size') {
                const parseSize = (s: string) => {
                    if (s === '-') return -1;
                    const val = parseFloat(s);
                    if (s.includes('MB')) return val * 1024;
                    if (s.includes('GB')) return val * 1024 * 1024;
                    return val;
                };
                const sA = parseSize(aVal as string);
                const sB = parseSize(bVal as string);
                return sortConfig.direction === 'asc' ? sA - sB : sB - sA;
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [fileSystem, searchTerm, sortConfig, searchResults]);

    // Helpers (Removed legacy recursive helpers)



    // Actions
    const handleNavigate = (folderName: string) => {
        setCurrentPath([...currentPath, folderName]);
        setSelectedIds(new Set());
        setSearchTerm('');
    };

    const handleUp = () => {
        if (searchResults) {
            setSearchResults(null);
            setSearchTerm('');
            return;
        }
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

        if (!canManage) {
            addToast('error', 'Access Denied', 'You do not have permission to create files.');
            return;
        }
        
        try {
            const relPath = [...currentPath, newItemModal.value].join('/');
            if (newItemModal.type === 'folder') {
                await API.createFolder(serverId, relPath);
            } else {
                await API.saveFileContent(serverId, relPath, '');
            }
            
            addToast('success', `${newItemModal.type === 'folder' ? 'Folder' : 'File'} Created`, newItemModal.value);
            setNewItemModal({ type: null, value: '' });
            fetchFiles();

        } catch (e) {
            addToast('error', 'Creation Failed', 'Failed to create item on disk.');
        }
    };

    const handleDelete = async (idsToDelete?: Set<string>) => {
        const targets = idsToDelete || selectedIds;
        if (targets.size === 0) return;

        if (!can('server.files.write', serverId)) {
            addToast('error', 'Access Denied', 'You do not have permission to delete files.');
            return;
        }

        const isConfirmed = await requestConfirm({
            title: 'Delete Items',
            description: `Are you sure you want to delete ${targets.size} items? This action cannot be undone.`,
            confirmText: 'Delete',
            cancelText: 'Cancel'
        });
        if (!isConfirmed) return;
        
        const paths = Array.from(targets);
        setDeletingItemIds(prev => {
            const next = new Set(prev);
            paths.forEach(p => next.add(p));
            return next;
        });

        try {
            await API.deleteFiles(serverId, paths);
            addToast('success', 'Items Deleted', `Removed ${targets.size} files/folders.`);
            setSelectedIds(new Set());
            // No need to fetch immediately if optimistic filtering works, but safer to refresh
            await fetchFiles();
        } catch (e) {
            addToast('error', 'Delete Failed', 'Failed to remove items from disk.');
        } finally {
            setDeletingItemIds(prev => {
                const next = new Set(prev);
                paths.forEach(p => next.add(p)); // Keep them hidden until refresh finishes
                return next;
            });
            // Re-fetch to clear optimistic state and ensure sync
            fetchFiles().finally(() => setDeletingItemIds(new Set()));
        }
    };

    const handleExtract = async (filePath: string, fileName: string) => {
        if (!can('server.files.write', serverId)) {
            addToast('error', 'Access Denied', 'You do not have permission to extract files.');
            return;
        }

        addToast('info', 'Extracting', `Please wait while ${fileName} is being extracted...`);
        setExtractingItemIds(prev => new Set(prev).add(filePath));
        try {
            await API.extractFile(serverId, filePath);
            addToast('success', 'Extraction Complete', `${fileName} has been extracted.`);
            fetchFiles();
        } catch (e: any) {
            addToast('error', 'Extraction Failed', e.message || 'Failed to extract ZIP file.');
        } finally {
            setExtractingItemIds(prev => {
                const next = new Set(prev);
                next.delete(filePath);
                return next;
            });
        }
    };



    const handleDownload = async (path: string, name: string) => {
        try {
            addToast('info', 'Downloading', `Preparing ${name}...`);
            await API.downloadFile(serverId, path);
        } catch (e: any) {
            addToast('error', 'Download Failed', e.message || 'Could not download file.');
        }
    };

    const handleRename = async (file: { id: string; path: string; name: string }, newName: string) => {
        if (!newName || newName === file.name) {
            setRenamingFile(null);
            return;
        }
        if (!canManage) {
            addToast('error', 'Access Denied', 'You do not have permission to rename files.');
            return;
        }
        try {
            const parentDir = file.path.substring(0, file.path.lastIndexOf('/'));
            const dest = parentDir ? `${parentDir}/${newName}` : newName;
            await API.moveFile(serverId, file.path, dest);
            addToast('success', 'Renamed', `${file.name} → ${newName}`);
            setRenamingFile(null);
            fetchFiles();
        } catch (e: any) {
            addToast('error', 'Rename Failed', e.message || 'Could not rename file.');
        }
    };

    const processUpload = async (file: File) => {
        if (!canManage) return;
        const fileSize = file.size > 1024 * 1024 
            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` 
            : `${(file.size / 1024).toFixed(1)} KB`;

        setUploadProgress({ visible: true, progress: 0, filename: file.name });
        
        try {
            // Actually upload the file
            const pathStr = currentPath.length > 0 ? currentPath.join('/') : '';
            await API.uploadFile(serverId, file, pathStr);
            
            setUploadProgress({ visible: true, progress: 100, filename: file.name });
            addToast('success', 'Upload Complete', `${file.name} uploaded successfully.`);
            
            // Refresh file list without page refresh
            setTimeout(async () => {
                setUploadProgress({ visible: false, progress: 0, filename: '' });
                fetchFiles();
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
        if (!canManage) return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processUpload(e.dataTransfer.files[0]);
        }
    };

    const handleSaveFile = async () => {
        if (!editorFile) return;

        if (!canManage) {
            addToast('error', 'Access Denied', 'You do not have permission to save files.');
            return;
        }

        try {
            await API.saveFileContent(serverId, editorFile.node.path, editorFile.content);
            addToast('success', 'File Saved', editorFile.node.name);
            setEditorFile({ ...editorFile, originalContent: editorFile.content });
        } catch (e) {
            addToast('error', 'Save Failed', 'Failed to save file content.');
        }
    };

    const handleServerSearch = async () => {
        if (!searchTerm || searchTerm.length < 2) return;
        setIsSearchingServer(true);
        try {
            const results = await API.searchFiles(serverId, searchTerm, '.', searchInContent);
            setSearchResults(results);
            if (results.length === 0) {
                addToast('info', 'No Results', `No matches found for "${searchTerm}"`);
            }
        } catch (e) {
            addToast('error', 'Search Failed', 'Could not complete server-side search.');
        } finally {
            setIsSearchingServer(false);
        }
    };


    // Icons now externalized

    return (
        <div 
            className="flex flex-col gap-4 h-[calc(100vh-120px)] relative"
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
        >
            {/* Header Toolbar */}
            <div className="bg-card border border-border p-4 flex flex-col md:flex-row items-center justify-between gap-4 rounded-md shadow-sm">
                <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto no-scrollbar py-0.5">
                    <button 
                        onClick={() => { setCurrentPath([]); setSelectedIds(new Set()); }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-md hover:bg-secondary transition-colors shrink-0 ${currentPath.length === 0 ? 'bg-primary/10 text-primary font-bold border border-primary/20' : 'text-muted-foreground border border-transparent'}`}
                    >
                        <Home size={14} />
                        <span className="text-[10px] font-black tracking-[0.1em] uppercase">Root</span>
                    </button>
                    {currentPath.map((folder, index) => (
                        <div key={folder} className="flex items-center gap-1 shrink-0">
                            <ChevronRight size={14} className="text-muted-foreground/30" />
                            <button 
                                onClick={() => {
                                    setCurrentPath(currentPath.slice(0, index + 1));
                                    setSelectedIds(new Set());
                                }}
                                className={`text-[10px] uppercase tracking-wider px-2.5 py-1.5 rounded-md hover:bg-secondary transition-colors font-bold border border-transparent hover:border-border/40 ${index === currentPath.length - 1 ? 'text-foreground bg-secondary/30' : 'text-muted-foreground'}`}
                            >
                                {folder}
                            </button>
                        </div>
                    ))}
                    {currentPath.length > 0 && (
                        <button 
                            onClick={() => {
                                navigator.clipboard.writeText('/' + currentPath.join('/'));
                                addToast('info', 'Path Copied', 'Directory path copied to clipboard');
                            }}
                            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground/40 hover:text-primary transition-all ml-2"
                            title="Copy Current Path"
                        >
                            <Copy size={12} />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64 flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 text-muted-foreground h-4 w-4" />
                            <input 
                                type="text" 
                                placeholder="Search files..." 
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    if (!e.target.value) setSearchResults(null);
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && handleServerSearch()}
                                className="w-full bg-secondary/30 border border-border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                        <button 
                            onClick={() => setSearchInContent(!searchInContent)}
                            className={`px-2 rounded-md border text-[10px] font-bold transition-all ${searchInContent ? 'bg-primary/20 border-primary text-primary' : 'bg-secondary/30 border-border text-muted-foreground'}`}
                            title="Search in file content (Grep)"
                        >
                            GREP
                        </button>
                        <button 
                            onClick={handleServerSearch}
                            disabled={isSearchingServer || searchTerm.length < 2}
                            className="p-2 bg-secondary/50 hover:bg-secondary border border-border rounded-md text-muted-foreground transition-all"
                            title="Search All Files"
                        >
                            {isSearchingServer ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                        </button>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        {canManage && (
                            <>
                                <button onClick={() => setNewItemModal({ type: 'file', value: '' })} className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md border border-transparent hover:border-border transition-all" title="New File">
                                    <FilePlus size={18} />
                                </button>
                                <button onClick={() => setNewItemModal({ type: 'folder', value: '' })} className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md border border-transparent hover:border-border transition-all" title="New Folder">
                                    <FolderPlus size={18} />
                                </button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    onChange={handleFileSelect} 
                                />
                                <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-all flex items-center gap-2 shadow-sm">
                                    <UploadCloud size={16} /> <span>Upload</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 flex gap-4 overflow-hidden relative">
                {/* Left Sidebar: File Tree */}
                <div className="w-64 md:w-72 border border-border flex flex-col overflow-hidden bg-card rounded-md shadow-sm">
                     <div className="p-3 border-b border-border bg-muted/20 font-semibold text-xs text-muted-foreground tracking-wider uppercase flex items-center justify-between">
                         <span className="flex items-center gap-2"><Folder size={14} className="text-primary"/> Explorer</span>
                     </div>
                     <div className="flex-1 overflow-y-auto w-full p-1 space-y-0.5 custom-scrollbar">
                          {treeCache['']?.length === 0 && (
                                <div className="py-8 text-center text-muted-foreground/50 text-xs">Root is empty</div>
                          )}

                          {treeCache['']?.map((rootNode) => (
                              <FileTreeNode 
                                  key={rootNode.id}
                                  node={rootNode}
                                  level={0}
                                  treeCache={treeCache}
                                  expandedFolders={expandedFolders}
                                  onToggle={handleTreeToggle}
                                  onSelect={handleTreeSelect}
                                  currentPath={currentPath}
                                  editorFile={editorFile}
                                  presence={presence}
                                  serverId={serverId}
                                  userId={user?.id}
                              />
                          ))}
                     </div>
                </div>

                {/* Right Pane: Editor OR Table View */}
                <div className="flex-1 border border-border overflow-hidden relative flex flex-col bg-card rounded-md shadow-sm">
                    {editorFile ? (
                        <div className="flex flex-col h-full bg-[#0d0d0d] font-mono text-sm leading-6">
                            <div className="flex items-center justify-between p-3 border-b border-border/40 bg-[#09090b]">
                                <div className="flex items-center gap-3">
                                    <FileCode size={18} className="text-emerald-400" />
                                    <div>
                                        <span className="font-mono font-medium text-foreground block text-sm">{editorFile.node.name}</span>
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">/{currentPath.join('/')}/{editorFile.node.name}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {canManage && (
                                        <button 
                                            onClick={handleSaveFile}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/10"
                                        >
                                            <Save size={14} /> Save
                                        </button>
                                    )}
                                    <button 
                                        onClick={async () => {
                                            if (editorFile && editorFile.content !== editorFile.originalContent) {
                                                const discard = await requestConfirm({
                                                    title: 'Unsaved Changes',
                                                    description: `You have unsaved changes in ${editorFile.node.name}. Discard them?`,
                                                    confirmText: 'Discard Changes',
                                                    cancelText: 'Keep Editing'
                                                });
                                                if (!discard) return;
                                            }
                                            setEditorFile(null); 
                                            updateActiveView(serverId, 'files');
                                        }}
                                        className="p-1.5 hover:bg-secondary text-muted-foreground hover:text-foreground rounded-md transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-hidden relative bg-[#09090b] fm-codemirror-wrapper">
                                <CodeMirror
                                    value={editorFile.content}
                                    height="100%"
                                    theme="dark"
                                    className="absolute inset-0 w-full h-full text-sm font-mono"
                                    extensions={
                                        editorFile.node.name.toLowerCase().endsWith('.json') ? [json()] :
                                        (editorFile.node.name.toLowerCase().endsWith('.yml') || editorFile.node.name.toLowerCase().endsWith('.yaml')) ? [yaml()] :
                                        editorFile.node.name.toLowerCase().endsWith('.properties') ? [StreamLanguage.define(properties)] :
                                        []
                                    }
                                    onChange={(val) => setEditorFile({ ...editorFile, content: val })}
                                    spellCheck={false}
                                    onKeyDown={(e) => {
                                        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                                            e.preventDefault();
                                            handleSaveFile();
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-auto flex-1">
                                <table className="w-full text-sm text-left border-collapse">
                                    <thead className="bg-muted text-xs uppercase text-muted-foreground font-semibold sticky top-0 z-10 border-b border-border">
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
                                        {(currentPath.length > 0 || searchResults) && (
                                            <tr 
                                                className="hover:bg-muted/40 transition-colors cursor-pointer group"
                                                onClick={handleUp}
                                            >
                                                <td className="px-4 py-3 text-center border-l-2 border-transparent">
                                                    <div className="w-4 h-4 rounded-full border border-muted-foreground/20 flex items-center justify-center group-hover:border-primary/40 transition-colors">
                                                        <CornerUpLeft size={10} className="text-muted-foreground/40 group-hover:text-primary transition-colors" />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs text-muted-foreground/60 group-hover:text-primary transition-colors" colSpan={4}>.. (Back{searchResults ? ' to Folder' : ''})</td>
                                            </tr>
                                        )}
                                        
                                        {!canRead ? (
                                            <tr>
                                                <td colSpan={5} className="py-20 text-center">
                                                    <AccessDenied 
                                                        title="File Access Restricted"
                                                        description="You do not have permission to view files on this server. Please contact your administrator for access."
                                                        showBackButton={false}
                                                    />
                                                </td>
                                            </tr>
                                        ) : currentFiles.length === 0 && (
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
                                                            className="rounded-sm border-border bg-secondary text-primary focus:ring-primary/50"
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
                                                                        const content = await API.getFileContent(serverId, file.path);
                                                                        setEditorFile({ node: file, content });
                                                                        updateActiveView(serverId, `files:${file.name}`);
                                                                    } catch (e) {
                                                                        addToast('error', 'Read Error', 'Could not read file content.');
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            {getFileIcon(file.type)}
                                                            {renamingFile?.id === file.id ? (
                                                                <input
                                                                    autoFocus
                                                                    type="text"
                                                                    defaultValue={renamingFile.name}
                                                                    className="bg-secondary border border-primary/40 rounded-md px-2 py-0.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary min-w-[200px]"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    onKeyDown={(e) => {
                                                                        e.stopPropagation();
                                                                        if (e.key === 'Enter') handleRename(renamingFile, (e.target as HTMLInputElement).value);
                                                                        if (e.key === 'Escape') setRenamingFile(null);
                                                                    }}
                                                                    onBlur={(e) => handleRename(renamingFile, e.target.value)}
                                                                />
                                                            ) : (
                                                                <span className={`font-medium transition-colors ${file.type === 'folder' ? 'text-foreground group-hover:text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                                                    {file.name}
                                                                </span>
                                                            )}
                                                            {file.snippet && (
                                                                <span className="text-[10px] text-muted-foreground/60 italic truncate max-w-xs ml-2">
                                                                    {file.snippet}
                                                                </span>
                                                            )}
                                                            {!file.isDirectory && presence[serverId]?.some(p => p.activeView === `files:${file.name}` && p.userId !== user?.id) && (
                                                                <span className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm bg-emerald-500/10 text-[9px] font-bold text-emerald-500 animate-pulse border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                                                    <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                                                    LIVE
                                                                </span>
                                                            )}
                                                            {extractingItemIds.has(file.path) && (
                                                                <span className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm bg-blue-500/10 text-[9px] font-bold text-blue-500 animate-pulse border border-blue-500/20">
                                                                    <Loader2 size={10} className="animate-spin" />
                                                                    EXTRACTING
                                                                </span>
                                                            )}
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
                                                            <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDownload(file.path, file.name);
                                                            }}
                                                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Download"
                                                        >
                                                            <Download size={14} />
                                                        </button>
                                                            {canManage && !file.isProtected && (
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setRenamingFile({ id: file.id, name: file.name, path: file.path });
                                                                    }}
                                                                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Rename"
                                                                >
                                                                    <Pencil size={14} />
                                                                </button>
                                                            )}
                                                            {file.name.endsWith('.zip') && canManage && (
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const filePath = currentPath.length > 0 
                                                                            ? [...currentPath, file.name].join('/') 
                                                                            : file.name;
                                                                        handleExtract(filePath, file.name);
                                                                    }}
                                                                    className="p-1.5 rounded-md hover:bg-blue-500/10 text-blue-400 hover:text-blue-300 transition-colors" 
                                                                    title="Extract ZIP"
                                                                >
                                                                    <Archive size={14} />
                                                                </button>
                                                            )}
                                                            {canManage && (
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDelete(new Set([file.id]));
                                                                    }}
                                                                    disabled={file.isProtected || deletingItemIds.has(file.id)}
                                                                    className={`p-1.5 rounded-md transition-colors ${file.isProtected ? 'text-muted-foreground/30 cursor-not-allowed' : 'hover:bg-destructive/10 text-muted-foreground hover:text-destructive'}`} title="Delete"
                                                                >
                                                                    {deletingItemIds.has(file.id) ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                                </button>
                                                            )}
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
                                <div className="absolute inset-0 bg-background z-50 flex flex-col items-center justify-center border-2 border-dashed border-primary m-4 rounded-md animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
                                    <UploadCloud size={64} className="text-primary animate-pulse" />
                                    <h3 className="text-xl font-bold mt-4">Drop files to upload</h3>
                                    <p className="text-muted-foreground">Files will be added to /{currentPath.join('/')}</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Bottom Actions Bar (Selection) */}
            {selectedIds.size > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background px-6 py-3 rounded-md shadow-lg flex items-center gap-6 animate-in slide-in-from-bottom-10 fade-in duration-300 z-40">
                    <span className="font-bold text-sm">{selectedIds.size} selected</span>
                    <div className="h-4 w-[1px] bg-background/20"></div>
                    <div className="flex gap-2">
                         <button 
                            onClick={async () => {
                                const name = await requestConfirm({
                                    title: 'Create Archive',
                                    description: 'Enter a name for the new archive file.',
                                    confirmText: 'Create',
                                    cancelText: 'Cancel'
                                });
                                if (name) {
                                    try {
                                        await API.archiveFiles(serverId, Array.from(selectedIds), name + '.zip');
                                        addToast('success', 'Archive Created', 'Files have been compressed.');
                                        setSelectedIds(new Set());
                                        fetchFiles();
                                    } catch (e) {
                                        addToast('error', 'Archive Failed', 'Failed to compress files.');
                                    }
                                }
                            }}
                            className="p-2 hover:bg-background/20 rounded-md transition-colors" title="Archive Selection"
                        >
                            <Archive size={18} />
                        </button>
                         <button 
                            onClick={async () => {
                                addToast('info', 'Downloading', `Starting sequential download of ${selectedIds.size} items...`);
                                for (const id of selectedIds) {
                                    const file = currentFiles.find(f => f.id === id);
                                    if (file && !file.isDirectory) {
                                        await API.downloadFile(serverId, file.path);
                                        await new Promise(r => setTimeout(r, 300));
                                    }
                                }
                                addToast('success', 'Downloads Finished', 'Batch download complete.');
                            }}
                            className="p-2 hover:bg-background/20 rounded-md transition-colors" title="Download Selection"
                        >
                            <Download size={18} />
                        </button>
                         {canManage && (
                             <button 
                                onClick={() => handleDelete()}
                                className="p-2 hover:bg-red-500 hover:text-white rounded-md transition-colors" title="Delete Selection"
                            >
                                <Trash2 size={18} />
                            </button>
                         )}
                    </div>
                    <div className="h-4 w-[1px] bg-background/20"></div>
                    <button onClick={() => setSelectedIds(new Set())}>
                        <X size={18} />
                    </button>
                </div>
            )}

            {/* Editor is now inline in the right pane, not a modal */}

            {/* Upload Progress Toast */}
            {uploadProgress.visible && (
                <div className="fixed bottom-6 right-6 bg-card border border-border shadow-md rounded-md p-4 w-80 animate-in slide-in-from-bottom-5 fade-in z-50">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium flex items-center gap-2">
                            <Loader2 className="animate-spin text-primary" size={14} /> Uploading...
                        </span>
                        <span className="text-xs text-muted-foreground">{Math.round(uploadProgress.progress)}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-3">{uploadProgress.filename}</p>
                    <div className="h-1.5 w-full bg-secondary rounded-sm overflow-hidden">
                        <div 
                            className="h-full bg-primary rounded-sm transition-all duration-100 ease-out"
                            style={{ width: `${uploadProgress.progress}%` }}
                        ></div>
                    </div>
                </div>
            )}

            {/* Create Item Modal */}
            {newItemModal.type && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
                    <div className="bg-card border border-border p-6 rounded-md w-full max-w-sm shadow-lg animate-in zoom-in-95">
                        <h3 className="text-lg font-bold mb-4">Create New {newItemModal.type === 'folder' ? 'Folder' : 'File'}</h3>
                        <input 
                            autoFocus
                            type="text" 
                            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-foreground mb-4 focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder={newItemModal.type === 'folder' ? 'folder_name' : 'filename.txt'}
                            value={newItemModal.value}
                            onChange={(e) => setNewItemModal({ ...newItemModal, value: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateItem()}
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setNewItemModal({ type: null, value: '' })} className="flex-1 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary rounded-md transition-colors">Cancel</button>
                            <button onClick={handleCreateItem} className="flex-1 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">Create</button>
                        </div>
                    </div>
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
};

export default FileManager;
