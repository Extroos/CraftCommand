#Requires -RunAsAdministrator
# ============================================================
# CraftCommand — Windows Service Uninstaller
#
# Removes the CraftCommand Windows Service installed by
# install_service_windows.ps1
#
# Usage:
#   Right-click PowerShell → Run as Administrator
#   .\uninstall_service_windows.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$ServiceName = "CraftCommandPanel"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$NssmExe = Join-Path $ScriptDir "nssm\nssm.exe"

# Check if NSSM exists
if (-not (Test-Path $NssmExe)) {
    # Try system PATH
    $NssmExe = (Get-Command nssm -ErrorAction SilentlyContinue).Source
    if (-not $NssmExe) {
        Write-Host "[ERROR] NSSM not found. Cannot uninstall service." -ForegroundColor Red
        Write-Host "You can try: sc.exe delete $ServiceName" -ForegroundColor Yellow
        exit 1
    }
}

# Check if service exists
$Service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $Service) {
    Write-Host "[INFO] Service '$ServiceName' does not exist. Nothing to do." -ForegroundColor Yellow
    exit 0
}

Write-Host "Service '$ServiceName' found (Status: $($Service.Status))." -ForegroundColor Cyan
Write-Host ""

$Confirm = Read-Host "Are you sure you want to remove this service? (y/n)"
if ($Confirm -ne 'y') {
    Write-Host "Aborted." -ForegroundColor Yellow
    exit 0
}

# Stop the service
if ($Service.Status -eq 'Running') {
    Write-Host "Stopping service..." -ForegroundColor Cyan
    & $NssmExe stop $ServiceName
    Start-Sleep -Seconds 3
}

# Remove the service
Write-Host "Removing service..." -ForegroundColor Cyan
& $NssmExe remove $ServiceName confirm

Start-Sleep -Seconds 1

# Verify
$Check = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($Check) {
    Write-Host "[WARN] Service may still exist. Try rebooting or run: sc.exe delete $ServiceName" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "[OK] Service '$ServiceName' has been removed." -ForegroundColor Green
    Write-Host ""
    Write-Host "Note: Log files in the 'logs/' directory were NOT deleted." -ForegroundColor White
    Write-Host "Note: NSSM binary in 'scripts/windows/nssm/' was NOT deleted." -ForegroundColor White
}
