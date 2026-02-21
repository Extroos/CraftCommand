@echo off
setlocal enabledelayedexpansion
title CraftCommand - Node Agent Worker

:: Default Defaults
set "PANEL_URL=http://localhost:3001"
set "NODE_ID="
set "SECRET="

:: 1. Parse Arguments (Simple Loop)
:PARSE_ARGS
if "%~1"=="" goto CHECK_INTERACTIVE
if "%~1"=="--node-id" (set "NODE_ID=%~2" & shift & shift & goto PARSE_ARGS)
if "%~1"=="--secret"  (set "SECRET=%~2"  & shift & shift & goto PARSE_ARGS)
if "%~1"=="--panel-url" (set "PANEL_URL=%~2" & shift & shift & goto PARSE_ARGS)
shift
goto PARSE_ARGS

:CHECK_INTERACTIVE
echo.
echo  ====================================================================================
echo    [CRAFTCOMMAND AGENT RUNNER]
echo  ====================================================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [CRITICAL] Node.js is not installed.
    echo Please install Node.js v18+ to run this agent.
    pause
    exit /b 1
)

:: Interactive Mode if no args provided
if "%NODE_ID%"=="" (
    echo  [INPUT REQUIRED]
    echo  Enter your Node Credentials (found in Dashboard -^> Nodes -^> Add Node)
    echo.
    set /p NODE_ID="  > Node ID: "
)
if "%SECRET%"=="" (
    set /p SECRET="  > Secret:  "
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
