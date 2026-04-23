# CraftCommand Unified Backend — Docker Image
#
# Build (RUN FROM ROOT):
#   docker build -t craftcommand-backend -f backend/Dockerfile .

# ── Stage 1: Frontend Build ──
FROM node:20-slim AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN rm -f package-lock.json && npm install
RUN mkdir -p dist
COPY frontend/ ./
COPY shared/ ../shared/
RUN npm run build

# ── Stage 2: Backend Build ──
FROM node:20-slim AS backend-builder
WORKDIR /build

# Copy component package files
WORKDIR /build/backend
COPY backend/package*.json ./
WORKDIR /build/shared
COPY shared/package*.json ./

# Install dependencies
# 1. Shadow shared dependencies at root for cross-component resolution
RUN npm install fs-extra @types/fs-extra

# 2. Install component-specific dependencies (Fresh Resolution)
WORKDIR /build/backend
RUN rm -f package-lock.json && npm install
RUN mkdir -p dist

# Copy source and build
WORKDIR /build
COPY tsconfig.json ./
COPY backend/ ./backend/
COPY shared/ ./shared/

WORKDIR /build/backend
RUN npm run build && npm prune --omit=dev

# ── Stage 4: JRE Provider ──
FROM eclipse-temurin:21-jre AS jre-provider

# ── Stage 5: Production ──
FROM node:20-slim
WORKDIR /app

# Install runtime tools (curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Inject JRE from provider
ENV JAVA_HOME=/opt/java/openjdk
COPY --from=jre-provider $JAVA_HOME $JAVA_HOME
ENV PATH="${JAVA_HOME}/bin:${PATH}"

# Copy built artifacts and pruned dependencies
COPY --from=backend-builder /build/backend/package*.json ./
COPY --from=backend-builder /build/backend/node_modules ./node_modules
COPY --from=backend-builder /build/backend/dist ./dist
COPY --from=backend-builder /build/shared ./dist/shared

# Copy frontend assets to where backend expects them (web/current)
COPY --from=frontend-builder /frontend/dist ./web/current

# Default environment variables
ENV NODE_ENV=production
# Expose API port
EXPOSE 3001

# Healthcheck targeting the unauthenticated status endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/system/status || exit 1

# Start the platform in production mode
CMD ["npm", "run", "start:prod"]
