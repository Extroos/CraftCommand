
import React from 'react';
import { Users, UserPlus, Trash2, Shield, Loader2, Mail, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { STAGGER_ITEM } from '../../styles/motion';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/hooks/useConfirm';
import { API } from '@core/services/api';
import InviteMemberModal from './components/InviteMemberModal';
import { usePermissions } from '../auth/hooks/usePermissions';

interface SubuserManagerProps {
    serverId: string;
}

export const SubuserManager: React.FC<SubuserManagerProps> = ({ serverId }) => {
    const { addToast } = useToast();
    const { confirm } = useConfirm();
    const { can } = usePermissions();
    const [members, setMembers] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [showInviteModal, setShowInviteModal] = React.useState(false);

    const canManageMembers = can('server.members.manage', serverId);

    const fetchMembers = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await API.getServerMembers(serverId);
            setMembers(data);
        } catch (e) {
            console.error("Failed to fetch members", e);
        } finally {
            setIsLoading(false);
        }
    }, [serverId]);

    React.useEffect(() => {
        fetchMembers();
    }, [fetchMembers]);

    const handleInvite = async (email: string, role: string) => {
        try {
            const result = await API.addServerMember(serverId, email, role);
            addToast('success', 'Invitation Dispatched', `Security credentials dispatched to ${email}.`);
            fetchMembers();
            return result;
        } catch (e: any) {
            addToast('error', 'Invitation Failed', e.message || 'Failed to send invitation.');
            throw e;
        }
    };

    const handleRemove = async (memberId: string, name: string) => {
        const isConfirmed = await confirm({
            title: 'Revoke Access',
            description: `Are you sure you want to permanently revoke all server permissions for ${name}?`,
            isDestructive: true
        });

        if (isConfirmed) {
            try {
                await API.removeServerMember(serverId, memberId);
                addToast('success', 'Access Revoked', `${name} has been removed from the server.`);
                fetchMembers();
            } catch (e) {
                addToast('error', 'Revocation Failed', 'Failed to remove member.');
            }
        }
    };

    return (
        <motion.div variants={STAGGER_ITEM} className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                        <Users className="text-primary" size={20} />
                        Access & Subusers
                    </h2>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-1">Hierarchical Member Management</p>
                </div>
                {canManageMembers && (
                    <button 
                        onClick={() => setShowInviteModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]"
                    >
                        <UserPlus size={14} /> Invite Member
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {isLoading ? (
                    <div className="col-span-full py-20 bg-card border border-border/40 rounded-xl flex flex-col items-center justify-center gap-3">
                        <Loader2 size={24} className="animate-spin text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Synchronizing Permissions...</span>
                    </div>
                ) : members.length === 0 ? (
                    <div className="col-span-full py-20 bg-card border border-border/40 border-dashed rounded-xl flex flex-col items-center justify-center gap-4">
                        <Users size={40} className="text-muted-foreground/10" />
                        <div className="text-center">
                            <p className="text-[11px] font-bold text-muted-foreground/40 uppercase tracking-widest">No Subusers Configured</p>
                            <p className="text-[9px] text-muted-foreground/20 mt-1 uppercase">Invite members to grant them server access</p>
                        </div>
                    </div>
                ) : (
                    members.map((member) => (
                        <div key={member.id} className="bg-card border border-border/60 p-4 rounded-xl flex items-center justify-between group hover:border-primary/30 transition-all duration-300">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-lg bg-secondary border border-border flex items-center justify-center text-primary font-black text-xs uppercase shadow-inner">
                                    {member.username?.charAt(0) || member.email?.charAt(0) || '?'}
                                </div>
                                <div className="flex flex-col">
                                    <h3 className="text-[11px] font-bold text-foreground/80 tracking-tight flex items-center gap-2 lowercase">
                                        {member.username || member.email}
                                        {member.role === 'OWNER' && <Shield size={10} className="text-primary fill-primary/20" />}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-primary/10 text-primary rounded leading-none">
                                            {member.role}
                                        </span>
                                        <div className="flex items-center gap-1 text-[8px] text-muted-foreground/40 font-medium lowercase">
                                            <Clock size={8} />
                                            {new Date(member.joinedAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {canManageMembers && member.role !== 'OWNER' && (
                                    <button 
                                        onClick={() => handleRemove(member.id, member.username || member.email)}
                                        className="p-2 text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                        title="Revoke Access"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl flex items-start gap-4">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <Mail size={16} />
                </div>
                <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary/80">Pending Invitations</h4>
                    <p className="text-xs text-muted-foreground/70 mt-1">Users will appear in this list once they accept their security clearance via email.</p>
                </div>
            </div>

            {showInviteModal && (
                <InviteMemberModal 
                    serverId={serverId}
                    onClose={() => setShowInviteModal(false)}
                    onInvite={handleInvite}
                />
            )}
        </motion.div>
    );
};
