<#
  Character packs (js/lib/pack.js): downloads one pack from the theme's pack list (theme/update/packs.json), checks
  it and installs it beside the theme, in <profile>\audio-archive-packs\<id>\ (outside the theme folder, which an update
  replaces). The theme starts it hidden from 06 STYLE › PRESETS › CHARACTER PACKS and follows its progress in a status
  file; it can also be run by hand:

    powershell -ExecutionPolicy Bypass -File pack.ps1 -Id sweetpie -Url <zip> -Sha256 <hex> -Dest <profile>\audio-archive-packs
    powershell -ExecutionPolicy Bypass -File pack.ps1 -Preview -Url <jpg> -Out <file>

  -Id      the pack's id (its folder name)          -Url     where the zip (or the preview picture) is
  -Sha256  the zip's SHA-256: nothing is installed unless it matches
  -Dest    the folder that holds the packs          -Status  a JSON file the theme reads: { state, done, total, error }
  -Preview download a preview picture to -Out (no checks: it is only shown)

  The zip is downloaded to a temporary folder, checked, unpacked next to the packs and only then put in place, so a
  failed or interrupted download leaves the pack installed before (if any) as it was.
#>
param([string]$Id, [string]$Url, [string]$Sha256, [string]$Dest, [string]$Status, [switch]$Preview, [string]$Out)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

function Write-Status($state, $done = 0, $total = 0, $err = '') {
    if (-not $Status) { if ($err) { Write-Host "pack: $err" }; return }
    $j = @{ state = $state; done = [int64]$done; total = [int64]$total; error = $err; id = $Id } | ConvertTo-Json -Compress
    try { [IO.File]::WriteAllText($Status, $j, (New-Object Text.UTF8Encoding $false)) } catch { }
}
function Get-Sha256($file) {
    $f = [IO.File]::OpenRead($file)
    try { -join ([Security.Cryptography.SHA256]::Create().ComputeHash($f) | ForEach-Object { $_.ToString('x2') }) } finally { $f.Dispose() }
}

if ($Preview) {
    try {
        $wc = New-Object Net.WebClient; $wc.Headers['User-Agent'] = 'RhinE-packs'
        $tmp = "$Out.part"; $wc.DownloadFile($Url, $tmp); Move-Item -Force $tmp $Out
    } catch { }
    exit 0
}

try {
    if ($Id -notmatch '^[a-z0-9][a-z0-9_-]{0,40}$') { throw "not a pack id: '$Id'" }
    if ($Sha256 -notmatch '^[0-9a-fA-F]{64}$') { throw 'no SHA-256 for the download' }
    if (-not $Dest) { throw 'no destination folder' }
    New-Item -ItemType Directory -Force $Dest | Out-Null
    $work = Join-Path ([IO.Path]::GetTempPath()) "rhine-pack-$Id"
    if (Test-Path $work) { Remove-Item -Recurse -Force $work }
    New-Item -ItemType Directory -Force $work | Out-Null
    $zip = Join-Path $work "$Id.zip"

    # the download, in pieces, so the theme can show how far it is
    Write-Status 'download'
    $req = [Net.WebRequest]::Create($Url); if ($req -is [Net.HttpWebRequest]) { $req.UserAgent = 'RhinE-packs' }
    $res = $req.GetResponse(); $total = $res.ContentLength
    $in = $res.GetResponseStream(); $outf = [IO.File]::Create($zip)
    try {
        $buf = New-Object byte[] 262144; $done = 0; $t = [Diagnostics.Stopwatch]::StartNew()
        while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
            $outf.Write($buf, 0, $n); $done += $n
            if ($t.ElapsedMilliseconds -gt 300) { Write-Status 'download' $done $total; $t.Restart() }
        }
    } finally { $outf.Dispose(); $in.Dispose(); $res.Dispose() }

    Write-Status 'check' $done $total
    if ((Get-Sha256 $zip) -ne $Sha256.ToLower()) { throw 'the download does not match its SHA-256' }

    # unpacked next to the packs (same drive: the last step is a rename), its pack.json checked
    Write-Status 'unpack' $done $total
    $new = Join-Path $Dest ".$Id.new"
    if (Test-Path $new) { Remove-Item -Recurse -Force $new }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($zip, $new)
    if (-not (Test-Path (Join-Path $new 'pack.json'))) { Remove-Item -Recurse -Force $new; throw 'the download has no pack.json' }

    # in place: the old one set aside first (a folder that is a link is never replaced: a developer's own copy)
    $dst = Join-Path $Dest $Id
    if (Test-Path $dst) {
        if ((Get-Item $dst -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { Remove-Item -Recurse -Force $new; throw "'$dst' is a link: not replaced" }
        $old = Join-Path $Dest ".$Id.old"
        if (Test-Path $old) { Remove-Item -Recurse -Force $old }
        Rename-Item $dst (Split-Path $old -Leaf)
        Rename-Item $new $Id
        Remove-Item -Recurse -Force $old
    } else { Rename-Item $new $Id }
    Remove-Item -Recurse -Force $work
    Write-Status 'done' $done $total
    exit 0
} catch {
    Write-Status 'error' 0 0 ($_.Exception.Message)
    exit 1
}
