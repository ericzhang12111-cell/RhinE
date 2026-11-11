<#
  Installs the online bridge (06 ONLINE: NetEase Cloud Music) beside the foobar2000 profile:
    <profile>\audio-archive-online\node\   Node.js, portable (downloaded, checked against its pinned SHA-256)
    <profile>\audio-archive-online\app\    bridge.js and its libraries (theme\online\, npm ci from the lockfile)
    <profile>\audio-archive-online\data\   what the bridge keeps (the login, encrypted for this Windows user)
  The theme runs it from 06 ONLINE (CONNECT); it can also be run by hand:
    powershell -ExecutionPolicy Bypass -File online.ps1 -Profile "<profile path>" [-Node "<node.exe>"]
  -Node uses a Node.js already installed instead of downloading one. -Remove takes the app and Node away (the data
  folder, with the login, too).
#>
param([Parameter(Mandatory)][string]$Profile, [string]$Node = "", [switch]$Remove)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Node.js for Windows x64, pinned (nodejs.org/dist/<version>/SHASUMS256.txt)
$NODE_VERSION = '22.23.4'
$NODE_SHA256 = 'cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20'

$root = Join-Path $Profile 'audio-archive-online'
$app = Join-Path $root 'app'
$status = Join-Path $root 'install.json'
function Say([string]$state, [string]$detail = '') {
    New-Item -ItemType Directory -Force $root | Out-Null
    @{ state = $state; detail = $detail; at = (Get-Date).ToString('s') } | ConvertTo-Json -Compress | Set-Content $status -Encoding UTF8
    "$state $detail"
}

if ($Remove) {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$app*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    if (Test-Path $root) { Remove-Item -Recurse -Force $root }
    'removed'
    return
}

try {
    # Node: the one given, else the pinned download
    if ($Node) {
        if (-not (Test-Path $Node)) { throw "no node at $Node" }
        $nodeExe = (Resolve-Path $Node).Path
    } else {
        if (-not $NODE_VERSION -or -not $NODE_SHA256) { throw 'no pinned Node.js in this version of online.ps1' }
        $nodeDir = Join-Path $root 'node'
        $nodeExe = Join-Path $nodeDir 'node.exe'
        if (-not (Test-Path $nodeExe) -or ((& $nodeExe --version) -ne "v$NODE_VERSION")) {
            Say 'node' "downloading Node.js $NODE_VERSION" | Out-Null
            $zip = Join-Path $env:TEMP "node-v$NODE_VERSION-win-x64.zip"
            Invoke-WebRequest "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-win-x64.zip" -OutFile $zip -UseBasicParsing
            if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $NODE_SHA256) { Remove-Item $zip; throw 'Node.js download does not match its checksum' }
            $tmp = Join-Path $root 'node-tmp'
            if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
            Expand-Archive $zip $tmp
            if (Test-Path $nodeDir) { Remove-Item -Recurse -Force $nodeDir }
            Move-Item (Join-Path $tmp "node-v$NODE_VERSION-win-x64") $nodeDir
            Remove-Item -Recurse -Force $tmp; Remove-Item $zip
        }
    }
    $npm = Join-Path (Split-Path $nodeExe) 'node_modules\npm\bin\npm-cli.js'
    if (-not (Test-Path $npm)) { throw "no npm beside $nodeExe" }

    # the bridge and its libraries, exactly as the lockfile names them
    Say 'app' 'installing the bridge' | Out-Null
    New-Item -ItemType Directory -Force $app | Out-Null
    foreach ($f in 'bridge.js', 'qq.js', 'importer.js', 'spotify.js', 'package.json', 'package-lock.json') { Copy-Item (Join-Path $PSScriptRoot "..\online\$f") (Join-Path $app $f) -Force }
    Push-Location $app
    try {
        & $nodeExe $npm ci --omit=dev --no-audit --no-fund --loglevel=error 2>&1 | Out-String | Write-Verbose
        if ($LASTEXITCODE) { throw "npm ci failed ($LASTEXITCODE)" }
    } finally { Pop-Location }
    New-Item -ItemType Directory -Force (Join-Path $root 'data') | Out-Null
    $v = (Get-Content (Join-Path $PSScriptRoot '..\VERSION') -Raw).Trim()
    @{ state = 'ready'; node = $nodeExe; version = $v; at = (Get-Date).ToString('s') } | ConvertTo-Json -Compress | Set-Content $status -Encoding UTF8
    'ready'
} catch {
    Say 'error' "$_"
    exit 1
}
