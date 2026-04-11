# CraftCommand Node Agent — Docker Image
#
# Build:
#   docker build -t craftcommand-agent .
#
# Run:
#   docker run -d \
#     --name craftcommand-agent \
#     -e PANEL_URL=http://host.docker.internal:3001 \
#     -e NODE_ID=your-node-uuid \
#     -e NODE_SECRET=your-secret \
#     -v /opt/mc-servers:/app/servers \
#     craftcommand-agent

# ── Stage 1: Build ──
FROM node:20-slim AS builder

WORKDIR /build

# Copy package files first for better layer caching
COPY package*.json ./
RUN npm ci --production=false

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# ── Stage 2: Production ──
FROM node:20-slim

# Install Java for running Minecraft servers
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-21-jre-headless \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built output and production dependencies
COPY --from=builder /build/package*.json ./
RUN npm ci --production

COPY --from=builder /build/dist/ ./dist/

# Create server storage directory
RUN mkdir -p /app/servers

# Default environment variables
ENV NODE_ENV=production
ENV PANEL_URL=http://host.docker.internal:3001
ENV NODE_ID=docker-agent
ENV NODE_SECRET=change-me
ENV SERVERS_DIR=/app/servers

# Health check — agent should be connectable
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD node -e "const http = require('http'); http.get('http://localhost:3002/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))" || exit 1

# Expose agent health port (optional)
EXPOSE 3002

# Start the agent
CMD ["node", "dist/index.js", \
    "--panel-url", "${PANEL_URL}", \
    "--node-id", "${NODE_ID}", \
    "--secret", "${NODE_SECRET}", \
    "--servers-dir", "${SERVERS_DIR}"]

# Use shell form to expand env vars
ENTRYPOINT ["/bin/sh", "-c", "node dist/index.js --panel-url $PANEL_URL --node-id $NODE_ID --secret $NODE_SECRET --servers-dir $SERVERS_DIR"]
