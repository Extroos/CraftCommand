#!/bin/bash
# ============================================================================
#  CRAFTCOMMAND — Platform Launcher (Linux/macOS)
# ============================================================================

# --- PERMISSION HARDENING ---
# Ensure internal scripts are executable
find scripts/ -name "*.sh" -o -name "*.cjs" -exec chmod +x {} + 2>/dev/null
chmod +x agent/run_agent.sh 2>/dev/null

# --- OS DETECTION ---
OS_TYPE="linux"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS_TYPE="mac"
fi

# --- ARGUMENT PARSING ---
if [[ "$1" == "--join" ]]; then
    PANEL_URL="$2"
    JOIN_TOKEN="$3"
    
    if [[ -z "$PANEL_URL" ]] || [[ -z "$JOIN_TOKEN" ]]; then
        echo -e "\n  \033[1;91m ERROR \033[0m Missing arguments for --join."
        echo -e "          Usage: $0 --join <PANEL_URL> <TOKEN>"
        exit 1
    fi

    echo -e "\n  \033[1;96m ENROLLMENT \033[0m Initializing secure node join..."
    
    # Fetch config from panel
    CONFIG_JSON=$(curl -s --connect-timeout 10 "$PANEL_URL/api/nodes/join-config/$JOIN_TOKEN")
    if [[ $? -ne 0 ]] || [[ -z "$CONFIG_JSON" ]] || [[ "$CONFIG_JSON" == *"error"* ]]; then
        echo -e "  \033[1;91m FAILED \033[0m Could not reach panel or token is invalid."
        echo -e "           Response: $CONFIG_JSON"
        exit 1
    fi

    # Parse JSON (Minimal extraction without jq)
    NODE_ID=$(echo "$CONFIG_JSON" | grep -o '"nodeId":"[^"]*' | cut -d'"' -f4)
    NODE_SEC=$(echo "$CONFIG_JSON" | grep -o '"nodeSecret":"[^"]*' | cut -d'"' -f4)
    PANEL_URL_VAL=$(echo "$CONFIG_JSON" | grep -o '"panelUrl":"[^"]*' | cut -d'"' -f4)

    if [[ -z "$NODE_ID" ]] || [[ -z "$NODE_SEC" ]]; then
        echo -e "  \033[1;91m FAILED \033[0m Enrollment data is corrupted."
        exit 1
    fi

    # Write .env to agent folder
    mkdir -p agent
    cat <<EOF > agent/.env
PANEL_URL=$PANEL_URL_VAL
NODE_ID=$NODE_ID
NODE_SECRET=$NODE_SEC
EOF

    echo -e "  \033[1;92m SUCCESS \033[0m Node enrolled: $NODE_ID"
    echo -e "  \033[0;90m Starting agent... \033[0m"
    
    cd agent
    if [ ! -d "node_modules" ]; then npm install; fi
    if [ ! -d "dist" ]; then npm run build; fi
    node dist/agent/src/index.js
    exit 0
fi

# --- ANSI ESCAPE CODE SETUP ---
R='\033[0m'
CR='\033[1;91m'
CG='\033[1;92m'
CY='\033[1;93m'
CC='\033[1;96m'
CM='\033[1;95m'
CW='\033[1;97m'
CGY='\033[0;90m'
CB='\033[1;94m'
BOLD='\033[1m'

# --- UTILS ---
clear_screen() {
    clear
}

pause() {
    echo -e ""
    read -p "  Press [Enter] to continue..."
}

# --- DEPENDENCY VALIDATION ---
validate_environment() {
    if ! command -v node &> /dev/null; then
        # Check for portable runtime
        if [ -f ".runtimes/node/bin/node" ]; then
            export PATH="$PWD/.runtimes/node/bin:$PATH"
        else
            # Try once more with absolute path resolution for strict environments
            ABS_PATH=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
            if [ -f "$ABS_PATH/.runtimes/node/bin/node" ]; then
                export PATH="$ABS_PATH/.runtimes/node/bin:$PATH"
            else
                echo -e "\n  ${CR}${BOLD} DEPENDECY MISSING ${R}  Node.js is not installed."
                echo -e "          ${CGY}CraftCommand can automatically install a portable runtime.${R}"
                echo -e "\n  ${BOLD}[1]${R} Install via package manager (sudo)"
                echo -e "  ${BOLD}[2]${R} Install portable runtime (Local folder)"
                echo -e "  ${BOLD}[0]${R} Exit"
                echo -ne "\n  TERM: "
                read -r n_choice
                
                if [ "$n_choice" == "1" ]; then
                    echo -e "  ${CGY}Attempting install...${R}"
                    sudo apt-get update && sudo apt-get install -y nodejs npm || brew install node
                    return $?
                elif [ "$n_choice" == "2" ]; then
                    # Support portable install on Linux
                    mkdir -p .runtimes/node
                    ARCH=$(uname -m)
                    [ "$ARCH" == "x86_64" ] && ARCH="x64"
                    [ "$ARCH" == "aarch64" ] && ARCH="arm64"
                    
                    VER="v20.18.0"
                    URL="https://nodejs.org/dist/$VER/node-$VER-linux-$ARCH.tar.xz"
                    echo -e "  ${CY}Downloading $VER ($ARCH)...${R}"
                    curl -L "$URL" | tar -xJ -C .runtimes/node --strip-components=1
                    export PATH="$PWD/.runtimes/node/bin:$PATH"
                    return 0
                fi
                exit 1
            fi
        fi
    fi
    
    # Ensure NPM is in path if node is present
    if ! command -v npm &> /dev/null && [ -f ".runtimes/node/bin/npm" ]; then
        export PATH="$PWD/.runtimes/node/bin:$PATH"
    fi
    check_optional_dependencies
}

check_optional_dependencies() {
    if ! command -v docker &> /dev/null; then
        echo -e "\n  ${CY}${BOLD}[OPTIONAL]${R} ${CGY}Docker${R} not found. Recommended for isolation."
    fi
    if ! command -v git &> /dev/null; then
        echo -e "\n  ${CY}${BOLD}[OPTIONAL]${R} ${CGY}Git${R} not found. Needed for some features."
    fi
}

validate_environment

# --- VERSION SYNC ---
CC_VERSION="1.13.2"
if [ -f "version.json" ]; then
    CC_VERSION=$(grep '"version":' version.json | sed -E 's/.*"([^"]+)".*/\1/')
fi

# --- CONFIG AUTOMATION ---
if [ ! -f ".env" ]; then
    echo -e "\n  ${CY}${BOLD} CONFIG GENERATION ${R}"
    echo -e "  ${CGY}Generating secure environment configuration...${R}"
    if [ ! -f ".env.example" ]; then
        echo -e "  ${CR}${BOLD} ERROR ${R}  .env.example not found."
        pause
        exit 1
    fi
    cp ".env.example" ".env"
    
    # Generate secure JWT_SECRET
    if command -v openssl &> /dev/null; then
        S=$(openssl rand -hex 32)
    else
        S=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 64)
    fi
    
    if [ "$OS_TYPE" == "mac" ]; then
        sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$S/" .env
    else
        sed -i "s/JWT_SECRET=.*/JWT_SECRET=$S/" .env
    fi
fi

# --- UPDATE EXECUTION (ATOMIC SWAP) ---
apply_update() {
    if [ -f "update-plan.json" ]; then
        echo -e "\n  ${CY}[UPDATE] Pending update found!${R}"
        echo -e "  ${CC}Executing update applicator...${R}"
        
        # Check for bash applicator script
        if [ -f "scripts/ops/apply_update.sh" ]; then
            bash scripts/ops/apply_update.sh
        else
            # Fallback inline applicator (Minimal)
            echo -e "  ${CGY}Applying files via Node.js...${R}"
            node scripts/core/system-updater.cjs --apply
        fi
        
        if [ $? -eq 0 ]; then
            echo -e "  ${CG}[SUCCESS] Update applied.${R}"
            touch update_applied.flag
        else
            echo -e "  ${CR}[ERROR] Update failed! Check console.${R}"
            pause
        fi
    fi
}

post_update_sync() {
    if [ -f "update_applied.flag" ]; then
        echo -e "\n  ${CY}[UPDATE] Finalizing update...${R}"
        node scripts/core/sync-env.cjs
        
        echo -e "  ${CY}[UPDATE] Updating dependencies (Background)...${R}"
        (npm install && cd backend && npm install && cd ../frontend && npm install) &
        
        # We rebuild assets if required
        node scripts/core/update-web-cli.cjs --silent
        
        rm "update_applied.flag"
        echo -e "  ${CG}[SUCCESS] System synchronized.${R}"
    fi
}

# --- UPDATE CHECK ---
check_updates() {
    echo -e "\n  ${CGY}Checking for updates... ${R}"
    REMOTE_JSON=$(curl -s --connect-timeout 5 https://raw.githubusercontent.com/Extroos/Craft-Commands/main/version.json)
    if [ $? -eq 0 ]; then
        REMOTE_VER=$(echo "$REMOTE_JSON" | grep '"version":' | sed -E 's/.*"([^"]+)".*/\1/')
        if [ "$REMOTE_VER" != "$CC_VERSION" ] && [ ! -z "$REMOTE_VER" ]; then
            echo -e "  ${CY}${BOLD} UPDATE AVAILABLE ($REMOTE_VER) ${R}"
            
            # Check for auto-update setting
            AUTO_UP=$(grep '"autoUpdate":' backend/data/settings.json 2>/dev/null | sed -E 's/.*: ([^,]+).*/\1/')
            
            if [ "$AUTO_UP" == "true" ]; then
                echo -ne "  ${CY}Do you want to install this update? ${CGY}(y/n)${R} "
                read -r u_choice
                if [[ "$u_choice" =~ ^[Yy]$ ]]; then
                    echo -e "\n  ${CG}Starting automated patching...${R}"
                    node scripts/core/system-updater.cjs
                    
                    if [ -f "update-plan.json" ]; then
                        apply_update
                        post_update_sync
                        
                        echo -e "\n  ${CG}${BOLD}SUCCESS!${R} System is now stable on version $REMOTE_VER."
                        sleep 3
                        # Force refresh by restarting the menu loop
                        return 0
                    fi
                fi
            else
                echo -e "  ${CGY}Auto-Update is DISABLED. Enable it in settings to install.${R}"
                pause
            fi
        fi
    fi
}

# --- MAIN MENU ---
while true; do
    # UI Header: Hero Card
    echo -e "\n  ${CC}${BOLD}      __      __                 __      __ ${R}"
    echo -e "  ${CC} ██████╗██████╗  █████╗ ███████╗████████╗   ██████╗ ██████╗ ███╗   ███╗███╗   ███╗ █████╗ ███╗   ██╗██████╗ ${R}"
    echo -e "  ${CC} ██╔════╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝  ██╔════╝██╔═══██╗████╗ ████║████╗ ████║██╔══██╗████╗  ██║██╔══██╗${R}"
    echo -e "  ${CC} ██║     ██████╔╝███████║█████╗     ██║     ██║     ██║   ██║██╔████╔██║██╔████╔██║███████║██╔██╗ ██║██║  ██║${R}"
    echo -e "  ${CC} ██║     ██╔══██╗██╔══██║██╔══╝     ██║     ██║     ██║   ██║██║╚██╔╝██║██║╚██╔╝██║██╔══██║██║╚██╗██║██║  ██║${R}"
    echo -e "  ${CC} ╚██████╗██║  ██║██║  ██║██║        ██║     ╚██████╗╚██████╔╝██║ ╚═╝ ██║██║ ╚═╝ ██║██║  ██║██║ ╚████║██████╔╝${R}"
    echo -e "  ${CC}  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝      ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ${R}"

    # Status Bar
    if [ "$OS_TYPE" == "mac" ]; then
        LOCAL_IP=$(ipconfig getifaddr en0 || echo "127.0.0.1")
    else
        LOCAL_IP=$(hostname -I | awk '{print $1}' || echo "127.0.0.1")
    fi
    
    echo -e "  ${CGY}------------------------------------------------------------------------${R}"
    printf "   %-10s :  ${CG}${BOLD}%-8s${R}  :  ${CGY}IPV4: ${CB}%-15s${R}  :  ${CGY}NODE: ${CM}%-12s${R}\n" "v$CC_VERSION" "ONLINE" "$LOCAL_IP" "CC-UNIX-01"
    echo -e "  ${CGY}------------------------------------------------------------------------${R}"
    echo -e "  ${CGY}[01]${R} ${CG}${BOLD}START PLATFORM${R}         ${CGY}Launch Backend & Frontend${R}"
    echo -e "  ${CGY}[02]${R} ${CC}SECURITY: HTTPS${R}        ${CGY}Caddy Automation / SSL${R}"
    echo -e "  ${CGY}[03]${R} ${CC}NETWORK: REMOTE${R}        ${CGY}Tunnels & Mesh VPNs${R}"
    echo -e " "
    echo -e "  ${CGY}[04]${R} ${CY}SYSTEM CHECK${R}           ${CGY}Check health & files${R}"
    echo -e "  ${CGY}[05]${R} ${CY}SYSTEM MAINTENANCE${R}     ${CGY}Environment Reconstruction${R}"
    echo -e "  ${CGY}[06]${R} ${CB}SYSTEM RECOVERY${R}        ${CGY}Rollback from Snapshot${R}"
    echo -e " "
    echo -e "  ${CGY}[07]${R} ${CM}REMOTE NODE${R}           ${CGY}Start Node Agent${R}"
    echo -e "  ${CGY}[08]${R} ${CR}STOP ALL${R}                ${CGY}Emergency Shutdown${R}"
    echo -e "  ${CGY}------------------------------------------------------------------------${R}"
    echo -e "   ${BOLD}${CW}[00]${R} ${CGY}POWER OFF${R}"
    echo -e "  ${CGY}------------------------------------------------------------------------${R}"
    
    read -p "  TERM: " CHOICE
    
    case $CHOICE in
        1|01)
            clear_screen
            echo -e "\n  ${CC}${BOLD} PLATFORM LAUNCH SEQUENCE${R}"
            echo -e "  ${CGY}-----------------------------------------------------------------------${R}\n"
            
            apply_update
            post_update_sync
            
            MISSING_DEPS=0
            [ ! -d "node_modules" ] && MISSING_DEPS=1
            [ ! -d "backend/node_modules" ] && MISSING_DEPS=1
            [ ! -d "frontend/node_modules" ] && MISSING_DEPS=1
            [ ! -d "agent/node_modules" ] && [ -d "agent" ] && MISSING_DEPS=1

            if [ "$MISSING_DEPS" == "1" ]; then
                echo -e "  ${CY}${BOLD}!${R}  First-time setup: installing dependencies\n"
                [ -d "frontend" ] && (echo -ne "    ${CGY}[1/4]${R} Frontend... " && cd frontend && npm install --no-audit --no-fund &> /dev/null && echo "OK")
                [ -d "backend" ] && (echo -ne "    ${CGY}[2/4]${R} Backend...  " && cd backend && npm install --no-audit --no-fund &> /dev/null && echo "OK")
                echo -ne "    ${CGY}[3/4]${R} Shared/Root... " && npm install --no-audit --no-fund &> /dev/null && echo "OK"
                [ -d "agent" ] && (echo -ne "    ${CGY}[4/4]${R} Agent...    " && cd agent && npm install --no-audit --no-fund &> /dev/null && echo "OK")
            fi
            
            echo -e "  ${CG}${BOLD}+${R}  Runtime         ${CGY}$(node -v)${R}"
            echo -e "  ${CG}${BOLD}+${R}  Platform        ${CGY}CraftCommand v$CC_VERSION${R}"
            echo -e "\n  ${CGY}Streaming logs...${R}\n"
            
            npm run dev || npm run start:all
            pause
            ;;
            
        2|02)
            clear_screen
            echo -e "\n  ${CC}${BOLD} SECURITY: HTTPS & DOMAIN BRIDGE${R}"
            echo -e "  ${CGY}-----------------------------------------------------------------------${R}\n"
            echo -e "  CraftCommand uses ${CC}Caddy${R} for automated SSL/HTTPS.\n"
            echo -e "  ${BOLD}Requirements:${R}"
            echo -e "   1. A domain name (e.g. yourpanel.com)"
            echo -e "   2. Ports ${BOLD}80${R} and ${BOLD}443${R} open/forwarded.\n"
            echo -e "  ${CGY}[1]${R}  ${CG}Setup Domain & Start${R}"
            echo -e "  ${CGY}[2]${R}  ${CY}Stop HTTPS Bridge${R}"
            echo -e "  ${CGY}[0]${R}  ${CGY}Back${R}\n"
            read -p "  TERM: " H_CHOICE
            if [ "$H_CHOICE" == "1" ]; then
                read -p "  Enter Domain: " USER_DOMAIN
                if [ ! -z "$USER_DOMAIN" ]; then
                    cat <<EOF > Caddyfile
# Generated by CraftCommand Launcher
$USER_DOMAIN {
    handle /api/* {
        reverse_proxy localhost:3001
    }
    handle /socket.io/* {
        reverse_proxy localhost:3001
    }
    handle {
        reverse_proxy localhost:3000
    }
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
    }
}
EOF
                    CADDY_BIN="./proxy/caddy"
                    [ ! -f "$CADDY_BIN" ] && CADDY_BIN="caddy"
                    nohup $CADDY_BIN run --config Caddyfile > caddy.log 2>&1 &
                    echo -e "\n  ${CG}SUCCESS${R} Caddy is running (PID: $!). Logs: caddy.log"
                    pause
                fi
            elif [ "$H_CHOICE" == "2" ]; then
                pkill -f caddy
                echo -e "\n  ${CY}STOPPED${R} HTTPS bridge terminated."
                pause
            fi
            ;;
            
        3|03)
            clear_screen
            echo -e "\n  ${CC}${BOLD} REMOTE ACCESS${R}"
            echo -e "  ${CGY}-----------------------------------------------------------------------${R}\n"
            echo -e "  ${BOLD}${CW}1${R}  ${CG}Mesh VPN (Tailscale)${R}"
            echo -e "  ${BOLD}${CW}2${R}  ${CG}Tunnel (Playit.gg)${R}"
            echo -e "  ${BOLD}${CW}3${R}  ${CR}Disable All${R}"
            echo -e "  ${BOLD}${CW}0${R}  ${CGY}Back${R}\n"
            read -p "  > " R_CHOICE
            if [ "$R_CHOICE" == "1" ]; then
                node scripts/ops/cli-remote-setup.cjs vpn
            elif [ "$R_CHOICE" == "2" ]; then
                node scripts/ops/cli-remote-setup.cjs proxy
            elif [ "$R_CHOICE" == "3" ]; then
                pkill -f playit
                pkill -f cloudflared
                node scripts/ops/emergency-disable-remote.cjs
            fi
            pause
            ;;
            
        3|03)
            clear_screen
            echo -e "\n  ${CC}${BOLD} REMOTE ACCESS${R}"
            echo -e "  ${CGY}-----------------------------------------------------------------------${R}\n"
            echo -e "  ${BOLD}${CW}1${R}  ${CG}Mesh VPN (Tailscale)${R}"
            echo -e "  ${BOLD}${CW}2${R}  ${CG}Tunnel (Playit.gg)${R}"
            echo -e "  ${BOLD}${CW}3${R}  ${CR}Disable All${R}"
            echo -e "  ${BOLD}${CW}0${R}  ${CGY}Back${R}\n"
            read -p "  > " R_CHOICE
            if [ "$R_CHOICE" == "1" ]; then
                node scripts/ops/cli-remote-setup.cjs vpn
            elif [ "$R_CHOICE" == "2" ]; then
                node scripts/ops/cli-remote-setup.cjs proxy
                node scripts/ops/install-proxy.cjs
            elif [ "$R_CHOICE" == "3" ]; then
                pkill -f playit
                pkill -f cloudflared
                node scripts/ops/emergency-disable-remote.cjs
            fi
            pause
            ;;
            
        4|04)
            clear_screen
            echo -e "\n  ${CY}${BOLD} STABILITY AUDIT${R}"
            echo -e "  ${CGY}-----------------------------------------------------------------------${R}\n"
            node -r ts-node/register -r tsconfig-paths/register scripts/tests/user_verification_test.ts
            pause
            ;;
            
        5|05)
            clear_screen
            echo -e "\n  ${CY}${BOLD} MAINTENANCE MODE${R}"
            echo -e "  ${CGY}-----------------------------------------------------------------------${R}\n"
            read -p "  Flush and reinstall all deps? (y/n): " CONFIRM
            if [ "$CONFIRM" == "y" ]; then
                rm -rf node_modules backend/node_modules frontend/node_modules agent/node_modules
                npm install
                (cd backend && npm install)
                (cd frontend && npm install)
                (cd agent && npm install)
                echo -e "\n  ${CG}Dependencies restored.${R}"
            fi
            pause
            ;;
            
        6|06)
            clear_screen
            echo -e "\n  ${CB}${BOLD} SYSTEM RECOVERY${R}"
            echo -e "  ${CGY}-----------------------------------------------------------------------${R}\n"
            if [ -f "scripts/ops/rollback.sh" ]; then
                bash scripts/ops/rollback.sh
            else
                echo -e "  ${CR}Rollback script not found.${R}"
            fi
            pause
            ;;
            
        7|07)
            clear_screen
            echo -e "\n  ${CM}${BOLD} REMOTE NODE AGENT${R}"
            echo -e "  ${CGY}-----------------------------------------------------------------------${R}\n"
            read -p "  Node ID: " N_ID
            read -p "  Node Secret: " N_SEC
            if [ ! -z "$N_ID" ]; then
                cd agent
                if [ ! -d "dist" ]; then
                    npm run build
                fi
                node dist/agent/src/index.js --panel-url http://localhost:3001 --node-id $N_ID --secret $N_SEC
                cd ..
            fi
            pause
            ;;
            
        8|08)
            clear_screen
            echo -e "\n  ${CR}${BOLD} EMERGENCY SHUTDOWN${R}"
            echo -e "  ${CGY}-----------------------------------------------------------------------${R}\n"
            pkill -f "node"
            pkill -f "java"
            echo -e "  ${CG}All platform processes terminated.${R}"
            pause
            ;;
            
        0|00)
            echo -e "\n  Goodbye!\n"
            exit 0
            ;;
            
        *)
            echo -e "  ${CR}Invalid choice.${R}"
            sleep 1
            ;;
    esac
done
