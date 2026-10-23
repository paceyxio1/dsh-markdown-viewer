<#
.SYNOPSIS
  Installs (or removes) dsh-plugin-markdown-viewer in a DSH profile.

.DESCRIPTION
  A DSH profile loads a locally developed plugin from two places:

    1. a node_modules entry the profile can resolve the package name through;
    2. a row in the profile's cordis.patch.yml that inserts the plugin.

  This script performs both, using a directory junction so the profile always
  reads the working copy. It is idempotent: re-running it repairs the junction
  and leaves an already-patched cordis.patch.yml alone. The profile's
  cordis.patch.yml is backed up before it is touched.

  A restart of DSH is required afterwards; a plugin row is mounted at profile
  load.

.PARAMETER Profile
  Profile name under $DSH_HOME\profiles. Defaults to 'desktop'.

.PARAMETER Uninstall
  Remove the junction and the inserted cordis row instead of installing.

.PARAMETER SkipBuildCheck
  Do not fail when the build artifacts are missing.

.EXAMPLE
  pwsh -File install.ps1
  pwsh -File install.ps1 -Profile web
  pwsh -File install.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [string]$Profile = 'desktop',
  [switch]$Uninstall,
  [switch]$SkipBuildCheck
)

$ErrorActionPreference = 'Stop'

$packageName = 'dsh-plugin-markdown-viewer'
$pluginId = 'markdown-viewer'
# This script lives at the plugin root, so its own directory is the repo root.
$repoRoot = $PSScriptRoot

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$profileDir = Join-Path (Join-Path $dshHome 'profiles') $Profile
$patchFile = Join-Path $profileDir 'cordis.patch.yml'
$linkPath = Join-Path (Join-Path $profileDir 'node_modules') $packageName

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "    $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "    $Message" -ForegroundColor Yellow }

# DSH's own YAML is UTF-8 without a BOM; Set-Content -Encoding UTF8 would add one
# on Windows PowerShell 5.1, so every write goes through this instead.
function Write-TextFile([string]$Path, [string]$Text) {
  [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}

if (-not (Test-Path -LiteralPath $profileDir)) {
  throw "DSH profile not found: $profileDir"
}

# --- uninstall -------------------------------------------------------------
if ($Uninstall) {
  Write-Step "Removing $packageName from profile '$Profile'"

  if (Test-Path -LiteralPath $linkPath) {
    # Only ever delete a reparse point; never recurse into a real directory.
    $item = Get-Item -LiteralPath $linkPath -Force
    if ($item.LinkType) {
      [System.IO.Directory]::Delete($linkPath, $false)
      Write-Ok "removed junction $linkPath"
    }
    else {
      Write-Warn "$linkPath is a real directory, not a junction; left in place"
    }
  }
  else {
    Write-Ok 'no junction to remove'
  }

  if (Test-Path -LiteralPath $patchFile) {
    # Remove exactly the block this script writes, and nothing else.
    $text = [System.IO.File]::ReadAllText($patchFile)
    $pattern = "(?m)^# $([regex]::Escape($packageName)) \(added by install\.ps1\)\r?\n- insert:\r?\n    - id: $([regex]::Escape($pluginId))\r?\n      name: $([regex]::Escape($packageName))\r?\n?"
    if ($text -match $pattern) {
      Write-TextFile $patchFile ([regex]::Replace($text, $pattern, ''))
      Write-Ok 'removed the cordis.patch.yml row'
    }
    else {
      Write-Ok 'cordis.patch.yml has no row to remove'
    }
  }

  Write-Host ''
  Write-Host 'Restart DSH to unload the plugin.' -ForegroundColor Yellow
  return
}

# --- preflight -------------------------------------------------------------
Write-Step "Installing $packageName into profile '$Profile'"

foreach ($artifact in @('client.js', 'dist\index.js')) {
  $path = Join-Path $repoRoot $artifact
  if (-not (Test-Path -LiteralPath $path)) {
    if ($SkipBuildCheck) { Write-Warn "missing build artifact: $artifact" }
    else { throw "Missing build artifact '$artifact'. Run 'pnpm install' and 'pnpm build' in $repoRoot first." }
  }
}

# --- 1. resolve the package name from the profile --------------------------
$modulesDir = Join-Path $profileDir 'node_modules'
if (-not (Test-Path -LiteralPath $modulesDir)) { New-Item -ItemType Directory -Path $modulesDir | Out-Null }

if (Test-Path -LiteralPath $linkPath) {
  $existing = Get-Item -LiteralPath $linkPath -Force
  if ($existing.LinkType -and $existing.Target -eq $repoRoot) {
    Write-Ok "junction already points at $repoRoot"
  }
  elseif ($existing.LinkType) {
    [System.IO.Directory]::Delete($linkPath, $false)
    New-Item -ItemType Junction -Path $linkPath -Target $repoRoot | Out-Null
    Write-Ok "repaired junction -> $repoRoot"
  }
  else {
    throw "$linkPath exists and is not a junction. Remove it manually, then re-run."
  }
}
else {
  New-Item -ItemType Junction -Path $linkPath -Target $repoRoot | Out-Null
  Write-Ok "junction -> $repoRoot"
}

# --- 2. insert the cordis row ---------------------------------------------
if (-not (Test-Path -LiteralPath $patchFile)) {
  throw "cordis.patch.yml not found: $patchFile"
}

$patchText = Get-Content -LiteralPath $patchFile -Raw
if ($patchText -match "(?m)^\s*-\s*id:\s*$([regex]::Escape($pluginId))\s*$") {
  Write-Ok 'cordis.patch.yml already lists the plugin'
}
else {
  $backup = "$patchFile.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $patchFile -Destination $backup
  Write-Ok "backed up to $(Split-Path -Leaf $backup)"

  $block = @(
    ''
    "# $packageName (added by install.ps1)"
    '- insert:'
    "    - id: $pluginId"
    "      name: $packageName"
  ) -join [Environment]::NewLine

  if (-not $patchText.EndsWith([Environment]::NewLine)) { $patchText += [Environment]::NewLine }
  Write-TextFile $patchFile ($patchText + $block + [Environment]::NewLine)
  Write-Ok 'added the insert row to cordis.patch.yml'
}

Write-Host ''
Write-Host 'Installed. Restart DSH to mount the plugin row.' -ForegroundColor Yellow
Write-Host "Then open Settings and look for the '$pluginId' page." -ForegroundColor Yellow
