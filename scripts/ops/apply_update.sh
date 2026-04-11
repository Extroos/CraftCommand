#!/bin/bash
# scripts/ops/apply_update.sh
# Linux/macOS Update Applicator (Atomic Swap)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLAN_FILE="$ROOT_DIR/update-plan.json"

# Colors
C_CYAN='\033[1;36m'
C_GREEN='\033[1;32m'
C_YELLOW='\033[1;33m'
C_RED='\033[1;31m'
C_RESET='\033[0m'

echo -e "\n${C_CYAN}[UPDATE] ========================================${C_RESET}"
echo -e "${C_CYAN}[UPDATE] CRAFTCOMMAND UPDATE APPLICATOR (UNIX)${C_RESET}"
echo -e "${C_CYAN}[UPDATE] ========================================${C_RESET}"

if [ ! -f "$PLAN_FILE" ]; then
    echo -e "${C_RED}[UPDATE] Error: update-plan.json not found.${C_RESET}"
    exit 1
fi

# Parse version/dirs (Minimal grep/sed to avoid jq dependency)
VERSION=$(grep '"version":' "$PLAN_FILE" | sed -E 's/.*: "([^"]+)".*/\1/')
SOURCE_DIR=$(grep '"sourceDir":' "$PLAN_FILE" | sed -E 's/.*: "([^"]+)".*/\1/')
BACKUP_DIR=$(grep '"backupDir":' "$PLAN_FILE" | sed -E 's/.*: "([^"]+)".*/\1/' | sed "s|\\\\|/|g")

echo -e "${C_GREEN}[UPDATE] Installing Version: v$VERSION${C_RESET}"
echo -e "[UPDATE] Source: $SOURCE_DIR"
echo -e "[UPDATE] Backup: $BACKUP_DIR"

# 1. Snapshot
echo -e "\n${C_YELLOW}[UPDATE] [1/3] Creating Pre-Update Snapshot...${C_RESET}"
mkdir -p "$BACKUP_DIR"
SNAP_FILE="$BACKUP_DIR/pre-update-v$VERSION-$(date +%s).tar.gz"

tar -czf "$SNAP_FILE" -C "$ROOT_DIR" backend/src backend/package.json version.json 2>/dev/null
echo -e "${C_GREEN}[UPDATE] Snapshot created: $(basename "$SNAP_FILE")${C_RESET}"

# 2. Apply Files (Atomic Swap)
echo -e "\n${C_YELLOW}[UPDATE] [2/3] Applying Update Files...${C_RESET}"

CORE_DIRS=("backend/src") # Add more if needed

for DIR in "${CORE_DIRS[@]}"; do
    SRC_PATH="$SOURCE_DIR/$DIR"
    TGT_PATH="$ROOT_DIR/$DIR"
    
    if [ -d "$SRC_PATH" ]; then
        echo -e "  -> Atomic Swap: $DIR"
        OLD_PATH="${TGT_PATH}.old"
        
        [ -d "$OLD_PATH" ] && rm -rf "$OLD_PATH"
        [ -d "$TGT_PATH" ] && mv "$TGT_PATH" "$OLD_PATH"
        
        mkdir -p "$(dirname "$TGT_PATH")"
        mv "$SRC_PATH" "$TGT_PATH"
        
        rm -rf "$OLD_PATH"
    fi
done

# Standard Overlay (Non-core)
PROTECTED=("data" ".env" "uploads" "config" "node_modules" "minecraft_servers" "logs")
for ITEM in "$SOURCE_DIR"/*; do
    BNAME=$(basename "$ITEM")
    
    # Skip protected
    SKIP=0
    for P in "${PROTECTED[@]}"; do [[ "$BNAME" == "$P" ]] && SKIP=1 && break; done
    [[ $SKIP -eq 1 ]] && continue
    
    # Skip already swapped core dirs
    [[ "$BNAME" == "backend" ]] && continue # Handled via src swap
    
    echo -e "  -> Syncing: $BNAME"
    cp -rf "$ITEM" "$ROOT_DIR/"
done

# 3. Finalize
echo -e "\n${C_YELLOW}[UPDATE] [3/3] Finalizing...${C_RESET}"
rm -rf "$SOURCE_DIR"
rm "$PLAN_FILE"

echo -e "${C_GREEN}[UPDATE] SUCCESS! Update applied.${C_RESET}"
exit 0
