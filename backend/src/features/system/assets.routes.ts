import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { DATA_PATHS } from '../../constants';
import { verifyToken } from '../../middleware/authMiddleware';
import { auditService } from './AuditService';
import { logger } from '../../utils/logger';

const router = express.Router();

// Configure storage for backgrounds
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, DATA_PATHS.BACKGROUNDS_UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, `background-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp|gif/;
        const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mime = allowedTypes.test(file.mimetype);
        
        if (ext && mime) {
            return cb(null, true);
        }
        cb(new Error('Only images are allowed (jpeg, jpg, png, webp, gif)'));
    }
});

// Configure storage for avatars
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = DATA_PATHS.AVATARS_UPLOADS_DIR;
        fs.ensureDirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const user = req.user;
        const uniqueSuffix = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `avatar-${user?.id || 'unknown'}-${uniqueSuffix}${ext}`);
    }
});

const uploadAvatar = multer({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for avatars
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mime = allowedTypes.test(file.mimetype);
        if (ext && mime) return cb(null, true);
        cb(new Error('Only images are allowed (jpeg, jpg, png, webp)'));
    }
});

router.post('/background', verifyToken, upload.single('file'), async (req, res) => {
    logger.info('[Assets] POST /background received');
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const user = req.user;
        const publicUrl = `/uploads/backgrounds/${req.file.filename}`;
        
        auditService.log(user.id, 'ASSET_UPLOAD', 'BACKGROUND', { filename: req.file.filename }, req.ip, user.email);
        
        res.json({ url: publicUrl });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/avatar', verifyToken, uploadAvatar.single('file'), async (req, res) => {
    logger.info('[Assets] POST /avatar received');
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const user = req.user;
        const publicUrl = `/uploads/avatars/${req.file.filename}`;
        
        auditService.log(user.id, 'ASSET_UPLOAD', 'AVATAR', { filename: req.file.filename }, req.ip, user.email);
        
        res.json({ url: publicUrl });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
