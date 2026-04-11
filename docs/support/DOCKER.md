# Docker Deployment & Containerization

Reference for containerized deployment of the Primary Panel and isolated server runners.

## 1. Deployment Specification

CraftCommand implements two containerization layers:
- **Panel Ingress**: The core process (backend/frontend) running within a managed container.
- **Isolated Runners**: Docker-based server engines that spawn child containers for specific Minecraft instances.

### Panel Launch Execution
```bash
docker run -d \
  --name craft-command \
  -p 3000:3000 \
  -p 25565:25565 \
  -v /opt/craft-command/data:/app/backend/data \
  -v /opt/craft-command/servers:/app/minecraft_servers \
  -v /var/run/docker.sock:/var/run/docker.sock \
  extroos/craft-command:latest
```

## 2. Persistence & Volumes

| Container Path | Purpose | Content Type |
| :--- | :--- | :--- |
| `/app/backend/data` | Configuration Root | Users, Settings, SQLite/JSON DB |
| `/app/minecraft_servers` | Working Directory | Server binaries, logs, worlds |
| `/var/run/docker.sock` | Socket Ingress | Required for nested runner spawning |

## 3. Network Configuration

- **Bridge Mode**: Default isolation; requires manual port mapping (`-p`).
- **Host Mode**: Unrestricted networking via `--network host`; direct port binding to host interfaces.

## 4. Resource Constraints

Resource limits are injected via the Docker Engine API during container creation:
- **CPU Isolation**: Implemented via `NanoCPUs` (10^9 units per CPU).
- **Memory Caps**: Hardware hard-caps enforced via the `Memory` constraint.

## 5. Diagnostic Requirements

For successful JVM monitoring and GC triggers within a containerized environment:
- **Capabilities**: The container must have `--cap-add=SYS_PTRACE` to access the JVM PID namespace.
- **Log Buffering**: Server `stdout` is buffered to the server working directory to enable panel-level log analysis.
