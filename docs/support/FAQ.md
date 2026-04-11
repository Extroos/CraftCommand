# Frequently Asked Questions (FAQ)

## 1. Core Functionality

### License and Usage
CraftCommand is open-source under the AGPLv3 license. It is available for both personal and production environments without licensing fees.

### Modpack Management
The system utilizes the Modrinth API for recursive dependency resolution.
- **Environment Filtering**: Projects tagged as `client` but `server-unsupported` are automatically quarantined in the `_client_mods/` directory to prevent startup failures.

### Java Versioning
CraftCommand manages the Java runtime environment per-server:
- **v1.21.x**: Java 21+
- **v1.18 - v1.20**: Java 17
- **v1.8 - v1.16**: Java 8/11

## 2. Distributed Architecture

### Node Enrollment Protocol
The platform uses a secure, time-limited Join Token (15m window) for node enrollment.
- **Identity Issuance**: The agent uses the token to retrieve persistent Ed25519 identity strings via WebSocket.
- **Scaling**: The Primary Panel supports N-count physical machines (Nodes) within the registry.

### Storage Optimization
- **Default**: Flat-file JSON (`data/`).
- **High Concurrency**: SQLite is available as an alternative storage provider for deployments requiring higher read/write parallelism or improved crash resilience.

## 3. Operations & Safety

### Credentials Recovery
Administrative credentials can be reset by applying a BCrypt hash directly to the `password` field in `backend/data/users.json`.

### Network Security
- **Visibility**: The panel binds to `127.0.0.1` by default. Remote access requires explicit binding to `0.0.0.0` or the use of an outbound reverse tunnel (Cloudflare).
- **Hardening**: We recommend TLS termination via Caddy or Nginx for all production environments.
