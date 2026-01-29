
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
import { processManager } from '../servers/ProcessManager';
import { getServers, getServer, startServer, stopServer } from '../servers/ServerService';
import { logger } from '../../utils/logger';

class DiscordService {
    private client: Client | null = null;
    private initialized = false;
    private connecting = false;
    private lastError: string | null = null;
    private listenersAttached = false;

    getStatus() {
        return {
            status: this.initialized ? 'online' : (this.connecting ? 'connecting' : 'offline'),
            lastError: this.lastError,
            user: this.client?.user ? {
                username: this.client.user.username,
                tag: this.client.user.tag,
                avatar: this.client.user.displayAvatarURL(),
                id: this.client.user.id
            } : null
        };
    }

    async reconnect() {
        logger.info('Manual Discord reconnection requested.');
        if (this.client) {
            try {
                await this.client.destroy();
            } catch (e) {}
        }
        this.client = null;
        this.initialized = false;
        this.connecting = false;
        await this.initialize();
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

        // Broadcasters
        processManager.on('status', async ({ id, status }) => {
            const server = getServer(id);
            if (!server) return;
            
            this.sendNotification(
                'Server Status Change',
                `The server **${server.name}** is now **${status}**.`,
                status === 'ONLINE' ? 0x10b981 : (status === 'OFFLINE' ? 0xf43f5e : 0xf59e0b)
            );
        });

        processManager.on('player:join', async ({ serverId, name }) => {
            const server = getServer(serverId);
            this.sendNotification(
                'Player Joined',
                `**${name}** has joined **${server?.name || serverId}**.`,
                0x3b82f6
            );
        });

        processManager.on('player:leave', async ({ serverId, name }) => {
            const server = getServer(serverId);
            this.sendNotification(
                'Player Left',
                `**${name}** has left **${server?.name || serverId}**.`,
                0xf97316
            );
        });
    }

    private async sendNotification(title: string, description: string, color: number) {
        const config = systemSettingsService.getSettings().discordBot;
        if (!this.client || !config.notificationChannel) return;

        try {
            const channel = await this.client.channels.fetch(config.notificationChannel);
            if (channel?.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor(color)
                    .setTimestamp();
                await (channel as any).send({ embeds: [embed] });
            }
        } catch (e) {
            logger.error(`Failed to send Discord notification: ${e}`);
        }
    }

    private async handleInteraction(interaction: ChatInputCommandInteraction) {
        const { commandName } = interaction;
        const config = systemSettingsService.getSettings().discordBot;

        // Simple Role Security
        if (config.commandRoles.length > 0) {
            const member = interaction.member as any;
            const hasRole = member?.roles?.cache.some((role: any) => config.commandRoles.includes(role.id));
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
                    
                    const statusEmoji = isRunning ? (stats?.status === 'STARTING' ? '🟡' : '🟢') : '🔴';
                    const statusText = isRunning ? (stats?.status || 'Online') : 'Offline';

                    embed.addFields({ 
                        name: `${statusEmoji} ${s.name}`, 
                        value: isRunning 
                            ? `> **State**: ${statusText}\n> **Users**: \`${stats?.players || 0}\` / \`${s.maxPlayers || '?'}\`\n> **Telemetry**: \`${stats?.tps || '20.00'}\` TPS | \`${Math.round(stats?.memory || 0)}\` MB`
                            : `> **State**: Offline\n> **Action**: Use \`/start ${s.id}\``,
                        inline: false 
                    });
                }

                await interaction.reply({ embeds: [embed] });
            }
        } catch (e) {
            logger.error(`Discord Command Error: ${e}`);
            if (!interaction.replied) {
                await interaction.reply({ content: '❌ An error occurred while executing the command.', ephemeral: true });
            }
        }
    }
}

export const discordService = new DiscordService();
