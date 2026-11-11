<#
  Borderless full screen for foobar2000 (05 STYLE › DISPLAY › WINDOW, or F11): the theme's root panel runs this with
  its own window handle, and the main window it belongs to loses its title bar and frame and covers the whole monitor
  it is on (the taskbar too), or gets them back:
    powershell -File window.ps1 -Panel <hwnd> -Mode borderless|window -State <file>
  The mini player (M) is the same window without its frame, small, on top of the others in a corner of the monitor's
  work area (tl, tr, bl, br; -Size in dp, as wide x high), or where it was last dragged to:
    powershell -File window.ps1 -Panel <hwnd> -Mode mini -Corner br -Size 560x136 -State <file>
  -Serve keeps it running beside foobar2000 (one per window; it ends with the window), taking its orders from
  <state folder>\window-cmd.txt — "<id>-<ms> <mode> [corner] [size] [snap]" or "<id>-<ms> drag" — so a switch takes a
  few milliseconds instead of a PowerShell start, and the mini player can be dragged: "drag" hands the window to
  Windows' own move (as a title bar does) while the mouse button is still down. It writes the time (Unix ms) and the
  panel it serves to window-serve.txt every 2 s, so the theme knows it is there (and that it is its own: one left from
  a foobar2000 that has just closed serves another window), and removes the file when it ends.
  The window's place before the first switch (its frame, its rectangle, maximized or not) is kept in the state file,
  so the way back finds it after a restart too; foobar2000 itself starts as it closed, and the theme runs this again
  then. The mini player's own place, once dragged, is kept there too ("mini": corner, x, y), until a corner is picked.
#>
param([Parameter(Mandatory)][long]$Panel, [ValidateSet('borderless', 'window', 'mini')][string]$Mode = 'window',
      [Parameter(Mandatory)][string]$State, [ValidateSet('tl', 'tr', 'bl', 'br')][string]$Corner = 'br', [string]$Size = '560x136',
      [switch]$Serve)
$ErrorActionPreference = 'Stop'

$NATIVE = @'
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
[StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
[StructLayout(LayoutKind.Sequential)] public struct PLACEMENT { public int Length, Flags, ShowCmd; public POINT Min, Max; public RECT Normal; }
[StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int Size; public RECT Monitor, Work; public int Flags; }
[DllImport("user32.dll")] public static extern System.IntPtr SetThreadDpiAwarenessContext(System.IntPtr c);
[DllImport("user32.dll")] public static extern System.IntPtr GetAncestor(System.IntPtr h, uint f);
[DllImport("user32.dll")] public static extern bool IsWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool IsZoomed(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int cmd);
[DllImport("user32.dll")] public static extern System.IntPtr GetWindowLongPtrW(System.IntPtr h, int i);
[DllImport("user32.dll")] public static extern System.IntPtr SetWindowLongPtrW(System.IntPtr h, int i, System.IntPtr v);
[DllImport("user32.dll")] public static extern bool GetWindowPlacement(System.IntPtr h, ref PLACEMENT p);
[DllImport("user32.dll")] public static extern bool SetWindowPlacement(System.IntPtr h, ref PLACEMENT p);
[DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr after, int x, int y, int w, int cy, uint f);
[DllImport("user32.dll")] public static extern System.IntPtr MonitorFromWindow(System.IntPtr h, uint f);
[DllImport("user32.dll")] public static extern System.IntPtr MonitorFromPoint(POINT p, uint f);
[DllImport("user32.dll")] public static extern bool GetMonitorInfoW(System.IntPtr m, ref MONITORINFO i);
[DllImport("user32.dll")] public static extern uint GetDpiForWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool PostMessageW(System.IntPtr h, uint msg, System.IntPtr w, System.IntPtr l);
[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
[DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
'@
# Compiling these declarations takes ≈ 0.4 s, most of the time a one-off run takes, so the compiled assembly is kept
# beside the state file, named by what it holds, and loaded from there after the first time
$dll = Join-Path (Split-Path -Parent $State) ('window-native-' + [BitConverter]::ToString(
    [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($NATIVE))).Replace('-', '').Substring(0, 12) + '.dll')
$loaded = $false
if (Test-Path -LiteralPath $dll) { try { Add-Type -LiteralPath $dll; $loaded = $true } catch { $loaded = $false } }
if (-not $loaded) {
    try {
        if (-not (Test-Path -LiteralPath (Split-Path -Parent $dll))) { [void](New-Item -ItemType Directory -Path (Split-Path -Parent $dll)) }
        Add-Type -Namespace AudioArchive -Name Frame -MemberDefinition $NATIVE -OutputAssembly $dll -OutputType Library
        Add-Type -LiteralPath $dll
    } catch { Add-Type -Namespace AudioArchive -Name Frame -MemberDefinition $NATIVE }   # (no file: compiled in memory, as before)
}
$W = [AudioArchive.Frame]
# per-monitor DPI aware, so the rectangles are the screen's own pixels (PER_MONITOR_AWARE_V2)
[void]$W::SetThreadDpiAwarenessContext([IntPtr](-4))

$main = $W::GetAncestor([IntPtr]$Panel, 2)   # GA_ROOT
if (-not $W::IsWindow($main)) { exit 1 }
$FRAME = 0x00C00000 -bor 0x00040000           # WS_CAPTION | WS_THICKFRAME
$GWL_STYLE = -16

$saved = $null
if (Test-Path -LiteralPath $State) { try { $saved = Get-Content -LiteralPath $State -Raw | ConvertFrom-Json } catch { $saved = $null } }
function Save($s) {
    $dir = Split-Path -Parent $State
    if (-not (Test-Path -LiteralPath $dir)) { [void](New-Item -ItemType Directory -Path $dir) }
    $s | ConvertTo-Json -Compress | Set-Content -LiteralPath $State -Encoding UTF8
}
function MonitorOf($h) {
    $mi = New-Object AudioArchive.Frame+MONITORINFO
    $mi.Size = [Runtime.InteropServices.Marshal]::SizeOf($mi)
    [void]$W::GetMonitorInfoW($W::MonitorFromWindow($h, 2), [ref]$mi)   # MONITOR_DEFAULTTONEAREST
    $mi
}
function MonitorAt($x, $y) {
    $pt = New-Object AudioArchive.Frame+POINT; $pt.X = $x; $pt.Y = $y
    $mi = New-Object AudioArchive.Frame+MONITORINFO
    $mi.Size = [Runtime.InteropServices.Marshal]::SizeOf($mi)
    [void]$W::GetMonitorInfoW($W::MonitorFromPoint($pt, 2), [ref]$mi)
    $mi
}
function PlacementOf($h) {
    $p = New-Object AudioArchive.Frame+PLACEMENT
    $p.Length = [Runtime.InteropServices.Marshal]::SizeOf($p)
    [void]$W::GetWindowPlacement($h, [ref]$p)
    $p
}
# the "mini" record of the state: where the mini player was dragged to (and for which corner)
function SetMini($v) {
    if (-not $script:saved) { return }
    if ($script:saved.PSObject.Properties['mini']) { $script:saved.mini = $v } else { $script:saved | Add-Member -NotePropertyName mini -NotePropertyValue $v }
    Save $script:saved
}

function Apply($mode, $corner, $size, $snap) {
    $style = $W::GetWindowLongPtrW($main, $GWL_STYLE).ToInt64()
    if ($mode -eq 'borderless' -or $mode -eq 'mini') {
        # the place to come back to: taken while the window still has its frame and was not borderless before (after a
        # restart in borderless mode foobar2000 brings the window back framed but monitor-sized: that is not kept). Its
        # rectangle on the screen as it is, or (maximized) the one its restore goes back to.
        if (($style -band $FRAME) -and -not ($script:saved -and $script:saved.active)) {
            $max = $W::IsZoomed($main)
            $n = (PlacementOf $main).Normal
            # (minimized: its rectangle is off screen, at -32000; the one its restore goes back to is kept instead)
            if (-not $max -and -not $W::IsIconic($main)) { [void]$W::GetWindowRect($main, [ref]$n) }
            $keep = if ($script:saved -and $script:saved.PSObject.Properties['mini']) { $script:saved.mini } else { $null }
            $script:saved = [pscustomobject]@{ active = $false; frame = ($style -band $FRAME); max = $max; normal = @($n.Left, $n.Top, $n.Right, $n.Bottom); mini = $keep }
        }
        if ($W::IsZoomed($main) -or $W::IsIconic($main)) {
            [void]$W::ShowWindow($main, 9)   # SW_RESTORE: a maximized window keeps its maximized size, a minimized one stays minimized
            # the style as it is now: the one read before still says minimized / maximized, and written back it would make
            # the window so again
            $style = $W::GetWindowLongPtrW($main, $GWL_STYLE).ToInt64()
        }
        [void]$W::SetWindowLongPtrW($main, $GWL_STYLE, [IntPtr]($style -band -bnot $FRAME))
        if ($mode -eq 'mini') {
            # Size dp at the window's own DPI; where it was dragged to (pulled inside the work area of the monitor that
            # place is on), else 12 dp in from the corner of the work area (the taskbar stays clear); over every other
            # window (HWND_TOPMOST); SWP_FRAMECHANGED | SWP_SHOWWINDOW | SWP_NOACTIVATE. A corner picked (snap) forgets
            # the dragged place.
            $sc = $W::GetDpiForWindow($main) / 96
            if ($sc -le 0) { $sc = 1 }
            $wh = $size -split 'x'
            $pw = [int]([double]$wh[0] * $sc); $ph = [int]([double]$wh[1] * $sc); $mg = [int](12 * $sc)
            $m = if ($script:saved -and $script:saved.PSObject.Properties['mini']) { $script:saved.mini } else { $null }
            if ($snap -and $m) { SetMini $null; $m = $null }
            if ($m -and $m.corner -eq $corner) {
                $a = (MonitorAt ([int]$m.x + [int]($pw / 2)) ([int]$m.y + [int]($ph / 2))).Work
                $x = [Math]::Max($a.Left, [Math]::Min([int]$m.x, $a.Right - $pw)); $y = [Math]::Max($a.Top, [Math]::Min([int]$m.y, $a.Bottom - $ph))
            } else {
                $a = (MonitorOf $main).Work
                $x = if ($corner -like '*l') { $a.Left + $mg } else { $a.Right - $pw - $mg }
                $y = if ($corner -like 't*') { $a.Top + $mg } else { $a.Bottom - $ph - $mg }
            }
            # (a pixel short first: a window already this size — foobar2000 started in the mini player, framed — would
            # only lose its frame, and Columns UI lays its panels out again only when the window's size changes)
            [void]$W::SetWindowPos($main, [IntPtr](-1), $x, $y, $pw, $ph - 1, 0x0070)
            [void]$W::SetWindowPos($main, [IntPtr](-1), $x, $y, $pw, $ph, 0x0070)
            $script:miniCorner = $corner
        } else {
            $r = (MonitorOf $main).Monitor
            # SWP_FRAMECHANGED | SWP_NOOWNERZORDER | SWP_SHOWWINDOW; no longer above the others (HWND_NOTOPMOST: from the
            # mini player)
            [void]$W::SetWindowPos($main, [IntPtr](-2), $r.Left, $r.Top, $r.Right - $r.Left, $r.Bottom - $r.Top, 0x0260)
        }
        if ($script:saved) { $script:saved.active = $true; Save $script:saved }
        return
    }
    # window: the frame back, then the place it had. The rectangle is a RECT of its own (set through $p.Normal, PowerShell
    # would change a copy of the struct).
    $frame = if ($script:saved -and $script:saved.frame) { [long]$script:saved.frame } else { $FRAME }
    [void]$W::SetWindowLongPtrW($main, $GWL_STYLE, [IntPtr]($style -bor $frame))
    $n = New-Object AudioArchive.Frame+RECT
    if ($script:saved -and $script:saved.normal) {
        $n.Left = $script:saved.normal[0]; $n.Top = $script:saved.normal[1]; $n.Right = $script:saved.normal[2]; $n.Bottom = $script:saved.normal[3]
    } else {
        # no place kept (the state file was removed): 80 % of the monitor's work area, centred
        $a = (MonitorOf $main).Work
        $fw = [int](($a.Right - $a.Left) * .8); $fh = [int](($a.Bottom - $a.Top) * .8)
        $n.Left = $a.Left + [int](($a.Right - $a.Left - $fw) / 2); $n.Top = $a.Top + [int](($a.Bottom - $a.Top - $fh) / 2)
        $n.Right = $n.Left + $fw; $n.Bottom = $n.Top + $fh
    }
    if ($script:saved -and $script:saved.max) {
        $p = PlacementOf $main
        $p.Normal = $n; $p.ShowCmd = 3; $p.Flags = 0   # SW_SHOWMAXIMIZED, the rectangle kept for its restore
        [void]$W::SetWindowPlacement($main, [ref]$p)
        [void]$W::SetWindowPos($main, [IntPtr](-2), 0, 0, 0, 0, 0x0233)   # HWND_NOTOPMOST; SWP_FRAMECHANGED | NOMOVE | NOSIZE | NOACTIVATE | NOOWNERZORDER
    } else {
        # exactly where it was (SetWindowPlacement would pull a window larger than the work area into it)
        [void]$W::SetWindowPos($main, [IntPtr](-2), $n.Left, $n.Top, $n.Right - $n.Left, $n.Bottom - $n.Top, 0x0230)   # HWND_NOTOPMOST (from the mini player); SWP_FRAMECHANGED | NOACTIVATE | NOOWNERZORDER
    }
    if ($script:saved) { $script:saved.active = $false; Save $script:saved }
}

# The mini player dragged: Windows' own move (WM_SYSCOMMAND SC_MOVE | HTCAPTION, as a title bar starts it) while the left
# button is still down. Should the window not follow (the mouse has moved, the window not), it is moved from here: with
# the mouse, 8 ms a step, until the button is let go. Then the place is kept for the corner the mini player is in.
function Drag {
    $c0 = New-Object AudioArchive.Frame+POINT; [void]$W::GetCursorPos([ref]$c0)
    $r0 = New-Object AudioArchive.Frame+RECT; [void]$W::GetWindowRect($main, [ref]$r0)
    [void]$W::PostMessageW($main, 0x0112, [IntPtr]0xF012, [IntPtr]0)
    $t0 = [DateTime]::UtcNow
    $own = $false
    $c = New-Object AudioArchive.Frame+POINT; $r = New-Object AudioArchive.Frame+RECT
    while (($W::GetAsyncKeyState(0x01) -band 0x8000) -and ([DateTime]::UtcNow - $t0).TotalSeconds -lt 60) {
        [void]$W::GetCursorPos([ref]$c)
        if (-not $own -and ([DateTime]::UtcNow - $t0).TotalMilliseconds -gt 120) {
            [void]$W::GetWindowRect($main, [ref]$r)
            if (([Math]::Abs($c.X - $c0.X) + [Math]::Abs($c.Y - $c0.Y)) -gt 4 -and $r.Left -eq $r0.Left -and $r.Top -eq $r0.Top) { $own = $true }
        }
        if ($own) {
            # SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER
            [void]$W::SetWindowPos($main, [IntPtr]::Zero, $r0.Left + $c.X - $c0.X, $r0.Top + $c.Y - $c0.Y, 0, 0, 0x0215)
            Start-Sleep -Milliseconds 8
        } else { Start-Sleep -Milliseconds 15 }
    }
    Start-Sleep -Milliseconds 60
    [void]$W::GetWindowRect($main, [ref]$r)
    if ($script:miniCorner) { SetMini ([pscustomobject]@{ corner = $script:miniCorner; x = $r.Left; y = $r.Top }) }
}

if (-not $Serve) { Apply $Mode $Corner $Size $false; exit 0 }

# ---- serving: one per window, until the window goes ----
$mutex = New-Object Threading.Mutex($false, "AudioArchiveWindow-$main")
if (-not $mutex.WaitOne(0)) { exit 0 }
$cmdFile = Join-Path (Split-Path -Parent $State) 'window-cmd.txt'
$beatFile = Join-Path (Split-Path -Parent $State) 'window-serve.txt'
$script:miniCorner = $null
$last = ''; $beat = [DateTime]::MinValue
while ($W::IsWindow($main)) {
    $now = [DateTime]::UtcNow
    if (($now - $beat).TotalSeconds -ge 2) {
        $beat = $now
        try { [IO.File]::WriteAllText($beatFile, "$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) $Panel") } catch { }
    }
    $t = ''
    try { if ([IO.File]::Exists($cmdFile)) { $t = [IO.File]::ReadAllText($cmdFile).Trim() } } catch { $t = '' }
    if ($t -and $t -ne $last) {
        $last = $t
        $words = $t -split '\s+'
        # (an order more than 10 s old was left from before: not carried out)
        $ms = 0; [void][long]::TryParse(($words[0] -split '-')[-1], [ref]$ms)
        if ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $ms -lt 10000) {
            try {
                switch ($words[1]) {
                    'drag' { Drag }
                    'mini' { Apply 'mini' $words[2] $words[3] ($words[4] -eq 'snap') }
                    'borderless' { Apply 'borderless' 'br' '560x136' $false }
                    'window' { Apply 'window' 'br' '560x136' $false }
                }
            } catch { }
        }
    }
    Start-Sleep -Milliseconds 15
}
try { if ((Get-Content -LiteralPath $beatFile -Raw) -match " $Panel\s*$") { Remove-Item -LiteralPath $beatFile } } catch { }
