
import { FileSystemManager } from '../files/FileSystemManager';
import { DiagnosisActions } from './DiagnosisActions';
import { serverRepository } from '../../storage/ServerRepository';
import { logger } from '../../utils/logger';
import { ServerConfig } from '@shared/types';
import { updateServer } from '../servers/ServerService';
import { notificationService } from '../system/NotificationService';

export class AutoHealingManager {
    /**
     * Executes a specific diagnosis action securely
     */
    public async executeFix(serverId: string, actionType: string, payload: any): Promise<void> {
        const server = serverRepository.findById(serverId);
        if (!server || !server.workingDirectory) {
            throw new Error(`Cannot execute fix: Server ${serverId} has no working directory.`);
        }

        const fsManager = new FileSystemManager(server.workingDirectory);
        logger.info(`[AutoHealing] Executing ${actionType} for ${serverId}`);

        try {
            switch (actionType) {
                case 'AGREE_EULA':
                    await DiagnosisActions.agreeEula(fsManager);
                    break;
                case 'RESOLVE_PORT_CONFLICT':
                    await DiagnosisActions.resolvePortConflict(server, fsManager);
                    break;
                case 'ADJUST_RAM':
                    await DiagnosisActions.adjustRam(server, payload.newRam);
                    break;
                case 'SWITCH_JAVA':
                    await DiagnosisActions.switchJavaVersion(server, payload.version);
                    break;
                case 'REPAIR_PROPERTIES':
                    await DiagnosisActions.repairProperties(fsManager, server.version);
                    break;
                case 'CLEANUP_TELEMETRY':
                    await DiagnosisActions.cleanupTelemetry(fsManager);
                    break;
                case 'OPTIMIZE_ARGUMENTS':
                    await DiagnosisActions.optimizeArguments(server);
                    break;
                case 'PURGE_GHOST':
                    await DiagnosisActions.purgeGhost(server);
                    break;
                case 'CREATE_PLUGIN_FOLDER':
                    await DiagnosisActions.createPluginFolder(fsManager);
                    break;
                case 'REMOVE_DUPLICATE_PLUGIN':
                    await DiagnosisActions.removeDuplicatePlugins(fsManager, payload.files);
                    break;
                case 'TAKE_HEAP_SNAPSHOT':
                    await DiagnosisActions.takeHeapSnapshot(payload.reason);
                    break;
                case 'RESTORE_DATA_BACKUP':
                    await DiagnosisActions.restoreDataBackup(fsManager, payload.filename, serverId);
                    break;
                case 'REINSTALL_BEDROCK':
                    await DiagnosisActions.reinstallBedrock(server);
                    break;
                case 'UPDATE_CONFIG':
                    // Payload contains the config updates (e.g., { ram: 4 } or { port: 25566 })
                    logger.info(`[AutoHealing] Applying Config Update to ${serverId}: ${JSON.stringify(payload)}`);
                    if (payload.reassignMapPort) {
                        await DiagnosisActions.reassignMapPort(server, fsManager);
                    } else if (payload.triggerDdnsUpdate) {
                        await DiagnosisActions.triggerDdnsUpdate(server);
                    } else if (payload.repairPermissions) {
                        await DiagnosisActions.repairPermissions(server, fsManager);
                    } else {
                        await updateServer(serverId, payload);
                    }
                    break;
                case 'RESYNC_VELOCITY_SECRET':
                    await DiagnosisActions.resyncVelocitySecret(server, fsManager);
                    break;
                case 'INSTALL_JAVA':
                    await DiagnosisActions.installJava(payload.version);
                    break;
                case 'TRIGGER_DDNS_UPDATE':
                    await DiagnosisActions.triggerDdnsUpdate(server);
                    break;
                case 'CLEANUP_WORLD_LOCK':
                    await DiagnosisActions.cleanupWorldLock(server, fsManager);
                    break;
                case 'FIX_JVM_ARGS':
                    await DiagnosisActions.fixJvmArgs(server);
                    break;
                // NOTE: REMOVE_MOD has been removed. CraftCommands NEVER deletes user mods.
                // Incompatible mod issues are handled via guidance and INSTALL_DEPENDENCY only.
                case 'INSTALL_DEPENDENCY':
                    await DiagnosisActions.installDependency(server, payload.name);
                    break;
                case 'RESTORE_LEVEL_DATA':
                    await DiagnosisActions.restoreLevelData(server, fsManager);
                    break;
                case 'ENABLE_ENTITY_PURGE':
                    await DiagnosisActions.enableEntityPurge(server, fsManager);
                    break;
                case 'REASSIGN_BEDROCK_PORT':
                    await DiagnosisActions.reassignBedrockPort(server);
                    break;
                default:
                    throw new Error(`Unknown auto-heal action type: ${actionType}`);
            }

            logger.success(`[AutoHealing] Successfully applied ${actionType} to ${serverId}`);
            
            // Send Notification
            const cascadingAdvice = this.getCascadingAdvice(actionType);
            await notificationService.create(
                'ALL', // Notify all admins
                'SUCCESS',
                'Auto-Healing Applied',
                `System applied fix: ${actionType.replace(/_/g, ' ')} to server ${server.name || serverId}.${cascadingAdvice ? ' ' + cascadingAdvice : ''}`,
                { serverId, actionType, timestamp: Date.now() },
                `/dashboard/${serverId}`
            );
        } catch (error: any) {
            logger.error(`[AutoHealing] Failed to apply ${actionType} to ${serverId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Provides context-aware advice for further checks after a fix
     */
    private getCascadingAdvice(actionType: string): string {
        switch (actionType) {
            case 'ADJUST_RAM':
            case 'SWITCH_JAVA':
                return 'This core fix might resolve related startup crashes. Please attempt to start the server now.';
            case 'RESOLVE_PORT_CONFLICT':
                return 'Port conflict resolved. Other instances using this port might still need attention.';
            case 'AGREE_EULA':
                return 'EULA accepted. The server will now be able to initialize its world files.';
            case 'REINSTALL_BEDROCK':
                return 'Reinstallation complete. Your world data was preserved, but behavior packs may need re-linking.';
            default:
                return '';
        }
    }
}

export const autoHealingManager = new AutoHealingManager();
