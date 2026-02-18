import path from 'path';
import fs from 'fs-extra';
import { logger } from '../../utils/logger';
import { DATA_DIR } from '../../constants';

export interface Migration {
    id: string;
    description: string;
    run: () => Promise<void>;
}

export class MigrationService {
    private static instance: MigrationService;
    private migrations: Migration[] = [];
    private migrationsFile = path.join(DATA_DIR, 'migrations.json');

    private constructor() {
        this.registerMigrations();
    }

    public static getInstance(): MigrationService {
        if (!MigrationService.instance) {
            MigrationService.instance = new MigrationService();
        }
        return MigrationService.instance;
    }

    private registerMigrations() {
        // Register your migrations here
        this.migrations.push({
            id: 'init_applied_migrations_file',
            description: 'Initialize the migrations storage file',
            run: async () => {
                // No-op, just explicitly marking the start of tracking
                logger.info('[Migration] Initialized migration tracking.');
            }
        });
        
        // Example:
        // this.migrations.push({ id: 'v2_schema_update', ... })
    }

    public async runMigrations(): Promise<void> {
        logger.info('[Migration] Checking for pending migrations...');
        
        const applied = await this.getAppliedMigrations();
        const pending = this.migrations.filter(m => !applied.includes(m.id));

        if (pending.length === 0) {
            logger.info('[Migration] System is up to date.');
            return;
        }

        logger.info(`[Migration] Found ${pending.length} pending migrations.`);

        // Create a pre-migration snapshot if needed
        await this.createSnapshot();

        for (const migration of pending) {
            try {
                logger.info(`[Migration] Running: ${migration.id} (${migration.description})`);
                await migration.run();
                await this.markAsApplied(migration.id);
                logger.info(`[Migration] Completed: ${migration.id}`);
            } catch (err: any) {
                logger.error(`[Migration] FAILED: ${migration.id} - ${err.message}`);
                throw err; // Stop startup on migration failure
            }
        }
        
        logger.info('[Migration] All migrations applied successfully.');
    }

    private async getAppliedMigrations(): Promise<string[]> {
        if (!await fs.pathExists(this.migrationsFile)) {
            return [];
        }
        try {
            const data = await fs.readJson(this.migrationsFile);
            return Array.isArray(data) ? data : [];
        } catch (err) {
            logger.warn('[Migration] Could not read migrations file, assuming empty.');
            return [];
        }
    }

    private async markAsApplied(id: string): Promise<void> {
        const applied = await this.getAppliedMigrations();
        applied.push(id);
        await fs.ensureDir(path.dirname(this.migrationsFile));
        await fs.writeJson(this.migrationsFile, applied, { spaces: 2 });
    }

    private async createSnapshot(): Promise<void> {
        // Simple snapshot of critical config files before applying changes
        const timestamp = Date.now();
        const snapshotDir = path.join(DATA_DIR, 'snapshots', `pre_migration_${timestamp}`);
        
        logger.info(`[Migration] Creating snapshot at ${snapshotDir}...`);
        
        try {
            await fs.ensureDir(snapshotDir);
            // Copy critical files if they exist
            const criticalFiles = ['settings.json', 'servers.json', 'users.json'];
            
            for (const file of criticalFiles) {
                const src = path.join(DATA_DIR, file);
                if (await fs.pathExists(src)) {
                    await fs.copy(src, path.join(snapshotDir, file));
                }
            }
        } catch (err: any) {
            logger.error(`[Migration] Snapshot failed: ${err.message}`);
            // Decide if we want to block migration if snapshot fails. 
            // Better safe than sorry.
            throw new Error(`Migration snapshot failed: ${err.message}`);
        }
    }
}

export const migrationService = MigrationService.getInstance();
