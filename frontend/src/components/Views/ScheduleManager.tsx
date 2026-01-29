
import React, { useState, useEffect } from 'react';
import { ScheduleTask } from '@shared/types';
import { CalendarClock, Plus, Play, Pause, Trash2, Clock, Command, Check, X } from 'lucide-react';
import { API } from '../../services/api';
import { useToast } from '../UI/Toast';
import { useServers } from '../../context/ServerContext';

interface ScheduleManagerProps {
    serverId: string;
}

const ScheduleManager: React.FC<ScheduleManagerProps> = ({ serverId }) => {
    const { addToast } = useToast();
    const [history, setHistory] = useState<any[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [newTask, setNewTask] = useState({ name: '', cron: '0 * * * *', command: '' });
    const { schedules: globalSchedules, refreshServerData, loading } = useServers();
    const tasks = globalSchedules[serverId] || [];

    useEffect(() => {
        if (!globalSchedules[serverId]) {
            refreshServerData(serverId);
        }
        fetchHistory();
    }, [serverId, globalSchedules[serverId], refreshServerData]);

    const fetchSchedules = async () => {
        await refreshServerData(serverId);
    };

    const fetchHistory = async () => {
        try {
            const data = await API.getScheduleHistory(serverId);
            setHistory(data);
        } catch (e) {
            // Ignore error
        }
    };

    const toggleTask = async (id: string) => {
        const task = tasks.find(t => t.id === id);
        if (!task) return;
        
        const updated = { ...task, isActive: !task.isActive };
        
        try {
            await API.updateSchedule(serverId, updated);
            await refreshServerData(serverId);
        } catch (e) {
            addToast('error', 'Update Failed', 'Could not update schedule status.');
        }
    };

    const deleteTask = async (id: string) => {
        if (confirm('Delete this schedule?')) {
            try {
                await API.deleteSchedule(serverId, id);
                await refreshServerData(serverId);
                addToast('success', 'Schedule Deleted', '');
            } catch (e) {
                addToast('error', 'Delete Failed', 'Could not delete schedule.');
            }
        }
    };

    const handleCreate = async () => {
        if (!newTask.name || !newTask.command) return;
        
        const task: ScheduleTask = {
            id: Date.now().toString(),
            name: newTask.name,
            cron: newTask.cron,
            command: newTask.command,
            lastRun: 'Never',
            nextRun: 'Calculated...',
            isActive: true
        };

        try {
            await API.createSchedule(serverId, task);
            await refreshServerData(serverId);
            setIsCreating(false);
            setNewTask({ name: '', cron: '0 * * * *', command: '' });
            addToast('success', 'Schedule Created', 'Automation task added successfully.');
        } catch (e) {
            addToast('error', 'Creation Failed', 'Could not create schedule.');
        }
    };

    const getLastRunStatus = (taskName: string) => {
        const lastRun = history.find(h => h.task === taskName);
        if (!lastRun) return null;
        return lastRun.success ? 'success' : 'error';
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-120px)] animate-fade-in overflow-y-auto pb-10">
            {/* Left Column: Info & Creator */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-primary/10 text-primary rounded-lg"><CalendarClock size={20} /></div>
                        <div>
                            <h2 className="text-lg font-bold">Automation</h2>
                            <p className="text-xs text-muted-foreground">Schedule commands using Cron syntax.</p>
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
                             <div>
                                <label className="text-xs font-medium text-muted-foreground">Cron Expression</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm mt-1 font-mono focus:ring-1 focus:ring-primary focus:outline-none"
                                    placeholder="* * * * *"
                                    value={newTask.cron}
                                    onChange={e => setNewTask({...newTask, cron: e.target.value})}
                                />
                                <a href="https://crontab.guru/" target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline mt-1 block">Help with Cron?</a>
                            </div>
                             <div>
                                <label className="text-xs font-medium text-muted-foreground">Command</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm mt-1 font-mono focus:ring-1 focus:ring-primary focus:outline-none"
                                    placeholder="say Hello World"
                                    value={newTask.command}
                                    onChange={e => setNewTask({...newTask, command: e.target.value})}
                                />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={handleCreate} className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg text-xs font-medium hover:bg-primary/90">Save Task</button>
                                <button onClick={() => setIsCreating(false)} className="flex-1 bg-secondary text-foreground py-2 rounded-lg text-xs font-medium hover:bg-secondary/80">Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <button 
                            onClick={() => setIsCreating(true)}
                            className="w-full py-3 border border-dashed border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-secondary/20 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                        >
                            <Plus size={16} /> New Schedule
                        </button>
                    )}
                </div>

                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5">
                    <h3 className="font-medium text-blue-500 text-sm mb-2">Cron Cheatsheet</h3>
                    <ul className="text-xs text-blue-500/70 space-y-1.5 font-mono">
                        <li className="flex justify-between"><span>*/5 * * * *</span> <span>Every 5 mins</span></li>
                        <li className="flex justify-between"><span>0 * * * *</span> <span>Every hour</span></li>
                        <li className="flex justify-between"><span>0 0 * * *</span> <span>Daily at midnight</span></li>
                        <li className="flex justify-between"><span>0 0 * * FRI</span> <span>Every Friday</span></li>
                    </ul>
                </div>
            </div>

            {/* Right Column: Task List */}
            <div className="lg:col-span-2 space-y-4">
                {tasks.length === 0 && !isCreating && (
                     <div className="text-center py-20 bg-card border border-border rounded-xl">
                        <CalendarClock size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="text-muted-foreground">No automated tasks configured.</p>
                    </div>
                )}

                {tasks.map((task) => (
                    <div key={task.id} className={`bg-card border ${task.isActive ? 'border-border' : 'border-border/50 opacity-70'} rounded-xl p-5 shadow-sm transition-all hover:border-primary/30 group`}>
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-lg ${task.isActive ? 'bg-secondary text-primary' : 'bg-secondary/50 text-muted-foreground'}`}>
                                    <Clock size={20} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                                        {task.name}
                                        {!task.isActive && <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">DISABLED</span>}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono text-emerald-500">{task.cron}</code>
                                        <span className="text-xs text-muted-foreground">Next run: {task.nextRun}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => toggleTask(task.id)}
                                    className={`p-2 rounded-lg transition-colors ${task.isActive ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
                                    title={task.isActive ? "Pause Schedule" : "Resume Schedule"}
                                >
                                    {task.isActive ? <Pause size={16} /> : <Play size={16} />}
                                </button>
                                <button 
                                    onClick={() => deleteTask(task.id)}
                                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                        
                        <div className="bg-secondary/30 rounded-lg p-3 flex items-center gap-3 border border-border/50">
                            <Command size={14} className="text-muted-foreground shrink-0" />
                            <code className="text-sm font-mono text-foreground flex-1 truncate">{task.command}</code>
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

            {/* History Panel */}
            <div className="lg:col-span-3 bg-card border border-border rounded-xl p-6">
                <h3 className="font-bold mb-4 flex items-center gap-2"><Clock size={16} /> Execution Audit Log</h3>
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
                            {history.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-4 text-muted-foreground">No execution history found.</td></tr>
                            ) : history.map((h, i) => (
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
        </div>
    );
};

export default ScheduleManager;
