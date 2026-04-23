import express from 'express';
import { logger } from '../../../utils/logger';
import { verifyToken, requirePermission } from '../../../middleware/authMiddleware';
import { getServer, saveServer } from '../ServerService';
import { installerService } from '../../installer/InstallerService';
import { auditService } from '../../system/AuditService';
import { ServerStatus } from '@shared/types';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';
import { DATA_PATHS } from '../../../constants';

const MAX_UPLOAD_SIZE = 500 * 1024 * 1024;
const upload = multer({ dest: path.join(path.dirname(DATA_PATHS.SERVERS_ROOT), 'temp_uploads'), limits: { fileSize: MAX_UPLOAD_SIZE } });

const router = express.Router({ mergeParams: true });

// Protect all install routes
router.use(verifyToken);

// Install Server Software
router.post('/install', requirePermission('server.settings'), async (req, res) => {
    const { id } = req.params;
    const { type, version, build, url } = req.body; 
    const server = getServer(id);

    if (!server) return res.status(404).json({ error: 'Server not found' });

    let installType = type;
    try {
        // Safety: If type is missing or mismatched (e.g. Paper instead of Purpur), 
        // fallback to the official metadata stored on the server record
        if ((!installType || installType === 'paper') && server.software === 'Purpur') {
            installType = 'purpur';
        } else if (!installType && server.software) {
            installType = server.software.toLowerCase();
        }

        logger.info(`[Installation] Request for server ${id} | Type: ${installType} (requested: ${type}) | Version: ${version}`);

        const onProgress = (msg: string, percent: number = -1) => {
            if (req.io) {
                req.io.emit('install:progress', {
                    serverId: id,
                    phase: 'installing',
                    message: msg,
                    percent
                });
            }
        };

        const s = getServer(id);
        if (s) {
            s.status = ServerStatus.INSTALLING;
            saveServer(s);
        }

        if (installType === 'paper') {
            await installerService.installPaper(id, server.workingDirectory, version || '1.21.11', build, onProgress);
            server.executable = 'server.jar';
            saveServer(server);
        } else if (installType === 'purpur') {
            await installerService.installPurpur(id, server.workingDirectory, version || '1.21.11', build, onProgress);
            server.executable = 'server.jar';
            server.status = ServerStatus.OFFLINE;
            saveServer(server);
        } else if (installType === 'vanilla') {
            await installerService.installVanilla(id, server.workingDirectory, version || '1.21.11', onProgress);
        } else if (installType === 'fabric') {
            await installerService.installFabric(id, server.workingDirectory, version || '1.21.11', onProgress);
        } else if (installType === 'modpack' && url) {
            await installerService.installModpackFromZip(id, server.workingDirectory, url, version, onProgress, server.software);
        } else if (installType === 'forge') {
            logger.info(`[Installation] Starting Async Forge Install for ${id}`);
            installerService.installForge(id, server.workingDirectory, version || '1.21.1', (req.body as any).localModpack, build, onProgress)
                .then(executable => {
                    const s = getServer(id);
                    if (s) {
                        s.executable = executable;
                        s.status = ServerStatus.OFFLINE;
                        saveServer(s);
                    }
                })
                .catch(err => {
                    logger.error(`[Installation] Forge Install Failed: ${err.message}`);
                    const s = getServer(id);
                    if (s) {
                        s.status = ServerStatus.OFFLINE;
                        saveServer(s);
                    }
                });
            
            res.json({ success: true, message: 'Installation started in background.' });
            return; 
        } else if (installType === 'neoforge') {
            const executable = await installerService.installNeoForge(id, server.workingDirectory, version || '1.21.1', build, onProgress);
            server.executable = executable;
            server.javaVersion = 'Java 21';
            saveServer(server);
        } else if (installType === 'spigot') {
            await installerService.installSpigot(id, server.workingDirectory, version || '1.21.1', onProgress);
        } else if (installType === 'velocity') {
            await installerService.installVelocity(id, server.workingDirectory, { version: version || '3.4.0-SNAPSHOT', build }, onProgress);
            const s = getServer(id);
            if (s) {
                s.executable = 'velocity.jar';
                saveServer(s);
            }
        } else if (installType === 'bedrock') {
            const bVersion = version || '1.26.0.2';
            await installerService.installBedrock(id, server.workingDirectory, bVersion, onProgress);
            const s = getServer(id);
            if (s) {
                const exe = process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server';
                s.executable = exe;
                s.executionCommand = process.platform === 'win32' ? exe : `./${exe}`;
                s.version = bVersion;
                s.status = ServerStatus.OFFLINE;
                saveServer(s);
            }
        } else {
            return res.status(400).json({ 
                error: 'Invalid installation type or missing parameters',
                details: { receivedType: installType, supported: ['paper', 'purpur', 'vanilla', 'fabric', 'modpack', 'forge', 'neoforge', 'spigot', 'velocity', 'bedrock'] }
            });
        }

        if (server.advancedFlags) {
            if (server.advancedFlags.installSpark) {
                if (installType === 'paper' || installType === 'purpur' || installType === 'spigot') {
                     await installerService.installSpark(server.workingDirectory);
                }
            }
        }

        if (server.onlineMode === false) {
             const propsPath = path.join(server.workingDirectory, 'server.properties');
             if (!await fs.pathExists(propsPath)) {
                 await fs.writeFile(propsPath, 'online-mode=false\n');
             } else {
                 let content = await fs.readFile(propsPath, 'utf8');
                 if (content.includes('online-mode=')) {
                     content = content.replace(/online-mode=(true|false)/, 'online-mode=false');
                 } else {
                     content += '\nonline-mode=false';
                 }
                 await fs.writeFile(propsPath, content);
             }
        }

        const finalS = getServer(id);
        if (finalS && finalS.status === ServerStatus.INSTALLING) {
            finalS.status = ServerStatus.OFFLINE;
            saveServer(finalS);
        }

        res.json({ success: true, message: 'Installation complete' });
        if (req.user) {
            auditService.log(req.user.id, 'TEMPLATE_INSTALL', id, { type: installType, version });
        }

    } catch (e: any) {
        logger.error(`[Installation] Fatal error during ${installType} install for ${id}: ${e}`);
        const s = getServer(id);
        if (s) {
            s.status = ServerStatus.OFFLINE;
            saveServer(s);
        }
        res.status(500).json({ error: e.message });
    }
});

// Server Icon Upload
router.post('/icon', requirePermission('server.settings'), upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const server = getServer(id);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });

        const iconName = server.software === 'Bedrock' ? 'world_icon.png' : 'server-icon.png';
        const targetPath = path.join(server.workingDirectory, iconName);

        try {
            await sharp(req.file.path)
                .resize(64, 64, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toFile(targetPath);
            
            await fs.remove(req.file.path);
            
            logger.info(`[IconUpload] Stabilized & Updated icon for ${id} (${server.software}) at ${targetPath}`);
            res.json({ success: true, iconName });

            if (req.user) {
                auditService.log(req.user.id, 'SERVER_ICON_UPDATE', server.id, { iconName });
            }
        } catch (sharpError: any) {
            logger.error(`[IconUpload] Sharp processing failed: ${sharpError.message}`);
            throw new Error(`Icon stabilization failed: ${sharpError.message}`);
        }
    } catch (e: any) {
        logger.error(`[IconUpload] Failed for ${req.params.id}: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

export default router;
