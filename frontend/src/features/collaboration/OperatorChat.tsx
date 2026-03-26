import React, { useState, useRef, useEffect } from 'react';
import { useCollaboration } from '@features/collaboration/context/CollaborationContext';
import { useServers } from '@features/servers/context/ServerContext';
import { useUser } from '@features/auth/context/UserContext';
import { ChatMessage, ActivityEvent, UserRole } from '@shared/types';
import { API } from '@core/services/api';
import { useToast } from '@features/ui/Toast';
import { 
    MessageCircle, Send, X, Users, Activity as ActivityIcon,
    Play, Square, RotateCcw, Terminal, Puzzle, Archive, FileEdit, 
    Shield, Clock, Eye, Monitor, FolderOpen, Settings
} from 'lucide-react';

const ROLE_RANK: Record<UserRole, number> = { 'VIEWER': 0, 'MANAGER': 1, 'ADMIN': 2, 'OWNER': 3 };

// --- Role Badges ---
const ROLE_BADGE: Record<UserRole, { bg: string; text: string; label: string }> = {
    'OWNER':   { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'OWNER' },
    'ADMIN':   { bg: 'bg-red-500/15',   text: 'text-red-400',   label: 'ADMIN' },
    'MANAGER': { bg: 'bg-blue-500/15',  text: 'text-blue-400',  label: 'MGR' },
    'VIEWER':  { bg: 'bg-zinc-500/15',  text: 'text-zinc-400',  label: 'VIEW' },
};

const ROLE_DOT: Record<UserRole, string> = {
    'OWNER': 'bg-amber-500', 'ADMIN': 'bg-red-500', 'MANAGER': 'bg-blue-500', 'VIEWER': 'bg-zinc-500'
};

// --- Activity Action Icons ---
const ACTION_ICON: Record<string, { icon: React.ReactNode; color: string }> = {
    'SERVER_START':      { icon: <Play size={11} />,        color: 'text-emerald-400' },
    'SERVER_STOP':       { icon: <Square size={11} />,      color: 'text-rose-400' },
    'SERVER_RESTART':    { icon: <RotateCcw size={11} />,   color: 'text-amber-400' },
    'COMMAND_SENT':      { icon: <Terminal size={11} />,    color: 'text-blue-400' },
    'PLUGIN_INSTALLED':  { icon: <Puzzle size={11} />,      color: 'text-purple-400' },
    'PLUGIN_REMOVED':    { icon: <Puzzle size={11} />,      color: 'text-rose-400' },
    'PLUGIN_TOGGLED':    { icon: <Puzzle size={11} />,      color: 'text-amber-400' },
    'BACKUP_CREATED':    { icon: <Archive size={11} />,     color: 'text-cyan-400' },
    'BACKUP_RESTORED':   { icon: <Archive size={11} />,     color: 'text-amber-400' },
    'CONFIG_CHANGED':    { icon: <FileEdit size={11} />,    color: 'text-orange-400' },
    'FILE_EDITED':       { icon: <FileEdit size={11} />,    color: 'text-zinc-400' },
    'USER_JOINED_PANEL': { icon: <Users size={11} />,       color: 'text-emerald-400' },
    'USER_LEFT_PANEL':   { icon: <Users size={11} />,       color: 'text-zinc-500' },
    'PLAYER_KICKED':     { icon: <Shield size={11} />,      color: 'text-rose-400' },
    'PLAYER_BANNED':     { icon: <Shield size={11} />,      color: 'text-rose-500' },
    'SCHEDULE_CREATED':  { icon: <Clock size={11} />,       color: 'text-blue-400' },
    'SCHEDULE_DELETED':  { icon: <Clock size={11} />,       color: 'text-rose-400' },
};

const VIEW_ICON: Record<string, React.ReactNode> = {
    'dashboard': <Monitor size={10} />,
    'console': <Terminal size={10} />,
    'files': <FolderOpen size={10} />,
    'plugins': <Puzzle size={10} />,
    'settings': <Settings size={10} />,
};

const timeAgo = (ts: number) => {
    const d = Date.now() - ts;
    if (d < 60_000) return 'now';
    if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
    return new Date(ts).toLocaleDateString();
};

const renderMessageContent = (content: string, currentUsername: string | undefined, isOwn: boolean) => {
    if (!content) return null;
    
    const tokenRegex = /(```[\s\S]*?```|`[^`]+`|@\w+)/g;
    const parts = content.split(tokenRegex);

    return parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
            const code = part.slice(3, -3).trim();
            return (
                <div key={i} className={`mt-1 mb-1 overflow-x-auto rounded-md p-1.5 text-[10px] font-mono ${isOwn ? 'bg-primary-foreground/10 text-primary-foreground' : 'bg-background border border-border text-muted-foreground'}`}>
                    <pre><code>{code}</code></pre>
                </div>
            );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            const code = part.slice(1, -1);
            return <code key={i} className={`px-1 rounded text-[10px] font-mono ${isOwn ? 'bg-primary-foreground/10' : 'bg-background border border-border'}`}>{code}</code>;
        }
        if (part.startsWith('@') && part.length > 1) {
            const username = part.slice(1);
            const isMe = currentUsername && username.toLowerCase() === currentUsername.toLowerCase();
            if (isMe) {
                 return <span key={i} className={`font-bold px-1 rounded-sm ${isOwn ? 'bg-primary-foreground/20' : 'bg-primary/20 text-primary'}`}>{part}</span>;
            }
            return <span key={i} className={`font-semibold ${isOwn ? 'text-primary-foreground' : 'text-primary'}`}>{part}</span>;
        }
        return <span key={i}>{part}</span>;
    });
};

type Tab = 'chat' | 'activity' | 'presence';
type SuggestionType = 'none' | 'command' | 'server' | 'mention';

const COMMANDS = [
    { cmd: 'start', desc: 'Start a server', hasArg: true },
    { cmd: 'stop', desc: 'Stop a server', hasArg: true },
    { cmd: 'restart', desc: 'Restart a server', hasArg: true },
    { cmd: 'clear', desc: 'Clear local chat', hasArg: false },
    { cmd: 'w', desc: 'Private whisper', hasArg: true },
    { cmd: 'status', desc: 'Host system metrics', hasArg: false },
    { cmd: 'nuke-chat', desc: 'Clear global chat history (Admin)', hasArg: false },
];

const OperatorChat: React.FC<{ serverId?: string }> = ({ serverId }) => {
    // --- Hooks ---
    const { currentServer } = useServers();
    const { servers, setCurrentServerById } = useServers();
    const { user } = useUser();
    const { chatMessages, typingUsers, sendChat, sendTyping, presence, activities } = useCollaboration();
    const { addToast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('chat');
    const [message, setMessage] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
    const [suggestionType, setSuggestionType] = useState<SuggestionType>('none');
    const [suggestionQuery, setSuggestionQuery] = useState('');
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const [activityFilter, setActivityFilter] = useState<'ALL' | 'SERVER' | 'USER' | 'SYSTEM'>('ALL');
    const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const lastTypingEmit = useRef(0);

    const id = 'global'; // Core is global as per user feedback
    const messages = chatMessages[id] || [];

    // Helper: jump to a user's current server
    const handleJumpToServer = (serverId: string | null) => {
        if (!serverId) return;
        const target = servers.find(s => s.id === serverId);
        if (target) {
            setCurrentServerById(target.id);
            setIsOpen(false); // Optionally close panel so they can see the view
        }
    };

    // Reset unread conceptually (though global ID rarely changes)
    useEffect(() => {
        setUnreadCount(0);
    }, [id]);

    // Clear unread when viewing chat
    useEffect(() => {
        if (isOpen && activeTab === 'chat' && unreadCount > 0) {
            setUnreadCount(0);
        }
    }, [isOpen, activeTab, unreadCount]);

    // Scroll to bottom
    useEffect(() => {
        const isViewingChat = isOpen && activeTab === 'chat';
        if (isViewingChat && messages.length > 0) {
            // Only auto-scroll if it's our own message or we are already close to bottom
            // For now, keep it simple and always scroll if the tab is active
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages.length, isOpen, activeTab]);

    // Track unread messages & Mentions
    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg) return;

        // Skip if it's our own message
        if (lastMsg.userId === user?.id) return;
        
        // --- Mention Notification ---
        const isMentioned = user?.username && new RegExp(`@${user.username}\\b`, 'i').test(lastMsg.content);
        if (isMentioned) {
            addToast('info', 'Team Mention', `${lastMsg.username} mentioned you in chat.`);
            // Mention Sound Integration (v1.12.5)
            try {
                const audio = new Audio('/assets/sounds/mention.mp3');
                audio.play().catch(() => {}); // Browser may block auto-play
            } catch (e) {}
        }

        // --- Unread Logic ---
        // If panel is closed OR user is on another tab, increment unread
        const isViewingChat = isOpen && activeTab === 'chat';
        if (!isViewingChat) {
            setUnreadCount(prev => prev + 1);
        }
    }, [messages.length, user?.id]); // Only run on new messages

    // --- Logic & Returns ---
    if (!id) return null;

    const canReadChat = true;
    const canSendChat = true;
    const chatEnabled = true;
    const canSeePresence = true;
    const canSeeActivity = true;

    const typing = typingUsers[id] || [];
    const users = presence[id] || [];
    const allEvents = (activities[id] || []).filter(e => ROLE_RANK[user?.role || 'VIEWER'] >= ROLE_RANK[e.visibility]);

    const events = allEvents.filter(e => {
        if (activityFilter === 'ALL') return true;
        if (activityFilter === 'SERVER') return ['SERVER_START', 'SERVER_STOP', 'SERVER_RESTART'].includes(e.action);
        if (activityFilter === 'USER') return ['USER_JOINED_PANEL', 'USER_LEFT_PANEL', 'PLAYER_KICKED', 'PLAYER_BANNED'].includes(e.action);
        if (activityFilter === 'SYSTEM') return ['CONFIG_CHANGED', 'FILE_EDITED', 'PLUGIN_INSTALLED', 'PLUGIN_REMOVED', 'PLUGIN_TOGGLED', 'BACKUP_CREATED', 'BACKUP_RESTORED', 'COMMAND_SENT', 'SCHEDULE_CREATED', 'SCHEDULE_DELETED'].includes(e.action);
        return true;
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setMessage(val);

        if (val.startsWith('/')) {
            const parts = val.split(' ');
            if (parts.length === 1) {
                setSuggestionType('command');
                setSuggestionQuery(parts[0].slice(1).toLowerCase());
            } else if (parts.length === 2 && ['/start', '/stop', '/restart'].includes(parts[0].toLowerCase())) {
                setSuggestionType('server');
                setSuggestionQuery(parts[1].toLowerCase());
            } else if (parts.length === 2 && parts[0].toLowerCase() === '/w') {
                setSuggestionType('mention');
                const rawQ = parts[1].startsWith('@') ? parts[1].slice(1) : parts[1];
                setSuggestionQuery(rawQ.toLowerCase());
            } else {
                setSuggestionType('none');
            }
        } else {
            const words = val.split(' ');
            const lastWord = words[words.length - 1];
            if (lastWord.startsWith('@')) {
                setSuggestionType('mention');
                setSuggestionQuery(lastWord.slice(1).toLowerCase());
            } else {
                setSuggestionType('none');
            }
        }
        setSuggestionIndex(0);
    };

    let options: { id: string, label: string, sub?: string }[] = [];
    if (suggestionType === 'command') {
        options = COMMANDS
            .filter(c => c.cmd.startsWith(suggestionQuery))
            .map(c => ({ id: c.cmd, label: `/${c.cmd}`, sub: c.desc }));
    } else if (suggestionType === 'server') {
        options = servers
            .filter(s => s.name.toLowerCase().includes(suggestionQuery) || s.id.toLowerCase().includes(suggestionQuery))
            .map(s => ({ id: s.id, label: s.name, sub: s.id }));
    } else if (suggestionType === 'mention') {
        options = users
            .filter(u => u.username.toLowerCase().includes(suggestionQuery) && u.userId !== user?.id)
            .map(u => ({ id: u.username, label: `@${u.username}`, sub: u.role }));
    }

    const applySuggestion = (optionId: string) => {
        if (suggestionType === 'command') {
            const cmd = COMMANDS.find(c => c.cmd === optionId);
            setMessage(`/${optionId}${cmd?.hasArg ? ' ' : ''}`);
        } else if (suggestionType === 'server') {
            const parts = message.split(' ');
            setMessage(`${parts[0]} ${optionId}`);
        } else if (suggestionType === 'mention') {
            const words = message.split(' ');
            words.pop();
            setMessage([...words, `@${optionId} `].join(' ').trimStart());
        }
        setSuggestionType('none');
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (suggestionType !== 'none' && options.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSuggestionIndex(prev => (prev + 1) % options.length);
                return;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSuggestionIndex(prev => (prev - 1 + options.length) % options.length);
                return;
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                applySuggestion(options[suggestionIndex].id);
                return;
            } else if (e.key === 'Escape') {
                setSuggestionType('none');
                return;
            }
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        const msg = message.trim();
        if (!msg || !canSendChat) return;

        if (msg.startsWith('/')) {
            await handleSlashCommand(msg);
        } else {
            sendChat(id, msg);
        }
        
        setMessage('');
        setSuggestionType('none');
        setUnreadCount(0); // Clear unread on own message
        inputRef.current?.focus();
        // Force scroll for own message
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    };

    const handleSlashCommand = async (cmdString: string) => {
        const parts = cmdString.slice(1).trim().split(/\s+/);
        const cmd = parts[0]?.toLowerCase();
        const args = parts.slice(1);

        try {
            switch (cmd) {
                case 'start':
                case 'server-start':
                    if (!args[0]) throw new Error('Usage: /start <serverId>');
                    addToast('info', 'Command Execution', `Initiating startup sequence for ${args[0]}...`);
                    await API.startServer(args[0]);
                    break;
                case 'stop':
                case 'server-stop':
                    if (!args[0]) throw new Error('Usage: /stop <serverId>');
                    addToast('warning', 'Command Execution', `Initiating shutdown sequence for ${args[0]}...`);
                    await API.stopServer(args[0]);
                    break;
                case 'restart':
                case 'server-restart':
                    if (!args[0]) throw new Error('Usage: /restart <serverId>');
                    addToast('info', 'Command Execution', `Initiating restart sequence for ${args[0]}...`);
                    await API.stopServer(args[0]);
                    setTimeout(() => API.startServer(args[0]), 2000);
                    break;
                case 'clear':
                    addToast('success', 'Clear History', 'Local chat history cleared for this session.');
                    break;
                case 'w':
                    sendChat(id, cmdString);
                    break;
                case 'nuke-chat': {
                    if (user?.role !== 'OWNER' && user?.role !== 'ADMIN') {
                        addToast('error', 'Permission Denied', 'Only Owners or Admins can nuke the chat.');
                        return;
                    }
                    sendChat(id, '/nuke-chat');
                    break;
                }
                case 'status': {
                    addToast('info', 'System Stats', 'Broadcasting host metrics to the team...');
                    try {
                        const stats = await API.getSystemStats();
                        const cpu = stats.cpu + '%';
                        const memBytes = stats.memory.used;
                        const memTotal = stats.memory.total;
                        const mem = (memBytes / 1024 / 1024 / 1024).toFixed(1) + 'GB / ' + (memTotal / 1024 / 1024 / 1024).toFixed(1) + 'GB';
                        
                        // Send as a real chat message so the whole team sees it
                        sendChat(id, `📊 **System Status**\n**CPU:** ${cpu}\n**RAM:** ${mem}`);
                    } catch (e: any) {
                        addToast('error', 'Status Failed', e.message);
                    }
                    break;
                }
                default:
                    addToast('error', 'Unknown Command', `The command '${cmd}' is not recognized.`);
                    throw new Error(`Unknown command: ${cmd}`);
            }
        } catch (e: any) {
            console.error('[Slash Command]', e);
        }
    };

    const handleTyping = () => {
        const now = Date.now();
        if (now - lastTypingEmit.current > 2000) {
            sendTyping(id);
            lastTypingEmit.current = now;
        }
    };

    // --- Floating Button (Closed State) ---
    if (!isOpen) {
        return (
            <button
                onClick={() => { setIsOpen(true); setUnreadCount(0); }}
                className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-2xl hover:scale-110 active:scale-95 transition-transform flex items-center justify-center z-50"
            >
                <MessageCircle size={20} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
                {users.length > 0 && (
                    <span className="absolute -bottom-0.5 -left-0.5 w-4 h-4 bg-emerald-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center border-2 border-background">
                        {users.length}
                    </span>
                )}
            </button>
        );
    }

    // --- Tab Config ---
    const tabs: { key: Tab; icon: React.ReactNode; label: string; count?: number; visible: boolean }[] = [
        { key: 'chat', icon: <MessageCircle size={13} />, label: 'Chat', count: (activeTab !== 'chat' ? unreadCount : 0), visible: canReadChat },
        { key: 'activity', icon: <ActivityIcon size={13} />, label: 'Activity', count: events.length, visible: canSeeActivity },
        { key: 'presence', icon: <Users size={13} />, label: 'Online', count: users.length, visible: canSeePresence },
    ];

    const visibleTabs = tabs.filter(t => t.visible);

    return (
        <div className="fixed bottom-6 right-6 w-[380px] z-50" style={{ height: 'min(520px, calc(100vh - 100px))' }}>
            <div className="flex flex-col h-full rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="px-3 py-2 border-b border-border bg-muted/30 shrink-0">
                    <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs font-bold text-foreground tracking-wide">Team Panel</span>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Tab Bar */}
                    <div className="flex gap-0.5 bg-secondary/50 rounded-lg p-0.5">
                        {visibleTabs.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                                    activeTab === tab.key
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {tab.icon}
                                {tab.label}
                                {tab.count != null && tab.count > 0 && (
                                    <span className={`text-[8px] px-1 py-0.5 rounded-full font-bold ${
                                        activeTab === tab.key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                                    }`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col">

                    {/* ========== CHAT TAB ========== */}
                    {activeTab === 'chat' && (
                        <>
                            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin scrollbar-thumb-border">
                                {messages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground/30 text-center">
                                        <MessageCircle size={28} className="mb-2 opacity-15" />
                                        <p className="text-[11px]">No messages yet</p>
                                        <p className="text-[9px] mt-0.5 opacity-50">Chat with your team here</p>
                                    </div>
                                ) : messages.map((msg: ChatMessage) => {
                                    const isOwn = msg.userId === user?.id;
                                    const isSystem = msg.type === 'system';
                                    const isWhisper = msg.type === 'whisper';
                                    const badge = ROLE_BADGE[msg.role];
                                    const isMentioned = !isOwn && user?.username && new RegExp(`@${user.username}\\b`, 'i').test(msg.content);

                                    if (isSystem) {
                                        return (
                                            <div key={msg.id} className="text-center text-[9px] text-muted-foreground/30 py-0.5">
                                                {msg.content}
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={msg.id} className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                                            {/* Avatar */}
                                            <div className="shrink-0 mt-1">
                                                {msg.avatar ? (
                                                    <img src={msg.avatar} alt="" className="w-6 h-6 rounded-full object-cover border border-border" />
                                                ) : (
                                                    <div className={`w-6 h-6 rounded-full ${ROLE_DOT[msg.role]} flex items-center justify-center text-[10px] font-bold text-white`}>
                                                        {msg.username.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                            </div>

                                            <div className={`max-w-[75%]`}>
                                                {!isOwn && (
                                                    <div className="flex items-center gap-1 mb-0.5">
                                                        <span className="text-[10px] font-semibold text-foreground">{msg.username}</span>
                                                        <span className={`text-[7px] px-1 py-0.5 rounded font-bold ${badge.bg} ${badge.text}`}>
                                                            {badge.label}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className={`px-2.5 py-1.5 rounded-xl text-[11px] leading-relaxed break-words ${
                                                    isOwn
                                                        ? isWhisper 
                                                            ? 'bg-indigo-600 text-white rounded-br-sm italic shadow-[0_0_10px_rgba(79,70,229,0.2)]'
                                                            : 'bg-primary text-primary-foreground rounded-br-sm'
                                                        : isWhisper
                                                            ? 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-bl-sm italic shadow-[0_0_10px_rgba(79,70,229,0.2)]'
                                                            : isMentioned
                                                                ? 'bg-primary/20 border border-primary/30 text-foreground rounded-bl-sm shadow-[0_0_10px_rgba(var(--primary),0.2)]'
                                                                : 'bg-secondary text-secondary-foreground rounded-bl-sm'
                                                }`}>
                                                    {renderMessageContent(msg.content, user?.username, isOwn)}
                                                </div>
                                                <span className="text-[8px] text-muted-foreground/20 mt-0.5 block">
                                                    {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* New Messages Jump Button (Stabilization) */}
                            {unreadCount > 0 && activeTab === 'chat' && (
                                <button
                                    onClick={() => {
                                        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                                        setUnreadCount(0);
                                    }}
                                    className="absolute bottom-16 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-primary text-primary-foreground rounded-full text-[10px] font-bold shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2 z-10"
                                >
                                    <MessageCircle size={12} />
                                    {unreadCount} New Messages
                                </button>
                            )}

                            {/* Typing + Input */}
                            <div className="shrink-0 border-t border-border bg-muted/20 relative">
                                {suggestionType !== 'none' && options.length > 0 && (
                                    <div className="absolute bottom-full left-0 w-full mb-1 px-2 z-20">
                                        <div className="bg-background/95 backdrop-blur-md border border-border rounded-lg shadow-xl overflow-hidden max-h-40 overflow-y-auto w-full scrollbar-thin scrollbar-thumb-border">
                                            {options.map((opt, i) => (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    onClick={() => applySuggestion(opt.id)}
                                                    className={`w-full text-left px-3 py-2 flex justify-between items-center text-[11px] transition-colors ${i === suggestionIndex ? 'bg-primary/20 text-primary' : 'text-foreground hover:bg-muted/50'}`}
                                                >
                                                    <span className="font-bold font-mono">{opt.label}</span>
                                                    {opt.sub && <span className="text-[9px] text-muted-foreground ml-2 truncate max-w-[200px]">{opt.sub}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {typing.length > 0 && (
                                    <div className="px-3 py-1 text-[9px] text-muted-foreground/50 animate-pulse">
                                        {typing.map(t => t.username).join(', ')} typing...
                                    </div>
                                )}
                                {canSendChat ? (
                                    <form onSubmit={handleSend} className="p-2">
                                        <div className="flex gap-1.5 items-center bg-background border border-border rounded-lg px-2.5 py-2 focus-within:ring-1 focus-within:ring-primary/50 transition-all shadow-inner">
                                            <input
                                                ref={inputRef}
                                                type="text"
                                                value={message}
                                                onChange={(e) => { handleInputChange(e); handleTyping(); }}
                                                onKeyDown={handleKeyDown}
                                                placeholder="Type a message..."
                                                maxLength={500}
                                                className="flex-1 bg-transparent border-none text-[11px] text-foreground focus:outline-none placeholder:text-muted-foreground/40"
                                            />
                                            <button
                                                type="submit"
                                                disabled={!message.trim()}
                                                className="p-1 text-primary hover:bg-primary/10 rounded disabled:opacity-0 transition-all"
                                            >
                                                <Send size={13} />
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="p-2 text-center text-[9px] text-muted-foreground/40">
                                        Read-only — your role does not allow sending messages
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* ========== ACTIVITY TAB ========== */}
                    {activeTab === 'activity' && (
                        <div className="flex-1 overflow-hidden flex flex-col">
                            {/* Filter Chips */}
                            <div className="shrink-0 p-2 border-b border-border/50 bg-background/50 flex gap-1.5 overflow-x-auto scrollbar-none">
                                {['ALL', 'SERVER', 'USER', 'SYSTEM'].map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setActivityFilter(f as any)}
                                        className={`px-2.5 py-1 rounded-full text-[9px] font-bold whitespace-nowrap transition-colors ${
                                            activityFilter === f 
                                                ? 'bg-primary text-primary-foreground' 
                                                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                                        }`}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border">
                                {events.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground/30 text-center p-6">
                                        <ActivityIcon size={28} className="mb-2 opacity-15" />
                                        <p className="text-[11px]">No activity matches filter</p>
                                        <p className="text-[9px] mt-0.5 opacity-50">System and server events appear here</p>
                                    </div>
                                ) : (
                                <div className="p-2 space-y-0.5">
                                    {events.map((event: ActivityEvent) => {
                                        const config = ACTION_ICON[event.action] || { icon: <ActivityIcon size={11} />, color: 'text-zinc-400' };
                                        return (
                                            <div key={event.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors group">
                                                <div className={`mt-0.5 p-1 rounded-md ${config.color} bg-secondary/40`}>
                                                    {config.icon}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-baseline gap-1">
                                                        <span className="text-[10px] font-bold text-foreground">{event.username}</span>
                                                        <span className="text-[10px] text-muted-foreground truncate">{event.detail}</span>
                                                    </div>
                                                    {id === 'global' && event.serverId && event.serverId !== 'global' && (
                                                        <div className="text-[8px] text-primary/60 font-medium uppercase tracking-tighter">
                                                            {servers.find(s => s.id === event.serverId)?.name || event.serverId}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-[8px] text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {timeAgo(event.timestamp)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            </div>
                        </div>
                    )}

                    {/* ========== PRESENCE TAB ========== */}
                    {activeTab === 'presence' && (
                        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border">
                            {users.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/30 text-center p-6">
                                    <Users size={28} className="mb-2 opacity-15" />
                                    <p className="text-[11px]">No one else is online</p>
                                    <p className="text-[9px] mt-0.5 opacity-50">Team members will appear when they join</p>
                                </div>
                            ) : (
                                <div className="p-2 space-y-1">
                                    {users.map(entry => {
                                        const dot = ROLE_DOT[entry.role];
                                        const badge = ROLE_BADGE[entry.role];
                                        const [targetServerId, actualView] = entry.activeView?.includes('::') 
                                            ? entry.activeView.split('::') 
                                            : [null, entry.activeView || 'dashboard'];

                                        const serverName = targetServerId ? servers.find(s => s.id === targetServerId)?.name : null;

                                        return (
                                            <button 
                                                key={entry.userId} 
                                                onClick={() => handleJumpToServer(targetServerId)}
                                                disabled={!targetServerId}
                                                className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${targetServerId ? 'hover:bg-primary/10 cursor-pointer group' : 'hover:bg-muted/30 cursor-default'} `}
                                            >
                                                {/* Avatar */}
                                                <div className="relative shrink-0">
                                                    {entry.avatar ? (
                                                        <img src={entry.avatar} alt="" className="w-8 h-8 rounded-full object-cover border border-border" />
                                                    ) : (
                                                        <div className={`w-8 h-8 rounded-full ${dot} flex items-center justify-center text-white text-xs font-bold`}>
                                                            {entry.username.charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-card" />
                                                </div>
                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[11px] font-semibold text-foreground truncate">{entry.username}</span>
                                                        <span className={`text-[7px] px-1 py-0.5 rounded font-bold ${badge.bg} ${badge.text}`}>
                                                            {badge.label}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between mt-0.5">
                                                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50 group-hover:text-primary/70 transition-colors">
                                                            {actualView.startsWith('files:') ? <FileEdit size={9} /> : (VIEW_ICON[actualView] || <Eye size={9} />)}
                                                            <span className="capitalize">
                                                                {actualView.startsWith('files:') 
                                                                    ? `Editing ${actualView.split(':')[1]}` 
                                                                    : actualView
                                                                }
                                                                {serverName && <span className="ml-1 opacity-70">in {serverName}</span>}
                                                            </span>
                                                        </div>
                                                        {targetServerId && (
                                                            <div className="text-[8px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                                                JUMP
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OperatorChat;
