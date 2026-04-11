# API Reference (Technical)

CraftCommand utilizes a RESTful API for management and Socket.IO for real-time telemetry. All requests must be authenticated via a Bearer Token or API Key.

## Authentication

### Login
`POST /api/auth/login`
- **Payload**: `{ "email": "admin@example.com", "password": "password" }`
- **Response**: `{ "token": "JWT...", "partial": boolean }`
- **Note**: If `partial: true`, account has 2FA enabled. A second request to `/2fa/verify` is required.

### 2FA Verification
`POST /api/auth/2fa/verify`
- **Payload**: `{ "loginToken": "JWT", "code": "123456" }`
- **Response**: `{ "token": "FULL_JWT", "user": Object }`

## Server Management

### List Servers
`GET /api/servers`
- **Response**: `Array<ServerConfig>`

### Server Control
`POST /api/servers/:id/power`
- **Payload**: `{ "action": "START" | "STOP" | "KILL" | "RESTART" }`

### Console Command
`POST /api/servers/:id/command`
- **Payload**: `{ "command": "save-all" }`

### Resource Polling
`GET /api/servers/:id/stats`
- **Response**: `{ "cpu": number, "memory": number, "status": string }`

## Distributed Nodes

### Register Node (Node-to-Master)
`POST /api/nodes/register`
- **Payload**: `{ "hostname": string, "key": string, "version": string }`
- **Note**: This is used exclusively by the Node agent on startup to establish the handshake.

### Heartbeat
`POST /api/nodes/heartbeat`
- **Payload**: `{ "nodeId": string, "stats": { "cpu": number, "ram": number } }`

## Real-time Events (Socket.IO)

- **Channel**: `/console`
- **Event**: `log` -> `(data: { id: string, line: string, type: 'stdout'|'stderr' })`
- **Event**: `stats` -> `(data: { id: string, cpu: number, memory: number })`
