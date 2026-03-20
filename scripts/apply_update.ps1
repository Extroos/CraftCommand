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

    # 1. Backup
    Write-Host "`n[UPDATE] [1/3] Creating Backup..." -ForegroundColor Yellow
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    }
    
    $exclude = @('node_modules', 'data', 'logs', 'uploads', '.env')
    
    Get-ChildItem -Path $BackendDir -Exclude $exclude | ForEach-Object {
        $dest = Join-Path $backupDir $_.Name
        if ($_.PSIsContainer) {
            Copy-Item -Path "$($_.FullName)\*" -Destination $dest -Recurse -Force -ErrorAction SilentlyContinue
        }
        else {
            Copy-Item -Path $_.FullName -Destination $dest -Force
        }
    }
    Write-Host "[UPDATE] Backup complete." -ForegroundColor Green

    # 2. Apply Files (Atomic-ish Swap)
    Write-Host "`n[UPDATE] [2/3] Applying Update Files..." -ForegroundColor Yellow
    
    if (-not (Test-Path $sourceDir)) {
        throw "Source directory missing: $sourceDir"
    }

    $protected = @('data', '.env', 'uploads', 'config', 'node_modules', 'minecraft_servers', 'logs')

    # Atomic swap: We'll rename old dirs and move new ones if possible, 
    # but for local Windows, Copy-Item -Force is often safer against locks.
    # We will however verify the target exists after copy.

    Get-ChildItem -Path $sourceDir | ForEach-Object {
        if ($protected -contains $_.Name) {
            Write-Warning "  [SKIP] Protected path found in update bundle: $($_.Name)"
            return
        }
        
        $dest = Join-Path $Root $_.Name
        Write-Host "  -> Updating: $($_.Name)"
        
        if ($_.PSIsContainer) {
            if (-not (Test-Path $dest)) {
                New-Item -ItemType Directory -Force -Path $dest | Out-Null
            }
            Copy-Item -Path "$($_.FullName)\*" -Destination $dest -Recurse -Force
        }
        else {
            Copy-Item -Path $_.FullName -Destination $dest -Force
        }

        # Verification
        if (-not (Test-Path $dest)) {
            throw "Failed to verify file application: $dest"
        }
    }
    
    # 3. Cleanup & Signal
    Write-Host "`n[UPDATE] [3/3] Finalizing..." -ForegroundColor Yellow
    
    # Cleanup extracted files
    Remove-Item $sourceDir -Recurse -Force -ErrorAction SilentlyContinue

    Remove-Item $PlanFile -Force
    
    # Create flag for dependency update
    $flagFile = Join-Path $Root "update_applied.flag"
    New-Item -ItemType File -Force -Path $flagFile | Out-Null
    
    Write-Host "[UPDATE] SUCCESS! Update v$version applied." -ForegroundColor Green
    exit 0
}
catch {
    Write-Error "[UPDATE] CRITICAL FAILURE: $($_.Exception.Message)"
    Write-Host "[UPDATE] Attempting to restore from backup is recommended manually." -ForegroundColor Red
    exit 1
}
