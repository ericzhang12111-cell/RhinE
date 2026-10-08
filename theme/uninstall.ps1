<#
  Removes the Audio Archive theme from a foobar2000 v2 installation. Double-click uninstall.cmd, or:

    powershell -ExecutionPolicy Bypass -File uninstall.ps1
    powershell -ExecutionPolicy Bypass -File uninstall.ps1 -Foobar "D:\Apps\foobar2000"

  -Foobar      the folder that contains foobar2000.exe. Without it, the foobar2000 that has the theme is looked for (the
               standard install, a portable one next to this folder) and you are asked to confirm.
  -KeepConfig  do not restore the configuration; only remove the theme files (the Columns UI layout then shows empty
               panels until you pick another layout or user interface)
  -KeepFonts   leave Geist Mono installed
  -Yes         do not ask (close foobar2000 if it is running, remove without confirming)

  By default it restores the configuration that install.ps1 backed up before the theme was first installed, so any
  foobar2000 setting changed since then is reverted too. The current configuration is backed up first, next to the
  install backups in <profile>\audio-archive-backup\; delete that folder when you no longer need it.
#>
param([string]$Foobar, [switch]$KeepConfig, [switch]$KeepFonts, [switch]$Yes)
$ErrorActionPreference = 'Stop'

$Name = 'audio-archive'
$zh = (Get-UICulture).Name -like 'zh*'
function T($en, $cn) { if ($zh) { $cn } else { $en } }
function Fail($msg) { Write-Host "uninstall: $msg" -ForegroundColor Red; exit 1 }
function Ask($question) {
    if ($Yes) { return $true }
    $a = Read-Host "$question [Y/n]"
    return -not $a -or $a -match '^(y|yes|是)$'
}
function Get-ProfileDir($folder) {
    if (Test-Path (Join-Path $folder 'portable_mode_enabled')) { Join-Path $folder 'profile' } else { Join-Path $env:APPDATA 'foobar2000-v2' }
}

if (-not $Foobar) {
    $candidates = @((Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\foobar2000' -ErrorAction SilentlyContinue).InstallLocation,
                    (Join-Path $env:ProgramFiles 'foobar2000'), (Join-Path $PSScriptRoot '..\foobar2000')) | Where-Object { $_ }
    $Foobar = $candidates | Where-Object { (Test-Path (Join-Path $_ 'foobar2000.exe')) -and (Test-Path (Join-Path (Get-ProfileDir $_) "themes\$Name")) } |
              Select-Object -First 1
    if (-not $Foobar) { Fail (T 'no foobar2000 with this theme found; run it with -Foobar "<the folder of foobar2000.exe>"' '没有找到装有本主题的 foobar2000；请用 -Foobar "<foobar2000.exe 所在文件夹>" 运行') }
}

$exe = Join-Path $Foobar 'foobar2000.exe'
if (-not (Test-Path $exe)) { Fail (T "no foobar2000.exe in '$Foobar'" "'$Foobar' 中没有 foobar2000.exe") }
$exe = (Resolve-Path $exe).Path
$Foobar = Split-Path $exe
$profileDir = Get-ProfileDir $Foobar
if (-not (Ask (T "Remove RhinE from $Foobar ?" "从 $Foobar 卸载 RhinE 吗？"))) { exit 1 }
$running = Get-CimInstance Win32_Process -Filter "Name='foobar2000.exe'" | Where-Object { $_.ExecutablePath -eq $exe }
if ($running) {
    if (-not (Ask (T 'foobar2000 is running. Close it now?' 'foobar2000 正在运行。现在关闭它吗？'))) { Fail (T 'close foobar2000 and run this again.' '请关闭 foobar2000 后重新运行。') }
    $p = Get-Process -Id $running.ProcessId
    [void]$p.CloseMainWindow()
    if (-not $p.WaitForExit(20000)) { Fail (T 'foobar2000 did not close (a dialog may be open). Close it and run this again.' 'foobar2000 没有关闭（可能有对话框开着）。请手动关闭后重新运行。') }
}

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
    $settings = Join-Path $profileDir "$Name-settings.json"
    if (Test-Path $settings) { Remove-Item $settings -Force; Write-Host "removed $settings" }
} else {
    Write-Host "'$target' does not look like this theme, left in place"
}

# --------------------------------------------------------------------------------------------------------------- fonts
if (-not $KeepFonts) { & (Join-Path $PSScriptRoot 'tools\fonts.ps1') -Uninstall | ForEach-Object { Write-Host $_ } }
Write-Host 'done.'
