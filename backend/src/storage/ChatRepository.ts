import { StorageProvider } from './StorageProvider';
import { StorageFactory } from './StorageFactory';
import { ChatMessage } from '@shared/types';

class ChatRepository implements StorageProvider<ChatMessage> {
    private provider: StorageProvider<ChatMessage>;
    private readonly MAX_HISTORY = 100;

    constructor() {
        this.provider = StorageFactory.get<ChatMessage>('chat_history', 'chat_history');
        this.init();
    }

    init() { return this.provider.init(); }

    public async rebind() {
        this.provider = StorageFactory.get<ChatMessage>('chat_history', 'chat_history');
        await this.init();
    }

    findAll() { return this.provider.findAll(); }
    findById(id: string) { return this.provider.findById(id); }
    findOne(criteria: Partial<ChatMessage>) { return this.provider.findOne(criteria); }
    create(item: ChatMessage) { 
        const result = this.provider.create(item);
        this.prune(item.serverId);
        return result;
    }
    update(id: string, updates: Partial<ChatMessage>) { return this.provider.update(id, updates); }
    saveAll(items: ChatMessage[]) { return this.provider.saveAll(items); }
    delete(id: string) { return this.provider.delete(id); }

    /**
     * Get chat history for a specific server (or 'global')
     */
    public getHistory(serverId: string, limit: number = 50): ChatMessage[] {
        return this.findAll()
            .filter(m => m.serverId === serverId)
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-limit);
    }

    /**
     * Prune history to keep storage lean
     */
    private prune(serverId: string): void {
        const all = this.findAll();
        const serverMessages = all
            .filter(m => m.serverId === serverId)
            .sort((a, b) => b.timestamp - a.timestamp); // Newest first

        if (serverMessages.length > this.MAX_HISTORY) {
            const toKeep = serverMessages.slice(0, this.MAX_HISTORY);
            const toKeepIds = new Set(toKeep.map(m => m.id));
            
            // Re-filter the global list to only keep the 'toKeep' for this server + everything else
            const updated = all.filter(m => m.serverId !== serverId || toKeepIds.has(m.id));
            this.saveAll(updated);
        }
    }
}

export const chatRepository = new ChatRepository();
