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

# Support portable runtime relative to root
if ! command -v node &>/dev/null; then
    if [ -f "../.runtimes/node/bin/node" ]; then
        export PATH="$PWD/../.runtimes/node/bin:$PATH"
    fi
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed.${NC}"
    echo -e "  Install with: ${YELLOW}sudo apt install nodejs${NC} or visit https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js $(node -v)"

# ── Load Environment ──
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

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

# ── Interactive Setup ──

if [ -z "$PANEL_URL" ] || [ -z "$AGENT_NODE_ID" ]; then
    if [ $# -eq 0 ]; then
        echo -e "${YELLOW} [INPUT REQUIRED] ${NC}"
        echo -e " Enter your Node Credentials (found in Dashboard -> Nodes -> Add Node)"
        echo -e " These will be saved to .env for future zero-config startups.\n"
        
        read -p "  > Panel URL [$PANEL_URL]: " UI_PANEL
        read -p "  > Node ID:   " UI_NODE_ID
        read -p "  > Secret:    " UI_SECRET
        
        [ ! -z "$UI_PANEL" ] && PANEL_URL=$UI_PANEL
        [ ! -z "$UI_NODE_ID" ] && AGENT_NODE_ID=$UI_NODE_ID
        [ ! -z "$UI_SECRET" ] && AGENT_NODE_SECRET=$UI_SECRET
        
        cat <<EOF > .env
PANEL_URL=$PANEL_URL
AGENT_NODE_ID=$AGENT_NODE_ID
AGENT_NODE_SECRET=$AGENT_NODE_SECRET
EOF
        echo -e "\n${GREEN}Settings saved to .env${NC}"
    fi
fi

# Fallback defaults for log output
: ${PANEL_URL:="http://localhost:3001"}

# ── Start Agent ──

echo -e "${CYAN}Starting CraftCommand Agent...${NC}"
echo -e "  Arguments: $@"
echo ""

exec $RUNNER "$ENTRY" "$@"
