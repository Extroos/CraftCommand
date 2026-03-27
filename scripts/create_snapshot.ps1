# create_snapshot.ps1
# Manually create a system recovery snapshot.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\create_snapshot.ps1

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackupDir = Join-Path $Root "backups\updates"

if (-not (Test-Path $BackupDir)) {
    New-Item -Path $BackupDir -ItemType Directory -Force | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Version = "1.12.5"
$ZipName = "pre-update-$Version-$Timestamp.zip"
$ZipPath = Join-Path $BackupDir $ZipName

Write-Host "`n[SNAPSHOT] ========================================" -ForegroundColor Cyan
Write-Host "[SNAPSHOT] CREATING SYSTEM SNAPSHOT" -ForegroundColor Cyan
Write-Host "[SNAPSHOT] ========================================" -ForegroundColor Cyan
Write-Host " This tool packages your core system files (Backend," -ForegroundColor Gray
Write-Host " Frontend, Shared internals, and Environment) into a" -ForegroundColor Gray
Write-Host " compressed archive. Use this to create a restore" -ForegroundColor Gray
Write-Host " point before making major changes." -ForegroundColor Gray
Write-Host ""
Write-Host "[SNAPSHOT] Target: $ZipName" -ForegroundColor Yellow

# Files to include
$Include = @(
    "backend/src", 
    "backend/data", 
    "frontend/src",
    "shared",
    "package.json",
    "version.json",
    ".env.example"
)

try {
    # Create temporary staging
    $Staging = Join-Path $env:TEMP "cc_snapshot_$Timestamp"
    if (Test-Path $Staging) { Remove-Item $Staging -Recurse -Force }
    New-Item $Staging -ItemType Directory | Out-Null

    foreach ($item in $Include) {
        $src = Join-Path $Root $item
        if (Test-Path $src) {
            $dest = Join-Path $Staging $item
            $parent = Split-Path $dest -Parent
            if (-not (Test-Path $parent)) { New-Item $parent -ItemType Directory | Out-Null }
            Copy-Item $src $dest -Recurse -Force
        }
    }

    # Zip it
    Compress-Archive -Path "$Staging\*" -DestinationPath $ZipPath -Force
    Remove-Item $Staging -Recurse -Force

    Write-Host "[SNAPSHOT] SUCCESS! Snapshot created in $BackupDir" -ForegroundColor Green
}
catch {
    Write-Error "[SNAPSHOT] Failed to create snapshot: $($_.Exception.Message)"
    exit 1
}
