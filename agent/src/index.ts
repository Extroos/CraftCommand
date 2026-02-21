#!/usr/bin/env node
/**
 * CraftCommand Node Agent — v1.11.8 (Stabilized)
 * 
 * Standalone process that runs on remote hosts.
 * Connects to the CraftCommand panel and manages Minecraft servers locally.
 * 
 * Usage:
 *   node agent.js --panel-url http://panel:3001 --node-id <uuid> [--secret <token>]
 * 
 * Stabilization (Phase 19.5):
 *   - Health field units aligned with NodeHealth type (bytes, not MB/GB)
 *   - Input validation on agent:start
 *   - Log batching (50ms window) to prevent socket flooding
 *   - Reconnect state sync via agent:sync
 *   - Shutdown race guard
 *   - Global error handlers (unhandledRejection, uncaughtException)
 *   - Max server capacity limit
 *   - Env whitelist for spawned processes
 *   - Protocol version in handshake auth
 *   - Panel URL validation
 */

import { io, Socket } from 'socket.io-client';
import { spawn, ChildProcess } from 'child_process';
import si from 'systeminformation';
import { Command } from 'commander';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getCapabilities } from './capabilities';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const AGENT_VERSION = '1.11.8';
const PROTOCOL_VERSION = '1';
const LOG_BATCH_INTERVAL_MS = 50;
const LOG_BATCH_MAX_LINES = 20;
const SAFE_ENV_KEYS = new Set([
    'PATH', 'JAVA_HOME', 'SERVER_PORT', 'JAVA_VERSION',
    'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'APPDATA',
    'SystemRoot', 'SYSTEMROOT', 'windir',
    'LANG', 'LC_ALL', 'TERM'
]);

// ──────────────────────────────────────────────
// CLI Argument Parsing
// ──────────────────────────────────────────────

const program = new Command();
program
    .name('craftcommand-agent')
    .description('CraftCommand Node Agent — Remote server execution daemon')
    .requiredOption('--panel-url <url>', 'URL of the CraftCommand panel (e.g., http://192.168.1.10:3001)')
    .requiredOption('--node-id <id>', 'UUID of this node (from the panel enrollment)')
    .option('--secret <token>', 'Shared secret for authentication (Phase 2)')
    .option('--heartbeat-interval <ms>', 'Heartbeat interval in milliseconds', '15000')
    .option('--servers-dir <path>', 'Root directory for server working directories', './servers')
    .option('--max-servers <count>', 'Maximum number of concurrent servers', '10')
    .parse(process.argv);

const opts = program.opts();
const PANEL_URL: string = opts.panelUrl;
const NODE_ID: string = opts.nodeId;
const SECRET: string = opts.secret || '';
const HEARTBEAT_MS: number = parseInt(opts.heartbeatInterval, 10) || 15000;
const SERVERS_DIR: string = path.resolve(opts.serversDir || './servers');
const MAX_SERVERS: number = parseInt(opts.maxServers, 10) || 10;

// ──────────────────────────────────────────────
// Startup Validation (#11 — Panel URL validation)
// ──────────────────────────────────────────────

function validateStartupArgs(): void {
    try {
        new URL(PANEL_URL);
    } catch {
        console.error(`[Agent] ✗ Invalid --panel-url: "${PANEL_URL}". Expected a valid URL like http://192.168.1.10:3001`);
        process.exit(1);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(NODE_ID) && NODE_ID !== 'local') {
        console.error(`[Agent] ✗ Invalid --node-id: "${NODE_ID}". Expected a UUID format.`);
        process.exit(1);
    }

    if (MAX_SERVERS < 1 || MAX_SERVERS > 100) {
        console.error(`[Agent] ✗ Invalid --max-servers: ${MAX_SERVERS}. Must be between 1 and 100.`);
        process.exit(1);
    }
}

validateStartupArgs();

// ──────────────────────────────────────────────
// Logger
// ──────────────────────────────────────────────

const LOG_PREFIX = `[Agent:${NODE_ID.slice(0, 8)}]`;

function log(msg: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`${ts} ${LOG_PREFIX} ${msg}`);
}
function warn(msg: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    console.warn(`${ts} ${LOG_PREFIX} ⚠ ${msg}`);
}
function error(msg: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    console.error(`${ts} ${LOG_PREFIX} ✗ ${msg}`);
}

// ──────────────────────────────────────────────
// Local Process Manager (embedded NativeRunner)
// ──────────────────────────────────────────────

interface ManagedServer {
    process: ChildProcess;
    serverId: string;
    startTime: number;
    logBuffer: { line: string; type: 'stdout' | 'stderr' }[];
    flushTimer: NodeJS.Timeout | null;
}

const managedServers: Map<string, ManagedServer> = new Map();

// ── Log Batching (#3) ──

function flushLogBuffer(managed: ManagedServer, socket: Socket): void {
    if (managed.logBuffer.length === 0) return;

    // Send as a batch if multiple lines, single emit if just one
    if (managed.logBuffer.length === 1) {
        const entry = managed.logBuffer[0];
        socket.emit('agent:log', { serverId: managed.serverId, line: entry.line, type: entry.type });
    } else {
        socket.emit('agent:log-batch', {
            serverId: managed.serverId,
            lines: managed.logBuffer.map(e => ({ line: e.line, type: e.type }))
        });
    }
    managed.logBuffer = [];
}

function bufferLog(managed: ManagedServer, line: string, type: 'stdout' | 'stderr', socket: Socket): void {
    managed.logBuffer.push({ line, type });

    // Force flush if buffer is full
    if (managed.logBuffer.length >= LOG_BATCH_MAX_LINES) {
        if (managed.flushTimer) {
            clearTimeout(managed.flushTimer);
            managed.flushTimer = null;
        }
        flushLogBuffer(managed, socket);
        return;
    }

    // Schedule flush if not already pending
    if (!managed.flushTimer) {
        managed.flushTimer = setTimeout(() => {
            managed.flushTimer = null;
            flushLogBuffer(managed, socket);
        }, LOG_BATCH_INTERVAL_MS);
    }
}

// ── Env Whitelist (#9) ──

function buildSafeEnv(incoming: Record<string, string>): NodeJS.ProcessEnv {
    const safe: NodeJS.ProcessEnv = {};

    // Copy only safe keys from the host environment
    for (const key of SAFE_ENV_KEYS) {
        if (process.env[key]) safe[key] = process.env[key];
    }

    // Merge only safe keys from the panel's env
    for (const [key, value] of Object.entries(incoming)) {
        if (SAFE_ENV_KEYS.has(key) && typeof value === 'string') {
            safe[key] = value;
        }
    }

    return safe;
}

// ── Input Validation (#2) ──

function validateStartData(data: any): { serverId: string; runCommand: string; cwd: string; env: Record<string, string> } {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid start data: expected an object.');
    }
    if (!data.serverId || typeof data.serverId !== 'string' || data.serverId.trim().length === 0) {
        throw new Error('Invalid start data: serverId is required and must be a non-empty string.');
    }
    if (!data.runCommand || typeof data.runCommand !== 'string' || data.runCommand.trim().length === 0) {
        throw new Error('Invalid start data: runCommand is required and must be a non-empty string.');
    }
    // Reject obviously dangerous commands
    const dangerous = ['rm -rf', 'format ', 'del /s', 'rmdir /s', 'mkfs.', ':(){', 'dd if='];
    const cmdLower = data.runCommand.toLowerCase();
    for (const pattern of dangerous) {
        if (cmdLower.includes(pattern)) {
            throw new Error(`Refused to execute dangerous command containing "${pattern}".`);
        }
    }
    return {
        serverId: data.serverId.trim(),
        runCommand: data.runCommand.trim(),
        cwd: (data.cwd && typeof data.cwd === 'string') ? data.cwd.trim() : '',
        env: (data.env && typeof data.env === 'object') ? data.env : {}
    };
}

function startLocalServer(
    serverId: string,
    runCommand: string,
    cwd: string,
    env: Record<string, string>,
    socket: Socket
): void {
    if (managedServers.has(serverId)) {
        throw new Error(`Server "${serverId}" is already running on this node.`);
    }

    // #8 — Max server capacity check
    if (managedServers.size >= MAX_SERVERS) {
        throw new Error(
            `Node at capacity (${managedServers.size}/${MAX_SERVERS} servers). ` +
            `Cannot start another server. Increase --max-servers or free up resources.`
        );
    }

    // Ensure working directory exists
    const serverDir = cwd || path.join(SERVERS_DIR, serverId);
    if (!fs.existsSync(serverDir)) {
        fs.mkdirSync(serverDir, { recursive: true });
    }

    log(`Starting server "${serverId}" — Command: ${runCommand}`);
    log(`  Working directory: ${serverDir}`);

    const safeEnv = buildSafeEnv(env);

    const child = spawn(runCommand, {
        cwd: serverDir,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: safeEnv
    });

    const managed: ManagedServer = {
        process: child,
        serverId,
        startTime: Date.now(),
        logBuffer: [],
        flushTimer: null
    };

    managedServers.set(serverId, managed);

    // Write PID for zombie recovery
    if (child.pid) {
        try {
            fs.writeFileSync(path.join(serverDir, 'server.pid'), String(child.pid));
        } catch (e) {
            warn(`Failed to write PID for server "${serverId}": ${e}`);
        }
    }

    // Relay stdout/stderr with batching (#3)
    child.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
            bufferLog(managed, line, 'stdout', socket);
        }
    });

    child.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
            bufferLog(managed, line, 'stderr', socket);
        }
    });

    // Relay close event
    child.on('close', (code: number | null) => {
        log(`Server "${serverId}" exited with code ${code}`);
        // Clean up PID file
        try {
            const pidFile = path.join(serverDir, 'server.pid');
            if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
        } catch { /* ignore */ }

        // Flush any remaining buffered logs before close
        if (managed.flushTimer) {
            clearTimeout(managed.flushTimer);
            managed.flushTimer = null;
        }
        flushLogBuffer(managed, socket);
        managedServers.delete(serverId);
        socket.emit('agent:close', { serverId, code: code ?? -1 });
    });

    child.on('error', (err: Error) => {
        error(`Server "${serverId}" process error: ${err.message}`);
        // Clean up PID file
        try {
            const pidFile = path.join(serverDir, 'server.pid');
            if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
        } catch { /* ignore */ }

        if (managed.flushTimer) {
            clearTimeout(managed.flushTimer);
            managed.flushTimer = null;
        }
        managedServers.delete(serverId);
        socket.emit('agent:close', { serverId, code: -1 });
    });
}

/**
 * Adopts an existing process (Zombie Recovery).
 * We can't perfectly re-attach to stdout/stderr of an existing PID in Node easily
 * without complex OS-level wrappers, but we can at least track its life and kill it.
 */
function adoptLocalServer(
    serverId: string,
    pid: number,
    serverDir: string,
    socket: Socket
): void {
    log(`Adopting existing server "${serverId}" (PID: ${pid})`);

    // In a real production scenario, we might use 'tail -f logs/latest.log' 
    // to pipe output from a zombie. For this implementation, we'll focus 
    // on life-tracking and status reporting.

    const managed: ManagedServer = {
        // Mock child process for tracking
        process: { 
            pid, 
            kill: (sig?: string | number) => process.kill(pid, sig),
            stdin: { write: () => false } as any, // Not supported for adopted zombies
            stdout: null,
            stderr: null,
            on: () => {},
            emit: () => false
        } as any,
        serverId,
        startTime: Date.now(), // Approximate
        logBuffer: [],
        flushTimer: null
    };

    managedServers.set(serverId, managed);

    // Periodically check if PID is still alive
    const interval = setInterval(() => {
        try {
            process.kill(pid, 0); // Check if exists
        } catch {
            log(`Adopted server "${serverId}" (PID: ${pid}) has terminated.`);
            clearInterval(interval);
            managedServers.delete(serverId);
            socket.emit('agent:close', { serverId, code: 0 });
            
            // Clean up PID file
            try {
                const pidFile = path.join(serverDir, 'server.pid');
                if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
            } catch { /* ignore */ }
        }
    }, 5000);
}

async function scanAndAdoptZombies(socket: Socket): Promise<void> {
    if (!fs.existsSync(SERVERS_DIR)) return;

    log('Scanning for servers to adopt...');
    const items = fs.readdirSync(SERVERS_DIR);

    for (const serverId of items) {
        const serverDir = path.join(SERVERS_DIR, serverId);
        const pidFile = path.join(serverDir, 'server.pid');

        if (fs.existsSync(pidFile)) {
            try {
                const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
                if (isNaN(pid)) continue;

                // Basic liveness check
                try {
                    process.kill(pid, 0);
                    adoptLocalServer(serverId, pid, serverDir, socket);
                } catch {
                    // Stale PID file
                    log(`Removing stale PID file for "${serverId}"`);
                    fs.unlinkSync(pidFile);
                }
            } catch (e) {
                warn(`Error processing PID file for "${serverId}": ${e}`);
            }
        }
    }
}

function stopLocalServer(serverId: string, force: boolean = false): void {
    const managed = managedServers.get(serverId);
    if (!managed) {
        warn(`Cannot stop server "${serverId}" — not running on this node.`);
        return;
    }

    log(`Stopping server "${serverId}" (force=${force})`);

    if (force) {
        managed.process.kill('SIGKILL');
    } else {
        // Graceful: send "stop" command to stdin (Minecraft convention)
        managed.process.stdin?.write('stop\n');

        // Force kill after 30s if still running
        setTimeout(() => {
            if (managedServers.has(serverId)) {
                warn(`Server "${serverId}" did not stop gracefully — force killing.`);
                try { managed.process.kill('SIGKILL'); } catch { /* process may already be dead */ }
            }
        }, 30000);
    }
}

function killLocalServer(serverId: string, signal: NodeJS.Signals = 'SIGKILL'): void {
    const managed = managedServers.get(serverId);
    if (!managed) {
        warn(`Cannot kill server "${serverId}" — not running on this node.`);
        return;
    }

    log(`Sending signal ${signal} to server "${serverId}"`);
    try {
        managed.process.kill(signal);
    } catch (e) {
        warn(`Failed to send signal ${signal} to "${serverId}": ${e}`);
    }
}

function sendCommandToServer(serverId: string, command: string): void {
    const managed = managedServers.get(serverId);
    if (!managed) {
        throw new Error(`Server "${serverId}" is not running on this node.`);
    }
    if (!command || typeof command !== 'string') {
        throw new Error('Command must be a non-empty string.');
    }
    managed.process.stdin?.write(command + '\n');
}

// ──────────────────────────────────────────────
// Stats Collection (process-level)
// ──────────────────────────────────────────────

let sharedSnapshot: any = null;
let lastScanTime = 0;
let isScanning = false;

async function getSystemSnapshot(): Promise<any> {
    const now = Date.now();
    if (sharedSnapshot && (now - lastScanTime < 2500)) {
        return sharedSnapshot;
    }
    if (isScanning) {
        while (isScanning) {
            await new Promise(r => setTimeout(r, 100));
        }
        return sharedSnapshot;
    }
    isScanning = true;
    try {
        sharedSnapshot = await si.processes();
        lastScanTime = Date.now();
    } finally {
        isScanning = false;
    }
    return sharedSnapshot;
}

async function collectServerStats(serverId: string): Promise<{ cpu: number; memory: number; pid?: number }> {
    const managed = managedServers.get(serverId);
    if (!managed || !managed.process.pid) return { cpu: 0, memory: 0 };

    try {
        const procs = await getSystemSnapshot();
        const shellPid = managed.process.pid;

        // Walk the process tree to find the Java process
        const descendants: any[] = [];
        const queue = [shellPid];
        const seen = new Set<number>([shellPid]);

        while (queue.length > 0) {
            const parentId = queue.shift()!;
            const children = procs.list.filter((p: any) => p.parentPid === parentId);
            for (const c of children) {
                if (!seen.has(c.pid)) {
                    seen.add(c.pid);
                    descendants.push(c);
                    queue.push(c.pid);
                }
            }
        }

        let target = procs.list.find((p: any) => p.pid === shellPid);

        if (descendants.length > 0) {
            const workloadProc = descendants.find((p: any) =>
                p.command?.toLowerCase().includes('java') ||
                p.name?.toLowerCase().includes('java') ||
                p.command?.toLowerCase().includes('bedrock_server') ||
                p.name?.toLowerCase().includes('bedrock_server')
            );
            target = workloadProc || descendants.sort((a: any, b: any) => b.memRss - a.memRss)[0];
        }

        if (target) {
            return {
                cpu: target.cpu || 0,
                memory: (target.memRss || 0) / 1024, // KB → MB
                pid: target.pid
            };
        }
    } catch {
        // Stats collection failure is non-fatal
    }

    return { cpu: 0, memory: 0 };
}

// ──────────────────────────────────────────────
// System Health (node-level) — #1 Fixed units
// ──────────────────────────────────────────────

async function getNodeHealth(): Promise<{
    cpu: number;
    memoryUsed: number;
    memoryTotal: number;
    diskUsed: number;
    diskTotal: number;
    serverCount: number;
    uptime: number;
}> {
    try {
        const [cpuLoad, mem, disk] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize()
        ]);

        const primaryDisk = disk[0] || { used: 0, size: 0 };

        return {
            cpu: Math.round(cpuLoad.currentLoad * 10) / 10,
            memoryUsed: mem.used,       // Raw bytes (NodeHealth type expects bytes)
            memoryTotal: mem.total,     // Raw bytes
            diskUsed: primaryDisk.used,  // Raw bytes
            diskTotal: primaryDisk.size, // Raw bytes
            serverCount: managedServers.size,
            uptime: os.uptime()
        };
    } catch {
        return {
            cpu: 0,
            memoryUsed: 0,
            memoryTotal: os.totalmem(),
            diskUsed: 0,
            diskTotal: 0,
            serverCount: managedServers.size,
            uptime: os.uptime()
        };
    }
}

// ──────────────────────────────────────────────
// Socket.IO Connection to Panel
// ──────────────────────────────────────────────

let shutdownCalled = false; // #5 — Shutdown race guard

function connect(): void {
    log(`Connecting to panel: ${PANEL_URL}/agent`);
    log(`Node ID: ${NODE_ID}`);
    log(`Servers directory: ${SERVERS_DIR}`);
    log(`Max servers: ${MAX_SERVERS}`);

    const socket = io(`${PANEL_URL}/agent`, {
        auth: {
            nodeId: NODE_ID,
            secret: SECRET,
            protocolVersion: PROTOCOL_VERSION,   // #10
            agentVersion: AGENT_VERSION           // #10
        },
        reconnection: true,
        reconnectionDelay: 3000,
        reconnectionDelayMax: 30000,
        reconnectionAttempts: Infinity,
        timeout: 10000,
        transports: ['websocket', 'polling']
    });

    // ── Connection Events ──



// ...

    async function reportCapabilities() {
        try {
            const caps = await getCapabilities();
            socket.emit('agent:capabilities', caps);
            log(`  Capabilities sent: Java=${caps.java || 'N/A'}, Docker=${caps.docker}, Node=${caps.node}`);
            return caps;
        } catch (e: any) {
            warn(`  Failed to check capabilities: ${e.message}`);
            return null;
        }
    }

    socket.on('connect', async () => {
        log(`✓ Connected to panel! Socket ID: ${socket.id}`);
        
        // #12 — Zombie Adoption: Find servers that were running before agent crash/restart
        await scanAndAdoptZombies(socket);

        log(`  Running servers: ${managedServers.size}`);

        // Phase 3: Send Capabilities
        await reportCapabilities();

        // #4 — Reconnect state sync: tell the panel which servers we're running
        if (managedServers.size > 0) {
            const runningServers = Array.from(managedServers.keys());
            log(`  Syncing ${runningServers.length} running server(s) with panel...`);
            socket.emit('agent:sync', { serverIds: runningServers });
        }
    });

    socket.on('connect_error', (err: Error) => {
        error(`Connection failed: ${err.message}`);
    });

    socket.on('disconnect', (reason: string) => {
        warn(`Disconnected from panel: ${reason}`);
        if (reason === 'io server disconnect') {
            // Server intentionally disconnected us — reconnect after delay
            setTimeout(() => socket.connect(), 5000);
        }
    });

    // ── Panel → Agent Commands ──

    /**
     * Phase 3: Fix Capability Command
     * Triggered when user clicks "Fix" in the panel UI.
     */
    socket.on('agent:fix', async (data: any, ack: (response: any) => void) => {
        const { capability } = data;
        const isWindows = os.platform() === 'win32';
        
        log(`Received FIX command for capability: "${capability}"`);

        try {
            let cmd = '';
            let msg = '';

            if (capability === 'java') {
                if (isWindows) {
                    cmd = 'winget install Microsoft.OpenJDK.21 --accept-package-agreements --accept-source-agreements';
                    msg = 'Installing OpenJDK 21 via winget...';
                } else {
                    throw new Error('Automatic Java installation is currently only supported on Windows.');
                }
            } else if (capability === 'docker') {
                if (isWindows) {
                    cmd = 'winget install Docker.DockerDesktop --accept-package-agreements --accept-source-agreements';
                    msg = 'Installing Docker Desktop via winget...';
                } else {
                    throw new Error('Automatic Docker installation is currently only supported on Windows.');
                }
            } else if (capability === 'git') {
                if (isWindows) {
                    cmd = 'winget install Git.Git --accept-package-agreements --accept-source-agreements';
                    msg = 'Installing Git via winget...';
                } else {
                    throw new Error('Automatic Git installation is currently only supported on Windows.');
                }
            } else {
                throw new Error(`Unknown capability: "${capability}"`);
            }

            log(`Fix Action: ${msg}`);
            
            // Run the fix command
            const child = spawn(cmd, { shell: true, stdio: 'inherit' });
            
            child.on('close', async (code) => {
                if (code === 0) {
                    log(`✓ Fix successful: ${capability}`);
                    // Refresh caps after fix
                    await reportCapabilities();
                    if (ack) ack({ ok: true, message: 'Fix applied successfully.' });
                } else {
                    error(`✗ Fix failed for ${capability} (Exit code: ${code})`);
                    if (ack) ack({ error: `Installation failed with exit code ${code}.` });
                }
            });

        } catch (err: any) {
            error(`Failed to apply fix for ${capability}: ${err.message}`);
            if (ack) ack({ error: err.message });
        }
    });

    socket.on('agent:start', async (data: any, ack: (response: any) => void) => {
        try {
            // #2 — Input validation
            const validated = validateStartData(data);
            log(`Received START command for server "${validated.serverId}"`);
            startLocalServer(validated.serverId, validated.runCommand, validated.cwd, validated.env, socket);
            if (ack) ack({ ok: true });
        } catch (err: any) {
            error(`Failed to start: ${err.message}`);
            if (ack) ack({ error: err.message });
        }
    });

    socket.on('agent:stop', (data: any, ack: (response: any) => void) => {
        const serverId = data?.serverId;
        const force = data?.force || false;
        log(`Received STOP command for server "${serverId}" (force=${force})`);
        try {
            if (!serverId || typeof serverId !== 'string') {
                throw new Error('Invalid serverId.');
            }
            stopLocalServer(serverId, force);
            if (ack) ack({ ok: true });
        } catch (err: any) {
            error(`Failed to stop "${serverId}": ${err.message}`);
            if (ack) ack({ error: err.message });
        }
    });

    socket.on('agent:kill', (data: any, ack: (response: any) => void) => {
        const serverId = data?.serverId;
        const signal = data?.signal || 'SIGKILL';
        log(`Received KILL command for server "${serverId}" (signal=${signal})`);
        try {
            if (!serverId || typeof serverId !== 'string') {
                throw new Error('Invalid serverId.');
            }
            killLocalServer(serverId, signal as NodeJS.Signals);
            if (ack) ack({ ok: true });
        } catch (err: any) {
            error(`Failed to kill "${serverId}": ${err.message}`);
            if (ack) ack({ error: err.message });
        }
    });

    /**
     * Phase 21: Remote Shutdown Command
     * Allows the panel to remotely terminate the agent process.
     */
    socket.on('agent:shutdown', (data: any, ack: (response: any) => void) => {
        log('Received SHUTDOWN command from panel.');
        
        if (ack) ack({ ok: true, message: 'Agent shutting down...' });

        // Set flag to prevent reconnect attempts during shutdown
        shutdownCalled = true;

        // Give time for ack to flush
        setTimeout(() => {
            log('👋 Agent shutting down now.');
            process.exit(0);
        }, 500);
    });

    socket.on('agent:command', (data: any, ack: (response: any) => void) => {
        try {
            if (!data?.serverId || typeof data?.serverId !== 'string') {
                throw new Error('Invalid serverId.');
            }
            sendCommandToServer(data.serverId, data.command);
            if (ack) ack({ ok: true });
        } catch (err: any) {
            error(`Failed to send command to "${data?.serverId}": ${err.message}`);
            if (ack) ack({ error: err.message });
        }
    });

    // ── File Transfer Handlers (Phase 21) ──

    // Track in-progress file transfers: serverId → { chunks buffer }
    const activeTransfers: Map<string, Map<string, Buffer[]>> = new Map();

    /**
     * Security Helper: Ensure path is within the server directory
     */
    function resolveSafePath(serverId: string, relativePath: string): string {
        const serverDir = path.resolve(SERVERS_DIR, serverId);
        const targetPath = path.resolve(serverDir, relativePath);
        
        // Critical: Prevent traversal out of server dir
        if (!targetPath.startsWith(serverDir)) {
            throw new Error(`Security Violation: Path "${relativePath}" escapes server directory.`);
        }
        return targetPath;
    }





    socket.on('agent:file-begin', (data: any, ack: (response: any) => void) => {
        try {
            const { serverId, manifest } = data;
            if (!serverId || !Array.isArray(manifest)) {
                throw new Error('Invalid file-begin data.');
            }

            const serverDir = path.join(SERVERS_DIR, serverId);
            if (!fs.existsSync(serverDir)) {
                fs.mkdirSync(serverDir, { recursive: true });
            }

            // Determine which files the agent needs (hash diff)
            const needed: string[] = [];
            for (const entry of manifest) {
                // Security check: validate relativePath
                const filePath = resolveSafePath(serverId, entry.relativePath);

                if (!fs.existsSync(filePath)) {
                    needed.push(entry.relativePath);
                    continue;
                }
                // Compare hash
                try {
                    const existing = fs.readFileSync(filePath);
                    const existingHash = crypto.createHash('sha256').update(existing).digest('hex');
                    if (existingHash !== entry.hash) {
                        needed.push(entry.relativePath);
                    }
                } catch {
                    needed.push(entry.relativePath);
                }
            }

            activeTransfers.set(serverId, new Map());
            log(`[FileTransfer] Manifest received for "${serverId}": ${manifest.length} files, ${needed.length} need transfer`);

            if (ack) ack({ ok: true, needed });
        } catch (err: any) {
            error(`[FileTransfer] file-begin error: ${err.message}`);
            if (ack) ack({ error: err.message });
        }
    });

    socket.on('agent:file-chunk', (data: any, ack: (response: any) => void) => {
        try {
            const { serverId, relativePath, chunkIndex, totalChunks, data: chunkData, hash } = data;
            if (!serverId || !relativePath || chunkData === undefined) {
                throw new Error('Invalid file-chunk data.');
            }

            let transfer = activeTransfers.get(serverId);
            if (!transfer) {
                transfer = new Map();
                activeTransfers.set(serverId, transfer);
            }

            let chunks = transfer.get(relativePath);
            if (!chunks) {
                chunks = [];
                transfer.set(relativePath, chunks);
            }

            chunks[chunkIndex] = Buffer.from(chunkData, 'base64');

            // If all chunks received, write file
            if (chunks.filter(Boolean).length === totalChunks) {
                const fullContent = Buffer.concat(chunks);
                // Security check
                const filePath = resolveSafePath(serverId, relativePath);

                // Ensure parent directory exists
                const fileDir = path.dirname(filePath);
                if (!fs.existsSync(fileDir)) {
                    fs.mkdirSync(fileDir, { recursive: true });
                }

                // Verify hash if provided
                if (hash) {
                    const receivedHash = crypto.createHash('sha256').update(fullContent).digest('hex');
                    if (receivedHash !== hash) {
                        throw new Error(`Hash mismatch for ${relativePath}: expected ${hash.slice(0, 12)}..., got ${receivedHash.slice(0, 12)}...`);
                    }
                }

                fs.writeFileSync(filePath, fullContent);
                transfer.delete(relativePath);
                log(`[FileTransfer] ✓ Received: ${relativePath} (${Math.round(fullContent.length / 1024)}KB)`);
            }

            if (ack) ack({ ok: true });
        } catch (err: any) {
            error(`[FileTransfer] file-chunk error: ${err.message}`);
            if (ack) ack({ error: err.message });
        }
    });

    socket.on('agent:file-end', (data: any, ack: (response: any) => void) => {
        try {
            const { serverId } = data;
            activeTransfers.delete(serverId);
            log(`[FileTransfer] ✓ Transfer complete for "${serverId}"`);
            if (ack) ack({ ok: true });
        } catch (err: any) {
            error(`[FileTransfer] file-end error: ${err.message}`);
            if (ack) ack({ error: err.message });
        }
    });

    // ── Heartbeat Loop ──

    const heartbeatInterval = setInterval(async () => {
        if (!socket.connected) return;

        try {
            const health = await getNodeHealth();
            socket.emit('agent:heartbeat', { health });
        } catch (err: any) {
            warn(`Heartbeat failed: ${err.message}`);
        }
    }, HEARTBEAT_MS);

    // ── Stats Reporting Loop ──

    const statsInterval = setInterval(async () => {
        if (!socket.connected) return;

        for (const [serverId] of managedServers) {
            try {
                const stats = await collectServerStats(serverId);
                if (stats.cpu > 0 || stats.memory > 0) {
                    socket.emit('agent:stats', {
                        serverId,
                        cpu: stats.cpu,
                        memory: stats.memory,
                        pid: stats.pid
                    });
                }
            } catch {
                // Non-fatal
            }
        }
    }, 3000);

    // ── Graceful Shutdown (#5 — race guard) ──

    const shutdown = () => {
        if (shutdownCalled) return; // Prevent re-entry
        shutdownCalled = true;

        log('Shutting down agent...');
        clearInterval(heartbeatInterval);
        clearInterval(statsInterval);

        // Stop all managed servers gracefully
        for (const [serverId, managed] of managedServers) {
            log(`Stopping server "${serverId}" before exit...`);
            try {
                managed.process.stdin?.write('stop\n');
            } catch {
                // Best effort
            }
        }

        // Give servers 5s to stop, then force exit
        setTimeout(() => {
            for (const [, managed] of managedServers) {
                try {
                    managed.process.kill('SIGKILL');
                } catch { /* ignore */ }
            }
            socket.disconnect();
            process.exit(0);
        }, 5000);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // #6 — Global error handlers
    process.on('uncaughtException', (err) => {
        error(`Uncaught exception: ${err.message}`);
        error(err.stack || '');
        shutdown();
    });

    process.on('unhandledRejection', (reason: any) => {
        error(`Unhandled rejection: ${reason?.message || reason}`);
        // Don't shutdown on unhandled rejections — just log
    });
}

// ──────────────────────────────────────────────
// Entry Point
// ──────────────────────────────────────────────

log('═══════════════════════════════════════════');
log(`  CraftCommand Node Agent v${AGENT_VERSION}`);
log('═══════════════════════════════════════════');
log(`  Host:       ${os.hostname()}`);
log(`  Platform:   ${os.platform()} ${os.arch()}`);
log(`  CPUs:       ${os.cpus().length} cores`);
log(`  Memory:     ${Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10} GB`);
log(`  Protocol:   v${PROTOCOL_VERSION}`);
log(`  Max Servers: ${MAX_SERVERS}`);
log('═══════════════════════════════════════════');

// Ensure servers directory exists
if (!fs.existsSync(SERVERS_DIR)) {
    fs.mkdirSync(SERVERS_DIR, { recursive: true });
    log(`Created servers directory: ${SERVERS_DIR}`);
}

connect();
