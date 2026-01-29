@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title CraftCommand - Server Manager
color 0B

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
echo    [1] Start (Auto-Setup)
echo    [2] Reinstall (Fix Issues)
echo    [3] Exit
echo.
set /p choice="Select Option: "

if "%choice%"=="1" goto START
if "%choice%"=="2" goto REINSTALL
if "%choice%"=="3" exit
goto MENU

:START
cls
echo [System] Checking Environment...

:: Check Node
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [Error] Node.js is not installed. Please install Node.js to continue.
    pause
    goto MENU
)

:: Smart Install Logic
set MISSING_DEPS=0
if not exist node_modules set MISSING_DEPS=1
if not exist backend\node_modules set MISSING_DEPS=1

if "%MISSING_DEPS%"=="1" (
    echo [Setup] First time setup detected. Installing files...
    echo.
    echo [1/3] Installing Dashboard...
    cd frontend
    call npm install
    cd ..
    echo.
    echo [2/3] Installing Backend...
    cd backend
    call npm install
    cd ..
    echo.
    echo [3/3] Installing Root Tools...
    call npm install
    echo.
    echo [Success] Installation complete. Starting...
) else (
    echo [System] Files verified. Launching...
)

echo.
call npm run start:all
pause
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
cd frontend
rmdir /s /q node_modules 2>nul
cd ..
echo [2/6] Cleaning Backend...
rmdir /s /q backend\node_modules 2>nul
echo [3/6] Cleaning Root...
rmdir /s /q node_modules 2>nul

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
echo [Success] Reset complete. You can now Start.
pause
goto MENU
