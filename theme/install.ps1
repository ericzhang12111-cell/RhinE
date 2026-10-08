<#
  Installs the Audio Archive theme into a foobar2000 v2 installation.

    powershell -ExecutionPolicy Bypass -File install.ps1 -Foobar "D:\Apps\foobar2000"
    powershell -ExecutionPolicy Bypass -File install.ps1 -Foobar "D:\Apps\foobar2000" -NoStart -NoFonts

  -Foobar   the folder that contains foobar2000.exe (portable or standard install)
  -NoFonts  do not install Geist Mono for the current user (the panels still load it privately; the native playlist
            then falls back to another font)
  -NoStart  do not start foobar2000 at the end (the layout is then imported on the next start you make with
            foobar2000.exe /columnsui:import-quiet "<profile>\themes\audio-archive\columns\audio-archive.fcl")

  What it does, in order — nothing is changed until every check has passed:
    1. checks that this foobar2000 is v2, is not running, and has Columns UI and JSplitter installed
    2. backs up the profile configuration to <profile>\audio-archive-backup\<date-time>\ (uninstall.ps1 restores it)
    3. copies the theme to <profile>\themes\audio-archive\
    4. installs the Geist Mono fonts for the current Windows user (no admin rights)
    5. selects Columns UI as the user interface
    6. starts foobar2000 and imports the theme's Columns UI layout

  Works with Windows PowerShell 5.1 and PowerShell 7. Uses Windows' own SQLite (winsqlite3.dll), nothing is downloaded.
#>
param([Parameter(Mandatory)][string]$Foobar, [switch]$NoFonts, [switch]$NoStart)
$ErrorActionPreference = 'Stop'

$Name = 'audio-archive'
$ColumnsUI = [guid]'F12D0A24-A8A4-4618-9659-6F66DE067524'   # Columns UI's user interface GUID
$DefaultUI = [guid]'6EBCE8DE-A55C-4E09-9EFE-A8B6A66D69FD'   # Default User Interface
$UiKey = 'cfg_var.094A28DA-C6E8-4392-BAF1-AD0F29E5B303'      # foobar2000 v2: selected user interface
$KnownUiKey = 'cfg_var.AD13B1D4-A6F7-425E-A93B-2A3C7DC37A93' # user interfaces already offered (uint32 count + GUIDs);
                                                             # a module missing here makes foobar2000 ask again

function Fail($msg) { Write-Host "install: $msg" -ForegroundColor Red; exit 1 }

# ------------------------------------------------------------------------------------------------------------- checks
$exe = Join-Path $Foobar 'foobar2000.exe'
if (-not (Test-Path $exe)) { Fail "no foobar2000.exe in '$Foobar'" }
$exe = (Resolve-Path $exe).Path
$Foobar = Split-Path $exe
$portable = Test-Path (Join-Path $Foobar 'portable_mode_enabled')
$profileDir = if ($portable) { Join-Path $Foobar 'profile' } else { Join-Path $env:APPDATA 'foobar2000-v2' }
$config = Join-Path $profileDir 'config.sqlite'
if (-not (Test-Path $config)) {
    Fail "no foobar2000 v2 configuration at '$profileDir'. foobar2000 v2 is required; if it is installed, start it once, close it and run this again."
}

# the theme needs the 64-bit foobar2000 (the 32-bit build shows a black window): the PE header's machine field says which
$pe = [IO.File]::ReadAllBytes($exe)
$machine = [BitConverter]::ToUInt16($pe, [BitConverter]::ToInt32($pe, 0x3C) + 4)
if ($machine -ne 0x8664) {
    Fail "'$exe' is the 32-bit foobar2000. Install the 64-bit foobar2000 v2 (and the x64 Columns UI and JSplitter) and run this again with its folder."
}

$running = Get-CimInstance Win32_Process -Filter "Name='foobar2000.exe'" | Where-Object { $_.ExecutablePath -eq $exe }
if ($running) { Fail 'this foobar2000 is running. Close it and run this again.' }

function Test-Component($folder) {
    foreach ($dir in 'user-components-x64', 'user-components') {
        if (Test-Path (Join-Path $profileDir "$dir\$folder\$folder.dll")) { return $true }
    }
    Test-Path (Join-Path $Foobar "components\$folder.dll")
}
$missing = @(@{ 'foo_ui_columns' = 'Columns UI'; 'foo_uie_jsplitter' = 'JSplitter' }.GetEnumerator() |
             Where-Object { -not (Test-Component $_.Key) } | ForEach-Object { $_.Value })
if ($missing) { Fail "missing component(s): $($missing -join ', '). Install them first (see README.md, 'Requirements')." }

$source = $PSScriptRoot
$target = Join-Path $profileDir "themes\$Name"
foreach ($part in 'js', 'tokens', 'columns', 'assets') {
    if (-not (Test-Path (Join-Path $source $part))) { Fail "the theme folder is incomplete: '$part' is missing next to install.ps1" }
}
$fcl = Join-Path $source 'columns\audio-archive.fcl'
if (-not (Test-Path $fcl)) { Fail 'columns\audio-archive.fcl is missing (the theme folder is incomplete)' }

# ------------------------------------------------------------------------------------------------------------- backup
$backup = Join-Path $profileDir ("$Name-backup\" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force $backup | Out-Null
Copy-Item $config $backup
if (Test-Path (Join-Path $profileDir 'configuration')) { Copy-Item (Join-Path $profileDir 'configuration') $backup -Recurse }
Write-Host "backed up the configuration to $backup"

# ---------------------------------------------------------------------------------------------------------- copy files
# a development checkout may link <profile>\themes\audio-archive to this folder; then there is nothing to copy
$item = Get-Item $target -ErrorAction SilentlyContinue
$linked = $item -and $item.LinkType -and ((Resolve-Path ($item.Target | Select-Object -First 1) -ErrorAction SilentlyContinue).Path -eq (Resolve-Path $source).Path)
if ($linked) {
    Write-Host "theme folder is linked to $source, not copied"
} else {
    if ($item) {
        # only ever replace a previous copy of this theme
        if (-not (Test-Path (Join-Path $target 'tokens\tokens.json'))) { Fail "'$target' exists but is not this theme; move it away and run this again" }
        Remove-Item $target -Recurse -Force
    }
    New-Item -ItemType Directory -Force $target | Out-Null
    foreach ($part in 'js', 'tokens', 'columns', 'assets') { Copy-Item (Join-Path $source $part) $target -Recurse }
    foreach ($file in 'README.md', 'LICENSE') { if (Test-Path (Join-Path $source $file)) { Copy-Item (Join-Path $source $file) $target } }
    Write-Host "copied the theme to $target"
}

# --------------------------------------------------------------------------------------------------------------- fonts
if (-not $NoFonts) { & (Join-Path $source 'tools\fonts.ps1') | ForEach-Object { Write-Host $_ } }

# ------------------------------------------------------------------------------------------------- select Columns UI
Add-Type -Namespace AudioArchive -Name Sqlite -MemberDefinition @'
[DllImport("winsqlite3.dll")] public static extern int sqlite3_open_v2(byte[] file, out System.IntPtr db, int flags, System.IntPtr vfs);
[DllImport("winsqlite3.dll")] public static extern int sqlite3_prepare_v2(System.IntPtr db, byte[] sql, int n, out System.IntPtr stmt, System.IntPtr tail);
[DllImport("winsqlite3.dll")] public static extern int sqlite3_bind_text(System.IntPtr stmt, int i, byte[] text, int n, System.IntPtr destructor);
[DllImport("winsqlite3.dll")] public static extern int sqlite3_bind_blob(System.IntPtr stmt, int i, byte[] blob, int n, System.IntPtr destructor);
[DllImport("winsqlite3.dll")] public static extern int sqlite3_step(System.IntPtr stmt);
[DllImport("winsqlite3.dll")] public static extern System.IntPtr sqlite3_column_blob(System.IntPtr stmt, int i);
[DllImport("winsqlite3.dll")] public static extern int sqlite3_column_bytes(System.IntPtr stmt, int i);
[DllImport("winsqlite3.dll")] public static extern int sqlite3_finalize(System.IntPtr stmt);
[DllImport("winsqlite3.dll")] public static extern int sqlite3_close(System.IntPtr db);
'@
$SQLITE_ROW = 100; $SQLITE_DONE = 101
$transient = [IntPtr](-1)   # SQLITE_TRANSIENT: sqlite copies the bound value
function Utf8z($s) { [Text.Encoding]::UTF8.GetBytes($s + [char]0) }

# runs one statement with a key (and optionally a blob value); returns the first column of the first row as bytes
function Invoke-Blob($db, $sql, $key, [byte[]]$value) {
    $stmt = [IntPtr]::Zero
    if ([AudioArchive.Sqlite]::sqlite3_prepare_v2($db, (Utf8z $sql), -1, [ref]$stmt, [IntPtr]::Zero) -ne 0) { Fail 'unexpected config.sqlite format' }
    try {
        $k = [Text.Encoding]::UTF8.GetBytes($key)
        [void][AudioArchive.Sqlite]::sqlite3_bind_text($stmt, 1, $k, $k.Length, $transient)
        if ($value) { [void][AudioArchive.Sqlite]::sqlite3_bind_blob($stmt, 2, $value, $value.Length, $transient) }
        $rc = [AudioArchive.Sqlite]::sqlite3_step($stmt)
        if ($rc -eq $SQLITE_ROW) {
            $n = [AudioArchive.Sqlite]::sqlite3_column_bytes($stmt, 0)
            $out = New-Object byte[] $n
            if ($n) { [Runtime.InteropServices.Marshal]::Copy([AudioArchive.Sqlite]::sqlite3_column_blob($stmt, 0), $out, 0, $n) }
            return ,$out
        }
        if ($rc -ne $SQLITE_DONE) { Fail "could not update config.sqlite (sqlite error $rc)" }
    } finally { [void][AudioArchive.Sqlite]::sqlite3_finalize($stmt) }
}

$db = [IntPtr]::Zero
if ([AudioArchive.Sqlite]::sqlite3_open_v2((Utf8z $config), [ref]$db, 2, [IntPtr]::Zero) -ne 0) { Fail 'could not open config.sqlite' }
try {
    $set = 'INSERT OR REPLACE INTO configBlobs (name, value) VALUES (?, ?)'
    [void](Invoke-Blob $db $set $UiKey $ColumnsUI.ToByteArray())

    # mark Columns UI as already offered, so foobar2000 does not ask which interface to use
    $known = [Collections.Generic.List[guid]]::new()
    $old = Invoke-Blob $db 'SELECT value FROM configBlobs WHERE name = ?' $KnownUiKey
    if ($old -and $old.Length -ge 4 -and $old.Length -eq 4 + 16 * [BitConverter]::ToUInt32($old, 0)) {
        for ($i = 4; $i -lt $old.Length; $i += 16) { $known.Add([guid]::new([byte[]]$old[$i..($i + 15)])) }
    } else { $known.Add($DefaultUI) }
    if (-not $known.Contains($ColumnsUI)) { $known.Insert(0, $ColumnsUI) }
    $blob = [BitConverter]::GetBytes([uint32]$known.Count) + ($known | ForEach-Object { $_.ToByteArray() })
    [void](Invoke-Blob $db $set $KnownUiKey ([byte[]]$blob))
} finally { [void][AudioArchive.Sqlite]::sqlite3_close($db) }
Write-Host 'selected Columns UI as the user interface'

# -------------------------------------------------------------------------------------------- start and import layout
$layout = Join-Path $target 'columns\audio-archive.fcl'
if ($NoStart) {
    Write-Host "done. On the next start, import the layout: `"$exe`" /columnsui:import-quiet `"$layout`""
} else {
    $proc = Start-Process -FilePath $exe -ArgumentList "/columnsui:import-quiet `"$layout`"" -PassThru
    # The first time Columns UI runs it opens its Quick setup dialog, whose presets would replace the theme's layout.
    # Close it (the same as Cancel, which keeps the current layout); it does not open again.
    Add-Type -Namespace AudioArchive -Name Win -MemberDefinition @'
public delegate bool EnumProc(System.IntPtr h, System.IntPtr l);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, System.IntPtr l);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(System.IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern bool PostMessageW(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);
'@
    $mainUp = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 250
        $titles = @{}
        $cb = [AudioArchive.Win+EnumProc] {
            param($h, $l)
            $p = 0; [void][AudioArchive.Win]::GetWindowThreadProcessId($h, [ref]$p)
            if ($p -eq $proc.Id -and [AudioArchive.Win]::IsWindowVisible($h)) {
                $t = New-Object Text.StringBuilder 256; [void][AudioArchive.Win]::GetWindowTextW($h, $t, 256); $titles[$h] = $t.ToString()
            }
            $true
        }
        [void][AudioArchive.Win]::EnumWindows($cb, [IntPtr]::Zero)
        $setup = $titles.Keys | Where-Object { $titles[$_] -like 'Quick setup*' }
        if ($setup) { foreach ($h in $setup) { [void][AudioArchive.Win]::PostMessageW($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }; break }   # WM_CLOSE
        # once the main window has been up for a while without the dialog, Columns UI has run before
        if ($titles.Values -contains 'foobar2000') { if ($mainUp -and $i -ge 20) { break }; $mainUp = $true }
    }
    Write-Host 'done. foobar2000 is starting with the theme.'
}
