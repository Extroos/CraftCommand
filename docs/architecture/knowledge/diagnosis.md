# Diagnostics & Automated Repair

## Purpose

Identifies server failures via tiered inference, perform Root Cause Analysis (RCA) to suppress redundant symptoms, and executes repair actions via the `AutomaticRepairManager`.

## Scope

- **Analysis**: Rule-based log parsing, crash report evaluation, and historical resource trend analysis.
- **Remediation**: 27+ verified "Heal" actions (config fixes, file repairs, binary reinstalls).
- **Proactive Modeling**: Memory/TPS trend forecasting and resource "Right-Sizing" advisory.
- **Diagnostics**: Multi-tier rule engine covering Infra, Loaders, and Game Logic.

## Invariants (Do Not Break)

- **Tiered Suppression**: Infrastructure issues (Tier 1) MUST suppress secondary symptoms (Tier 3).
- **Causality Map**: `DiagnosisBrain` uses a static map (e.g., `insufficient_ram` -> `tps_lag`) to prioritize root causes.
- **OS Safety Guard**: `adjustRam` actions MUST retain at least **2GB of physical RAM** for the Host OS.
- **Trend Confidence**: Predictive warnings (Tier 3) require a **Linear Regression R² > 0.5** to trigger.
- **FS Isolation**: All Automatic Repair actions MUST use `FileSystemManager` scoped to the server's directory.
- **Automation Guard**: Auto-heal is only permitted for rules with **>80% default confidence**.
- **Log Resilience**: Log analysis MUST be performed on pre-processed/truncated logs (max 2000 lines, de-duplicated) to prevent execution timeouts and event loop starvation during log spam events.

## Key Flows

### 1. Diagnosis Pipeline (Happy Path)

1.  **Trigger**: Logic-less crash detection or manual "Diagnose" request.
2.  **Tiered Evaluation**:
    - **Tier 1 (Infrastructure)**: Java binaries, Disk space, Port binding, Permissions, RAM availability.
    - **Tier 2 (Logic/Config)**: Mod loaders, `server.properties` corruption, duplicate mods.
    - **Tier 3 (Advisory)**: TPS degradation, entity lag, mod/plugin incompatibilities.
3.  **Root Cause Analysis**: Brain suppresses any result listed as an effect of a higher-priority match.
4.  **Remediation**: `AutomaticRepairManager` maps `ruleId` to specific `DiagnosisActions`.

### 2. Predictive Forecasting

- **OOM Prediction**: Uses `StatsRingBuffer` to calculate memory slope. Triggers WARNING if max memory hit projected within 10min.
- **TPS Degradation**: Tracks 5-minute TPS horizon; warns if trending below 15 TPS with R² > 0.4.
- **Disk Heuristics**: Calculates "Days Remaining" based on world growth and log accumulation.

## Feature Map & Verified Entry Points

### Core Logic

- **Brain (RCA)**: `DiagnosisBrain.ts` — Implements tiered inference and suppression logic.
- **Trend Engine**: `StatsRingBuffer.ts` — Sliding window buffer for linear regression modeling.
- **Crash Reader**: `CrashReportReader.ts` — Extracts stack traces and "Caused by" classes.

### Repair Actions

- **Port Recovery**: `resolvePortConflict` — Scans up to 10 ports and updates `server.properties` atomically.
- **Memory Fix**: `adjustRam` — Increments allocation by 1GB/2GB while respecting the 2GB OS reserve.
- **Forge Purge**: `enableEntityPurge` — Updates `forge-server.toml` (Modern) or `forge.cfg` (Legacy) to clear ticking mobs.
- **Identity Sync**: 100+ mod library mappings in `ModDiagnosisRules.ts` for instant dependency resolution.

### Guards

- **False Positive Guard**: `BadConfigRule` is ignored if "Done!" is detected in logs.
- **UDP Port Check**: `checkUDPPortBind` specifically for Bedrock/Geyser connectivity.
- **Permission Repair**: Platform-aware (chmod 755 on Darwin/Linux; skipped on Win32).

## Testing Checklist

- [x] Tier 1 (OOM) correctly suppresses Tier 3 (Watchdog).
- [ ] Predictive OOM triggers at 70% usage with a steep positive slope.
- [ ] Forge entity purge correctly distinguishes between world/serverconfig and world/config paths.
- [ ] Bedrock UDP port conflict triggers `REASSIGN_BEDROCK_PORT` action.
