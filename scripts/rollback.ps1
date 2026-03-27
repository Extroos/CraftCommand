# rollback.ps1
# Emergency restoration utility for CraftCommand.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\rollback.ps1

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackupDir = Join-Path $Root "backups\updates"

Write-Host "`n[RECOVERY] ========================================" -ForegroundColor Cyan
Write-Host "[RECOVERY] CRAFTCOMMAND EMERGENCY ROLLBACK" -ForegroundColor Cyan
Write-Host "[RECOVERY] ========================================" -ForegroundColor Cyan
Write-Host " This tool restores your core system files (backend/src," -ForegroundColor Gray
Write-Host " web/current) from a previous pre-update snapshot. Use" -ForegroundColor Gray
Write-Host " this if an update fails or if a configuration mistake" -ForegroundColor Gray
Write-Host " has rendered the platform unusable. " -ForegroundColor Gray
Write-Host ""

if (-not (Test-Path $BackupDir)) {
    New-Item -Path $BackupDir -ItemType Directory -Force | Out-Null
    Write-Host "[RECOVERY] No update backups found (directory created)." -ForegroundColor Yellow
    exit 0
}

# 1. Find latest snapshot
$latestSnapshot = Get-ChildItem -Path $BackupDir -Filter "pre-update-*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($null -eq $latestSnapshot) {
    Write-Host "[RECOVERY] No update snapshots found. Use 'create_snapshot' to generate one." -ForegroundColor Yellow
    exit 0
}

Write-Host "[RECOVERY] Target Snapshot: $($latestSnapshot.Name)" -ForegroundColor Yellow
Write-Host "[RECOVERY] Last Modified: $($latestSnapshot.LastWriteTime)"

Write-Host "`n[RECOVERY] WARNING: This will overwrite backend/src and web/current." -ForegroundColor Red
$confirm = Read-Host "[RECOVERY] Proceed with restoration? (y/n)"
if ($confirm -ne "y") {
    Write-Host "[RECOVERY] Aborted."
    exit 0
}

try {
    # 2. Extract snapshot
    Write-Host "[RECOVERY] [1/2] Restoring files..." -ForegroundColor Yellow
    
    # We use Expand-Archive -Force to overwrite
    Expand-Archive -Path $latestSnapshot.FullName -DestinationPath $Root -Force
    
    # 3. Cleanup Stability Artifacts
    Write-Host "[RECOVERY] [2/2] Cleaning up stability artifacts..." -ForegroundColor Yellow
    
    $artifacts = @("backend/src.old", "web/current.old", "update-plan.json", "update_applied.flag")
    foreach ($art in $artifacts) {
        $p = Join-Path $Root $art
        if (Test-Path $p) {
            Write-Host "  -> Removing $art"
            Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host "`n[RECOVERY] SUCCESS! System restored to state: v$($latestSnapshot.Name.Split('-')[2])" -ForegroundColor Green
    Write-Host "[RECOVERY] Please restart the launcher." -ForegroundColor Cyan
}
catch {
    Write-Error "[RECOVERY] CRITICAL FAILURE during restoration: $($_.Exception.Message)"
    exit 1
}
