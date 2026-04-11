# Automated Task Scheduling

## Purpose

Manages recurring server tasks (e.g., automated backups, scheduled restarts) via a technical 5-field cron system.

## Scope

- **Cron Parsing**: Resolving standard cron expressions including named days (`SUN-SAT`) and months (`JAN-DEC`).
- **Task Orchestration**: Executing automated actions like `START_SERVER`, `STOP_SERVER`, `RESTART_SERVER`, and `CREATE_BACKUP`.
- **State Management**: Calculating "Next Run" times and persisting task configurations in `schedules.json`.
- **Persistence**: Managing the `scheduleRepository` for CRUD operations on tasks.

## Invariants (Do Not Break)

- **Timezone Awareness**: All scheduling is based on the host system's local time.
- **Minute-Precision**: The scheduler sweeps once every 60 seconds. Tasks scheduled for the SAME minute MUST NOT double-trigger.
- **Next-Run Projection**: After a task completes, the `nextRun` timestamp MUST be updated to the future minute that matches the cron expression.
- **Fail-Safe Processing**: Brute-force "Next Run" calculation is capped at 7 days to prevent infinite loops on impossible expressions.

## Key Flows

### 1. Scheduler Logic

1. **Trigger**: `setInterval` (60s).
2. **Analysis**: Compares `now` against all tasks where `enabled=true`.
3. **Action**: If `now >= nextRun`, triggers the action (e.g., calls `backupService.createBackup`).
4. **Update**: Calculates the new `nextRun` and saves the state.

### 2. Cron Matching

- **Wildcards**: `*` matches any value.
- **Steps**: `*/15` matches 0, 15, 30, 45.
- **Ranges**: `1-5` matches 1, 2, 3, 4, 5.
- **Named Days**: `MON-FRI` resolves to `1-5`.

## Verified Entry Points / File Map

### backend

- **Core Orchestrator**: [ScheduleService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/scheduling/ScheduleService.ts)
- **Data Repository**: `backend/src/storage/ScheduleRepository.ts`
- **Route Handlers**: `backend/src/features/scheduling/scheduling.routes.ts`

### frontend

- **Schedule Manager**: `frontend/src/features/scheduling/ScheduleManager.tsx`
- **Schedule Editor**: `frontend/src/features/scheduling/TaskForm.tsx`

## Execution Constraints
- **Validation**: Cron expressions are verified for standard 5-field syntax before persistence.
- **Auditing**: History is maintained via `lastRun` timestamps and `lastStatus` (SUCCESS/FAIL) flags.
- **Timezone**: All operations are synchronized to the host system clock.

## Testing Checklist + Done

- [x] Verify `*/5` cron triggers every 5 minutes accurately.
- [x] Verify `SUN` named day resolves correctly to 0.
- [ ] Test behavior when a server is OFFLINE but a RESTART task triggers (should attempt START).
- [ ] Verify `nextRun` is correctly calculated after a system clock change.
