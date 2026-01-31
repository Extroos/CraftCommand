# Appendix: HTTPS & Launcher Integration Plan

This document details the wiring between the `run_locally.bat` launcher, the Backend API, and the Frontend Wizard for the new **Remote Access** feature.

## 1. Launcher Updates (`run_locally.bat`)

The launcher will act as the entry point for users who are uncomfortable with command lines or manual config editing.

### New Menu Options

- **[4] HTTPS Setup**: (Existing) Generates Caddyfile or self-signed certs.
- **[5] Remote Access Setup**: (New) Opens the browser to `/settings/remote-access` (The Wizard).
- **[6] Emergency Disable**: (New)
  - Writes `{"app": {"remoteAccess": false}}` to `settings.json`.
  - Resets bind address to `127.0.0.1`.
  - Restarts the server.

## 2. Backend Implementation

### `RemoteAccessService`

A new service responsible for:

1.  **Safety Checks**: Verifying rate limits and audit logs are active BEFORE enabling.
2.  **Bind Management**:
    - Default: `localhost` (127.0.0.1)
    - Remote: `0.0.0.0` (Listen on all interfaces)
3.  **UPnP (Optional)**: Can optionally attempt to open ports automatically (if safe), but strictly opt-in.

### API Endpoints

- `GET /api/system/remote-access/status`: Returns current bind status and public reachability (ping-back).
- `POST /api/system/remote-access/enable`: Enables mode (requires Admin + 2FA/Password confirmation).
- `POST /api/system/remote-access/disable`: Disables mode immediately.

## 3. Frontend Wizard (`RemoteAccessWizard.tsx`)

A multi-step modal or page:

1.  **Risk Acknowledgement**: User must check "I understand the risks".
2.  **Method Selection**:
    - **VPN** (Recommended): Shows Tailscale/ZeroTier guide.
    - **Proxy** (Standard): Checks Caddy status.
    - **Direct** (Advanced): Checks Port Forwarding.
3.  **Verification**: Pings the server from an external API (e.g., `api.craft-commands.com/ping`) to verify visibility.

## 4. Integration Flow

1.  User selects **[5]** in Launcher.
2.  Launcher starts server (if not running) and opens `http://localhost:3000/settings/remote-access`.
3.  User completes Wizard.
4.  User clicks "Enable Remote Access".
5.  Backend validates safety requirements -> Updates `settings.json` -> Restarts HTTP Server on `0.0.0.0`.
6.  User is redirected to the new Public URL (or remains on localhost).
