<#
  Removes the Audio Archive theme from a foobar2000 v2 installation.

    powershell -ExecutionPolicy Bypass -File uninstall.ps1 -Foobar "D:\Apps\foobar2000"

  -Foobar      the folder that contains foobar2000.exe
  -KeepConfig  do not restore the configuration; only remove the theme files (the Columns UI layout then shows empty
               panels until you pick another layout or user interface)
  -KeepFonts   leave Geist Mono installed

  By default it restores the configuration that install.ps1 backed up before the theme was first installed, so any
  foobar2000 setting changed since then is reverted too. The current configuration is backed up first, next to the
  install backups in <profile>\audio-archive-backup\; delete that folder when you no longer need it.
#>
param([Parameter(Mandatory)][string]$Foobar, [switch]$KeepConfig, [switch]$KeepFonts)
$ErrorActionPreference = 'Stop'

$Name = 'audio-archive'
function Fail($msg) { Write-Host "uninstall: $msg" -ForegroundColor Red; exit 1 }

$exe = Join-Path $Foobar 'foobar2000.exe'
if (-not (Test-Path $exe)) { Fail "no foobar2000.exe in '$Foobar'" }
$exe = (Resolve-Path $exe).Path
$Foobar = Split-Path $exe
$profileDir = if (Test-Path (Join-Path $Foobar 'portable_mode_enabled')) { Join-Path $Foobar 'profile' } else { Join-Path $env:APPDATA 'foobar2000-v2' }
$running = Get-CimInstance Win32_Process -Filter "Name='foobar2000.exe'" | Where-Object { $_.ExecutablePath -eq $exe }
if ($running) { Fail 'this foobar2000 is running. Close it and run this again.' }

# ------------------------------------------------------------------------------------------------ restore configuration
if (-not $KeepConfig) {
    $root = Join-Path $profileDir "$Name-backup"
    # the oldest install backup is the configuration from before the theme
    $first = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue | Where-Object Name -match '^\d{8}-\d{6}$' |
             Sort-Object Name | Select-Object -First 1
    if (-not $first) { Fail "no install backup in '$root'. Run again with -KeepConfig to remove only the theme files." }

    $current = Join-Path $root ('before-uninstall-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Force $current | Out-Null
    Copy-Item (Join-Path $profileDir 'config.sqlite') $current
    if (Test-Path (Join-Path $profileDir 'configuration')) { Copy-Item (Join-Path $profileDir 'configuration') $current -Recurse }

    Copy-Item (Join-Path $first.FullName 'config.sqlite') $profileDir -Force
    if (Test-Path (Join-Path $first.FullName 'configuration')) {
        Remove-Item (Join-Path $profileDir 'configuration') -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item (Join-Path $first.FullName 'configuration') $profileDir -Recurse
    }
    Write-Host "restored the configuration from $($first.FullName) (the current one is kept in $current)"
}

# --------------------------------------------------------------------------------------------------------- theme files
$target = Join-Path $profileDir "themes\$Name"
$item = Get-Item $target -ErrorAction SilentlyContinue
if (-not $item) {
    Write-Host 'no theme folder to remove'
} elseif ($item.LinkType) {
    Write-Host "theme folder is a link (development checkout), left in place: $target"
} elseif (Test-Path (Join-Path $target 'tokens\tokens.json')) {
    Remove-Item $target -Recurse -Force
    Write-Host "removed $target"
} else {
    Write-Host "'$target' does not look like this theme, left in place"
}

# --------------------------------------------------------------------------------------------------------------- fonts
if (-not $KeepFonts) { & (Join-Path $PSScriptRoot 'tools\fonts.ps1') -Uninstall | ForEach-Object { Write-Host $_ } }
Write-Host 'done.'
