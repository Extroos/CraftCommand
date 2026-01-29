@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title CraftCommand - Server Manager v1.5.0-unstable (UNSTABLE)
color 0B

:: Hardening: Verify Critical Directories exist
if not exist "backend" (
    echo [Fatal] 'backend' directory not found. Corrupt installation?
    pause
    exit /b 1
)
if not exist "frontend" (
    echo [Fatal] 'frontend' directory not found. Corrupt installation?
    pause
    exit /b 1
)

:MENU
cls
echo.
echo   ______            ______   ______                                          __
echo  /      \          /      \ /      \                                        ^|  \
echo ^|  $$$$$$\  ______ ^|  $$$$$$^|  $$$$$$\ ______  mmmmm  mmmmm   ______  _______  ^| $$
echo ^| $$   \$$ /      \^| $$___\$^| $$   \$$/      \^|     \^|     \ ^|      \^|       \ ^| $$
echo ^| $$      ^|  $$$$$$^| $$    \^| $$     ^|  $$$$$$^| $$$$$^| $$$$$\ \$$$$$$^| $$$$$$$\^| $$
echo ^| $$   __ ^| $$   \$^| $$$$$$$^| $$   __^| $$  ^| $^| $$ ^| $$ ^| $$ /      $^| $$  ^| $$^| $$
echo ^| $$__/  \^| $$     ^| $$     ^| $$__/  ^| $$__/ $^| $$ ^| $$ ^| $$^|  $$$$$$^| $$  ^| $$^| $$
echo  \$$    $$^| $$     ^| $$      \$$    $$\$$    $$^| $$ ^| $$ ^| $$ \$$    $$^| $$  ^| $$^| $$
echo   \$$$$$$  \$$      \$$       \$$$$$$  \$$$$$$  \$$  \$$  \$$  \$$$$$$$ \$$   \$$ \$$
echo.
echo ====================================================================================
echo.
echo.
echo    [1] Start Server (Opens Dashboard)
echo    [2] Reinstall (Fix Bugs/Issues)
echo    [3] Setup HTTPS (Secure Remote Access)
echo    [4] Setup Remote Access (Wizard)
echo    [5] Emergency Disable (Reset to Localhost)
echo    [6] Exit
echo.
set /p choice="Select Option: "

if "%choice%"=="1" goto START
if "%choice%"=="2" goto REINSTALL
if "%choice%"=="3" goto HTTPS_MENU
if "%choice%"=="4" goto REMOTE_SETUP
if "%choice%"=="5" goto REMOTE_DISABLE
if "%choice%"=="6" exit
goto MENU

:START
goto START_LOGIC

:REMOTE_SETUP
cls
echo.
echo [Remote Access Configuration]
echo ====================================================================================
echo.
echo [Info] Choose how you want to connect remotely.
echo        This will update your settings and start the server.
echo.
echo    [1] Mesh VPN (Tailscale, ZeroTier) - [Recommended]
echo        - Safest. Requires software on both PCs. No ports needed.
echo.
echo    [2] Reverse Proxy (Playit.gg) - [Built-in]
echo        - Auto-configures a gamer tunnel for you.
echo.
echo    [3] Quick Website Share (Cloudflare) - [Web Only]
echo        - Better, faster link for the Panel. NO Game Access.
echo.
echo    [4] Direct Connection (Port Forwarding)
echo        - Advanced. Requires Router config. Riskiest if not careful.
echo.
echo    [5] Cancel (Go Back)
echo.
set /p r_choice="Select Method: "

if "%r_choice%"=="1" (
    call node scripts/cli-remote-setup.js vpn
    goto POST_REMOTE_CONFIG
)
if "%r_choice%"=="2" (
    call node scripts/cli-remote-setup.js proxy
    echo.
    echo [Proxy Setup] Checking/Downloading Playit.gg Agent...
    call node scripts/install-proxy.js
    echo.
    echo [Proxy Setup] Launching Tunnel Agent...
    start "CraftCommand Tunnel (Do Not Close)" "proxy\playit.exe"
    goto POST_REMOTE_CONFIG
)
if "%r_choice%"=="3" (
    echo.
    echo [Quick Share] Launching Cloudflare Tunnel...
    echo [Quick Share] Check the new window for your link!
    start "Cloudflare Website Share - Keep Open" node scripts/share-website.js
    timeout /t 3 >nul
    goto POST_REMOTE_CONFIG
)
if "%r_choice%"=="4" (
    call node scripts/cli-remote-setup.js direct
    goto POST_REMOTE_CONFIG
)
goto MENU

:POST_REMOTE_CONFIG
echo.
echo [Action] Configuration Saved. Starting Server...
timeout /t 3 >nul
:: START_LOGIC label is assumed to exist from previous step, or we fall through to START_LOGIC
goto START_LOGIC

:START_LOGIC
cls
echo [System] Checking Environment...

:: Check Node
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [Error] Node.js is not installed. Please install Node.js to continue.
    pause
    goto MENU
)

:: Check NPM
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [Error] NPM is not installed. Please reinstall Node.js.
    pause
    goto MENU
)

:: Smart Install Logic
set MISSING_DEPS=0
if not exist "node_modules" set MISSING_DEPS=1
if not exist "backend\node_modules" set MISSING_DEPS=1
if not exist "frontend\node_modules" set MISSING_DEPS=1

if "%MISSING_DEPS%"=="1" (
    echo [Setup] First time setup detected. Installing files...
    echo.
    
    echo [1/3] Installing Dashboard...
    cd frontend
    call npm install
    if !errorlevel! neq 0 (
        echo [Fatal] Failed to install Dashboard dependencies.
        pause
        cd ..
        goto MENU
    )
    cd ..
    echo.

    echo [2/3] Installing Backend...
    cd backend
    call npm install
    if !errorlevel! neq 0 (
        echo [Fatal] Failed to install Backend dependencies.
        pause
        cd ..
        goto MENU
    )
    cd ..
    echo.

    echo [3/3] Installing Root Tools...
    call npm install
    if !errorlevel! neq 0 (
        echo [Fatal] Failed to install Root dependencies.
        pause
        goto MENU
    )
    echo.
    echo [Success] Installation complete. Starting...
) else (
    echo [System] Files verified. Launching...
    echo [Action] Opening Dashboard in your browser...
    start http://localhost:3000
)

echo.
echo ====================================================
echo [Config Summary]
echo * Panel URL: http://localhost:3000 (Unless HTTPS enabled)
echo * Settings:  backend/data/settings.json
echo * Servers:   backend/data/servers.json
echo * Logs:      backend/data/audit.json
echo ====================================================

echo.
call npm run start:all
if %errorlevel% neq 0 (
    echo [Error] System crashed with code %errorlevel%.
    pause
)
goto MENU

:REINSTALL
cls
echo.
echo [Warning] This will completely reset the installation files.
echo           Your servers/data will NOT be deleted.
echo.
set /p confirm="Continue? (y/n): "
if not "%confirm%"=="y" goto MENU

echo.
echo [1/6] Cleaning Dashboard...
if exist "frontend\node_modules" (
    rmdir /s /q "frontend\node_modules"
    if exist "frontend\node_modules" echo [Warn] Failed to delete frontend/node_modules. Files might be locked.
)

echo [2/6] Cleaning Backend...
if exist "backend\node_modules" (
    rmdir /s /q "backend\node_modules"
)

echo [3/6] Cleaning Root...
if exist "node_modules" (
    rmdir /s /q "node_modules"
)

echo [4/6] Reinstalling Dashboard...
cd frontend
call npm install
cd ..

echo [5/6] Reinstalling Backend...
cd backend
call npm install
cd ..

echo [6/6] Reinstalling Root...
call npm install

echo.
echo.
echo [Success] Reset complete.
echo.
set /p auto_start="Start Server now? (y/n): "
if /i "%auto_start%"=="y" goto START
goto MENU

:HTTPS_MENU
cls
echo.
echo [HTTPS Setup]
echo ====================================================================================
echo.
echo [Warning] HTTPS encrypts traffic but implies remote access risks.
echo           Do not expose this server to the internet without proper security.
echo           See: docs/remote-access-plan.md
echo.
echo    [1] Recommended: Reverse Proxy (Caddy/Nginx)
echo    [2] Optional: Built-in HTTPS (Direct Bind)
echo    [3] Back to Main Menu
echo.
set /p choice="Select Option: "

if "%choice%"=="1" goto PROTOCOL_PROXY
if "%choice%"=="2" goto PROTOCOL_DIRECT
if "%choice%"=="3" goto MENU
goto HTTPS_MENU

:PROTOCOL_PROXY
cls
echo.
echo [Reverse Proxy Setup]
echo.
echo [Action] Generating Caddyfile.example...
if not exist "proxy" mkdir "proxy" 2>nul
copy /y "proxy\Caddyfile.example" "Caddyfile.example" >nul 2>nul
if %errorlevel% neq 0 (
    echo [Error] Caddyfile.example template missing or write failed.
) else (
    echo [Success] 'Caddyfile.example' created in root directory.
)
echo.
echo [Info] Please rename it to 'Caddyfile' and place it in your Caddy directory.
echo [Info] For detailed instructions, read 'docs/https.md'.
echo.
pause
goto MENU

:PROTOCOL_DIRECT
cls
echo.
echo [Built-in HTTPS Setup]
echo.
echo [Warning] This requires valid SSL Certificate (.pem or .crt) and Key (.key) files.
echo           Incorrect paths will cause the server to fallback to HTTP.
echo.
set /p CERT_PATH="Enter Absolute Path to Certificate (.crt/.pem): "
set /p KEY_PATH="Enter Absolute Path to Private Key (.key): "
echo.
echo (Optional) Enter Key Passphrase. Passphrases prevent auto-start without input.
echo Leave empty if your key is not encrypted.
set /p PASSPHRASE="Enter Key Passphrase (leave empty if none): "
if "%PASSPHRASE%"=="" set PASSPHRASE=EMPTY

if not exist "scripts\setup-https.js" (
    echo [Fatal] Setup script is missing (scripts/setup-https.js).
    pause
    goto MENU
)

echo.
echo [Action] Updating Configuration...
call node scripts/setup-https.js "!CERT_PATH!" "!KEY_PATH!" "!PASSPHRASE!"

echo.
pause
goto MENU



:REMOTE_DISABLE
cls
echo.
echo [Emergency Disable]
echo.
echo [Action] Disabling Remote Access and resetting bind to localhost...
if not exist "scripts\emergency-disable-remote.js" (
    echo [Fatal] Script missing: scripts\emergency-disable-remote.js
    pause
    goto MENU
)

call node scripts/emergency-disable-remote.js
echo.
echo [Action] Restarting System to apply changes...
timeout /t 3 >nul
goto START
