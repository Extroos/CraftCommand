CraftCommand Feature Plan
Velocity Proxy + Multi-Version Support (ViaVersion / ViaBackwards)

Mission
Add a first-class “Network Mode” using Velocity, and optionally enable multi-version client support so players on older/newer Java versions can join the same network.

This must match CraftCommand philosophy:
one-click, safe by default, prevents mistakes, explains problems, self-healing, auditable.

No duplication:
Reuse existing orchestration, runners, safety gates, diagnosis/healing core, audit, RBAC, file transfer, and distributed nodes.

---

Phase 0 — Repo Discovery (mandatory)
Before coding, agent must map:

- how server types are registered (Paper/Fabric/Forge/NeoForge)
- installer patterns (download, extract, configure, run)
- StartupManager preflight and how it blocks starts
- DiagnosisService and how rules are registered
- AutoHealingService action format
- RunnerFactory and how to add a new execution type cleanly
- UI flow for Create Server and Advanced Settings

Deliverable:
docs/network/velocity_discovery_map.md

---

Phase 1 — Add Server Type: Velocity Proxy
Goal: Velocity becomes a normal “server type” in CraftCommand.

Backend:

- Add server type enum/value: velocity
- Add installer entry “Velocity Proxy”
- Add config schema for velocity instances:
  - proxyPort (default 25565 or next free)
  - bind address (safe default per security model)
  - onlineMode / forwarding mode selection (default safe)
  - backend list (serverName -> host:port)

Installer:

- Download official Velocity proxy jar
- Create directory layout
- Generate start command (Java) like existing Java server types
- Generate velocity.toml with safe defaults
- Ensure console + stop/restart works using existing lifecycle pipeline

Frontend:

- Create Server wizard includes “Velocity Proxy”
- Proxy instances show clear “Proxy” badge

Deliverable:

- User can create/start/stop a Velocity proxy like any other server.

---

Phase 2 — Network Model: Proxy + Backends
Goal: Build a “Network” concept that links proxy to backend servers.

Data model:

- NetworkConfig: id, name, proxyServerId, backendServerIds, defaultServerId, routing policy
- Each backend ServerConfig gets:
  - networkId
  - role = backend
  - proxyId reference (for wiring and diagnostics)

UI:

- Create Network wizard:
  1. Create proxy
  2. Add backends (existing servers or create new)
  3. Set default server (lobby)
  4. Show join info (IP:port + commands)

Wiring:

- Update velocity.toml servers list automatically
- Ensure backend ports are unique and conflict-free

Deliverable:

- Players join proxy and can switch with /server <name>

---

Phase 3 — One-Click Multi-Version Support (ViaVersion Stack)
Goal: Optional toggle “Multi-Version Support” for the proxy.

Implementation approach:

- When enabled on a Velocity proxy:
  - auto-install ViaVersion on proxy
  - auto-install ViaBackwards on proxy
  - (optional) ViaRewind only if you explicitly want older legacy ranges

How to install:

- Define a “Proxy Plugin Manager” that is separate from “Paper/Spigot plugin manager”
  - This is important: Velocity plugins are different from Bukkit plugins.
  - Do NOT reuse Bukkit plugin workflows blindly.
- Download from official release sources (agent must choose reliable sources)
- Place jar(s) into Velocity plugins folder
- Restart proxy or hot-load if supported (assume restart)

UI:

- Toggle in proxy settings:
  - Multi-Version Support: OFF by default
  - When ON: shows what it does + limits (“new blocks won’t appear on old clients”)

Deliverable:

- Users can enable multi-version with one click, without manual downloads.

---

Phase 4 — Diagnosis Rules (must use old diagnosis core)
Goal: Prevent “it doesn’t work” confusion.

Add diagnosis rules for Velocity and Via\*:

Proxy rules:

- Port 25565 conflict
- Proxy bind address unreachable
- velocity.toml invalid or missing
- Proxy crash loop

Backend reachability rules:

- Proxy cannot reach backend host:port
- Backend port mismatch vs expected
- Backend not running
- Backend exposed publicly while proxy exists (warning)

Multi-version rules:

- ViaVersion missing when multi-version toggle is ON
- Via plugins present but not loaded (log signature)
- Client join fails due to unsupported protocol range (show guidance)
- Mods/plugins incompatible with Via translation (warn, explain)

Each diagnosis issue must include:

- explanation
- severity
- recommended fix
- optional one-click heal action

Deliverable:

- Errors become helpful, not guesswork.

---

Phase 5 — Auto-Healing Actions (safe only)
Add heal actions:

- Auto-pick next free port for proxy and update configs
- Re-sync velocity.toml backend list from panel truth
- Reinstall ViaVersion/ViaBackwards if missing/corrupt
- Restart proxy safely after config changes
- Detect and warn about exposing backends (do NOT auto-open WAN)

All heals must:

- write audit logs
- re-run diagnosis to verify health

Deliverable:

- “Fix” button actually fixes common network issues.

---

Phase 6 — Distributed Nodes Compatibility (if enabled)
Goal: Proxy and backends can run on different nodes.

Requirements:

- Scheduler can place proxy on node A and backends on nodes B/C
- velocity.toml must use correct reachable addresses (LAN IP / node address)
- Ensure file sync works for proxy plugins (Via jars) too
- Node capabilities must include “java” for velocity nodes

Deliverable:

- Network works across multiple machines.

---

Phase 7 — UX Polish (one-click standard)
Make the experience obvious:

- “Create Network” button
- Join card: “Connect to PROXY IP:PORT”
- Command hints: “/server lobby”
- Health panel shows:
  - proxy status
  - backend reachable count
  - multi-version ON/OFF badge

Header/dashboard must not confuse proxy vs backend:

- show “Proxy” tag
- show linked network name

Deliverable:

- Beginner-friendly flow, no wiki needed.

---

Phase 8 — E2E Tests (must exist)
Create a repeatable test matrix:

Core:

1. Create proxy, start proxy
2. Create backend, add to network, start backend
3. Verify proxy config includes backend
4. Stop backend -> diagnosis shows backend down, proxy stays up

Multi-version: 5) Enable Multi-Version toggle -> ViaVersion + ViaBackwards installed 6) Restart proxy -> diagnosis confirms Via loaded 7) Simulate “missing Via jar” -> rule detects and offers reinstall

Distributed: 8) Proxy on node A, backend on node B -> routing works, reachability check passes

Deliverable:
docs/network/walkthrough_velocity_multiversion.md
docs/network/test_matrix_velocity_multiversion.md

---

Definition of Done

- Velocity proxy is a first-class server type.
- Network linking is one-click and stable.
- Multi-version toggle installs ViaVersion stack automatically.
- Diagnosis/healing integrates via old core, no duplication.
- Dashboard/header UI clearly shows proxy/backends.
- Distributed nodes supported where applicable.
- Test matrix exists with pass/fail evidence.

End of plan.
