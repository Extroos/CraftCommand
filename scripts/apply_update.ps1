# apply_update.ps1
# Usage: called by run_CraftCommand.bat when update-plan.json exists.
# Performs the atomic file swap and backup.

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$PlanFile = Join-Path $Root "update-plan.json"
$BackendDir = Join-Path $Root "backend"

Write-Host "`n[UPDATE] ========================================" -ForegroundColor Cyan
Write-Host "[UPDATE] CRAFTCOMMAND UPDATE APPLICATOR" -ForegroundColor Cyan
Write-Host "[UPDATE] ========================================" -ForegroundColor Cyan

if (-not (Test-Path $PlanFile)) {
    Write-Error "[UPDATE] Plan file not found: $PlanFile"
    exit 1
}

try {
    $plan = Get-Content $PlanFile | ConvertFrom-Json
    $version = $plan.version
    $sourceDir = $plan.sourceDir
    $backupDir = $plan.backupDir
    
    Write-Host "[UPDATE] Installing Version: v$version" -ForegroundColor Green
    Write-Host "[UPDATE] Source: $sourceDir"
    Write-Host "[UPDATE] Backup: $backupDir"

    # Verify Source Integrity (Basic check)
    if (-not (Test-Path (Join-Path $sourceDir "backend/package.json"))) {
        throw "Update bundle seems corrupted: backend/package.json missing in source."
    }

    # 1. Snapshot (Zero Data Loss Guarantee)
    Write-Host "`n[UPDATE] [1/3] Creating Pre-Update Snapshot..." -ForegroundColor Yellow
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    }
    
    $snapshotName = "pre-update-v$version-$((Get-Date).Ticks).zip"
    $snapshotPath = Join-Path $backupDir $snapshotName
    
    # Snapshot core code and version info
    $includes = @("backend/src", "backend/package.json", "web/current", "version.json")
    $includePaths = $includes | ForEach-Object { Join-Path $Root $_ }
    
    Compress-Archive -Path $includePaths -DestinationPath $snapshotPath -CompressionLevel Optimal -Force
    Write-Host "[UPDATE] Snapshot created: $snapshotName" -ForegroundColor Green

    # 2. Apply Files (Atomic Swap Pattern)
    Write-Host "`n[UPDATE] [2/3] Applying Update Files..." -ForegroundColor Yellow
    
    if (-not (Test-Path $sourceDir)) {
        throw "Source directory missing: $sourceDir"
    }

    # Core Directories to swap atomically
    $coreDirs = @("backend\src", "web\current")
    
    foreach ($dir in $coreDirs) {
        $sourcePath = Join-Path $sourceDir $dir
        $targetPath = Join-Path $Root $dir
        
        if (Test-Path $sourcePath) {
            Write-Host "  -> Atomic Swap: $dir"
            $oldPath = "$targetPath.old"
            
            # Move old out of the way
            if (Test-Path $oldPath) { Remove-Item $oldPath -Recurse -Force -ErrorAction SilentlyContinue }
            if (Test-Path $targetPath) { Rename-Item -Path $targetPath -NewName "$dir.old" -Force }
            
            # Move new in
            if (-not (Test-Path (Split-Path $targetPath))) { New-Item -ItemType Directory -Force -Path (Split-Path $targetPath) | Out-Null }
            Move-Item -Path $sourcePath -Destination $targetPath -Force
            
            # Cleanup old
            Remove-Item $oldPath -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    # Standard Overlay for non-core files (configs, readme, etc)
    $protected = @('data', '.env', 'uploads', 'config', 'node_modules', 'minecraft_servers', 'logs')
    Get-ChildItem -Path $sourceDir | ForEach-Object {
        if ($protected -contains $_.Name) { return }
        if ($coreDirs -contains "backend\$($_.Name)" -or $coreDirs -contains "web\$($_.Name)") { return }
        
        $dest = Join-Path $Root $_.Name
        Write-Host "  -> Syncing: $($_.Name)"
        Copy-Item -Path $_.FullName -Destination $Root -Recurse -Force
    }
    
    # 3. Cleanup & Signal
    Write-Host "`n[UPDATE] [3/3] Finalizing..." -ForegroundColor Yellow
    Remove-Item $sourceDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $PlanFile -Force
    
    $flagFile = Join-Path $Root "update_applied.flag"
    New-Item -ItemType File -Force -Path $flagFile | Out-Null
    
    Write-Host "[UPDATE] SUCCESS! Update v$version applied." -ForegroundColor Green
    exit 0
}
catch {
    Write-Error "[UPDATE] CRITICAL FAILURE: $($_.Exception.Message)"
    Write-Host "`n[UPDATE] RECOVERY REQUIRED" -ForegroundColor Red
    Write-Host "[UPDATE] Snapshot created in: $backupDir" -ForegroundColor Cyan
    Write-Host "[UPDATE] Run: 'powershell -ExecutionPolicy Bypass -File scripts\rollback.ps1'" -ForegroundColor Cyan
    exit 1
}
