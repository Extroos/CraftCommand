@echo off
setlocal enabledelayedexpansion
title CraftCommand - Node Agent Worker

:: Default Defaults
set "PANEL_URL=http://localhost:3001"
set "NODE_ID="
set "SECRET="

:: 1. Parse Arguments (Simple Loop)
:PARSE_ARGS
if "%~1"=="" goto LOAD_ENV
if "%~1"=="--node-id" (set "NODE_ID=%~2" & shift & shift & goto PARSE_ARGS)
if "%~1"=="--secret"  (set "SECRET=%~2"  & shift & shift & goto PARSE_ARGS)
if "%~1"=="--panel-url" (set "PANEL_URL=%~2" & shift & shift & goto PARSE_ARGS)
shift
goto PARSE_ARGS

:LOAD_ENV
if exist ".env" (
    for /f "tokens=1,2 delims==" %%a in (.env) do (
        if "%%a"=="PANEL_URL" set "PANEL_URL=%%b"
        if "%%a"=="AGENT_NODE_ID" set "NODE_ID=%%b"
        if "%%a"=="AGENT_NODE_SECRET" set "SECRET=%%b"
    )
)

:CHECK_INTERACTIVE
echo.
echo  ====================================================================================
echo    [CRAFTCOMMAND AGENT RUNNER]
echo  ====================================================================================
echo.

:VALIDATE_ENVIRONMENT
set "NODE_OK=0"
where node >nul 2>nul
if !errorlevel! equ 0 set "NODE_OK=1"
:: Check for portable runtime relative to root from agent folder
if exist "..\.runtimes\node\node.exe" (
    set "PATH=%CD%\..\.runtimes\node;!PATH!"
    set "NODE_OK=1"
)

if "!NODE_OK!"=="1" goto CHECK_INTERACTIVE

echo.
echo  [DEPENDENCY MISSING] Node.js is required.
echo.
echo  [1] Install via Winget (System-wide)
echo  [2] Install via Bootstrapper (Local runtime)
echo  [0] Exit
echo.
set /p n_choice="  Choice: "

if "%n_choice%"=="1" (
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if !errorlevel! equ 0 (
        echo [SUCCESS] Please RESTART this script.
        pause
        exit
    )
    goto VALIDATE_ENVIRONMENT
)
if "%n_choice%"=="2" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "..\scripts\core\bootstrap-runtime.ps1"
    if !errorlevel! equ 0 (
        set "PATH=%CD%\..\.runtimes\node;!PATH!"
        goto CHECK_INTERACTIVE
    )
    goto VALIDATE_ENVIRONMENT
)
exit /b 1

:: Interactive Mode if no args provided
if "%NODE_ID%"=="" (
    echo  [INPUT REQUIRED]
    echo  Enter your Node Credentials (found in Dashboard -^> Nodes -^> Add Node)
    echo  These will be saved to .env for future zero-config startups.
    echo.
    set /p PANEL_URL="  > Panel URL [%PANEL_URL%]: "
    set /p NODE_ID="  > Node ID:   "
    set /p SECRET="  > Secret:    "
    
    (
        echo PANEL_URL=!PANEL_URL!
        echo AGENT_NODE_ID=!NODE_ID!
        echo AGENT_NODE_SECRET=!SECRET!
    ) > .env
    echo.
    echo  [SUCCESS] Settings saved to .env
)

if "%NODE_ID%"=="" (
    echo [Error] Node ID is required.
    pause
    exit /b 1
)

:: 2. Auto-Build Logic (Smart Check)
:: Check for the actual entry point file, not just the folder
if not exist "dist\index.js" (
    echo.
    echo  [SYSTEM] Build artifacts missing. Compiling agent...
    if not exist "node_modules" (
        echo   - Installing dependencies...
        call npm ci --loglevel=error
    )
    echo   - Building source code...
    call npm run build
    if !errorlevel! neq 0 (
        echo.
        echo [CRITICAL] Build failed! Please check the errors above.
        pause
        exit /b !errorlevel!
    )
    echo   - Build complete.
)

:: 3. Execution
:: Detect Correct Entry Point
set "RUN_PATH=dist\index.js"
if not exist "!RUN_PATH!" (
    echo [ERROR] Compiled agent entry point not found.
    echo Expected: !RUN_PATH!
    pause
    exit /b 1
)

echo.
echo  [SYSTEM] Connecting to Panel...
echo   - URL: %PANEL_URL%
echo   - ID:  %NODE_ID%
echo.

node !RUN_PATH! --panel-url "%PANEL_URL%" --node-id "%NODE_ID%" --secret "%SECRET%"

if %errorlevel% neq 0 (
    echo.
    echo  [STOPPED] Agent process exited with code %errorlevel%.
    pause
)
