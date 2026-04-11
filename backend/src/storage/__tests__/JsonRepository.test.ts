import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// Mock process.cwd() to use our temp directory
let mockCwd: string;

jest.mock('../../utils/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

// Import the abstract class after mocks
import { JsonRepository } from '../JsonRepository';

interface TestItem {
    id: string;
    name: string;
    status: string;
}

// Concrete implementation for testing (since JsonRepository is abstract)
class TestRepository extends JsonRepository<TestItem> {
    constructor(fileName: string, isFragmented: boolean = false) {
        super(fileName, isFragmented);
    }
}

describe('JsonRepository', () => {
    let testDir: string;
    let originalCwd: () => string;

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'craftcmd-repo-'));
        // Create data dir since JsonRepository reads from process.cwd()/data/
        await fs.ensureDir(path.join(testDir, 'data'));
        
        // Override process.cwd to point to our temp dir 
        originalCwd = process.cwd;
        process.cwd = jest.fn().mockReturnValue(testDir) as any;
    });

    afterEach(async () => {
        process.cwd = originalCwd;
        await fs.remove(testDir);
    });

    // ── Basic CRUD ──

    describe('CRUD Operations', () => {
        it('should create a new repository with empty data', () => {
            const repo = new TestRepository('test-crud.json');
            expect(repo.findAll()).toEqual([]);
        });

        it('should create and retrieve items', () => {
            const repo = new TestRepository('test-crud2.json');
            const item: TestItem = { id: 'srv-1', name: 'Survival', status: 'offline' };
            repo.create(item);
            expect(repo.findById('srv-1')).toEqual(item);
        });

        it('should update an existing item', () => {
            const repo = new TestRepository('test-crud3.json');
            repo.create({ id: 'srv-1', name: 'Survival', status: 'offline' });
            const updated = repo.update('srv-1', { status: 'online' });
            expect(updated?.status).toBe('online');
            expect(updated?.name).toBe('Survival'); // unchanged fields preserved
        });

        it('should delete an item', () => {
            const repo = new TestRepository('test-crud4.json');
            repo.create({ id: 'srv-1', name: 'Survival', status: 'offline' });
            repo.delete('srv-1');
            expect(repo.findById('srv-1')).toBeUndefined();
            expect(repo.findAll()).toHaveLength(0);
        });

        it('should return undefined when updating non-existent item', () => {
            const repo = new TestRepository('test-crud5.json');
            const result = repo.update('nope', { status: 'online' });
            expect(result).toBeNull();
        });
    });

    // ── Persistence ──

    describe('Persistence', () => {
        it('should persist data to disk after save', async () => {
            const repo = new TestRepository('test-persist.json');
            repo.create({ id: 'srv-1', name: 'Test', status: 'offline' });

            // Force save (bypass debounce)
            await (repo as any).executeSave();

            // Read the file directly
            const dataFile = path.join(testDir, 'data', 'test-persist.json');
            const raw = await fs.readJSON(dataFile);
            expect(raw).toHaveLength(1);
            expect(raw[0].id).toBe('srv-1');
        });

        it('should load existing data from disk on construction', async () => {
            // Write data directly to file
            const dataFile = path.join(testDir, 'data', 'test-preload.json');
            await fs.writeJSON(dataFile, [{ id: 'pre-1', name: 'Preloaded', status: 'online' }]);

            const repo = new TestRepository('test-preload.json');
            expect(repo.findById('pre-1')).toBeDefined();
            expect(repo.findById('pre-1')?.name).toBe('Preloaded');
        });

        it('should use atomic temp+rename for saves', async () => {
            const repo = new TestRepository('test-atomic.json');
            repo.create({ id: 'srv-1', name: 'Test', status: 'offline' });

            await (repo as any).executeSave();

            // Verify no .tmp file left behind
            const dataFile = path.join(testDir, 'data', 'test-atomic.json');
            const tmpExists = await fs.pathExists(dataFile + '.tmp');
            expect(tmpExists).toBe(false);

            // Verify real file exists
            const exists = await fs.pathExists(dataFile);
            expect(exists).toBe(true);
        });
    });

    // ── Fragmented Storage ──

    describe('Fragmented Storage', () => {
        it('should write individual fragment files when fragmented', async () => {
            const repo = new TestRepository('test-frag.json', true);
            repo.create({ id: 'frag-1', name: 'Fragment', status: 'offline' });

            // Wait for debounced fragment save
            await new Promise(resolve => setTimeout(resolve, 200));

            const fragmentDir = path.join(testDir, 'data', 'test-frag');
            const fragmentFile = path.join(fragmentDir, 'frag-1.json');
            expect(await fs.pathExists(fragmentFile)).toBe(true);
        });

        it('should not leave .tmp files after fragment save', async () => {
            const repo = new TestRepository('test-frag2.json', true);
            repo.create({ id: 'frag-2', name: 'AtomicFrag', status: 'online' });

            // Wait for debounced fragment save
            await new Promise(resolve => setTimeout(resolve, 200));

            const fragmentDir = path.join(testDir, 'data', 'test-frag2');
            const tmpFile = path.join(fragmentDir, 'frag-2.json.tmp');
            expect(await fs.pathExists(tmpFile)).toBe(false);

            const realFile = path.join(fragmentDir, 'frag-2.json');
            expect(await fs.pathExists(realFile)).toBe(true);
        });

        it('should delete fragment file when item is deleted', async () => {
            const repo = new TestRepository('test-frag3.json', true);
            repo.create({ id: 'frag-del', name: 'ToDelete', status: 'offline' });

            await new Promise(resolve => setTimeout(resolve, 200));

            const fragmentDir = path.join(testDir, 'data', 'test-frag3');
            expect(await fs.pathExists(path.join(fragmentDir, 'frag-del.json'))).toBe(true);

            repo.delete('frag-del');
            // Fragment deletion is synchronous
            expect(await fs.pathExists(path.join(fragmentDir, 'frag-del.json'))).toBe(false);
        });
    });
});
