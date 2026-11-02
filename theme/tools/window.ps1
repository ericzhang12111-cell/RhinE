<#
  Borderless full screen for foobar2000 (05 STYLE › DISPLAY › WINDOW, or F11): the theme's root panel runs this with
  its own window handle, and the main window it belongs to loses its title bar and frame and covers the whole monitor
  it is on (the taskbar too), or gets them back:
    powershell -File window.ps1 -Panel <hwnd> -Mode borderless|window -State <file>
  The window's place before the first switch (its frame, its rectangle, maximized or not) is kept in the state file,
  so the way back finds it after a restart too; foobar2000 itself starts as it closed, and the theme runs this again
  then.
#>
param([Parameter(Mandatory)][long]$Panel, [Parameter(Mandatory)][ValidateSet('borderless', 'window')][string]$Mode,
      [Parameter(Mandatory)][string]$State)
$ErrorActionPreference = 'Stop'

Add-Type -Namespace AudioArchive -Name Frame -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
[StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
[StructLayout(LayoutKind.Sequential)] public struct PLACEMENT { public int Length, Flags, ShowCmd; public POINT Min, Max; public RECT Normal; }
[StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int Size; public RECT Monitor, Work; public int Flags; }
[DllImport("user32.dll")] public static extern System.IntPtr SetThreadDpiAwarenessContext(System.IntPtr c);
[DllImport("user32.dll")] public static extern System.IntPtr GetAncestor(System.IntPtr h, uint f);
[DllImport("user32.dll")] public static extern bool IsWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool IsZoomed(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int cmd);
[DllImport("user32.dll")] public static extern System.IntPtr GetWindowLongPtrW(System.IntPtr h, int i);
[DllImport("user32.dll")] public static extern System.IntPtr SetWindowLongPtrW(System.IntPtr h, int i, System.IntPtr v);
[DllImport("user32.dll")] public static extern bool GetWindowPlacement(System.IntPtr h, ref PLACEMENT p);
[DllImport("user32.dll")] public static extern bool SetWindowPlacement(System.IntPtr h, ref PLACEMENT p);
[DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr after, int x, int y, int w, int cy, uint f);
[DllImport("user32.dll")] public static extern System.IntPtr MonitorFromWindow(System.IntPtr h, uint f);
[DllImport("user32.dll")] public static extern bool GetMonitorInfoW(System.IntPtr m, ref MONITORINFO i);
'@
$W = [AudioArchive.Frame]
# per-monitor DPI aware, so the rectangles are the screen's own pixels (PER_MONITOR_AWARE_V2)
[void]$W::SetThreadDpiAwarenessContext([IntPtr](-4))

$main = $W::GetAncestor([IntPtr]$Panel, 2)   # GA_ROOT
if (-not $W::IsWindow($main)) { exit 1 }
$FRAME = 0x00C00000 -bor 0x00040000           # WS_CAPTION | WS_THICKFRAME
$GWL_STYLE = -16
$style = $W::GetWindowLongPtrW($main, $GWL_STYLE).ToInt64()

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
function PlacementOf($h) {
    $p = New-Object AudioArchive.Frame+PLACEMENT
    $p.Length = [Runtime.InteropServices.Marshal]::SizeOf($p)
    [void]$W::GetWindowPlacement($h, [ref]$p)
    $p
}

if ($Mode -eq 'borderless') {
    # the place to come back to: taken while the window still has its frame and was not borderless before (after a
    # restart in borderless mode foobar2000 brings the window back framed but monitor-sized: that is not kept). Its
    # rectangle on the screen as it is, or (maximized) the one its restore goes back to.
    if (($style -band $FRAME) -and -not ($saved -and $saved.active)) {
        $max = $W::IsZoomed($main)
        $n = (PlacementOf $main).Normal
        if (-not $max) { [void]$W::GetWindowRect($main, [ref]$n) }
        $saved = [pscustomobject]@{ active = $false; frame = ($style -band $FRAME); max = $max; normal = @($n.Left, $n.Top, $n.Right, $n.Bottom) }
    }
    if ($W::IsZoomed($main)) { [void]$W::ShowWindow($main, 9) }   # SW_RESTORE: a maximized window keeps its maximized size
    [void]$W::SetWindowLongPtrW($main, $GWL_STYLE, [IntPtr]($style -band -bnot $FRAME))
    $r = (MonitorOf $main).Monitor
    # SWP_FRAMECHANGED | SWP_NOOWNERZORDER | SWP_SHOWWINDOW, at the top of the z-order
    [void]$W::SetWindowPos($main, [IntPtr]::Zero, $r.Left, $r.Top, $r.Right - $r.Left, $r.Bottom - $r.Top, 0x0260)
    if ($saved) { $saved.active = $true; Save $saved }
    exit 0
}

# window: the frame back, then the place it had. The rectangle is a RECT of its own (set through $p.Normal, PowerShell
# would change a copy of the struct).
$frame = if ($saved -and $saved.frame) { [long]$saved.frame } else { $FRAME }
[void]$W::SetWindowLongPtrW($main, $GWL_STYLE, [IntPtr]($style -bor $frame))
$n = New-Object AudioArchive.Frame+RECT
if ($saved -and $saved.normal) {
    $n.Left = $saved.normal[0]; $n.Top = $saved.normal[1]; $n.Right = $saved.normal[2]; $n.Bottom = $saved.normal[3]
} else {
    # no place kept (the state file was removed): 80 % of the monitor's work area, centred
    $a = (MonitorOf $main).Work
    $w = [int](($a.Right - $a.Left) * .8); $h = [int](($a.Bottom - $a.Top) * .8)
    $n.Left = $a.Left + [int](($a.Right - $a.Left - $w) / 2); $n.Top = $a.Top + [int](($a.Bottom - $a.Top - $h) / 2)
    $n.Right = $n.Left + $w; $n.Bottom = $n.Top + $h
}
if ($saved -and $saved.max) {
    $p = PlacementOf $main
    $p.Normal = $n; $p.ShowCmd = 3; $p.Flags = 0   # SW_SHOWMAXIMIZED, the rectangle kept for its restore
    [void]$W::SetWindowPlacement($main, [ref]$p)
    [void]$W::SetWindowPos($main, [IntPtr]::Zero, 0, 0, 0, 0, 0x0237)   # SWP_FRAMECHANGED | NOMOVE | NOSIZE | NOZORDER | NOACTIVATE | NOOWNERZORDER
} else {
    # exactly where it was (SetWindowPlacement would pull a window larger than the work area into it)
    [void]$W::SetWindowPos($main, [IntPtr]::Zero, $n.Left, $n.Top, $n.Right - $n.Left, $n.Bottom - $n.Top, 0x0234)   # SWP_FRAMECHANGED | NOZORDER | NOACTIVATE | NOOWNERZORDER
}
if ($saved) { $saved.active = $false; Save $saved }
exit 0
