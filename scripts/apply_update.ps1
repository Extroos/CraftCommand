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

    # 1. Backup
    Write-Host "`n[UPDATE] [1/3] Creating Backup..." -ForegroundColor Yellow
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    }
    
    # We backup backend mainly, as that's where critical logic lives. 
    # Frontend builds are replaceable.
    # Exclude 'node_modules', 'data', '.env' to save space/time/security
    $exclude = @('node_modules', 'data', 'logs', 'uploads', '.env')
    
    # Use Copy-Item with \* to copy contents correctly
    Get-ChildItem -Path $BackendDir -Exclude $exclude | ForEach-Object {
        $dest = Join-Path $backupDir $_.Name
        if ($_.PSIsContainer) {
            # If it's a directory, we need to ensure the destination exists and copy its children
            Copy-Item -Path "$($_.FullName)\*" -Destination $dest -Recurse -Force -ErrorAction SilentlyContinue
        }
        else {
            Copy-Item -Path $_.FullName -Destination $dest -Force
        }
    }
    Write-Host "[UPDATE] Backup complete." -ForegroundColor Green

    # 2. Apply Files
    Write-Host "`n[UPDATE] [2/3] Applying Update Files..." -ForegroundColor Yellow
    
    if (-not (Test-Path $sourceDir)) {
        throw "Source directory missing: $sourceDir"
    }

    # Protected paths that should NEVER be overwritten from an update bundle
    $protected = @('data', '.env', 'uploads', 'config', 'node_modules', 'minecraft_servers', 'logs')

    Get-ChildItem -Path $sourceDir | ForEach-Object {
        if ($protected -contains $_.Name) {
            Write-Warning "  [SKIP] Protected path found in update bundle: $($_.Name)"
            return
        }
        
        $dest = Join-Path $Root $_.Name
        Write-Host "  -> Updating: $($_.Name)"
        
        if ($_.PSIsContainer) {
            # Merge directory contents
            if (-not (Test-Path $dest)) {
                New-Item -ItemType Directory -Force -Path $dest | Out-Null
            }
            Copy-Item -Path "$($_.FullName)\*" -Destination $dest -Recurse -Force
        }
        else {
            # Overwrite file
            Copy-Item -Path $_.FullName -Destination $dest -Force
        }
    }
    
    # 3. Cleanup & Signal
    Write-Host "`n[UPDATE] [3/3] Finalizing..." -ForegroundColor Yellow
    Remove-Item $PlanFile -Force
    
    # Create flag for dependency update
    $flagFile = Join-Path $Root "update_applied.flag"
    New-Item -ItemType File -Force -Path $flagFile | Out-Null
    
    Write-Host "[UPDATE] SUCCESS! Update v$version applied." -ForegroundColor Green
    exit 0

}
catch {
    Write-Error "[UPDATE] CRITICAL FAILURE: $($_.Exception.Message)"
    exit 1
}
