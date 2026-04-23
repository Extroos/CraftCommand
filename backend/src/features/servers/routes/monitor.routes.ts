import express from 'express';
import { logger } from '../../../utils/logger';
import { verifyToken, requirePermission } from '../../../middleware/authMiddleware';
import { getServer, diagnoseServer, getServers, saveServer } from '../ServerService';
import { processManager } from '../../processes/ProcessManager';
import { ServerStatus } from '@shared/types';
import net from 'net';
import mcstatus from 'mcstatus';

const router = express.Router({ mergeParams: true });

// Note: query is NOT behind verifyToken in the original code, but we protect specific ones
// Actually, earlier code: `router.get('/:id/stats', verifyToken, requirePermission('server.view'), ...)`

// Query Server Status (Hardware Metrics + Diagnosis)
router.get('/stats', verifyToken, requirePermission('server.view'), async (req, res) => {
    const { id } = req.params;
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const stats = await processManager.getServerStats(id);
    const diagnosis = await diagnoseServer(id);
    
    // Map diagnosis to the legacy 'analysis' field for frontend compatibility
    const analysis = {
        status: diagnosis.some(r => r.severity === 'CRITICAL') ? 'CRITICAL' : (diagnosis.length > 0 ? 'WARNING' : 'HEALTHY'),
        issues: diagnosis.map(r => `⚠️ ${r.title}`),
        environment: {}
    };

    res.json({ ...stats, analysis, diagnosis });
});

// Query Server Status (Game Reachability)
// Note: Intentionally left open in original code (or handled by global middleware exception)
// For security, if this was public, we'll keep it public or match original.
// Actually, original code: `router.get('/:id/query', async (req, res) => {`
router.get('/query', async (req, res) => {
    const { id } = req.params as { id: string };
    const server = getServer(id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const cached = processManager.getCachedStatus(id);
    
    const response = {
        ...cached,
        status: cached.status || (processManager.isRunning(id) ? ServerStatus.STARTING : ServerStatus.OFFLINE),
        uptime: processManager.getUptime(id),
        tps: await processManager.getTPS(id),
        maxPlayers: server.maxPlayers || 20
    };

    const diagnosis = await diagnoseServer(id);
    const analysis = {
        status: diagnosis.some(r => r.severity === 'CRITICAL') ? 'CRITICAL' : (diagnosis.length > 0 ? 'WARNING' : 'HEALTHY'),
        issues: diagnosis.map(r => `⚠️ ${r.title}`),
        environment: {}
    };

    res.json({ ...response, analysis, diagnosis });

    // Background Refresh (Proactive)
    if (!processManager.isUpdatingStatus(id)) {
        processManager.setUpdatingStatus(id, true);
        (async () => {
             try {
                 const allServers = getServers(); 
                 const conflict = allServers.find((s: any) => s.port === server.port && s.id !== id && processManager.isRunning(s.id));
                 
                 if (conflict) {
                      processManager.updateCachedStatus(id, { online: false, players: 0, status: ServerStatus.OFFLINE });
                      if (server.status === ServerStatus.ONLINE) {
                          server.status = ServerStatus.OFFLINE;
                          saveServer(server);
                      }
                      return;
                 }

                 let status: any;
                 status = await mcstatus.checkStatus({ host: '127.0.0.1', port: server.port });
                 
                 if (!processManager.isRunning(id)) {
                     if (processManager.isStarting(id)) return;
                     processManager.updateCachedStatus(id, { online: false, status: ServerStatus.OFFLINE });
                     return; 
                 }

                 // mcstatus fields (checkStatus): players, max_players, ping, version
                 processManager.updateCachedStatus(id, {
                     online: true,
                     players: status.players,
                     playerList: [], // mcstatus simplified doesn't provide sample
                     maxPlayers: status.max_players,
                     latency: status.ping,
                     version: status.version
                 });

                 if (server.status !== ServerStatus.ONLINE && !processManager.isStarting(id)) {
                     server.status = ServerStatus.ONLINE;
                     saveServer(server);
                 }
             } catch (e) {
                 // Fallback for failed status (Port check or Query)
                 try {
                      // Attempt a simple TCP check as mcstatus.query is sometimes overkill for offline detection
                      const isPortOpen = await new Promise((resolve) => {
                          const socket = new net.Socket();
                          socket.setTimeout(500);
                          socket.on('connect', () => { socket.destroy(); resolve(true); });
                          socket.on('error', () => { socket.destroy(); resolve(false); });
                          socket.on('timeout', () => { socket.destroy(); resolve(false); });
                          socket.connect(server.port, '127.0.0.1');
                      });

                      if (!processManager.isRunning(id)) {
                         processManager.updateCachedStatus(id, { online: false, status: ServerStatus.OFFLINE });
                         return;
                      }

                      if (isPortOpen) {
                          processManager.updateCachedStatus(id, { online: true, latency: 1 });
                      } else {
                          const isRunning = processManager.isRunning(id);
                          processManager.updateCachedStatus(id, { 
                              online: isRunning, 
                              players: 0, 
                              playerList: [] 
                          });
                          
                          if (!isRunning) {
                              if (server.startTime || server.status !== ServerStatus.OFFLINE) {
                                  delete server.startTime;
                                  server.status = ServerStatus.OFFLINE;
                                  saveServer(server);
                              }
                          }
                      }
                 } catch (qe) {
                      // Silent fail for fallback
                 }
             } finally {
                 processManager.setUpdatingStatus(id, false);
             }
        })();
    }
});

// Get Server Logs
router.get('/logs', verifyToken, requirePermission('server.console.read'), async (req, res) => {
    const { id } = req.params;
    let logs = processManager.getLogs(id);

    if (logs.length === 0) {
        const server = getServer(id);
        if (server) {
             const path = require('path');
             const fs = require('fs-extra');
             const logPath = server.logLocation 
                ? path.resolve(server.workingDirectory, server.logLocation)
                : path.join(server.workingDirectory, 'logs', 'latest.log');
             
             if (await fs.pathExists(logPath)) {
                 try {
                     const { readLastLines } = require('../../../utils/logger');
                     logs = await readLastLines(logPath, 200);
                 } catch (e) {
                     logger.warn(`[API] Failed to read fallback logs for ${id}: ${e}`);
                 }
             }
        }
    }

    res.json(logs);
});

// Get Crash Report
router.get('/crash-report', verifyToken, requirePermission('server.files.read'), async (req, res) => {
    const { id } = req.params;
    const logs = processManager.getLogs(id);
    
    const diagnosis = await diagnoseServer(id);
    const mainIssue = diagnosis.find(d => d.severity === 'CRITICAL') || diagnosis[0];
    
    const analysis = mainIssue 
        ? `${mainIssue.title} - ${mainIssue.recommendation}`
        : 'Unknown Crash - Please check the console logs for "Exception" or "Error".';

    res.json({ analysis, logs: logs.slice(-50), diagnosis });
});

// Run Diagnosis
router.get('/diagnosis', verifyToken, requirePermission('server.view'), async (req, res) => {
    const { id } = req.params;
    try {
        const results = await diagnoseServer(id);
        res.json(results);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Test Diagnosis (Internal/Dev)
router.get('/test-diagnosis', async (req, res) => {
    const { id } = req.params as { id: string };
    try {
        const results = await diagnoseServer(id);
        res.json(results);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
