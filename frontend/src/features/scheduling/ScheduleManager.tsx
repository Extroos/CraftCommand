
import React, { useState, useEffect } from 'react';
import { ScheduleTask } from '@shared/types';
import { CalendarClock, Plus, Play, Pause, Trash2, Clock, Command, Check, X, Loader2, Copy, Zap, List, History, Settings2 } from 'lucide-react';
import { API } from '@core/services/api';
import { useToast } from '../ui/Toast';
import { useServers } from '@features/servers/context/ServerContext';
import { usePermissions } from '@features/auth/hooks/usePermissions';
import AccessDenied from '@features/auth/components/AccessDenied';
import { useConfirm } from '@features/ui/hooks/useConfirm';
import { ConfirmDialog } from '@features/ui/ConfirmDialog';

interface ScheduleManagerProps {
    serverId: string;
}

const ScheduleManager: React.FC<ScheduleManagerProps> = ({ serverId }) => {
    const { addToast } = useToast();
    const { can } = usePermissions();
    const [executionHistory, setExecutionHistory] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'schedules' | 'history'>('schedules');
    const [isCreating, setIsCreating] = useState(false);
    const { isOpen: isConfirmOpen, config: confirmConfig, confirm: requestConfirm, handleConfirm, handleCancel } = useConfirm();
    const [newTask, setNewTask] = useState({ 
        name: '', 
        cron: '0 * * * *', 
        actions: [{ type: 'command', command: '' }] as any[], 
        scheduleType: 'recurring' as 'recurring' | 'once', 
        runAt: '' 
    });
    const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set());
    const { schedules: globalSchedules, refreshServerData, loading } = useServers();
    const [localTasks, setLocalTasks] = useState<ScheduleTask[]>([]);
    const [editingTask, setEditingTask] = useState<ScheduleTask | null>(null);
    const [showOptimistic, setShowOptimistic] = useState(false);

    const scheduleCount = (globalSchedules[serverId] || []).length; // Stable primitive

    useEffect(() => {
        setLocalTasks(globalSchedules[serverId] || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverId, scheduleCount]);

    useEffect(() => {
        if (!globalSchedules[serverId]) {
            refreshServerData(serverId);
        }
        fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverId]);

    const fetchSchedules = async () => {
        await refreshServerData(serverId);
    };

    const fetchHistory = async () => {
        try {
            const data = await API.getScheduleHistory(serverId);
            setExecutionHistory(data);
        } catch (e) {
            // Ignore error
        }
    };

    const toggleTask = async (id: string) => {
        if (!can('server.schedules.manage', serverId)) {
            addToast('error', 'Permissions', 'Insufficient permissions to toggle schedules');
            return;
        }
        const task = localTasks.find(t => t.id === id);
        if (!task) return;
        
        // Optimistic Toggle
        setPendingTaskIds(prev => new Set(prev).add(id));
        setLocalTasks(prev => prev.map(t => t.id === id ? { ...t, isActive: !t.isActive } : t));
        
        try {
            await API.updateSchedule(serverId, { ...task, isActive: !task.isActive });
            // refreshServerData(serverId); // Context will sync eventually
        } catch (e) {
            setLocalTasks(prev => prev.map(t => t.id === id ? { ...t, isActive: task.isActive } : t));
            addToast('error', 'Update Failed', 'Could not update schedule status.');
        } finally {
            setPendingTaskIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const deleteTask = async (id: string) => {
        if (!can('server.schedules.manage', serverId)) {
            addToast('error', 'Permissions', 'Insufficient permissions to delete schedules');
            return;
        }
        
        const isConfirmed = await requestConfirm({
            title: 'Delete Schedule',
            description: 'Are you sure you want to delete this schedule? This action cannot be undone.',
            confirmText: 'Delete',
            cancelText: 'Cancel'
        });
        
        if (isConfirmed) {
            setPendingTaskIds(prev => new Set(prev).add(id));
            const originalTasks = [...localTasks];
            setLocalTasks(prev => prev.filter(t => t.id !== id));
            
            try {
                await API.deleteSchedule(serverId, id);
                addToast('success', 'Schedule Deleted', '');
            } catch (e) {
                setLocalTasks(originalTasks);
                setPendingTaskIds(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
                addToast('error', 'Delete Failed', 'Could not delete schedule.');
            }
        }
    };

    const CountdownTimer: React.FC<{ nextRun?: string }> = ({ nextRun }) => {
        const [timeLeft, setTimeLeft] = useState(() => formatNextRunLive(nextRun));

        useEffect(() => {
            if (!nextRun || isNaN(new Date(nextRun).getTime())) return;
            const timer = setInterval(() => {
                setTimeLeft(formatNextRunLive(nextRun));
            }, 1000);
            return () => clearInterval(timer);
        }, [nextRun]);

        return <span>{timeLeft}</span>;
    };

    const formatNextRunLive = (nextRun?: string) => {
        if (!nextRun) return 'Calculating...';
        try {
            const date = new Date(nextRun);
            if (isNaN(date.getTime())) return nextRun;
            const now = new Date();
            const diffMs = date.getTime() - now.getTime();
            if (diffMs < 0) return 'Any moment';
            
            const diffSecs = Math.floor(diffMs / 1000);
            if (diffSecs < 60) return `in ${diffSecs}s`;
            
            const diffMins = Math.floor(diffSecs / 60);
            const remainingSecs = diffSecs % 60;
            if (diffMins < 60) return `in ${diffMins}m ${remainingSecs}s`;
            
            const diffHours = Math.floor(diffMins / 60);
            const remainingMins = diffMins % 60;
            if (diffHours < 24) return `in ${diffHours}h ${remainingMins}m`;
            
            return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch {
            return nextRun;
        }
    };

    const describeCron = (cron: string): string => {
        const preset = cronPresets.find(p => p.value === cron);
        if (preset) return preset.label;
        const parts = cron.split(' ');
        if (parts.length !== 5) return cron;
        const [min, hour, day, month, weekday] = parts;
        if (min === '0' && hour === '0' && day === '*' && month === '*' && weekday === '*') return 'Daily at midnight';
        if (min === '0' && hour !== '*' && day === '*' && month === '*' && weekday === '*') return `Daily at ${hour}:00`;
        if (min.startsWith('*/')) return `Every ${min.slice(2)} minutes`;
        if (min === '0' && hour.startsWith('*/')) return `Every ${hour.slice(2)} hours`;
        return cron;
    };

    const handleRunNow = async (task: ScheduleTask) => {
        if (!can('server.schedules.manage', serverId)) {
            addToast('error', 'Permissions', 'Insufficient permissions');
            return;
        }
        setPendingTaskIds(prev => new Set(prev).add(task.id));
        try {
            await API.runScheduleNow(serverId, task.id);
            addToast('success', 'Triggered', `"${task.name}" executed manually.`);
            setTimeout(() => fetchHistory(), 1500);
        } catch (e: any) {
            addToast('error', 'Run Failed', e.message || 'Could not execute task.');
        } finally {
            setPendingTaskIds(prev => {
                const next = new Set(prev);
                next.delete(task.id);
                return next;
            });
        }
    };

    const handleEdit = (task: ScheduleTask) => {
        setEditingTask(task);
        setNewTask({
            name: task.name,
            cron: task.cron,
            actions: task.actions ? [...task.actions] : [{ type: 'command', command: task.command || '' }],
            scheduleType: task.runOnce ? 'once' : 'recurring',
            runAt: task.runAt ? task.runAt.slice(0, 16) : ''
        });
        setIsCreating(true);
    };

    const handleDuplicate = (task: ScheduleTask) => {
        setEditingTask(null);
        setNewTask({
            name: `${task.name} (Copy)`,
            cron: task.cron,
            actions: task.actions ? [...task.actions] : [{ type: 'command', command: task.command || '' }],
            scheduleType: task.runOnce ? 'once' : 'recurring',
            runAt: ''
        });
        setIsCreating(true);
        addToast('info', 'Duplicated', `Pre-filled from "${task.name}". Edit and save.`);
    };

    const cronPresets = [
        { label: 'Every 5 mins', value: '*/5 * * * *' },
        { label: 'Every 15 mins', value: '*/15 * * * *' },
        { label: 'Every hour', value: '0 * * * *' },
        { label: 'Every 6 hours', value: '0 */6 * * *' },
        { label: 'Daily at midnight', value: '0 0 * * *' },
        { label: 'Daily at 6 AM', value: '0 6 * * *' },
        { label: 'Every Friday midnight', value: '0 0 * * FRI' },
        { label: 'Every Sunday 3 AM', value: '0 3 * * SUN' },
    ];
    const handleSave = async () => {
        if (!newTask.name || newTask.actions.length === 0) return;
        
        // Simple Cron Validation for Recurring Tasks
        if (newTask.scheduleType === 'recurring') {
            const cronParts = newTask.cron.trim().split(/\s+/);
            if (cronParts.length !== 5) {
                addToast('error', 'Invalid Cron', 'Cron expression must have exactly 5 parts (min hour day month weekday).');
                return;
            }
            // Basic character check (digits, *, /, -, ,)
            const cronRegex = /^[0-9\*\/\-\,a-zA-Z\s]+$/;
            if (!cronRegex.test(newTask.cron)) {
                addToast('error', 'Invalid Cron', 'Cron expression contains illegal characters.');
                return;
            }
        }

        if (newTask.scheduleType === 'once' && !newTask.runAt) {
            addToast('error', 'Missing Date', 'Please select a date and time for the one-time task.');
            return;
        }
        if (!can('server.schedules.manage', serverId)) {
            addToast('error', 'Permissions', 'Insufficient permissions to manage schedules');
            return;
        }
        
        const task: ScheduleTask = {
            id: editingTask?.id || Date.now().toString(),
            serverId,
            name: newTask.name,
            cron: newTask.scheduleType === 'once' ? '* * * * *' : newTask.cron,
            command: newTask.actions[0]?.command || '', 
            actions: newTask.actions,
            lastRun: editingTask?.lastRun || 'Never',
            nextRun: editingTask?.nextRun || (newTask.scheduleType === 'once' ? newTask.runAt : 'Calculated...'),
            isActive: editingTask ? editingTask.isActive : true,
            runOnce: newTask.scheduleType === 'once',
            runAt: newTask.scheduleType === 'once' ? new Date(newTask.runAt).toISOString() : undefined
        };

        try {
            if (editingTask) {
                setLocalTasks(prev => prev.map(t => t.id === task.id ? task : t));
                await API.updateSchedule(serverId, task);
                addToast('success', 'Schedule Updated', `"${task.name}" has been modified.`);
            } else {
                setLocalTasks(prev => [...prev, task]);
                await API.createSchedule(serverId, task);
                addToast('success', 'Schedule Created', newTask.scheduleType === 'once' ? 'One-time task scheduled.' : 'Recurring automation added.');
            }
            
            setIsCreating(false);
            setEditingTask(null);
            setNewTask({ name: '', cron: '0 * * * *', actions: [{ type: 'command', command: '' }], scheduleType: 'recurring', runAt: '' });
            
            setTimeout(() => refreshServerData(serverId), 1000);
        } catch (e) {
            if (editingTask) {
                // Refresh to revert
                refreshServerData(serverId);
            } else {
                setLocalTasks(prev => prev.filter(t => t.id !== task.id));
            }
            addToast('error', 'Save Failed', 'Could not save schedule.');
        }
    };

    const getLastRunStatus = (taskName: string) => {
        const lastRun = executionHistory.find(h => h.task === taskName);
        if (!lastRun) return null;
        return lastRun.success ? 'success' : 'error';
    };

    if (!can('server.schedules.read', serverId)) {
        return (
            <AccessDenied 
                title="Automation Access Restricted"
                description="You do not have permission to view or manage automated schedules for this server. Please contact an administrator for access."
            />
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-120px)] animate-fade-in relative pt-2">
            
            {/* Tabs */}
            <div className="flex gap-2 mb-4 px-1">
                <button
                    onClick={() => setActiveTab('schedules')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                        activeTab === 'schedules' 
                            ? 'bg-primary text-primary-foreground shadow-md' 
                            : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                >
                    <List size={16} /> Configurations
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                        activeTab === 'history' 
                            ? 'bg-primary text-primary-foreground shadow-md' 
                            : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                >
                    <History size={16} /> Execution History
                </button>
            </div>

            {activeTab === 'schedules' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 overflow-y-auto pb-10 custom-scrollbar pr-2">
            {/* Left Column: Info & Creator */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-primary/10 text-primary rounded-lg"><CalendarClock size={20} /></div>
                        <div>
                            <h2 className="text-lg font-bold">{editingTask ? 'Edit Task' : 'Automation'}</h2>
                            <p className="text-xs text-muted-foreground">{editingTask ? `Modifying ${editingTask.name}` : 'Schedule commands using Cron syntax.'}</p>
                        </div>
                    </div>

                    {isCreating ? (
                        <div className="space-y-4 animate-fade-in">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Task Name</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm mt-1 focus:ring-1 focus:ring-primary focus:outline-none"
                                    placeholder="e.g. Nightly Backup"
                                    value={newTask.name}
                                    onChange={e => setNewTask({...newTask, name: e.target.value})}
                                />
                            </div>
                            {/* Schedule Type Toggle */}
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-2 block">Schedule Type</label>
                                <div className="flex rounded-lg overflow-hidden border border-border">
                                    <button
                                        onClick={() => setNewTask({...newTask, scheduleType: 'recurring'})}
                                        className={`flex-1 py-2 text-xs font-medium transition-colors ${newTask.scheduleType === 'recurring' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Recurring (Cron)
                                    </button>
                                    <button
                                        onClick={() => setNewTask({...newTask, scheduleType: 'once'})}
                                        className={`flex-1 py-2 text-xs font-medium transition-colors ${newTask.scheduleType === 'once' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
                                    >
                                        One-Time
                                    </button>
                                </div>
                            </div>
                            {newTask.scheduleType === 'recurring' ? (
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground">Cron Expression</label>
                                    <select
                                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm mt-1 focus:ring-1 focus:ring-primary focus:outline-none mb-2"
                                        value={cronPresets.find(p => p.value === newTask.cron) ? newTask.cron : 'custom'}
                                        onChange={e => { if (e.target.value !== 'custom') setNewTask({...newTask, cron: e.target.value}); }}
                                    >
                                        {cronPresets.map(p => (
                                            <option key={p.value} value={p.value}>{p.label}</option>
                                        ))}
                                        <option value="custom">Custom...</option>
                                    </select>
                                    <input 
                                        type="text" 
                                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary focus:outline-none"
                                        placeholder="* * * * *"
                                        value={newTask.cron}
                                        onChange={e => setNewTask({...newTask, cron: e.target.value})}
                                    />
                                    <a href="https://crontab.guru/" target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline mt-1 block">Help with Cron?</a>
                                </div>
                            ) : (
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground">Run At</label>
                                    <input 
                                        type="datetime-local" 
                                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm mt-1 focus:ring-1 focus:ring-primary focus:outline-none"
                                        value={newTask.runAt}
                                        onChange={e => setNewTask({...newTask, runAt: e.target.value})}
                                        min={new Date().toISOString().slice(0, 16)}
                                    />
                                    <p className="text-[10px] text-muted-foreground mt-1">Task runs once at this time, then auto-disables.</p>
                                </div>
                            )}
                            <div className="space-y-3">
                                <label className="text-xs font-medium text-muted-foreground">Actions Chain</label>
                                {newTask.actions.map((action, idx) => (
                                    <div key={idx} className="bg-secondary/50 border border-border rounded-lg p-3 space-y-2 relative group/action">
                                        <select
                                            className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                                            value={action.type}
                                            onChange={e => {
                                                const a = [...newTask.actions];
                                                a[idx].type = e.target.value;
                                                setNewTask({...newTask, actions: a});
                                            }}
                                        >
                                            <option value="command">Console Command</option>
                                            <option value="backup">Trigger Backup</option>
                                            <option value="restart">Graceful Restart</option>
                                            <option value="start">Start Server</option>
                                            <option value="stop">Stop Server</option>
                                        </select>
                                        
                                        {action.type === 'command' && (
                                            <input 
                                                type="text" 
                                                className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs font-mono focus:ring-1 focus:ring-primary focus:outline-none"
                                                placeholder="say Hello World"
                                                value={action.command}
                                                onChange={e => {
                                                    const a = [...newTask.actions];
                                                    a[idx].command = e.target.value;
                                                    setNewTask({...newTask, actions: a});
                                                }}
                                            />
                                        )}
                                        
                                        {newTask.actions.length > 1 && (
                                            <button 
                                                onClick={() => {
                                                    const a = [...newTask.actions];
                                                    a.splice(idx, 1);
                                                    setNewTask({...newTask, actions: a});
                                                }}
                                                className="absolute -right-2 -top-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover/action:opacity-100 transition-opacity"
                                            >
                                                <X size={10} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button 
                                    onClick={() => setNewTask({...newTask, actions: [...newTask.actions, { type: 'command', command: '' }]})}
                                    className="w-full py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-all flex items-center justify-center gap-2"
                                >
                                    <Plus size={14} /> Add Another Action
                                </button>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button 
                                    onClick={handleSave} 
                                    disabled={!can('server.schedules.manage', serverId)}
                                    className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {editingTask ? 'Update Task' : 'Save Task'}
                                </button>
                                <button onClick={() => { setIsCreating(false); setEditingTask(null); setNewTask({ name: '', cron: '0 * * * *', actions: [{ type: 'command', command: '' }], scheduleType: 'recurring', runAt: '' }); }} className="flex-1 bg-secondary text-foreground py-2 rounded-lg text-xs font-medium hover:bg-secondary/80">Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <button 
                            onClick={() => { setEditingTask(null); setIsCreating(true); }}
                            disabled={!can('server.schedules.manage', serverId)}
                            title={!can('server.schedules.manage', serverId) ? 'Insufficient Permissions' : ''}
                            className={`w-full py-3 border border-dashed border-border rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium ${
                                can('server.schedules.manage', serverId)
                                ? 'text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-secondary/20'
                                : 'opacity-40 cursor-not-allowed text-zinc-600'
                            }`}
                        >
                            <Plus size={16} /> New Schedule
                        </button>
                    )}
                </div>

                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5">
                    <h3 className="font-medium text-blue-500 text-sm mb-2">Cron Cheatsheet</h3>
                    <p className="text-[10px] text-blue-500/50 mb-2">Format: min hour day month weekday</p>
                    <ul className="text-xs text-blue-500/70 space-y-1.5 font-mono">
                        <li className="flex justify-between"><span>*/5 * * * *</span> <span>Every 5 mins</span></li>
                        <li className="flex justify-between"><span>0 * * * *</span> <span>Every hour</span></li>
                        <li className="flex justify-between"><span>0 0 * * *</span> <span>Daily at midnight</span></li>
                        <li className="flex justify-between"><span>0 6 * * MON-FRI</span> <span>Weekdays 6 AM</span></li>
                        <li className="flex justify-between"><span>0 0 * * FRI</span> <span>Every Friday</span></li>
                        <li className="flex justify-between"><span>0 0 1 * *</span> <span>1st of month</span></li>
                        <li className="flex justify-between"><span>0 3 * * SUN</span> <span>Sundays 3 AM</span></li>
                    </ul>
                </div>
            </div>

            {/* Right Column: Task List */}
            <div className="lg:col-span-2 space-y-4">
                {localTasks.length === 0 && !isCreating && (
                     <div className="text-center py-20 bg-card border border-border rounded-xl">
                        <CalendarClock size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="text-muted-foreground">No automated tasks configured.</p>
                    </div>
                )}

                {localTasks.map((task) => (
                    <div 
                        key={task.id} 
                        className={`bg-card border ${task.isActive ? 'border-border' : 'border-border/50 opacity-70'} rounded-xl p-5 shadow-sm transition-all hover:border-primary/30 group ${
                            pendingTaskIds.has(task.id) ? 'pointer-events-none' : ''
                        }`}
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-lg ${task.isActive ? 'bg-secondary text-primary' : 'bg-secondary/50 text-muted-foreground'}`}>
                                    <Clock size={20} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                                        {task.name}
                                        {!task.isActive && <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">DISABLED</span>}
                                        {task.runOnce && <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded">ONE-TIME</span>}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        {!task.runOnce && <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono text-emerald-500">{task.cron}</code>}
                                        {!task.runOnce && <span className="text-[10px] text-muted-foreground/60 italic">{describeCron(task.cron)}</span>}
                                        <span className="text-xs text-muted-foreground">Next: <CountdownTimer nextRun={task.nextRun} /></span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => toggleTask(task.id)}
                                    disabled={pendingTaskIds.has(task.id) || !can('server.schedules.manage', serverId)}
                                    className={`p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${task.isActive ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
                                    title={!can('server.schedules.manage', serverId) ? 'Insufficient Permissions' : (task.isActive ? "Pause Schedule" : "Resume Schedule")}
                                    aria-label={task.isActive ? "Pause Schedule" : "Resume Schedule"}
                                >
                                    {pendingTaskIds.has(task.id) ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        task.isActive ? <Pause size={16} /> : <Play size={16} />
                                    )}
                                </button>
                                <button 
                                    onClick={() => handleRunNow(task)}
                                    disabled={pendingTaskIds.has(task.id) || !can('server.schedules.manage', serverId)}
                                    className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="Run Now"
                                    aria-label="Run Now"
                                >
                                    <Zap size={16} />
                                </button>
                                <button 
                                    onClick={() => handleDuplicate(task)}
                                    disabled={!can('server.schedules.manage', serverId)}
                                    className="p-2 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="Duplicate Schedule"
                                    aria-label="Duplicate Schedule"
                                >
                                    <Copy size={16} />
                                </button>
                                <button 
                                    onClick={() => handleEdit(task)}
                                    disabled={!can('server.schedules.manage', serverId)}
                                    className="p-2 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="Edit Schedule"
                                    aria-label="Edit Schedule"
                                >
                                    <Settings2 size={16} />
                                </button>
                                <button 
                                    onClick={() => deleteTask(task.id)}
                                    disabled={pendingTaskIds.has(task.id) || !can('server.schedules.manage', serverId)}
                                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={!can('server.schedules.manage', serverId) ? 'Insufficient Permissions' : 'Delete Schedule'}
                                    aria-label="Delete Schedule"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            {(task.actions && task.actions.length > 0 ? task.actions : [{ type: 'command', command: task.command }]).map((action: any, idx) => (
                                <div key={idx} className="bg-secondary/30 rounded-lg p-3 flex items-center gap-3 border border-border/50">
                                    <div className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                                        {idx + 1}
                                    </div>
                                    <Command size={14} className="text-muted-foreground shrink-0" />
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase w-16">{action.type}</span>
                                    <code className="text-sm font-mono text-foreground flex-1 truncate">{action.command || '(No details)'}</code>
                                </div>
                            ))}
                        </div>
                        
                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <span>Last run: {task.lastRun}</span>
                                {getLastRunStatus(task.name) === 'success' && <Check size={12} className="text-emerald-500" />}
                                {getLastRunStatus(task.name) === 'error' && <X size={12} className="text-rose-500" />}
                            </div>
                            <span className="font-mono text-[10px] opacity-50">ID: {task.id}</span>
                        </div>
                    </div>
                ))}
            </div>
            </div>
            )}

            {/* History Panel */}
            {activeTab === 'history' && (
            <div className="bg-card border border-border rounded-xl p-6 overflow-y-auto custom-scrollbar h-full">
                <h3 className="font-bold mb-4 flex items-center gap-2"><History size={16} /> Execution Audit Log</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                            <tr>
                                <th className="px-4 py-3">Time</th>
                                <th className="px-4 py-3">Task</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Message</th>
                            </tr>
                        </thead>
                        <tbody>
                            {executionHistory.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-4 text-muted-foreground">No execution history found.</td></tr>
                            ) : executionHistory.map((h, i) => (
                                <tr key={i} className="border-b border-border/50 hover:bg-secondary/20">
                                    <td className="px-4 py-3 font-mono text-xs">{new Date(h.timestamp).toLocaleString()}</td>
                                    <td className="px-4 py-3 font-medium">{h.task}</td>
                                    <td className="px-4 py-3">
                                        {h.success ? (
                                            <span className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded text-[10px] font-bold">SUCCESS</span>
                                        ) : (
                                            <span className="bg-rose-500/10 text-rose-500 px-2 py-0.5 rounded text-[10px] font-bold">FAILED</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground truncate max-w-xs">{h.message}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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

export default ScheduleManager;
