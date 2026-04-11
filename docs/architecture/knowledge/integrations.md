# External Integrations

## Purpose

Handles cross-platform connectivity via Discord bot integration and outbound HMAC-signed Webhooks.

## Scope

- **Discord Bot**: Full bot lifecycle, slash command registry (`/start`, `/stop`, `/status`), and rich embed reporting.
- **Webhook System**: Generic outgoing HTTP notifications for server and system events with HMAC-SHA256 signing.
- **Event Mapping**: Translating `ProcessManager` and `BackupService` events into external notifications.

- **Cipher Integrity**: Discord tokens and Webhook secrets are never logged; retrieval is restricted to `SystemSettingsService`.
- **Message Integrity**: Outbound webhooks include the `X-CraftCommand-Signature` header (HMAC-SHA256).
- **Rate-Limiting**: Discord event reporting uses debouncing for high-frequency player events.
- **Fault Tolerance**: Webhooks are automatically disabled after 10 consecutive delivery failures.

## Key Flows

### 1. Discord Slash Command Execution

1. **Interaction**: User executes `/start <serverId>` in Discord.
2. **Authorization**: `DiscordService` verifies the user (if linked/allowed).
3. **Execution**: Calls `ServerService.startServer`.
4. **Feedback**: Posts a rich embed with the server's new status.

### 2. Webhook Event Dispatching

1. **Listen**: `WebhookService` listens for `SERVER_CRASH` or `BACKUP_COMPLETE`.
2. **Filter**: Matches events against enabled webhook triggers and `serverId` scope.
3. **Sign**: Calculates HMAC-SHA256 signature using the configured secret.
4. **Post**: Sends JSON payload to the target URL with a 5s timeout.

## Verified Entry Points / File Map

### backend/src/features/

- **Discord Bot**: [DiscordService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/integrations/DiscordService.ts)
- **Webhooks**: [WebhookService.ts](file:///c:/Users/user/Desktop/Craft-Commands/backend/src/features/system/WebhookService.ts)

## Operational Details
- **User-Agent**: Outgoing requests use `CraftCommand-Webhook/1.0`.
- **Reconnection**: `DiscordService` manages Gateway heartbeats and manual reconnection triggers.
- **Payload Structure**: JSON envelopes include `event`, `timestamp`, and `data` fields.
