import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { processManager } from '../processes/ProcessManager';
import { backupService } from '../backups/BackupService';
import {  WebhookConfig, WebhookTrigger, ServerStatus  } from '@shared/types';
import { logger } from '../../utils/logger';

const DATA_DIR = path.join(__dirname, '../../../data');
const WEBHOOKS_FILE = path.join(DATA_DIR, 'webhooks.json');

export class WebhookService {
    private webhooks: WebhookConfig[] = [];

    constructor() {
        this.loadWebhooks();
        this.setupListeners();
    }

    private async loadWebhooks() {
        try {
            if (await fs.pathExists(WEBHOOKS_FILE)) {
                this.webhooks = await fs.readJson(WEBHOOKS_FILE);
            }
        } catch (e) {
            logger.error(`Failed to load webhooks config: ${e}`);
            this.webhooks = [];
        }
    }

    private async saveWebhooks() {
        try {
            await fs.writeJson(WEBHOOKS_FILE, this.webhooks, { spaces: 2 });
        } catch (e) {
            logger.error(`Failed to save webhooks config: ${e}`);
        }
    }

    public getWebhooks(): WebhookConfig[] {
        return this.webhooks;
    }

    public getWebhooksByServer(serverId: string): WebhookConfig[] {
        return this.webhooks.filter(w => !w.serverId || w.serverId === serverId);
    }


    public async addWebhook(config: Omit<WebhookConfig, 'id' | 'failureCount'>): Promise<WebhookConfig> {
        const newWebhook: WebhookConfig = {
            ...config,
            id: crypto.randomUUID(),
            failureCount: 0
        };
        this.webhooks.push(newWebhook);
        await this.saveWebhooks();
        return newWebhook;
    }


    public async removeWebhook(id: string) {
        this.webhooks = this.webhooks.filter(w => w.id !== id);
        await this.saveWebhooks();
    }

    public async updateWebhook(id: string, updates: Partial<WebhookConfig>) {
        const index = this.webhooks.findIndex(w => w.id === id);
        if (index !== -1) {
            this.webhooks[index] = { ...this.webhooks[index], ...updates };
            await this.saveWebhooks();
        }
    }

    public async testWebhook(id: string) {
        const webhook = this.webhooks.find(w => w.id === id);
        if (!webhook) throw new Error('Webhook not found');
        
        await this.sendPayload(webhook, 'TEST_EVENT', {
            message: 'This is a test notification from CraftCommand.',
            timestamp: new Date().toISOString()
        });
    }

    private setupListeners() {
        processManager.on('status', ({ id, status }) => {
            if (status === ServerStatus.ONLINE) this.dispatch('SERVER_START', { serverId: id, status });
            if (status === ServerStatus.OFFLINE) this.dispatch('SERVER_STOP', { serverId: id, status });
            if (status === ServerStatus.CRASHED) this.dispatch('SERVER_CRASH', { serverId: id, status });
        });

        processManager.on('player:join', ({ serverId, name }) => {
            this.dispatch('PLAYER_JOIN', { serverId, player: name, action: 'join' });
        });
        
        processManager.on('player:leave', ({ serverId, name }) => {
            this.dispatch('PLAYER_LEAVE', { serverId, player: name, action: 'leave' });
        });

        backupService.on('status', (msg: string) => {
             if (msg === 'Backup created successfully') {
                 this.dispatch('BACKUP_COMPLETE', { message: msg });
             }
        });
    }

    private dispatch(trigger: WebhookTrigger, payload: any) {
        const targets = this.webhooks.filter(w => w.enabled && w.triggers.includes(trigger));
        const enrichedPayload = {
            event: trigger,
            timestamp: new Date().toISOString(),
            data: payload
        };

        targets.forEach(webhook => {
            // Filter by serverId if present in payload
            if (webhook.serverId && payload.data?.serverId && webhook.serverId !== payload.data.serverId) {
                return;
            }

            this.sendPayload(webhook, trigger, enrichedPayload).catch(e => {
                logger.warn(`Webhook ${webhook.name} failed: ${e.message}`);
            });
        });

    }

    private async sendPayload(webhook: WebhookConfig, eventType: string, payload: any) {
        try {
            const headers: any = {
                'Content-Type': 'application/json',
                'User-Agent': 'CraftCommand-Webhook/1.0',
                'X-CraftCommand-Event': eventType
            };

            if (webhook.secret) {
                const signature = crypto.createHmac('sha256', webhook.secret)
                    .update(JSON.stringify(payload))
                    .digest('hex');
                headers['X-CraftCommand-Signature'] = `sha256=${signature}`;
            }

            await axios.post(webhook.url, payload, { headers, timeout: 5000 });
            
            // Reset failure count on success
            if (webhook.failureCount > 0) {
                webhook.failureCount = 0;
                this.saveWebhooks();
            }

        } catch (e) {
            webhook.failureCount++;
            if (webhook.failureCount >= 10) {
                logger.warn(`Webhook ${webhook.name} disabled after 10 consecutive failures.`);
                webhook.enabled = false;
            }
            this.saveWebhooks();
            throw e;
        }
    }
}

export const webhookService = new WebhookService();
