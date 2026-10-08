<#
  The portable bundle's one-click setup ("Setup 一键安装.cmd" runs it from the bundle's setup\ folder):

    <bundle>\
      Setup 一键安装.cmd
      setup\portable.ps1, foobar2000-x64_v<version>.exe (the official installer, unmodified), 7z.exe + 7z.dll,
            foo_ui_columns-<version>.x86-x64.fb2k-component
      audio-archive-<version>\      the theme (install.ps1 and the rest)

  1. unpacks the official foobar2000 installer into <bundle>\foobar2000\ as a portable foobar2000 (its files only: no
     registry entries, shortcuts or file associations, no admin rights), unless that folder exists already
  2. runs the theme's install.ps1 on it: Columns UI from setup\, JSplitter from its official GitHub release, the
     theme, its fonts, the layout
  3. adds a shortcut "RhinE (foobar2000)" to <bundle>\

  Running it again keeps the foobar2000 folder and installs the theme again (how a newer bundle's theme is put in).
#>
param([switch]$NoStart)
$ErrorActionPreference = 'Stop'
$zh = (Get-UICulture).Name -like 'zh*'
function T($en, $cn) { if ($zh) { $cn } else { $en } }
function Fail($msg) { Write-Host "setup: $msg" -ForegroundColor Red; exit 1 }

$setup = $PSScriptRoot
$root = Split-Path $setup
$fb = Join-Path $root 'foobar2000'
$theme = Get-ChildItem $root -Directory -Filter 'audio-archive-*' | Where-Object Name -match '^audio-archive-\d+(\.\d+)+$' |
         Sort-Object { [version]($_.Name -replace '^audio-archive-', '') } -Descending | Select-Object -First 1   # the newest
if (-not $theme -or -not (Test-Path (Join-Path $theme.FullName 'install.ps1'))) { Fail (T 'the theme folder (audio-archive-*) is missing: unzip the whole bundle first' '缺少主题文件夹（audio-archive-…）：请先完整解压整个压缩包') }

# ------------------------------------------------------------------------------------------------ portable foobar2000
if (-not (Test-Path (Join-Path $fb 'foobar2000.exe'))) {
    $installer = Get-ChildItem $setup -Filter 'foobar2000-x64_v*.exe' | Select-Object -First 1
    $7z = Join-Path $setup '7z.exe'
    if (-not $installer -or -not (Test-Path $7z)) { Fail (T 'setup\ is incomplete: unzip the whole bundle first' 'setup 文件夹不完整：请先完整解压整个压缩包') }
    Write-Host (T "unpacking $($installer.Name) into $fb ..." "正在把 $($installer.Name) 解压为便携版：$fb ……")
    # the installer's own files, as its portable mode installs them: not its setup plug-ins, nor the icons and
    # shell-association helper that only a standard install uses
    & $7z x -tNsis -y "-o$fb" $installer.FullName '-x!$PLUGINSDIR' '-x!$R0' '-x!icons' '-x!foobar2000 Shell Associations Updater.exe' | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $fb 'foobar2000.exe'))) { Fail (T 'could not unpack the foobar2000 installer' '无法解压 foobar2000 安装程序') }
    New-Item -ItemType File -Force (Join-Path $fb 'portable_mode_enabled') | Out-Null
    $version = if ($installer.Name -match '_v([\d.]+)\.exe$') { $Matches[1] } else { '' }
    Set-Content (Join-Path $fb 'installer.ini') "[foobar2000]`r`nversion=$version`r`nrun_after_install=0" -Encoding ASCII
} else {
    Write-Host (T "using the foobar2000 in $fb" "使用已有的 foobar2000：$fb")
}

# ------------------------------------------------------------------------------------------------------------ theme
$psArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $theme.FullName 'install.ps1'), '-Foobar', $fb, '-Yes', '-ComponentDir', $setup)
if ($NoStart) { $psArgs += '-NoStart' }
& powershell @psArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# ------------------------------------------------------------------------------------------------------------ shortcut
$lnk = Join-Path $root 'RhinE (foobar2000).lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = Join-Path $fb 'foobar2000.exe'
$s.WorkingDirectory = $fb
$s.Save()
Write-Host ''
Write-Host (T "Next time, start it with '$lnk' (or foobar2000\foobar2000.exe). Add your music: MENU › Library › Configure (Media Library › + Folder)." `
              "以后用 '$lnk'（或 foobar2000\foobar2000.exe）启动。添加音乐：菜单 › Library › Configure（Media Library › + Folder）。")
