<#
  Updates the Audio Archive theme in one foobar2000 to the latest release. The theme starts it from its UPDATE chip
  (or MENU › Audio Archive › Check for updates); it can also be run by hand:

    powershell -ExecutionPolicy Bypass -File update.ps1 -Foobar "C:\Program Files\foobar2000" [-Yes] [-Full] [-Force]

  -Foobar  the folder that contains foobar2000.exe
  -Yes     do not ask before updating
  -Full    download the whole release zip instead of only the files that changed
  -Force   update even when the installed version is the latest

  1. reads the latest release (theme/update/latest.json in the repository) and its file list (theme/update/files.json
     at that release's tag): every file of the theme with its size and SHA-256
  2. builds the new theme in a temporary folder: files that are the same as installed are copied from the installed
     theme, the others are downloaded from the repository at the release's tag (from GitHub, else through jsDelivr);
     when most of the theme changed, or a download fails, the release zip is downloaded instead. Every file is
     checked against its SHA-256 before it is used.
  3. runs that version's install.ps1, which closes foobar2000, backs up its configuration, replaces the theme (your
     settings are kept) and starts foobar2000 again.
#>
param([Parameter(Mandatory)][string]$Foobar, [switch]$Yes, [switch]$Full, [switch]$Force,
      [string]$Repo = 'ericzhang12111-cell/RhinE')
$ErrorActionPreference = 'Stop'
$zh = (Get-UICulture).Name -like 'zh*'
function T($en, $cn) { if ($zh) { $cn } else { $en } }
function Say($msg, $colour = 'Gray') { Write-Host $msg -ForegroundColor $colour }
function Done($code) { if (-not $Yes) { Write-Host ''; Read-Host (T 'Press Enter to close' '按回车键关闭') | Out-Null }; exit $code }
function Fail($msg) {
    Say "update: $msg" Red
    Say (T "You can also update by hand: https://github.com/$Repo/releases" "也可以手动更新：https://github.com/$Repo/releases") Yellow
    Done 1
}

# the theme folder is replaced by the update: run from a copy of this script in the temporary folder
$work = Join-Path ([IO.Path]::GetTempPath()) 'rhine-update'
if ($PSCommandPath -and -not $PSCommandPath.StartsWith($work, [StringComparison]::OrdinalIgnoreCase)) {
    New-Item -ItemType Directory -Force $work | Out-Null
    $copy = Join-Path $work 'update.ps1'
    Copy-Item $PSCommandPath $copy -Force
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $copy, '-Foobar', $Foobar, '-Repo', $Repo)
    if ($Yes) { $a += '-Yes' }; if ($Full) { $a += '-Full' }; if ($Force) { $a += '-Force' }
    & powershell @a
    exit $LASTEXITCODE
}
$Host.UI.RawUI.WindowTitle = 'RhinE update'

# where things come from (RHINE_RAW / RHINE_CDN / RHINE_RELEASES replace them for tests)
$raw = if ($env:RHINE_RAW) { $env:RHINE_RAW } else { 'https://raw.githubusercontent.com' }
$cdn = if ($env:RHINE_CDN) { $env:RHINE_CDN } else { 'https://cdn.jsdelivr.net/gh' }
$rel = if ($env:RHINE_RELEASES) { $env:RHINE_RELEASES } else { 'https://github.com' }
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'
$wc = New-Object Net.WebClient
$wc.Headers['User-Agent'] = 'RhinE-updater'
$wc.Encoding = [Text.Encoding]::UTF8
$enc = { param($p) ($p -split '/' | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/' }
# a repository file at a ref: GitHub first, then jsDelivr
function Get-RepoUrls($path, $ref) { @("$raw/$Repo/$ref/$(& $enc $path)", "$cdn/$Repo@$ref/$(& $enc $path)") }
function Get-RepoText($path, $ref) {
    foreach ($u in Get-RepoUrls $path $ref) { try { return $wc.DownloadString($u) } catch { } }
    $null
}
function Get-Sha256($file) {
    $f = [IO.File]::OpenRead($file)
    try { -join ([Security.Cryptography.SHA256]::Create().ComputeHash($f) | ForEach-Object { $_.ToString('x2') }) } finally { $f.Dispose() }
}
function Get-Version($s) { try { [version]([string]$s).Trim() } catch { [version]'0.0' } }

# ------------------------------------------------------------------------------------------------------- what is new
$exe = Join-Path $Foobar 'foobar2000.exe'
if (-not (Test-Path $exe)) { Fail (T "no foobar2000.exe in '$Foobar'" "'$Foobar' 中没有 foobar2000.exe") }
$Foobar = Split-Path (Resolve-Path $exe).Path
$profileDir = if (Test-Path (Join-Path $Foobar 'portable_mode_enabled')) { Join-Path $Foobar 'profile' } else { Join-Path $env:APPDATA 'foobar2000-v2' }
$target = Join-Path $profileDir 'themes\audio-archive'
$installed = if (Test-Path (Join-Path $target 'VERSION')) { Get-Version (Get-Content (Join-Path $target 'VERSION') -Raw) } else { [version]'0.0' }

Say (T 'Looking for the latest version...' '正在查找最新版本...')
$latestText = Get-RepoText 'theme/update/latest.json' 'main'
if (-not $latestText) { Fail (T 'could not reach GitHub or jsDelivr.' '无法连接 GitHub 或 jsDelivr。') }
$latest = $latestText | ConvertFrom-Json
$new = Get-Version $latest.version
Say ("RhinE {0} → {1}" -f $installed, $new) White
if ($new -le $installed -and -not $Force) { Say (T 'You have the latest version.' '已经是最新版本。') Green; Done 0 }
$notes = if ($zh -and $latest.notes.zh) { $latest.notes.zh } else { $latest.notes.en }
foreach ($n in @($notes)) { Say "  · $n" }
if (-not $Yes) {
    $a = Read-Host (T 'Update now? foobar2000 will close and start again [Y/n]' '现在更新吗？foobar2000 会关闭后重新启动 [Y/n]（回车 = 是）')
    if ($a -and $a -notmatch '^(y|yes|是)$') { Done 1 }
}

# --------------------------------------------------------------------------------------------- the new theme, staged
$tag = $latest.tag
$filesText = Get-RepoText 'theme/update/files.json' $tag
if (-not $filesText) { Fail (T 'could not read the list of files.' '无法读取文件列表。') }
$list = $filesText | ConvertFrom-Json
$stage = Join-Path $work "audio-archive-$($latest.version)"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

# each entry: path in the theme, path in the repository, size, SHA-256 as shipped in the zip, SHA-256 in the repository
$get = [Collections.Generic.List[object]]::new()
$need = 0L
Say (T 'Comparing with the installed theme...' '正在与已安装的主题比较...')
foreach ($f in $list.files) {
    $path, $repoPath, $size, $sha, $rsha = $f
    if (-not $rsha) { $rsha = $sha }
    $local = Join-Path $target ($path -replace '/', '\')
    $dest = Join-Path $stage ($path -replace '/', '\')
    if (-not $Full -and (Test-Path $local)) {
        $h = Get-Sha256 $local
        if ($h -eq $sha -or $h -eq $rsha) {
            New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
            Copy-Item $local $dest
            continue
        }
    }
    $get.Add([pscustomobject]@{ Path = $path; Repo = $repoPath; Size = [long]$size; Sha = $sha; Rsha = $rsha; Dest = $dest })
    $need += [long]$size
}

function Get-Zip {
    $zip = $list.zip
    $file = Join-Path $work $zip.name
    Say (T ("downloading {0} ({1:N0} MB)..." -f $zip.name, ($zip.size / 1MB)) ("正在下载 {0}（{1:N0} MB）..." -f $zip.name, ($zip.size / 1MB)))
    try { $wc.DownloadFile("$rel/$Repo/releases/download/$tag/$($zip.name)", $file) } catch { return $false }
    if ((Get-Sha256 $file) -ne $zip.sha256) { return $false }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $out = Join-Path $work 'zip'
    if (Test-Path $out) { Remove-Item $out -Recurse -Force }
    [IO.Compression.ZipFile]::ExtractToDirectory($file, $out)
    Remove-Item $file -Force
    $script:stage = (Get-ChildItem $out -Directory | Select-Object -First 1).FullName
    $true
}

$useZip = $Full -or ($list.zip -and $need -gt 0.6 * [long]$list.zip.size)
if (-not $useZip) {
    Say (T ("{0} files changed, {1:N1} MB to download" -f $get.Count, ($need / 1MB)) ("有 {0} 个文件变化，需下载 {1:N1} MB" -f $get.Count, ($need / 1MB)))
    $i = 0
    foreach ($g in $get) {
        $i++
        Write-Progress -Activity 'RhinE' -Status $g.Path -PercentComplete ([int](100 * $i / [math]::Max(1, $get.Count)))
        New-Item -ItemType Directory -Force (Split-Path $g.Dest) | Out-Null
        $ok = $false
        foreach ($u in Get-RepoUrls $g.Repo $tag) {
            try { $wc.DownloadFile($u, $g.Dest); $h = Get-Sha256 $g.Dest; if ($h -eq $g.Rsha -or $h -eq $g.Sha) { $ok = $true; break } } catch { }
        }
        if (-not $ok) { Say (T "could not download $($g.Path); trying the release zip" "无法下载 $($g.Path)，改为下载完整安装包") Yellow; $useZip = $true; break }
    }
    Write-Progress -Activity 'RhinE' -Completed
}
if ($useZip -and -not (Get-Zip)) { Fail (T 'could not download the release zip.' '无法下载完整安装包。') }

# ----------------------------------------------------------------------------------------------------------- install
if (-not (Test-Path (Join-Path $stage 'install.ps1'))) { Fail (T 'the downloaded theme is incomplete.' '下载的主题不完整。') }
Say (T 'Installing...' '正在安装...') White
$env:PSModulePath = $null
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $stage 'install.ps1') -Foobar $Foobar -Yes
$code = $LASTEXITCODE
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
if ($code -ne 0) { Fail (T 'the installer stopped (see above).' '安装程序未完成（见上方信息）。') }
Say (T "Updated to RhinE $($latest.version)." "已更新到 RhinE $($latest.version)。") Green
Start-Sleep -Seconds 3
