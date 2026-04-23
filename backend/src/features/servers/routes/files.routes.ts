import express from 'express';
import { logger } from '../../../utils/logger';
import { verifyToken, requirePermission } from '../../../middleware/authMiddleware';
import { getServer } from '../ServerService';
import { FileSystemManager } from '../../files/FileSystemManager';
import { auditService } from '../../system/AuditService';
import path from 'path';
import multer from 'multer';
import fs from 'fs-extra';
import { emitActivity } from '../../../sockets/index';
import AdmZip from 'adm-zip';
import { DATA_PATHS } from '../../../constants';

const MAX_UPLOAD_SIZE = 500 * 1024 * 1024; // 500MB
const upload = multer({ dest: path.join(path.dirname(DATA_PATHS.SERVERS_ROOT), 'temp_uploads'), limits: { fileSize: MAX_UPLOAD_SIZE } });

const router = express.Router({ mergeParams: true });

// Protect all file routes
router.use(verifyToken);

// Check File Exists (Silent)
router.get('/exists', requirePermission('server.files.read'), async (req, res) => {
    const { id } = req.params;
    const { path: relativePath } = req.query;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!relativePath || typeof relativePath !== 'string') return res.status(400).json({ error: 'Path is required' });

    try {
        const targetPath = path.resolve(server.workingDirectory, relativePath);
        if (!targetPath.startsWith(server.workingDirectory)) {
            return res.json({ exists: false });
        }
        const exists = await fs.pathExists(targetPath);
        res.json({ exists });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get File Content
router.get('/content', requirePermission('server.files.read'), async (req, res) => {
    const { id } = req.params;
    const { path: relativePath } = req.query;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!relativePath) return res.status(400).json({ error: 'Path is required' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        const content = await fsManager.readFile(relativePath as string);
        res.json({ content });
    } catch (e: any) {
        if (e.code === 'ENOENT') {
            return res.status(404).json({ error: 'File not found' });
        }
        res.status(500).json({ error: e.message });
    }
});

// Save File Content
router.post('/content', requirePermission('server.files.write'), async (req, res) => {
    const { id } = req.params;
    const { path: relativePath, content } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!relativePath) return res.status(400).json({ error: 'Path is required' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.writeFile(relativePath, content);
        res.json({ success: true });
        
        if (req.user) {
            auditService.log(req.user.id, 'FILE_EDIT', id, { path: relativePath });
            emitActivity({
                id: `act-${Date.now()}`,
                serverId: id,
                userId: req.user.id,
                username: req.user.username,
                action: 'FILE_EDITED',
                detail: `Edited ${relativePath}`,
                visibility: 'VIEWER',
                timestamp: Date.now()
            });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Create Folder
router.post('/folder', requirePermission('server.files.write'), async (req, res) => {
    const { id } = req.params;
    const { path: relativePath } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!relativePath) return res.status(400).json({ error: 'Path is required' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.createDirectory(relativePath);
        res.json({ success: true });
        
        if (req.user) {
            auditService.log(req.user.id, 'FOLDER_CREATE', id, { path: relativePath });
            emitActivity({
                id: `act-${Date.now()}`,
                serverId: id,
                userId: req.user.id,
                username: req.user.username,
                action: 'CONFIG_CHANGED',
                detail: `Created folder ${relativePath}`,
                visibility: 'VIEWER',
                timestamp: Date.now()
            });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get Files
router.get('/', requirePermission('server.files.read'), async (req, res) => {
    const { id } = req.params;
    const { path: relativePath } = req.query;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    
    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        const files = await fsManager.listFiles((relativePath as string) || '.');
        res.json(files);
    } catch (e: any) {
        res.status(403).json({ error: e.message });
    }
});

// Search Files
router.get('/search', requirePermission('server.files.read'), async (req, res) => {
    const { id } = req.params;
    const { query, dir } = req.query;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!query || typeof query !== 'string' || query.length < 2) {
        return res.status(400).json({ error: 'Search query must be at least 2 characters.' });
    }

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        const searchContent = req.query.content === 'true';
        const results = await fsManager.searchFiles(query, (dir as string) || '.', 100, searchContent);
        res.json(results);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete Files (Bulk Action)
router.post('/delete-bulk', requirePermission('server.files.write'), async (req, res) => {
    const { id } = req.params;
    const { paths } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!Array.isArray(paths)) return res.status(400).json({ error: 'Invalid paths' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        for (const p of paths) {
            await fsManager.deletePath(p);
        }
        res.json({ success: true });
        if (req.user) {
            auditService.log(req.user.id, 'FILE_DELETE_BULK', id, { paths, count: paths.length });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Move Files
router.post('/move', requirePermission('server.files.write'), async (req, res) => {
    const { id } = req.params;
    const { source, dest } = req.body;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.move(source, dest);
        res.json({ success: true });
        if (req.user) {
            auditService.log(req.user.id, 'FILE_MOVE', id, { source, dest });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Copy Files
router.post('/copy', requirePermission('server.files.write'), async (req, res) => {
    const { id } = req.params;
    const { source, dest } = req.body;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.copy(source, dest);
        res.json({ success: true });
        if (req.user) {
            auditService.log(req.user.id, 'FILE_COPY', id, { source, dest });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Archive Files
router.post('/archive', requirePermission('server.files.write'), async (req, res) => {
    const { id } = req.params;
    const { paths, archiveName } = req.body; 
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        await fsManager.compress(paths, archiveName);
        res.json({ success: true });
        if (req.user) {
            auditService.log(req.user.id, 'FILE_COMPRESS', id, { paths, count: paths.length, archive: archiveName });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Download File
router.get('/download', requirePermission('server.files.read'), async (req, res) => {
    const { id } = req.params;
    const { path: relativePath } = req.query;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!relativePath) return res.status(400).json({ error: 'Path is required' });

    // Use fsManager to safely resolve and assert the path is within bounds
    const fsManager = new FileSystemManager(server.workingDirectory);

    try {
        const filePath = fsManager.getAbsolutePath(relativePath as string);
        
        if (await fs.pathExists(filePath)) {
             res.download(filePath);
             if (req.user) {
                 auditService.log(req.user.id, 'FILE_DOWNLOAD', id, { path: relativePath });
             }
        } else {
             res.status(404).json({ error: 'File not found' });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Upload File
router.post('/upload', requirePermission('server.files.write'), upload.single('file'), async (req, res) => {
    const { id } = req.params;
    const { path: relativePath } = req.query;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        const targetDir = relativePath && typeof relativePath === 'string'
            ? fsManager.getAbsolutePath(relativePath)
            : server.workingDirectory;

        await fs.ensureDir(targetDir);
        const targetPath = path.join(targetDir, req.file.originalname);
        
        await fs.move(req.file.path, targetPath, { overwrite: true });
        
        res.json({ success: true, filename: req.file.originalname, path: relativePath || '/' });
        if (req.user) {
            auditService.log(req.user.id, 'FILE_UPLOAD', id, { filename: req.file.originalname, path: relativePath || '/' });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Extract ZIP file
router.post('/extract', requirePermission('server.files.write'), async (req, res) => {
    const { id } = req.params;
    const { filePath } = req.body;
    const server = getServer(id);
    
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!filePath || !filePath.endsWith('.zip')) return res.status(400).json({ error: 'Invalid ZIP file' });

    const fsManager = new FileSystemManager(server.workingDirectory);
    try {
        logger.info(`[Extract] Request for server ${id}, file: ${filePath}`);
        const zipPath = fsManager.getAbsolutePath(filePath);
        
        if (!(await fs.pathExists(zipPath))) {
            return res.status(404).json({ error: 'ZIP file not found' });
        }

        const tempDir = fsManager.getAbsolutePath(`.temp_extract_${Date.now()}`);
        await fs.ensureDir(tempDir);
        
        const zip = new AdmZip(zipPath);

        const MAX_ZIP_ENTRIES = 10000;
        const MAX_ZIP_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
        const BLOCKED_PATTERNS = /(?:^|[\/\\])(?:\.\.(?:[\/\\]|$)|\.ssh|\.env|\.git)/i;

        const entries = zip.getEntries();
        if (entries.length > MAX_ZIP_ENTRIES) {
            return res.status(400).json({ error: `Archive exceeds maximum file limit (${MAX_ZIP_ENTRIES} entries)` });
        }

        let totalSize = 0;
        for (const entry of entries) {
            totalSize += entry.header.size;
            if (totalSize > MAX_ZIP_SIZE) {
                return res.status(400).json({ error: 'Archive exceeds maximum uncompressed size (2GB)' });
            }
            if (BLOCKED_PATTERNS.test(entry.entryName)) {
                return res.status(400).json({ error: `Forbidden path in archive: ${entry.entryName}` });
            }
        }

        zip.extractAllTo(tempDir, true);

        const files = await fs.readdir(tempDir);
        const targetDir = path.dirname(zipPath);

        if (files.length === 1) {
             const nestedPath = path.join(tempDir, files[0]);
             const stats = await fs.stat(nestedPath);
             if (stats.isDirectory()) {
                 await fs.copy(nestedPath, targetDir, { overwrite: true });
             } else {
                 await fs.move(nestedPath, path.join(targetDir, files[0]), { overwrite: true });
             }
        } else {
             await fs.copy(tempDir, targetDir, { overwrite: true });
        }

        await fs.remove(tempDir);
        
        res.json({ success: true, message: 'File extracted successfully' });
        if (req.user) {
            auditService.log(req.user.id, 'FILE_EXTRACT', id, { path: filePath });
        }
    } catch (e: any) {
        logger.error(`[Extract] Error: ${e}`);
        res.status(500).json({ error: e.message });
    }
});

export default router;
