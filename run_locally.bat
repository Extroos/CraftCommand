@echo off
cd /d "%~dp0"
title CraftCommand - Local Server Manager

echo ========================================================
echo   CraftCommand Local Environment
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:3001
echo   Process:  Unified (Close this window to stop both)
echo ========================================================
echo.

:: 1. Install Root Dependencies
if not exist node_modules (
    echo [Setup] Installing Frontend dependencies...
    call npm install
)

:: 2. Install Backend Dependencies
if not exist backend\node_modules (
    echo [Setup] Installing Backend dependencies...
    cd backend
    call npm install
    cd ..
)

:: 3. Start Everything
echo.
echo [System] Launching services...
call npm run start:all

pause
