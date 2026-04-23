# CraftCommand Node Agent — Docker Image
#
# Build (RUN FROM ROOT):
#   docker build -t craftcommand-agent -f agent/Dockerfile .

# ── Stage 1: Build ──
FROM node:20-slim AS builder
WORKDIR /build

# Copy component package files
WORKDIR /build/agent
COPY agent/package*.json ./
WORKDIR /build/shared
COPY shared/package*.json ./

# Install dependencies
# 1. Shadow shared dependencies at root for cross-component resolution
RUN npm install fs-extra @types/fs-extra

# 2. Install component-specific dependencies (Fresh Resolution)
WORKDIR /build/agent
RUN rm -f package-lock.json && npm install
RUN mkdir -p dist

# Copy source and build
WORKDIR /build
COPY tsconfig.json ./
COPY agent/ ./agent/
COPY shared/ ./shared/

WORKDIR /build/agent
RUN npm run build && npm prune --omit=dev

# ── Stage 2: JRE Provider ──
FROM eclipse-temurin:21-jre AS jre-provider

# ── Stage 3: Production ──
FROM node:20-slim

# Install runtime tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    procps \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" | \
    tee /etc/apt/local.sources.list.d/docker.list > /dev/null \
    && apt-get update && apt-get install -y --no-install-recommends \
    docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Inject JRE from provider
ENV JAVA_HOME=/opt/java/openjdk
COPY --from=jre-provider $JAVA_HOME $JAVA_HOME
ENV PATH="${JAVA_HOME}/bin:${PATH}"

WORKDIR /app

# Copy pruned dependencies and built output
COPY --from=builder /build/agent/package*.json ./
COPY --from=builder /build/agent/node_modules ./node_modules
COPY --from=builder /build/agent/dist ./dist

# Create server storage directory
RUN mkdir -p /app/servers

# Default environment variables
ENV NODE_ENV=production
ENV PANEL_URL=http://backend:3001
ENV NODE_ID=docker-agent
ENV NODE_SECRET=change-me
ENV SERVERS_DIR=/app/servers

# Start the agent
ENTRYPOINT ["/bin/sh", "-c", "node dist/agent/src/index.js --panel-url $PANEL_URL --node-id $NODE_ID --secret $NODE_SECRET --servers-dir $SERVERS_DIR"]
