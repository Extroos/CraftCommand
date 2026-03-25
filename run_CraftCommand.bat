@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0."

:: --- CONSOLE SETUP ---
mode con cols=80 lines=42
color 0F

:: --- ANSI ESCAPE CODE SETUP ---
for /f %%a in ('echo prompt $E ^| cmd') do set "E=%%a"
set "R=%E%[0m"
set "CR=%E%[91m"
set "CG=%E%[92m"
set "CY=%E%[93m"
set "CC=%E%[96m"
set "CM=%E%[95m"
set "CW=%E%[97m"
set "CGY=%E%[90m"
set "CB=%E%[94m"
set "BOLD=%E%[1m"

:: ============================================================================
::  CRAFTCOMMAND — Enterprise Platform Launcher
:: ============================================================================

:: --- DEPENDENCY VALIDATION ---
where node >nul 2>nul
if !errorlevel! neq 0 (
    echo.
    echo   %CR%%BOLD% ERROR %R%  Node.js is not installed or not in PATH.
    echo          Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: --- VERSION SYNC ---
set "CC_VERSION=1.12.5"
if exist "version.json" (
    for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"^[ ]*.version.:" version.json') do (
        set "VERSION_VAL=%%~a"
        set "VERSION_VAL=!VERSION_VAL: =!"
        set "VERSION_VAL=!VERSION_VAL:"=!"
        set "CC_VERSION=!VERSION_VAL!"
    )
)

title CraftCommand v%CC_VERSION%

:: --- FIRST RUN SETUP ---
if not exist "node_modules" (
    echo.
    echo   %CY%%BOLD% INITIAL SETUP DETECTED %R%
    echo   %CGY%Setting up core dependencies for first launch...%R%
    call npm install >nul 2>nul
    if !errorlevel! neq 0 (
        echo   %CR%[ERROR] Dependency installation failed. Check your network.%R%
        pause
    )
)

:: --- CONFIG AUTOMATION ---
if not exist ".env" (
    echo.
    echo   %CY%%BOLD% CONFIG GENERATION %R%
    echo   %CGY%Generating secure environment configuration...%R%
    if not exist ".env.example" (
        echo   %CR%%BOLD% ERROR %R%  .env.example not found. 
        pause
        exit /b 1
    )
    copy ".env.example" ".env" >nul
    powershell -Command "$s=(-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 64 | %% {[char]$_})); (Get-Content .env) -replace 'JWT_SECRET=.*', ('JWT_SECRET=' + $s) | Set-Content .env"
)

:: --- UPDATE CHECK ---
if not exist "version.json" goto SKIP_UPDATE_CHECK
echo.
echo   %CGY%Checking for updates... %R%
(
echo $wc = New-Object System.Net.WebClient
echo $wc.Headers.Add^('User-Agent', 'CraftCommand-Launcher'^)
echo try {
echo     $r = $wc.DownloadString^('https://raw.githubusercontent.com/Extroos/Craft-Commands/main/version.json'^) ^| ConvertFrom-Json
echo     $l = Get-Content 'version.json' -Raw ^| ConvertFrom-Json
echo     if ^($r.version -ne $l.version^) { Write-Host 'UPDATE_AVAILABLE' } else { Write-Host 'UP_TO_DATE' }
echo ^} catch { Write-Host 'OFFLINE' }
) > "%TEMP%\cc_check.ps1"

set "UPDATE_STATUS=OFFLINE"
for /f "usebackq tokens=*" %%i in (`powershell -ExecutionPolicy Bypass -File "%TEMP%\cc_check.ps1"`) do set "UPDATE_STATUS=%%i"
del "%TEMP%\cc_check.ps1" >nul 2>nul

if not "!UPDATE_STATUS!"=="UPDATE_AVAILABLE" goto SKIP_UPDATE_CHECK

:: Check Auto-Update Setting
set "AUTO_UPDATE=false"
if not exist "backend\data\settings.json" goto SKIP_AUTO_CHECK
powershell -NoProfile -Command "$s = Get-Content 'backend\data\settings.json' -Raw | ConvertFrom-Json; if ($s.app.autoUpdate -eq $true) { Write-Host 'true' } else { Write-Host 'false' }" > "%TEMP%\cc_au.txt"
for /f "usebackq tokens=*" %%a in ("%TEMP%\cc_au.txt") do set "AUTO_UPDATE=%%a"
del "%TEMP%\cc_au.txt" >nul 2>nul
:SKIP_AUTO_CHECK

echo.
echo   %CY%%BOLD% UPDATE AVAILABLE %R%
echo   %CGY%New version detected on GitHub.%R%
echo.

if "!AUTO_UPDATE!"=="true" (
    echo   %CY%Do you want to install this update? %CGY%(y/n)%R%
    set /p u_choice="  %CC%^> %R%"
    if /i "!u_choice!"=="y" (
        echo.
        echo   %CG%Starting update process...%R%
        node scripts/system-updater.cjs
        if !errorlevel! equ 0 (
            echo.
            echo   %CG%%BOLD%+%R%  Update installed successfully.
            echo   %CGY%    Please restart the launcher to apply changes.%R%
            pause
            exit
        ) else (
            echo.
            echo   %CR%%BOLD%X%R%  Update failed. See logs above.
            pause
        )
    )
) else (
    echo   %CY%  Auto-Update is DISABLED in System Settings.%R%
    echo   %CGY%  Enable it in the dashboard to install updates.%R%
    echo.
    pause
)

:SKIP_UPDATE_CHECK

:: --- ASSET SYNC ---
if not exist "backend\data\settings.json" goto SKIP_ASSET_SYNC

<nul set /p "=%CGY%  Syncing assets... %R%"
powershell -NoProfile -Command "$s = Get-Content 'backend\data\settings.json' -Raw | ConvertFrom-Json; if ($s.app.updateWeb -eq $true) { exit 1 } else { exit 0 }"
if !errorlevel! equ 1 (
    node scripts/update-web-cli.cjs
) else (
    echo %CGY%Skipped.%R%
)

:SKIP_ASSET_SYNC

:: ============================================================================
::  MAIN MENU
:: ============================================================================
:MENU
set "choice="
cls

:: --- UPDATE EXECUTION (ATOMIC SWAP) ---
if exist "update-plan.json" (
    echo.
    echo   %CY%[UPDATE] Pending update found!%R%
    echo   %CC%Executing update applicator...%R%
    
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\apply_update.ps1"
    if !errorlevel! neq 0 (
        echo   %CR%[ERROR] Update failed! Check console.%R%
        pause
    ) else (
        echo   %CG%[SUCCESS] Update applied.%R%
    )
)

:: --- POST-UPDATE CLEANUP ---
if exist "update_applied.flag" (
    echo.
    echo   %CY%[UPDATE] Synchronizing system configuration...%R%
    call node scripts/sync-env.cjs
    
    echo.
    echo   %CY%[UPDATE] Updating dependencies...%R%
    cd backend
    call npm install >nul 2>nul
    cd ..
    cd frontend
    call npm install >nul 2>nul
    cd ..
    cd agent
    call npm install >nul 2>nul
    cd ..
    
    echo.
    echo   %CY%[UPDATE] Rebuilding frontend assets...%R%
    call node scripts/update-web-cli.cjs --force
    
    del "update_applied.flag"
    echo   %CG%[SUCCESS] System synchronized, dependencies updated, and assets rebuilt.%R%
    timeout /t 2 >nul
)


echo.
echo  %CC%%BOLD%   ______             ______  ______                                          __ %R%
echo  %CC%  ██████╗██████╗  █████╗ ███████╗████████╗ ██████╗ ██████╗ ███╗   ███╗███╗   ███╗ █████╗ ███╗   ██╗██████╗ %R%
echo  %CC% ██╔════╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔═══██╗████╗ ████║████╗ ████║██╔══██╗████╗  ██║██╔══██╗%R%
echo  %CC% ██║     ██████╔╝███████║█████╗     ██║   ██║     ██║   ██║██╔████╔██║██╔████╔██║███████║██╔██╗ ██║██║  ██║%R%
echo  %CC% ██║     ██╔══██╗██╔══██║██╔══╝     ██║   ██║     ██║   ██║██║╚██╔╝██║██║╚██╔╝██║██╔══██║██║╚██╗██║██║  ██║%R%
echo  %CC% ╚██████╗██║  ██║██║  ██║██║        ██║   ╚██████╗╚██████╔╝██║ ╚═╝ ██║██║ ╚═╝ ██║██║  ██║██║ ╚████║██████╔╝%R%
echo  %CC%  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝    ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ %R%

:: --- STATUS BAR ---
set "LOCAL_IP=127.0.0.1"
for /f "tokens=4" %%a in ('route print ^| findstr 0.0.0.0 ^| findstr /V "0.0.0.0.0"') do set "LOCAL_IP=%%a"

echo  %CGY%------------------------------------------------------------------------%R%
echo   %BOLD%%CW%v!CC_VERSION!%R%  %CGY%:%R%  %CG%%BOLD%ONLINE%R%  %CGY%:%R%  %CGY%IPV4: %CB%!LOCAL_IP!%R%  %CGY%:%R%  %CGY%NODE: %CM%WDL-ADMIN-01%R%
echo  %CGY%------------------------------------------------------------------------%R%
echo  %CGY%[01]%R% %CG%%BOLD%LAUNCH PLATFORM%R%        %CGY%Boot (Backend ^& Frontend)%R%
echo  %CGY%[02]%R% %CC%SECURITY: HTTPS%R%        %CGY%Caddy Automation / SSL%R%
echo  %CGY%[03]%R% %CC%NETWORK: REMOTE%R%        %CGY%Tunnels ^& Mesh VPNs%R%
echo.
echo  %CGY%[04]%R% %CY%SYSTEM DIAGNOSTICS%R%     %CGY%Connectivity ^& Integrity%R%
echo  %CGY%[05]%R% %CY%SYSTEM MAINTENANCE%R%     %CGY%Environment Reconstruction%R%
echo  %CGY%[06]%R% %CB%SYSTEM RECOVERY%R%        %CGY%Rollback from Snapshot%R%
echo.
echo  %CGY%[07]%R% %CM%NODE ORCHESTRATION%R%     %CGY%Distributed Node Agent%R%
echo  %CGY%[08]%R% %CR%EMERGENCY: ISOLATE%R%     %CGY%Immediate Panic Kill%R%
echo  %CGY%------------------------------------------------------------------------%R%
echo   %BOLD%%CW%[00]%R% %CGY%POWER OFF%R%
echo  %CGY%------------------------------------------------------------------------%R%
set /p choice="  %CC%%BOLD%TERM: %R%"

if "%choice%"=="1" goto START
if "%choice%"=="01" goto START
if "%choice%"=="2" goto HTTPS_MENU
if "%choice%"=="02" goto HTTPS_MENU
if "%choice%"=="3" goto REMOTE_SETUP
if "%choice%"=="03" goto REMOTE_SETUP
if "%choice%"=="4" goto STABILITY_CHECK
if "%choice%"=="04" goto STABILITY_CHECK
if "%choice%"=="5" goto REINSTALL
if "%choice%"=="05" goto REINSTALL
if "%choice%"=="6" goto ROLLBACK
if "%choice%"=="06" goto ROLLBACK
if "%choice%"=="7" goto AGENT_START
if "%choice%"=="07" goto AGENT_START
if "%choice%"=="8" goto REMOTE_DISABLE
if "%choice%"=="08" goto REMOTE_DISABLE
if "%choice%"=="0" exit
if "%choice%"=="00" exit
goto MENU

:: ============================================================================
::  LAUNCH LOGIC
:: ============================================================================
:START
cls
echo.
echo  %CC%%BOLD% PLATFORM LAUNCH SEQUENCE%R%
echo  %CGY%-----------------------------------------------------------------------%R%
echo.

:: Check Node.js
:: Check Node.js
set "NODE_PATH=.runtimes\node\node.exe"
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "%NODE_PATH%" (
        set "PATH=%CD%\.runtimes\node;%PATH%"
    ) else (
        echo.
        echo   %CY%%BOLD%!%R%  Node.js not found. Bootstrapping portable runtime...
        powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\bootstrap-runtime.ps1"
        if !errorlevel! neq 0 (
            echo   %CR%Failed to download Node.js. Please install manually.%R%
            pause
            exit /b 1
        )
        set "PATH=%CD%\.runtimes\node;%PATH%"
    )
)

for /f "delims=" %%v in ('node -v') do set "NODE_V=%%v"
echo   %CG%%BOLD%+%R%  Runtime         %CGY%!NODE_V!%R%
echo   %CG%%BOLD%+%R%  Platform        %CGY%CraftCommand v!CC_VERSION!%R%

:: Smart Install
set MISSING_DEPS=0
if not exist "node_modules" set MISSING_DEPS=1
if not exist "backend\node_modules" set MISSING_DEPS=1
if not exist "frontend\node_modules" set MISSING_DEPS=1
if not exist "agent\node_modules" set MISSING_DEPS=1

if "%MISSING_DEPS%"=="1" (
    echo.
    echo   %CY%%BOLD%!%R%  First-time setup: installing dependencies
    echo.
    echo     %CGY%[1/3]%R% Frontend
    cd frontend && call npm install >nul 2>nul && cd ..
    echo     %CGY%[2/3]%R% Backend
    cd backend && call npm install >nul 2>nul && cd ..
    echo     %CGY%[3/4]%R% Root
    call npm install >nul 2>nul
    echo     %CGY%[4/4]%R% Node Agent
    cd agent && call npm install >nul 2>nul && cd ..
    echo.
    echo   %CG%%BOLD%+%R%  Dependencies resolved
)

:: Detect Protocol
set "B_TYPE=HTTP"
tasklist /fi "imagename eq caddy.exe" 2>nul | findstr /i "caddy.exe" >nul
if !errorlevel! equ 0 set "B_TYPE=HTTPS (Caddy)"
tasklist /fi "imagename eq playit.exe" 2>nul | findstr /i "playit.exe" >nul
if !errorlevel! equ 0 set "B_TYPE=TUNNEL (Playit)"

set "ACC_URL=http://localhost:3000"
if exist "backend\data\settings.json" (
    set "DOM_VAL="
    powershell -NoProfile -Command "$s = Get-Content 'backend\data\settings.json' -ErrorAction SilentlyContinue | ConvertFrom-Json; if ($s.app.https.enabled -eq $true) { if ($s.app.https.domain) { Write-Output $s.app.https.domain } else { Write-Output 'localhost' } } else { exit 1 }" > "%TEMP%\cc_domain.txt" 2>nul
    if !errorlevel! equ 0 (
        set /p DOM_VAL= < "%TEMP%\cc_domain.txt"
        if not "!DOM_VAL!"=="" set "ACC_URL=https://!DOM_VAL!"
    )
)

echo.
echo  %CGY%-----------------------------------------------------------------------%R%
echo   Protocol   %BOLD%%CG%!B_TYPE!%R%
echo   Access     %BOLD%%CC%!ACC_URL!%R%
echo  %CGY%-----------------------------------------------------------------------%R%
echo.
echo   %CGY%Streaming logs...%R%
echo.

call npm run start:all
if %errorlevel% neq 0 (
    echo.
    echo   %CR%%BOLD%X%R%  Process terminated  %CGY%Exit code: %errorlevel%%R%
    pause
)
goto MENU

:: ============================================================================
::  REMOTE ACCESS
:: ============================================================================
:REMOTE_SETUP
cls
echo.
echo  %CC%%BOLD% REMOTE ACCESS%R%
echo  %CGY%-----------------------------------------------------------------------%R%
echo.
echo  %CGY%%BOLD% CONNECTIVITY%R%
echo   %BOLD%%CW%1%R%  %CG%Mesh VPN%R%                  %CGY%Tailscale / ZeroTier%R%
echo   %BOLD%%CW%2%R%  %CG%Zero-Config Tunnel%R%         %CGY%Playit.gg%R%
echo   %BOLD%%CW%3%R%  %CC%Web Share%R%                  %CGY%Cloudflare Tunnel%R%
echo   %BOLD%%CW%4%R%  %CC%Direct Bind%R%                %CGY%Manual Port Forward%R%
echo.
echo  %CGY%%BOLD% CONTROL%R%
echo   %BOLD%%CW%5%R%  %CR%Disable All%R%                %CGY%Kill remote bridges%R%
echo   %BOLD%%CW%0%R%  %CGY%Back%R%
echo.
echo  %CGY%-----------------------------------------------------------------------%R%
echo.
<nul set /p "=  %CC%%BOLD%^> %R%"
set /p r_choice=""

if "%r_choice%"=="1" (
    call node scripts/ops/cli-remote-setup.cjs vpn
    goto START
)
if "%r_choice%"=="2" (
    call node scripts/ops/cli-remote-setup.cjs proxy
    call node scripts/ops/install-proxy.cjs
    taskkill /f /im playit.exe >nul 2>nul
    echo   %CG%Configured for Zero-Config Tunnel.%R%
    goto START
)
if "%r_choice%"=="3" (
    start "CraftCommand - Web Share" node scripts/ops/share-website.cjs
    timeout /t 3 >nul
    goto START
)
if "%r_choice%"=="4" (
    call node scripts/ops/cli-remote-setup.cjs direct
    goto START
)
if "%r_choice%"=="5" goto REMOTE_DISABLE
if "%r_choice%"=="0" goto MENU
if "%r_choice%"=="6" goto MENU
goto REMOTE_SETUP

:: ============================================================================
::  HTTPS CONFIGURATION
:: ============================================================================
:HTTPS_MENU
cls
echo.
echo  %CC%%BOLD% HTTPS CONFIGURATION%R%
echo  %CGY%-----------------------------------------------------------------------%R%
echo.
echo   %BOLD%%CW%1%R%  %CG%Automated Caddy%R%            %CGY%One-click HTTPS%R%
echo   %BOLD%%CW%2%R%  %CY%Manual Certificates%R%        %CGY%Bind custom PEM/CRT%R%
echo   %BOLD%%CW%3%R%  %CR%Disable HTTPS%R%              %CGY%Revert to HTTP%R%
echo   %BOLD%%CW%0%R%  %CGY%Back%R%
echo.
echo  %CGY%-----------------------------------------------------------------------%R%
echo.
<nul set /p "=  %CC%%BOLD%^> %R%"
set /p h_choice=""

if "%h_choice%"=="1" goto PROTOCOL_PROXY
if "%h_choice%"=="2" goto PROTOCOL_DIRECT
if "%h_choice%"=="3" (
    call node scripts/ops/manage-caddy.cjs disable
    taskkill /f /im caddy.exe >nul 2>nul
    pause
    goto MENU
)
if "%h_choice%"=="0" goto MENU
if "%h_choice%"=="4" goto MENU
goto HTTPS_MENU

:PROTOCOL_PROXY
cls
echo.
echo  %CC%%BOLD% AUTOMATED HTTPS%R%
echo  %CGY%-----------------------------------------------------------------------%R%
echo.
<nul set /p "=  Domain %CGY%(e.g. panel.example.com)%CW%: %R%"
set /p DOMAIN=""
echo.
call node scripts/ops/install-caddy.cjs
call node scripts/ops/manage-caddy.cjs setup !DOMAIN!
taskkill /f /im caddy.exe >nul 2>&1
timeout /t 1 >nul
start "CraftCommand - HTTPS Bridge" proxy\caddy.exe run --config proxy\Caddyfile --adapter caddyfile
echo.
echo   %CG%%BOLD%+%R%  HTTPS active for %CC%!DOMAIN!%R%
pause
goto MENU

:PROTOCOL_DIRECT
cls
echo.
echo  %CC%%BOLD% MANUAL SSL BINDING%R%
echo  %CGY%-----------------------------------------------------------------------%R%
echo.
<nul set /p "=  Certificate (.pem/.crt): "
set /p CERT_PATH=""
<nul set /p "=  Private Key (.key):      "
set /p KEY_PATH=""
<nul set /p "=  Passphrase (optional):   "
set /p PASSPHRASE=""
echo.
call node scripts/maintenance/setup-https.cjs "!CERT_PATH!" "!KEY_PATH!" "!PASSPHRASE!"
pause
goto MENU

:: ============================================================================
::  PANIC CONTROL
:: ============================================================================
:REMOTE_DISABLE
cls
echo.
echo  %CR%%BOLD% NETWORK ISOLATION%R%
echo  %CGY%-----------------------------------------------------------------------%R%
echo.
echo   Terminating external bridges...
taskkill /f /im caddy.exe >nul 2>nul
taskkill /f /im playit.exe >nul 2>nul
taskkill /f /im cloudflared.exe >nul 2>nul
echo.
echo   Updating security registry...
call node scripts/ops/emergency-disable-remote.cjs
if %errorlevel% neq 0 (
    echo.
    echo   %CR%%BOLD%X%R%  Isolation failed. Check settings.json.
) else (
    echo.
    echo   %CG%%BOLD%+%R%  Network isolated. Dashboard is local-only.
)
timeout /t 5 >nul
goto MENU

:: ============================================================================
::  STABILITY AUDIT
:: ============================================================================
:STABILITY_CHECK
cls
echo.
echo  %CY%%BOLD% STABILITY AUDIT%R%
echo  %CGY%-----------------------------------------------------------------------%R%
echo.
echo   Running diagnostics...
echo.
node -r ts-node/register -r tsconfig-paths/register scripts/user_verification_test.ts 2>nul || echo   %CR%ts-node not available. Run option [05] Maintenance first.%R%
echo.
pause
goto MENU

:: ============================================================================
::  SYSTEM RECOVERY
:: ============================================================================
:ROLLBACK
cls
echo.
echo  %CB%%BOLD% SYSTEM RECOVERY%R%
echo  %CGY%-----------------------------------------------------------------------%R%
echo.
echo   Searching for pre-update snapshots...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\rollback.ps1"
echo.
pause
goto MENU

:: ============================================================================
::  MAINTENANCE
:: ============================================================================
:REINSTALL
cls
echo.
echo  %CY%%BOLD% MAINTENANCE MODE%R%
echo  %CGY%-----------------------------------------------------------------------%R%
echo.
<nul set /p "=  Flush and reinstall all deps? %CGY%(y/n)%CW%: %R%"
set confirm=
set /p confirm=""
if /i not "!confirm!"=="y" goto MENU

echo.
echo   %CGY%[1/3]%R% Flushing node_modules...
if exist "frontend\node_modules" rmdir /s /q "frontend\node_modules"
if exist "backend\node_modules" rmdir /s /q "backend\node_modules"
if exist "node_modules" rmdir /s /q "node_modules"

echo   %CGY%[2/3]%R% Reinstalling frontend...
cd frontend && call npm install && cd ..

echo   %CGY%[3/3]%R% Reinstalling backend...
cd backend && call npm install && cd ..
call npm install

echo.
echo   %CG%%BOLD%+%R%  Dependencies restored.
echo.
pause
goto MENU

:: ============================================================================
::  NODE AGENT
:: ============================================================================
:AGENT_START
cls
echo.
echo  %CM%%BOLD% NODE AGENT%R%
echo  %CGY%-----------------------------------------------------------------------%R%
echo.
<nul set /p "=  Node ID:     "
set /p N_ID=""
<nul set /p "=  Node Secret: "
set /p N_SEC=""

if "%N_ID%"=="" goto MENU

echo.
echo   Initializing agent...

cd agent
if not exist "dist\agent\src\index.js" (
    echo   [System] Building agent artifacts...
    if not exist "node_modules" call npm install >nul 2>nul
    call npm run build >nul 2>nul
)
title CraftCommand - Node Agent [%N_ID:~0,8%...]
node dist/agent/src/index.js --panel-url http://localhost:3001 --node-id %N_ID% --secret %N_SEC%
cd ..
goto MENU
