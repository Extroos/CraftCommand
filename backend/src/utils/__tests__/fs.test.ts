import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { SafeFileOperation } from '../fs';

describe('SafeFileOperation', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'craftcommand-fs-test-'));
    });

    afterEach(async () => {
        await fs.remove(tempDir);
    });

    it('should write a file successfully', async () => {
        const testFile = path.join(tempDir, 'test.txt');
        await SafeFileOperation.writeFile(testFile, 'Hello World');
        
        const content = await fs.readFile(testFile, 'utf8');
        expect(content).toBe('Hello World');
    });

    it('should ensure directory exists before writing', async () => {
        const deepFile = path.join(tempDir, 'deep', 'folder', 'test.txt');
        await SafeFileOperation.writeFile(deepFile, 'Deep Content');
        
        const content = await fs.readFile(deepFile, 'utf8');
        expect(content).toBe('Deep Content');
    });

    it('should safely overwrite an existing file atomically', async () => {
        const testFile = path.join(tempDir, 'overwrite.txt');
        await SafeFileOperation.writeFile(testFile, 'Initial');
        await SafeFileOperation.writeFile(testFile, 'Updated Content');
        
        const content = await fs.readFile(testFile, 'utf8');
        expect(content).toBe('Updated Content');
        
        // Ensure no .tmp files were left behind
        expect(await fs.pathExists(testFile + '.tmp')).toBe(false);
    });
});
