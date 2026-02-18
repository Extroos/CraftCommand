import fs from 'fs-extra';
import path from 'path';
import { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    REST, 
    Routes, 
    SlashCommandBuilder,
    Interaction,
    ChatInputCommandInteraction
} from 'discord.js';
import { systemSettingsService } from '../system/SystemSettingsService';
import { getServer, getServers, startServer, stopServer } from '../servers/ServerService';
import { processManager } from '../processes/ProcessManager';
import { backupService } from '../backups/BackupService';
import { logger } from '../../utils/logger';

export class DiscordService {
    private client: Client | null = null;
    private initialized = false;
    private connecting = false;
    private lastError: string | null = null;
    private listenersAttached = false;
    private activeListeners: { emitter: any, event: string, handler: Function }[] = [];
    private playerEventDebounce: Map<string, NodeJS.Timeout> = new Map();

    getStatus() {
        return {
            status: this.initialized ? 'online' : (this.connecting ? 'connecting' : 'offline'),
            lastError: this.lastError,
            latency: this.client?.ws.ping || 0,
            guilds: this.client?.guilds.cache.size || 0,
            user: this.client?.user ? {
                username: this.client.user.username,
                tag: this.client.user.tag,
                avatar: this.client.user.displayAvatarURL(),
                id: this.client.user.id
            } : null
        };
    }

    async reconnect() {
        if (this.connecting) {
            logger.warn('Discord reconnection already in progress. Skipping.');
            return;
        }

        logger.info('Manual Discord reconnection requested.');
        
        try {
            if (this.client) {
                logger.info('Destroying existing Discord client...');
                await this.client.destroy();
            }
        } catch (e: any) {
            logger.error(`Error destroying Discord client: ${e.message}`);
        } finally {
            this.cleanupListeners();
            this.client = null;
            this.initialized = false;
            this.connecting = false;
            
            // Wait a bit before re-initializing
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.initialize();
        }
    }

    private cleanupListeners() {
        logger.debug(`[Discord] Cleaning up ${this.activeListeners.length} event listeners.`);
        for (const { emitter, event, handler } of this.activeListeners) {
            emitter.removeListener(event, handler);
        }
        this.activeListeners = [];
        this.listenersAttached = false;
    }

    async initialize() {
        if (this.initialized) return;
        const config = systemSettingsService.getSettings().discordBot;

        if (!config.enabled || !config.token) {
            logger.info('Discord Bot is disabled or missing token. Skipping initialization.');
            return;
        }

        try {
            this.connecting = true;
            this.lastError = null;
            logger.info('Connecting to Discord Gateway...');
            
            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent
                ]
            });

            this.client.on('ready', () => {
                logger.success(`Discord Bot logged in as ${this.client?.user?.tag}`);
                this.initialized = true;
                this.connecting = false;
                this.setupEventForwarding();
            });

            this.client.on('error', (error) => {
                logger.error(`Discord Client Error: ${error.message}`);
                this.initialized = false;
                this.connecting = false;
            });

            this.client.on('interactionCreate', async (interaction: Interaction) => {
                if (!interaction.isChatInputCommand()) return;
                await this.handleInteraction(interaction);
            });

            // Login with 10s timeout
            await Promise.race([
                this.client.login(config.token),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Discord login timed out (10s)')), 10000))
            ]);

        } catch (error: any) {
            let errorMsg = error.message;
            if (errorMsg.includes('disallowed intents')) {
                errorMsg = 'Disallowed Intents: Enable "Message Content Intent" in Discord Developer Portal > Bot tab.';
            }
            
            logger.error(`Failed to initialize Discord Bot: ${errorMsg}`);
            this.client = null;
            this.initialized = false;
            this.connecting = false;
            this.lastError = errorMsg;
            
            // Critical Retry Logic: Try again in 30 seconds if it's a transient error
            if (!error.message.includes('token')) {
                logger.info('Scheduling Discord reconnection attempt in 30s...');
                setTimeout(() => this.initialize(), 30000);
            }
        }
    }

    async deployCommands() {
        const config = systemSettingsService.getSettings().discordBot;
        if (!config.token || !config.clientId) {
            throw new Error('Missing configuration (Token or Client ID)');
        }

        const commands = [
            new SlashCommandBuilder()
                .setName('list')
                .setDescription('List all Minecraft servers'),
            new SlashCommandBuilder()
                .setName('status')
                .setDescription('Get detailed status of a server')
                .addStringOption(option => 
                    option.setName('id')
                        .setDescription('The ID of the server')
                        .setRequired(false)),
            new SlashCommandBuilder()
                .setName('start')
                .setDescription('Start a Minecraft server')
                .addStringOption(option => 
                    option.setName('id')
                        .setDescription('The ID of the server to start')
                        .setRequired(true)),
            new SlashCommandBuilder()
                .setName('stop')
                .setDescription('Stop a Minecraft server')
                .addStringOption(option => 
                    option.setName('id')
                        .setDescription('The ID of the server to stop')
                        .setRequired(true)),
            new SlashCommandBuilder()
                .setName('backup')
                .setDescription('Create a system snapshot (Backup)')
                .addStringOption(option => 
                    option.setName('id')
                        .setDescription('The ID of the server to backup')
                        .setRequired(true))
        ].map(command => command.toJSON());

        const rest = new REST({ version: '10' }).setToken(config.token);

        if (config.guildId) {
            logger.info(`Refreshing application (/) commands for guild: ${config.guildId}`);
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands },
            );
        } else {
            logger.info('Refreshing global application (/) commands.');
            await rest.put(
                Routes.applicationCommands(config.clientId),
                { body: commands },
            );
        }
        
        logger.success('Successfully reloaded application (/) commands.');
    }

    private setupEventForwarding() {
        if (this.listenersAttached) return;
        this.listenersAttached = true;

        const addManagedListener = (emitter: any, event: string, handler: (...args: any[]) => void) => {
            emitter.on(event, handler);
            this.activeListeners.push({ emitter, event, handler });
        };

        // --- SERVER STATUS TRIGGERS ---
        addManagedListener(processManager, 'status', async ({ id, status }) => {
            const server = getServer(id);
            if (!server) return;
            
            if (status === 'RECOVERING') {
                this.sendNotification(
                    '🛡️ Recovery Protocol Active',
                    `The system has detected an issue with **${server.name}**. \n**Action**: Attempting automated stabilization...`,
                    0xf59e0b
                );
                return;
            }

            this.sendNotification(
                'Server Status Change',
                `The server **${server.name}** is now **${status}**.`,
                status === 'ONLINE' ? 0x10b981 : (status === 'OFFLINE' ? 0xf43f5e : 0xf59e0b)
            );
        });

        // --- PLAYER EVENT DEBOUNCED TRIGGERS ---
        const handlePlayerEvent = (serverId: string, name: string, type: 'join' | 'leave') => {
            const server = getServer(serverId);
            const key = `${serverId}:${type}`;
            
            if (this.playerEventDebounce.has(key)) return;
            
            this.sendNotification(
                type === 'join' ? '👤 Player Joined' : '👤 Player Left',
                `**${name}** has ${type === 'join' ? 'joined' : 'left'} **${server?.name || serverId}**.`,
                type === 'join' ? 0x3b82f6 : 0xf97316
            );

            // Debounce for 5 seconds to prevent spam during mass joins/leaves
            const timeout = setTimeout(() => this.playerEventDebounce.delete(key), 5000);
            this.playerEventDebounce.set(key, timeout);
        };

        addManagedListener(processManager, 'player:join', ({ serverId, name }) => handlePlayerEvent(serverId, name, 'join'));
        addManagedListener(processManager, 'player:leave', ({ serverId, name }) => handlePlayerEvent(serverId, name, 'leave'));

        // --- BACKUP TRIGGERS ---
        addManagedListener(backupService, 'status', (msg: string) => {
            if (msg === 'Backup created successfully') {
                this.sendNotification(
                    '💾 Backup Successful',
                    'A new system snapshot has been successfully archived to the primary storage vault.',
                    0x10b981
                );
            }
        });
    }

    public async sendNotification(title: string, description: string, color: number) {
        const config = systemSettingsService.getSettings().discordBot;
        
        if (!config.enabled || !config.token) return;
        
        if (!this.client || !this.initialized) {
            logger.debug(`[Discord] Bot not ready, skipping notification: ${title}`);
            return;
        }

        if (!config.notificationChannel) {
            logger.debug(`[Discord] No notification channel configured, skipping notification: ${title}`);
            return;
        }

        try {
            // Attempt to fetch channel with a timeout
            const channel = await Promise.race([
                this.client.channels.fetch(config.notificationChannel),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Channel fetch timeout')), 5000))
            ]) as any;

            if (!channel) {
                logger.warn(`[Discord] Channel ${config.notificationChannel} not found or inaccessible.`);
                return;
            }

            if (channel.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor(color)
                    .setTimestamp()
                    .setFooter({ text: 'CraftCommand Integration' });

                await channel.send({ embeds: [embed] });
                logger.debug(`[Discord] Notification sent: ${title}`);
            } else {
                logger.warn(`[Discord] Channel ${config.notificationChannel} is not text-based.`);
            }
        } catch (e: any) {
            logger.error(`[Discord] Failed to send notification: ${e.message}`);
            
            // If it's a 403 or 404, maybe our channel cache is stale or permissions are missing
            if (e.message.includes('Missing Permissions') || e.message.includes('Unknown Channel')) {
                this.lastError = `Notification Error: ${e.message}`;
            }
        }
    }

    private async handleInteraction(interaction: ChatInputCommandInteraction) {
        const { commandName } = interaction;
        const config = systemSettingsService.getSettings().discordBot;

        // Simple Role Security
        const commandRoles = config.commandRoles || [];
        if (commandRoles.length > 0) {
            const member = interaction.member as any;
            const hasRole = member?.roles?.cache.some((role: any) => commandRoles.includes(role.id));
            if (!hasRole && !member?.permissions?.has('Administrator')) {
                return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
            }
        }

        try {
            if (commandName === 'list') {
                const servers = getServers();
                const embed = new EmbedBuilder()
                    .setTitle('🗄️ Minecraft Server List')
                    .setDescription('Current infrastructure configuration and status.')
                    .setColor(0x5865F2)
                    .setTimestamp();

                servers.forEach((s: any) => {
                    const isRunning = processManager.isRunning(s.id);
                    const stats = isRunning ? processManager.getCachedStatus(s.id) : null;
                    const statusIcon = isRunning ? (stats?.status === 'STARTING' ? '🟡' : '🟢') : '🔴';
                    const statusText = isRunning ? (stats?.status || 'Online') : 'Offline';
                    
                    embed.addFields({ 
                        name: `${statusIcon} ${s.name}`, 
                        value: `ID: \`${s.id}\` | **${statusText}**`, 
                        inline: true 
                    });
                });

                await interaction.reply({ embeds: [embed] });
            } 
            
            else if (commandName === 'start') {
                const id = interaction.options.getString('id');
                const server = getServer(id!);
                if (!server) return interaction.reply({ content: '❌ **Error**: Protocol ID not recognized in current context.', ephemeral: true });

                if (processManager.isRunning(id!)) {
                    return interaction.reply({ content: `⚠️ **Warning**: Server **${server.name}** is already in an active state.`, ephemeral: true });
                }

                await interaction.reply({ content: `🚀 **Protocol Initialization**: Booting up **${server.name}**...` });
                
                // Set up status listener for confirmation
                const statusListener = async ({ id: statusId, status }: { id: string, status: string }) => {
                    if (statusId === id && status === 'ONLINE') {
                        processManager.removeListener('status', statusListener);
                        await interaction.followUp({ content: `✅ **System Ready**: **${server.name}** is now fully operational. Use \`/status\` to view telemetry.` });
                    } else if (statusId === id && status === 'CRASHED') {
                        processManager.removeListener('status', statusListener);
                        await interaction.followUp({ content: `❌ **Critical Failure**: **${server.name}** failed to stabilize during boot sequence.` });
                    }
                };

                processManager.on('status', statusListener);

                // Auto-cleanup after 5 minutes just in case
                setTimeout(() => processManager.removeListener('status', statusListener), 300000);

                try {
                    await startServer(id!);
                } catch (e: any) {
                    processManager.removeListener('status', statusListener);
                    await interaction.followUp({ content: `❌ **Initialization Error**: ${e.message}`, ephemeral: true });
                }
            }

            else if (commandName === 'stop') {
                const id = interaction.options.getString('id');
                const server = getServer(id!);
                if (!server) return interaction.reply({ content: '❌ **Error**: Protocol ID not recognized.', ephemeral: true });

                if (!processManager.isRunning(id!)) {
                    return interaction.reply({ content: `⚠️ **Warning**: Server **${server.name}** is already dormant (Offline).`, ephemeral: true });
                }

                await interaction.reply({ content: `🛑 **Shutdown Sequence**: Sending termination signal to **${server.name}**...` });
                
                const stopListener = async ({ id: statusId, status }: { id: string, status: string }) => {
                    if (statusId === id && (status === 'OFFLINE' || status === 'CRASHED')) {
                        processManager.removeListener('status', stopListener);
                        await interaction.followUp({ content: `💤 **Status: Dormant**: **${server.name}** has reached a safe shutdown state.` });
                    }
                };

                processManager.on('status', stopListener);
                setTimeout(() => processManager.removeListener('status', stopListener), 60000);

                await stopServer(id!);
            }

            else if (commandName === 'status') {
                const id = interaction.options.getString('id');
                const servers = id ? [getServer(id)] : getServers();
                
                const embed = new EmbedBuilder()
                    .setTitle('📊 Server Infrastructure Status')
                    .setColor(0x5865F2)
                    .setTimestamp()
                    .setFooter({ text: 'CraftCommand Infrastructure Monitor' });

                for (const s of servers) {
                    if (!s) continue;
                    const isRunning = processManager.isRunning(s.id);
                    const stats = isRunning ? processManager.getCachedStatus(s.id) : null;
                    
                    const statusEmoji = isRunning ? (stats?.status === 'STARTING' ? '🟡' : '🟢') : (s.status === 'CRASHED' ? '⚠️' : '🔴');
                    const statusText = isRunning ? (stats?.status || 'Online') : (s.status === 'CRASHED' ? 'Crashed' : 'Offline');

                    // Get last backup info
                    const backups = await backupService.listBackups(s.id);
                    const lastBackup = backups.length > 0 ? new Date(backups[0].createdAt).toLocaleString() : 'Never';

                    embed.addFields({ 
                        name: `${statusEmoji} ${s.name}`, 
                        value: isRunning 
                            ? `> **State**: ${statusText}\n> **Users**: \`${stats?.players || 0}\` / \`${s.maxPlayers || '?'}\`\n> **Telemetry**: \`${stats?.tps || '20.00'}\` TPS | \`${Math.round(stats?.memory || 0)}\` MB\n> **Last Backup**: \`${lastBackup}\``
                            : `> **State**: ${statusText}\n> **Last Backup**: \`${lastBackup}\`\n> **Action**: Use \`/start ${s.id}\``,
                        inline: false 
                    });
                }

                await interaction.reply({ embeds: [embed] });
            }

            else if (commandName === 'backup') {
                const id = interaction.options.getString('id');
                const server = getServer(id!);
                if (!server) return interaction.reply({ content: '❌ **Error**: Protocol ID not recognized.', ephemeral: true });

                await interaction.reply({ content: `💾 **Snapshot Protocol**: Initiating backup for **${server.name}**...` });

                try {
                    const serverDir = path.join(__dirname, '../../data/servers', id!); // Improved pathing
                    await backupService.createBackup(serverDir, id!, `Discord Command: ${interaction.user.tag}`);
                    // Notification will be handle by the managed listener we setup in setupEventForwarding
                } catch (e: any) {
                    await interaction.followUp({ content: `❌ **Backup Failure**: ${e.message}`, ephemeral: true });
                }
            }
        } catch (e) {
            logger.error(`Discord Command Error: ${e}`);
            if (!interaction.replied) {
                await interaction.reply({ content: '❌ An error occurred while executing the command.', ephemeral: true });
            }
        }
    }

    async shutdown() {
        if (this.client) {
            logger.info('[Discord] Destroying client...');
            await this.client.destroy();
            this.client = null;
        }
        this.cleanupListeners();
    }
}

export const discordService = new DiscordService();
