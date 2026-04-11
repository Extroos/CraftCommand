
# scripts/bootstrap-runtime.ps1
# Automates the download of portable Node.js for CraftCommand

param (
    [string]$TargetVersion = "v20.18.0"
)

$ErrorActionPreference = "Stop"
$RuntimeDir = Join-Path $PSScriptRoot "..\.runtimes\node"
$NodeExe = Join-Path $RuntimeDir "node.exe"

# If Node exists locally, exit
if (Test-Path $NodeExe) {
    Write-Host "Portable Node.js detected."
    exit 0
}

Write-Host "Node.js not found in system PATH or local runtimes."
Write-Host "Initializing Zero-Config Bootstrapper..." -ForeColor Cyan

# Create Directory
if (-not (Test-Path $RuntimeDir)) {
    New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
}

# Determine Architecture
$Arch = "x64"
if ($env:PROCESSOR_ARCHITECTURE -eq "x86") { $Arch = "x86" }
if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { $Arch = "arm64" }

$ZipName = "node-$TargetVersion-win-$Arch.zip"
$DownloadUrl = "https://nodejs.org/dist/$TargetVersion/$ZipName"
$ZipPath = Join-Path $env:TEMP $ZipName

Write-Host "Downloading Node.js $TargetVersion ($Arch)..." -ForeColor Yellow
try {
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath -UseBasicParsing
}
catch {
    Write-Error "Failed to download Node.js. Please install manually."
    exit 1
}

Write-Host "Extracting runtime..." -ForeColor Yellow
Expand-Archive -Path $ZipPath -DestinationPath $env:TEMP -Force

# Move files to .runtimes/node
$ExtractedFolder = Join-Path $env:TEMP "node-$TargetVersion-win-$Arch"
Get-ChildItem -Path $ExtractedFolder | Move-Item -Destination $RuntimeDir -Force

# Cleanup
Remove-Item $ZipPath -Force
Remove-Item $ExtractedFolder -Recurse -Force

Write-Host "Node.js runtime installed successfully." -ForeColor Green
exit 0
