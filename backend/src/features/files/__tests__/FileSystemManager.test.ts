import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// We test FileSystemManager in isolation — no mocks needed since it uses real fs
import { FileSystemManager } from '../FileSystemManager';

describe('FileSystemManager', () => {
    let fsm: FileSystemManager;
    let testDir: string;

    beforeEach(async () => {
        // Create a fresh temp directory for each test
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'craftcmd-fsm-'));
        fsm = new FileSystemManager(testDir);
    });

    afterEach(async () => {
        await fs.remove(testDir);
    });

    // ── Path Traversal Protection ──

    describe('Path Traversal Prevention', () => {
        it('should block ../ traversal attempts', () => {
            expect(() => (fsm as any).resolvePath('../../../etc/passwd')).toThrow('Access denied');
        });

        it('should block absolute path injection', () => {
            expect(() => (fsm as any).resolvePath('/etc/passwd')).toThrow('Access denied');
        });

        it('should block prefix attacks (basepath + suffix = different dir)', async () => {
            // If basePath is /tmp/test, ensure /tmp/test2 is blocked
            const siblingDir = testDir + '2';
            await fs.ensureDir(siblingDir);
            try {
                // The relative path that would resolve to the sibling
                const relativeSibling = path.relative(testDir, siblingDir);
                expect(() => (fsm as any).resolvePath(relativeSibling)).toThrow('Access denied');
            } finally {
                await fs.remove(siblingDir);
            }
        });

        it('should allow valid relative paths within basePath', () => {
            const resolved = (fsm as any).resolvePath('subdir/file.txt');
            expect(resolved).toBe(path.resolve(testDir, 'subdir/file.txt'));
        });

        it('should allow accessing the basePath root itself', () => {
            const resolved = (fsm as any).resolvePath('.');
            expect(resolved).toBe(path.resolve(testDir));
        });

        it('should block encoded traversal (..%2F)', () => {
            // Even if someone passes URL-encoded dots, path.resolve handles it
            // but let's ensure it still blocks
            expect(() => (fsm as any).resolvePath('..%2F..%2Fetc/passwd')).not.toThrow();
            // The above won't actually traverse because %2F is literal, 
            // but ../ inside a decoded path should still be caught:
            expect(() => (fsm as any).resolvePath(decodeURIComponent('..%2F..%2Fetc%2Fpasswd'))).toThrow('Access denied');
        });
    });

    // ── File Operations ──

    describe('File Read/Write', () => {
        it('should write a file and read it back', async () => {
            await fsm.writeFile('test.txt', 'Hello, CraftCommand!');
            const content = await fsm.readFile('test.txt');
            expect(content).toBe('Hello, CraftCommand!');
        });

        it('should write atomically via temp file', async () => {
            await fsm.writeFile('atomic.txt', 'data');
            // Verify no .tmp file left behind
            const tmpExists = await fs.pathExists(path.join(testDir, 'atomic.txt.tmp'));
            expect(tmpExists).toBe(false);
            // Verify the real file exists
            const content = await fsm.readFile('atomic.txt');
            expect(content).toBe('data');
        });

        it('should create parent directories when writing to nested path', async () => {
            await fsm.writeFile('deep/nested/dir/file.txt', 'nested content');
            const content = await fsm.readFile('deep/nested/dir/file.txt');
            expect(content).toBe('nested content');
        });

        it('should overwrite existing files', async () => {
            await fsm.writeFile('replace.txt', 'original');
            await fsm.writeFile('replace.txt', 'updated');
            const content = await fsm.readFile('replace.txt');
            expect(content).toBe('updated');
        });
    });

    // ── Directory Operations ──

    describe('Directory Operations', () => {
        it('should create and list a directory', async () => {
            await fsm.createDirectory('my-folder');
            const files = await fsm.listFiles('.');
            const dir = files.find(f => f.name === 'my-folder');
            expect(dir).toBeDefined();
            expect(dir!.isDirectory).toBe(true);
        });

        it('should list files with correct metadata', async () => {
            await fsm.writeFile('info.txt', 'some content');
            const files = await fsm.listFiles('.');
            const file = files.find(f => f.name === 'info.txt');
            expect(file).toBeDefined();
            expect(file!.isDirectory).toBe(false);
            expect(file!.size).toBe(12); // 'some content' = 12 bytes
        });
    });

    // ── Delete ──

    describe('Delete', () => {
        it('should delete a file', async () => {
            await fsm.writeFile('delete-me.txt', 'bye');
            await fsm.deletePath('delete-me.txt');
            const exists = await fsm.exists('delete-me.txt');
            expect(exists).toBe(false);
        });

        it('should delete a directory recursively', async () => {
            await fsm.createDirectory('delete-dir');
            await fsm.writeFile('delete-dir/file.txt', 'content');
            await fsm.deletePath('delete-dir');
            const exists = await fsm.exists('delete-dir');
            expect(exists).toBe(false);
        });
    });

    // ── Move / Copy ──

    describe('Move and Copy', () => {
        it('should move a file', async () => {
            await fsm.writeFile('original.txt', 'data');
            await fsm.move('original.txt', 'moved.txt');
            expect(await fsm.exists('original.txt')).toBe(false);
            expect(await fsm.readFile('moved.txt')).toBe('data');
        });

        it('should copy a file', async () => {
            await fsm.writeFile('source.txt', 'copy me');
            await fsm.copy('source.txt', 'dest.txt');
            expect(await fsm.readFile('source.txt')).toBe('copy me');
            expect(await fsm.readFile('dest.txt')).toBe('copy me');
        });

        it('should handle copy-to-same-path by creating " - Copy" suffix', async () => {
            await fsm.writeFile('same.txt', 'data');
            await fsm.copy('same.txt', 'same.txt');
            expect(await fsm.exists('same - Copy.txt')).toBe(true);
        });

        it('should throw when moving a non-existent file', async () => {
            await expect(fsm.move('nope.txt', 'dest.txt')).rejects.toThrow('Source file not found');
        });
    });

    // ── Search ──

    describe('Search', () => {
        it('should find files by name', async () => {
            await fsm.writeFile('server.properties', 'key=value');
            await fsm.writeFile('eula.txt', 'eula=true');
            
            const results = await fsm.searchFiles('server');
            expect(results.length).toBe(1);
            expect(results[0].name).toBe('server.properties');
        });

        it('should respect maxResults limit', async () => {
            for (let i = 0; i < 5; i++) {
                await fsm.writeFile(`match-${i}.txt`, 'content');
            }
            const results = await fsm.searchFiles('match', '.', 3);
            expect(results.length).toBe(3);
        });

        it('should search file contents when enabled', async () => {
            await fsm.writeFile('config.yml', 'server-port=25565');
            const results = await fsm.searchFiles('25565', '.', 100, true);
            expect(results.length).toBe(1);
            expect(results[0].snippet).toContain('25565');
        });
    });

    // ── Stats / Exists ──

    describe('Stats and Exists', () => {
        it('should return true for existing files', async () => {
            await fsm.writeFile('exists.txt', 'yes');
            expect(await fsm.exists('exists.txt')).toBe(true);
        });

        it('should return false for non-existing files', async () => {
            expect(await fsm.exists('nope.txt')).toBe(false);
        });

        it('should return valid stats', async () => {
            await fsm.writeFile('stats.txt', 'hello');
            const stats = await fsm.getStats('stats.txt');
            expect(stats.size).toBe(5);
            expect(stats.isFile()).toBe(true);
        });
    });
});
