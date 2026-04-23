# Docker Deployment

How to run CraftCommand and its server instances inside Docker containers.

## Quick Start

```bash
cd Craft-Commands
docker-compose up -d
```

This starts three containers: the frontend (port 3000), the backend (port 3001), and a local agent.

## Running the Panel Standalone

If you prefer a single container without docker-compose:

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

## Volumes

| Container Path | What It Stores | Why It Matters |
|---|---|---|
| `/app/backend/data` | Users, settings, JSON/SQLite database | Persists your panel configuration across container recreations |
| `/app/minecraft_servers` | Server JARs, world files, configs | Persists your actual Minecraft server data |
| `/var/run/docker.sock` | Docker socket (host mount) | Required if you want CraftCommand to create isolated containers per Minecraft server |

## Network Modes

- **Bridge (default)**: Each container gets its own network. You must map ports with `-p`. Recommended for most setups.
- **Host (`--network host`)**: Container shares the host's network directly. Simpler port management but no network isolation.

## Resource Limits

When CraftCommand creates Docker containers for individual Minecraft servers, it applies the resource limits you set in the panel UI:
- **CPU**: Set via Docker's `NanoCPUs` parameter (e.g., 2 CPUs = `2000000000`)
- **Memory**: Hard cap via Docker's `Memory` parameter (e.g., `4g` for 4 GB)

## Requirements for JVM Monitoring

If you want the panel to read JVM metrics (GC pauses, heap usage) from containerized Minecraft servers:
- Add `--cap-add=SYS_PTRACE` to the Minecraft container so the panel can access the JVM process
- Server console output (`stdout`) is buffered to the server's working directory for log analysis
