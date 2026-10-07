<#
  Installs (or removes) the theme's fonts for the current Windows user only: no admin rights, nothing system-wide.
  Copies assets/fonts/*.ttf to %LOCALAPPDATA%\Microsoft\Windows\Fonts and registers them under
  HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts, then tells running programs that fonts changed.

    pwsh tools/fonts.ps1             # install
    pwsh tools/fonts.ps1 -Uninstall  # remove exactly what this script installed
#>
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'

$src = Join-Path $PSScriptRoot '..\assets\fonts'
$dir = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
$key = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'

Add-Type -Namespace Native -Name Fonts -MemberDefinition @'
[DllImport("gdi32.dll", CharSet = CharSet.Unicode)] public static extern int AddFontResourceW(string file);
[DllImport("gdi32.dll", CharSet = CharSet.Unicode)] public static extern bool RemoveFontResourceW(string file);
[DllImport("user32.dll")] public static extern System.IntPtr SendMessageTimeoutW(System.IntPtr hWnd, uint msg, System.IntPtr w, System.IntPtr l, uint flags, uint timeout, out System.IntPtr result);
'@

New-Item -ItemType Directory -Force $dir | Out-Null
if (-not (Test-Path $key)) { New-Item $key -Force | Out-Null }

foreach ($ttf in Get-ChildItem $src -Filter *.ttf) {
    # registry value name as Windows' own installer writes it, e.g. "Geist Mono Regular (TrueType)"
    $style = ($ttf.BaseName -replace '^GeistMono-', '')
    $name = "Geist Mono $style (TrueType)"
    $dest = Join-Path $dir $ttf.Name
    if ($Uninstall) {
        if (Test-Path $dest) { [void][Native.Fonts]::RemoveFontResourceW($dest); Remove-Item $dest -Force -ErrorAction SilentlyContinue }
        Remove-ItemProperty -Path $key -Name $name -ErrorAction SilentlyContinue
        "removed  $name"
    } else {
        # an installed font file is held open by Windows; it only needs replacing when it differs
        $same = (Test-Path $dest) -and ((Get-FileHash $dest).Hash -eq (Get-FileHash $ttf.FullName).Hash)
        if (-not $same) { Copy-Item $ttf.FullName $dest -Force }
        Set-ItemProperty -Path $key -Name $name -Value $dest
        [void][Native.Fonts]::AddFontResourceW($dest)
        "installed $name"
    }
}
$r = [IntPtr]::Zero
[void][Native.Fonts]::SendMessageTimeoutW([IntPtr]0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero, 2, 1000, [ref]$r)   # WM_FONTCHANGE
