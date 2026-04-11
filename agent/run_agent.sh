#!/bin/bash
# ============================================================
# CraftCommand Node Agent Launcher (Linux/macOS)
#
# Usage:
#   ./run_agent.sh --panel-url http://192.168.1.10:3001 --node-id <uuid> --secret <token>
#
# This script starts the CraftCommand Node Agent which connects
# to a remote CraftCommand panel and manages Minecraft servers
# on this machine.
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}CraftCommand Node Agent${NC}"
echo ""

# ── Dependency Check ──

if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed.${NC}"
    echo -e "  Install with: ${YELLOW}sudo apt install nodejs${NC} or visit https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗ Node.js 18+ required. Found: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js $(node -v)"

# ── Install Dependencies ──

if [ ! -d "node_modules" ]; then
    echo -e "${CYAN}Installing agent dependencies...${NC}"
    npm install --production
fi

# ── Build Check ──

if [ ! -f "dist/index.js" ]; then
    echo -e "${CYAN}Building agent...${NC}"
    npm run build 2>/dev/null || {
        echo -e "${YELLOW}No build script found. Trying ts-node...${NC}"
    }
fi

# ── Determine Entry Point ──

if [ -f "dist/index.js" ]; then
    ENTRY="dist/index.js"
    RUNNER="node"
elif [ -f "src/index.ts" ]; then
    ENTRY="src/index.ts"
    RUNNER="node -r ts-node/register"
else
    echo -e "${RED}✗ No agent entry point found (dist/index.js or src/index.ts)${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Entry point: $ENTRY"
echo ""

# ── Validate Arguments ──

if [ $# -eq 0 ]; then
    echo -e "${YELLOW}Usage:${NC}"
    echo "  ./run_agent.sh --panel-url http://<panel-ip>:3001 --node-id <uuid> --secret <token>"
    echo ""
    echo -e "${YELLOW}Options:${NC}"
    echo "  --panel-url <url>     URL of the CraftCommand panel (required)"
    echo "  --node-id <uuid>      UUID of this node from panel enrollment (required)"
    echo "  --secret <token>      Shared secret for authentication"
    echo "  --servers-dir <path>  Root directory for server files (default: ./servers)"
    echo "  --max-servers <n>     Max concurrent servers (default: 10)"
    echo ""
    echo -e "${YELLOW}Example:${NC}"
    echo "  ./run_agent.sh --panel-url http://192.168.1.10:3001 --node-id abc12345-1234-1234-1234-123456789abc --secret my-secret"
    exit 0
fi

# ── Start Agent ──

echo -e "${CYAN}Starting CraftCommand Agent...${NC}"
echo -e "  Arguments: $@"
echo ""

exec $RUNNER "$ENTRY" "$@"
