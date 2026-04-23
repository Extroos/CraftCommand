#Requires -RunAsAdministrator
# ============================================================
# CraftCommand — Windows Service Installer (NSSM)
#
# This script installs CraftCommand as a Windows Service
# so it starts automatically on boot and restarts on crash.
#
# Usage:
#   Right-click PowerShell → Run as Administrator
#   .\install_service_windows.ps1
#
# Requirements:
#   - Node.js 18+ installed
#   - CraftCommand backend built (npm run build in backend/)
# ============================================================

$ErrorActionPreference = "Stop"

$ServiceName = "CraftCommandPanel"
$DisplayName = "CraftCommand Panel"
$Description = "CraftCommand Minecraft Server Management Panel"

# Paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = (Resolve-Path "$ScriptDir\..\..\").Path.TrimEnd('\')
$BackendDir = Join-Path $ProjectRoot "backend"
$LogsDir = Join-Path $ProjectRoot "logs"
$NssmDir = Join-Path $ScriptDir "nssm"
$NssmExe = Join-Path $NssmDir "nssm.exe"

# Find Node.js
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $NodeExe) {
    Write-Host "[ERROR] Node.js not found. Install it from https://nodejs.org/" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Node.js: $NodeExe" -ForegroundColor Green

# Check backend build
$EntryPoint = Join-Path $BackendDir "dist\server.js"
if (-not (Test-Path $EntryPoint)) {
    Write-Host "[WARN] Backend not built. Building now..." -ForegroundColor Yellow
    Push-Location $BackendDir
    npm run build
    Pop-Location

    if (-not (Test-Path $EntryPoint)) {
        Write-Host "[ERROR] Build failed. Cannot find $EntryPoint" -ForegroundColor Red
        exit 1
    }
}
Write-Host "[OK] Entry point: $EntryPoint" -ForegroundColor Green

# Ensure logs directory
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}

# ── Download NSSM if not present ──

if (-not (Test-Path $NssmExe)) {
    Write-Host ""
    Write-Host "NSSM (Non-Sucking Service Manager) not found." -ForegroundColor Yellow
    Write-Host "Downloading NSSM..." -ForegroundColor Cyan
    
    $NssmUrl = "https://nssm.cc/release/nssm-2.24.zip"
    $NssmZip = Join-Path $env:TEMP "nssm.zip"
    $NssmExtract = Join-Path $env:TEMP "nssm-extract"
    
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $NssmUrl -OutFile $NssmZip -UseBasicParsing
        
        # Extract
        if (Test-Path $NssmExtract) { Remove-Item $NssmExtract -Recurse -Force }
        Expand-Archive -Path $NssmZip -DestinationPath $NssmExtract -Force
        
        # Copy the correct architecture binary
        New-Item -ItemType Directory -Path $NssmDir -Force | Out-Null
        $Arch = if ([Environment]::Is64BitOperatingSystem) { "win64" } else { "win32" }
        $NssmSource = Get-ChildItem -Path $NssmExtract -Filter "nssm.exe" -Recurse | 
            Where-Object { $_.DirectoryName -like "*$Arch*" } | 
            Select-Object -First 1
        
        if ($NssmSource) {
            Copy-Item $NssmSource.FullName $NssmExe
            Write-Host "[OK] NSSM downloaded to $NssmExe" -ForegroundColor Green
        } else {
            Write-Host "[ERROR] Could not find nssm.exe in downloaded archive." -ForegroundColor Red
            exit 1
        }
        
        # Cleanup
        Remove-Item $NssmZip -Force -ErrorAction SilentlyContinue
        Remove-Item $NssmExtract -Recurse -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "[ERROR] Failed to download NSSM: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please download NSSM manually from https://nssm.cc/download" -ForegroundColor Yellow
        Write-Host "and place nssm.exe in: $NssmDir" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "[OK] NSSM: $NssmExe" -ForegroundColor Green

# ── Check if service already exists ──

$ExistingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($ExistingService) {
    Write-Host ""
    Write-Host "[WARN] Service '$ServiceName' already exists (Status: $($ExistingService.Status))." -ForegroundColor Yellow
    $Confirm = Read-Host "Do you want to reinstall it? (y/n)"
    if ($Confirm -ne 'y') {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 0
    }
    
    # Stop and remove existing
    Write-Host "Stopping existing service..." -ForegroundColor Cyan
    & $NssmExe stop $ServiceName 2>$null
    Start-Sleep -Seconds 2
    & $NssmExe remove $ServiceName confirm
    Start-Sleep -Seconds 1
}

# ── Install Service ──

Write-Host ""
Write-Host "Installing CraftCommand as a Windows Service..." -ForegroundColor Cyan
Write-Host ""

# Install
& $NssmExe install $ServiceName $NodeExe $EntryPoint

# Configure
& $NssmExe set $ServiceName DisplayName $DisplayName
& $NssmExe set $ServiceName Description $Description
& $NssmExe set $ServiceName AppDirectory $ProjectRoot
& $NssmExe set $ServiceName AppEnvironmentExtra "NODE_ENV=production"

# Logging
& $NssmExe set $ServiceName AppStdout (Join-Path $LogsDir "service-stdout.log")
& $NssmExe set $ServiceName AppStderr (Join-Path $LogsDir "service-stderr.log")
& $NssmExe set $ServiceName AppRotateFiles 1
& $NssmExe set $ServiceName AppRotateBytes 10485760  # 10MB

# Restart behavior
& $NssmExe set $ServiceName AppExit Default Restart
& $NssmExe set $ServiceName AppRestartDelay 10000  # 10 seconds

# Startup type
& $NssmExe set $ServiceName Start SERVICE_AUTO_START

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Service '$ServiceName' installed!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Start:   nssm start $ServiceName" -ForegroundColor White
Write-Host "  Stop:    nssm stop $ServiceName" -ForegroundColor White
Write-Host "  Status:  nssm status $ServiceName" -ForegroundColor White
Write-Host "  Remove:  .\uninstall_service_windows.ps1" -ForegroundColor White
Write-Host "  Logs:    $LogsDir" -ForegroundColor White
Write-Host ""

# Start the service
$StartNow = Read-Host "Start the service now? (y/n)"
if ($StartNow -eq 'y') {
    & $NssmExe start $ServiceName
    Start-Sleep -Seconds 3
    $Svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($Svc -and $Svc.Status -eq 'Running') {
        Write-Host ""
        Write-Host "[OK] CraftCommand is running! Open http://localhost:3001" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[WARN] Service may have failed to start. Check logs in $LogsDir" -ForegroundColor Yellow
    }
}
