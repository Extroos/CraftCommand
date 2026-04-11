# Process Lifecycle & Supervision

Technical specification of Minecraft server process management, crash recovery, and application shutdown sequences.

---

## How Servers Are Started

When you click "Start" in the panel UI:

```
1. ServerService.startServer(id)
   │
2. ├─ Acquires an operation lock (prevents double-start)
   ├─ Validates server config (port range, RAM, etc.)
   ├─ Clears stale diagnosis cache
   │
3. └─ StartupManager.startServer(server)
      │
4.    ├─ Resolves Java path (auto-detects or uses configured version)
      ├─ Builds the run command:
      │     java -Xms{ram}G -Xmx{ram}G -jar server.jar nogui
      │
5.    └─ ProcessManager.spawn()
           │
6.         ├─ child_process.spawn(command, { cwd: serverDir })
           ├─ Pipes stdout/stderr to log buffer
           ├─ Emits status: STARTING → ONLINE
           └─ Starts health monitoring
```

**Process Isolation**: Minecraft servers be executed as child processes of the Node.js backend. Process lifecycle state is dependent on the Primary Panel or Node Agent runtime.

---

## What Happens When a Server Crashes

```
1. child_process emits 'close' event with non-zero exit code
   │
2. ProcessManager marks server as CRASHED
   │
3. AutomaticRepairService.initiateRecovery(serverId)
   │
4. ├─ TRIAGE: Read last 1,000 log lines
   │   └─ DiagnosisService.diagnose() checks 40+ regex patterns
   │
5. ├─ REPAIR (if a known fix exists):
   │   ├─ EULA not accepted → auto-accept
   │   ├─ Port in use → kill ghost process or reassign
   │   ├─ Java version mismatch → switch Java binary
   │   ├─ Corrupted mod → quarantine the file
   │   ├─ Missing dependency → install it
   │   └─ ... (20+ auto-fix actions)
   │
6. ├─ SCRUB: Force-stop if still running
   │
7. ├─ RESTART: Start the server again
   │
8. └─ VERIFY: Wait (with exponential backoff) to check if healthy
        │
        ├─ Success → Reset crash counter, mark ONLINE
        │
        └─ Failure → Increment crash counter
             │
             └─ After 3 consecutive failures → SAFE MODE
                 (Server stops restarting. Manual review required.)
```

### Backoff Timing

Each recovery attempt waits longer before verifying:
- Attempt 1: 60 seconds
- Attempt 2: 120 seconds
- Attempt 3: 240 seconds (then enters Safe Mode if still failing)

Maximum backoff: 5 minutes.

---

## What Happens on Reboot

### Without a Service Manager (default)

```
1. Machine reboots
2. CraftCommand backend is NOT running → All Minecraft servers are down
3. You must manually run:
   - Windows: run_CraftCommand.bat
   - Linux:   ./run_CraftCommand.sh
4. On startup, backend checks which servers were marked "autoStart: true"
5. Those servers are automatically started
```

### With systemd (Linux)

```
1. Machine reboots
2. systemd starts craftcommand-panel.service automatically
3. Backend finds servers with autoStart=true
4. Those servers are started
5. Everything is back online without manual intervention
```

### With NSSM (Windows)

```
1. Machine reboots
2. Windows Service Manager starts CraftCommandPanel
3. Same auto-start logic applies
4. Back online without manual intervention
```

---

## The Local Agent

CraftCommand runs an "embedded agent" as a child process of the backend. This agent is what actually manages Minecraft server processes on the local machine.

```
Backend starts
  └─ LocalAgentManager.initialize()
      └─ spawn('node', ['agent/dist/index.js', '--panel-url', 'http://127.0.0.1:3001', ...])
```

### Agent Crash Recovery

If the local agent crashes, the LocalAgentManager restarts it with **exponential backoff**:

| Attempt | Delay |
|---------|-------|
| 1 | 1 second |
| 2 | 2 seconds |
| 3 | 4 seconds |
| 4 | 8 seconds |
| 5 | 16 seconds |

After **5 consecutive crashes**, the agent enters **Safe Mode** and stops restarting. To retry, toggle "Distributed Nodes" off and on in Settings.

If the agent stays alive for 60 seconds, the failure counter resets.

---

## Process Supervision Summary

| Component | Supervision Method | Auto-restart? |
|---|---|---|
| Panel backend | systemd / NSSM / manual | With systemd/NSSM |
| Local agent | LocalAgentManager (built-in) | Yes (exponential backoff) |
| Minecraft servers | AutomaticRepairService (built-in) | Yes (3 attempts before Safe Mode) |
| Remote agents | systemd on each host | With systemd |

---

## 5. Termination Sequence

Upon receipt of `SIGINT` (Ctrl+C) or `SIGTERM` (systemd stop), the application executes the following shutdown order:

1. **Ingress**: Stop accepting new HTTP connections.
2. **Services**: Orderly closure of Discord, Update, and FileWatcher modules.
3. **Runners**: Graceful termination of all Minecraft instances (sends `stop`, 30s timeout, then `SIGKILL`).
4. **Exit**: Process exit.

This sequence ensures world data consistency via the Minecraft `save-all` and `stop` procedures.
