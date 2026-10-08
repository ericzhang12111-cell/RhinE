<#
  Installs the Audio Archive theme into a foobar2000 v2 installation (64-bit). Double-click install.cmd, or:

    powershell -ExecutionPolicy Bypass -File install.ps1
    powershell -ExecutionPolicy Bypass -File install.ps1 -Foobar "D:\Apps\foobar2000" -NoStart -NoFonts

  -Foobar        the folder that contains foobar2000.exe (portable or standard install). Without it the installer looks
                 for foobar2000 itself (the standard install, a portable one next to this folder) and asks when it
                 finds several or none.
  -NoFonts       do not install Geist Mono for the current user (the panels still load it privately; the native
                 playlist then falls back to another font)
  -NoStart       do not start foobar2000 at the end (the layout is then imported on the next start you make with
                 foobar2000.exe /columnsui:import-quiet "<profile>\themes\audio-archive\columns\audio-archive.fcl")
  -Yes           answer yes to every question (close foobar2000, download missing components)
  -ComponentDir  a folder with Columns UI / JSplitter .fb2k-component packages to use instead of downloading them

  What it does, in order — the theme is not touched until every check has passed:
    1. finds foobar2000 and checks that it is v2 and 64-bit; offers to close it when it is running; starts it once
       when it has never run (that creates its configuration)
    2. installs Columns UI and JSplitter when they are missing: from -ComponentDir or this folder, or downloaded
       from their official GitHub releases (asks first; each package is checked against its SHA-256)
    3. backs up the profile configuration to <profile>\audio-archive-backup\<date-time>\ (uninstall.ps1 restores it)
    4. copies the theme to <profile>\themes\audio-archive\
    5. installs the Geist Mono fonts for the current Windows user (no admin rights)
    6. selects Columns UI as the user interface
    7. starts foobar2000 and imports the theme's Columns UI layout

  Works with Windows PowerShell 5.1 and PowerShell 7. Uses Windows' own SQLite (winsqlite3.dll). Messages are in
  Chinese on a Chinese Windows, English otherwise.
#>
param([string]$Foobar, [switch]$NoFonts, [switch]$NoStart, [switch]$Yes, [string]$ComponentDir)
$ErrorActionPreference = 'Stop'

$Name = 'audio-archive'
$ColumnsUI = [guid]'F12D0A24-A8A4-4618-9659-6F66DE067524'   # Columns UI's user interface GUID
$DefaultUI = [guid]'6EBCE8DE-A55C-4E09-9EFE-A8B6A66D69FD'   # Default User Interface
$UiKey = 'cfg_var.094A28DA-C6E8-4392-BAF1-AD0F29E5B303'      # foobar2000 v2: selected user interface
$KnownUiKey = 'cfg_var.AD13B1D4-A6F7-425E-A93B-2A3C7DC37A93' # user interfaces already offered (uint32 count + GUIDs);
                                                             # a module missing here makes foobar2000 ask again
# the components the theme needs: the tested releases, from their official GitHub pages
$Components = @(
    @{ Folder = 'foo_ui_columns'; Name = 'Columns UI 3.7.0'; File = 'foo_ui_columns-3.7.0.x86-x64.fb2k-component'
       Url = 'https://github.com/reupen/columns_ui/releases/download/v3.7.0/foo_ui_columns-3.7.0.x86-x64.fb2k-component'
       Sha256 = 'f8578f01439a000df2f745d2c648e6d34cbfa3d924be8e49fe38407c5dabddb3' },
    @{ Folder = 'foo_uie_jsplitter'; Name = 'JSplitter 3.9.4'; File = 'foo_uie_jsplitter_3.9.4.fb2k-component'
       Url = 'https://github.com/dima-lur/jsplitter/releases/download/v3.9.4/foo_uie_jsplitter_3.9.4.fb2k-component'
       Sha256 = '612079e4c4faa51311812fc77f71d46103cfcc4501124261db14a33825cde1b3' }
)

$zh = (Get-UICulture).Name -like 'zh*'
function T($en, $cn) { if ($zh) { $cn } else { $en } }
function Fail($msg) { Write-Host "install: $msg" -ForegroundColor Red; exit 1 }
function Say($msg) { Write-Host $msg }
function Ask($question) {
    if ($Yes) { return $true }
    $a = Read-Host "$question $(T '[Y/n]' '[Y/n]（回车 = 是）')"
    return -not $a -or $a -match '^(y|yes|是)$'
}

Add-Type -Namespace AudioArchive -Name Win -MemberDefinition @'
public delegate bool EnumProc(System.IntPtr h, System.IntPtr l);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, System.IntPtr l);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(System.IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(System.IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern bool PostMessageW(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);
'@
# visible top-level windows of a process: handle -> @{ Title; Class }
function Get-Windows($procId) {
    $found = @{}
    $cb = [AudioArchive.Win+EnumProc] {
        param($h, $l)
        $p = 0; [void][AudioArchive.Win]::GetWindowThreadProcessId($h, [ref]$p)
        if ($p -eq $procId -and [AudioArchive.Win]::IsWindowVisible($h)) {
            $t = New-Object Text.StringBuilder 256; [void][AudioArchive.Win]::GetWindowTextW($h, $t, 256)
            $c = New-Object Text.StringBuilder 256; [void][AudioArchive.Win]::GetClassNameW($h, $c, 256)
            $found[$h] = @{ Title = $t.ToString(); Class = $c.ToString() }
        }
        $true
    }
    [void][AudioArchive.Win]::EnumWindows($cb, [IntPtr]::Zero)
    $found
}
function Get-Running($exePath) { Get-CimInstance Win32_Process -Filter "Name='foobar2000.exe'" | Where-Object { $_.ExecutablePath -eq $exePath } }
# closes foobar2000 the way its window's close button does (it saves its configuration); dialogs are closed first
function Stop-Foobar($exePath) {
    foreach ($r in @(Get-Running $exePath)) {
        $w = Get-Windows $r.ProcessId
        foreach ($h in $w.Keys) { if ($w[$h].Class -eq '#32770') { [void][AudioArchive.Win]::PostMessageW($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) } }
        Start-Sleep -Milliseconds 500
        $p = Get-Process -Id $r.ProcessId -ErrorAction SilentlyContinue
        if ($p) { [void]$p.CloseMainWindow(); if (-not $p.WaitForExit(20000)) { return $false } }
    }
    $true
}
function Test-X64($exePath) {
    # the PE header's machine field: 0x8664 is x64
    $pe = [IO.File]::ReadAllBytes($exePath)
    [BitConverter]::ToUInt16($pe, [BitConverter]::ToInt32($pe, 0x3C) + 4) -eq 0x8664
}

# ------------------------------------------------------------------------------------------------------ find foobar2000
if (-not $Foobar) {
    $candidates = [Collections.Generic.List[string]]::new()
    $keys = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\foobar2000', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\foobar2000',
            'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\foobar2000'
    foreach ($k in $keys) {
        $loc = (Get-ItemProperty $k -ErrorAction SilentlyContinue).InstallLocation
        if (-not $loc) { $u = (Get-ItemProperty $k -ErrorAction SilentlyContinue).UninstallString; if ($u) { $loc = Split-Path ($u.Trim('"')) } }
        if ($loc) { $candidates.Add($loc.Trim('"')) }
    }
    $candidates.Add((Join-Path $env:ProgramFiles 'foobar2000'))
    $candidates.Add((Join-Path $PSScriptRoot '..\foobar2000'))   # a portable foobar2000 next to the theme folder
    $found = @($candidates | Where-Object { Test-Path (Join-Path $_ 'foobar2000.exe') } | ForEach-Object { (Resolve-Path $_).Path.TrimEnd('\') } |
               Select-Object -Unique | Where-Object { Test-X64 (Join-Path $_ 'foobar2000.exe') })
    if ($found.Count -eq 1) {
        $Foobar = $found[0]
    } elseif ($found.Count -gt 1 -and -not $Yes) {
        Say (T 'Found more than one foobar2000:' '找到多个 foobar2000：')
        for ($i = 0; $i -lt $found.Count; $i++) { Say "  $($i + 1). $($found[$i])" }
        $n = Read-Host (T "Which one? (1-$($found.Count))" "安装到哪一个？（1-$($found.Count)）")
        if ($n -notmatch '^\d+$' -or [int]$n -lt 1 -or [int]$n -gt $found.Count) { Fail (T 'no foobar2000 chosen' '没有选择 foobar2000') }
        $Foobar = $found[[int]$n - 1]
    } elseif ($found.Count -gt 1) {
        $Foobar = $found[0]
    } else {
        Say (T 'foobar2000 (64-bit) was not found. Choose the folder that contains foobar2000.exe.' '没有找到 64 位 foobar2000。请选择 foobar2000.exe 所在的文件夹。')
        Add-Type -AssemblyName System.Windows.Forms
        $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
        $dlg.Description = T 'The folder that contains foobar2000.exe' 'foobar2000.exe 所在的文件夹'
        if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { Fail (T 'no folder chosen' '没有选择文件夹') }
        $Foobar = $dlg.SelectedPath
    }
}

# ------------------------------------------------------------------------------------------------------------- checks
$exe = Join-Path $Foobar 'foobar2000.exe'
if (-not (Test-Path $exe)) { Fail (T "no foobar2000.exe in '$Foobar'" "'$Foobar' 中没有 foobar2000.exe") }
$exe = (Resolve-Path $exe).Path
$Foobar = Split-Path $exe
Say (T "foobar2000: $Foobar" "foobar2000：$Foobar")
# the theme needs the 64-bit foobar2000 (the 32-bit build shows a black window)
if (-not (Test-X64 $exe)) {
    Fail (T "'$exe' is the 32-bit foobar2000. Install the 64-bit foobar2000 v2 and run this again with its folder." `
            "'$exe' 是 32 位的 foobar2000。请安装 64 位 foobar2000 v2，再对它运行本安装程序。")
}
$portable = Test-Path (Join-Path $Foobar 'portable_mode_enabled')
$profileDir = if ($portable) { Join-Path $Foobar 'profile' } else { Join-Path $env:APPDATA 'foobar2000-v2' }
$config = Join-Path $profileDir 'config.sqlite'

$source = $PSScriptRoot
$target = Join-Path $profileDir "themes\$Name"
foreach ($part in 'js', 'tokens', 'columns', 'assets', 'columns\audio-archive.fcl') {
    if (-not (Test-Path (Join-Path $source $part))) {
        Fail (T "the theme folder is incomplete: '$part' is missing next to install.ps1 (unzip the whole download first)" "主题文件夹不完整：install.ps1 旁边缺少 '$part'（请先完整解压下载的文件）")
    }
}

if (Get-Running $exe) {
    if (-not (Ask (T 'foobar2000 is running. Close it now?' 'foobar2000 正在运行。现在关闭它吗？'))) { Fail (T 'close foobar2000 and run this again.' '请关闭 foobar2000 后重新运行。') }
    if (-not (Stop-Foobar $exe)) { Fail (T 'foobar2000 did not close (a dialog may be open). Close it and run this again.' 'foobar2000 没有关闭（可能有对话框开着）。请手动关闭后重新运行。') }
}

# a foobar2000 that has never run has no configuration yet: start it once, then close it
if (-not (Test-Path $config)) {
    Say (T 'Starting foobar2000 once to create its settings...' '首次启动 foobar2000 以创建它的设置……')
    $first = Start-Process -FilePath $exe -PassThru
    for ($i = 0; $i -lt 80; $i++) {
        Start-Sleep -Milliseconds 250
        $w = Get-Windows $first.Id
        if ((Test-Path $config) -and ($w.Values | Where-Object { $_.Class -ne '#32770' })) { break }
    }
    Start-Sleep -Seconds 2
    [void](Stop-Foobar $exe)
    if (-not (Test-Path $config)) { Fail (T "no foobar2000 v2 configuration at '$profileDir'. Start foobar2000 once, close it and run this again." "'$profileDir' 中没有 foobar2000 v2 的配置。请先启动一次 foobar2000 并关闭，再重新运行。") }
}

# ---------------------------------------------------------------------------------------------------------- components
function Test-Component($folder) {
    foreach ($dir in 'user-components-x64', 'user-components') {
        if (Test-Path (Join-Path $profileDir "$dir\$folder\$folder.dll")) { return $true }
    }
    Test-Path (Join-Path $Foobar "components\$folder.dll")
}
function Get-Sha256($file) {
    $f = [IO.File]::OpenRead($file)
    try { -join ([Security.Cryptography.SHA256]::Create().ComputeHash($f) | ForEach-Object { $_.ToString('x2') }) } finally { $f.Dispose() }
}
# a component package's x64 files go to <profile>\user-components-x64\<component>\, its shared files (docs, samples)
# keep their paths; the 32-bit binaries at the top of the package are left out
function Install-Component($c, $package) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $dest = Join-Path $profileDir "user-components-x64\$($c.Folder)"
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    New-Item -ItemType Directory -Force $dest | Out-Null
    $zip = [IO.Compression.ZipFile]::OpenRead($package)
    try {
        foreach ($e in $zip.Entries) {
            $n = $e.FullName
            if ($n.EndsWith('/')) { continue }
            if ($n.StartsWith('x64/')) { $n = $n.Substring(4) }
            elseif (-not $n.Contains('/') -and $n.ToLower().EndsWith('.dll')) { continue }
            $t = Join-Path $dest ($n -replace '/', '\')
            New-Item -ItemType Directory -Force (Split-Path $t) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $t, $true)
        }
    } finally { $zip.Dispose() }
}
$lookIn = @($ComponentDir, $PSScriptRoot, (Join-Path $PSScriptRoot 'components'), (Join-Path $PSScriptRoot '..\setup')) | Where-Object { $_ -and (Test-Path $_) }
foreach ($c in $Components) {
    if (Test-Component $c.Folder) { continue }
    $package = $lookIn | ForEach-Object { Join-Path $_ $c.File } | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $package) {
        if (-not (Ask (T "$($c.Name) is not installed. Download it from its official GitHub release now?" "没有安装 $($c.Name)。现在从它的 GitHub 官方发布页下载吗？"))) {
            Fail (T "install $($c.Name) first ($($c.Url))" "请先安装 $($c.Name)（$($c.Url)）")
        }
        $package = Join-Path ([IO.Path]::GetTempPath()) $c.File
        Say (T "downloading $($c.Name)..." "正在下载 $($c.Name)……")
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $c.Url -OutFile $package -UseBasicParsing
        } catch {
            Fail (T "could not download $($c.Name). Download it in a browser from`n  $($c.Url)`nput the file into '$PSScriptRoot' and run this again." `
                    "无法下载 $($c.Name)。请用浏览器从`n  $($c.Url)`n下载，把文件放进 '$PSScriptRoot' 后重新运行。")
        }
    }
    if ((Get-Sha256 $package) -ne $c.Sha256) { Fail (T "'$package' is not the expected $($c.Name) package (SHA-256 differs)" "'$package' 不是预期的 $($c.Name) 安装包（SHA-256 不符）") }
    Install-Component $c $package
    Say (T "installed $($c.Name)" "已安装 $($c.Name)")
}


# ------------------------------------------------------------------------------------------------------------- backup
$backup = Join-Path $profileDir ("$Name-backup\" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force $backup | Out-Null
Copy-Item $config $backup
if (Test-Path (Join-Path $profileDir 'configuration')) { Copy-Item (Join-Path $profileDir 'configuration') $backup -Recurse }
Say (T "backed up the configuration to $backup" "已备份配置到 $backup")

# ---------------------------------------------------------------------------------------------------------- copy files
# a development checkout may link <profile>\themes\audio-archive to this folder; then there is nothing to copy
$item = Get-Item $target -ErrorAction SilentlyContinue
$linked = $item -and $item.LinkType -and ((Resolve-Path ($item.Target | Select-Object -First 1) -ErrorAction SilentlyContinue).Path -eq (Resolve-Path $source).Path)
if ($linked) {
    Write-Host "theme folder is linked to $source, not copied"
} else {
    if ($item) {
        # only ever replace a previous copy of this theme
        if (-not (Test-Path (Join-Path $target 'tokens\tokens.json'))) { Fail (T "'$target' exists but is not this theme; move it away and run this again" "'$target' 已存在但不是本主题；请移走它后重新运行") }
        Remove-Item $target -Recurse -Force
    }
    New-Item -ItemType Directory -Force $target | Out-Null
    foreach ($part in 'js', 'tokens', 'columns', 'assets') { Copy-Item (Join-Path $source $part) $target -Recurse }
    foreach ($file in 'README.md', 'LICENSE') { if (Test-Path (Join-Path $source $file)) { Copy-Item (Join-Path $source $file) $target } }
    Say (T "copied the theme to $target" "已复制主题到 $target")
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
Say (T 'selected Columns UI as the user interface' '已选择 Columns UI 作为界面')

# -------------------------------------------------------------------------------------------- start and import layout
$layout = Join-Path $target 'columns\audio-archive.fcl'
if ($NoStart) {
    Write-Host "done. On the next start, import the layout: `"$exe`" /columnsui:import-quiet `"$layout`""
} else {
    $proc = Start-Process -FilePath $exe -ArgumentList "/columnsui:import-quiet `"$layout`"" -PassThru
    # The first time Columns UI runs it opens its Quick setup dialog, whose presets would replace the theme's layout.
    # Close it (the same as Cancel, which keeps the current layout); it does not open again.
    $mainUp = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 250
        $titles = @{}
        $w = Get-Windows $proc.Id
        foreach ($h in $w.Keys) { $titles[$h] = $w[$h].Title }
        $setup = $titles.Keys | Where-Object { $titles[$_] -like 'Quick setup*' }
        if ($setup) { foreach ($h in $setup) { [void][AudioArchive.Win]::PostMessageW($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }; break }   # WM_CLOSE
        # once the main window has been up for a while without the dialog, Columns UI has run before
        if ($titles.Values -contains 'foobar2000') { if ($mainUp -and $i -ge 20) { break }; $mainUp = $true }
    }
    Say (T 'Done. foobar2000 is starting with the theme.' '完成。foobar2000 正在以本主题启动。')
}
