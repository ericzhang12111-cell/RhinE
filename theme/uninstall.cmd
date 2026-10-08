@echo off
rem RhinE - An Audio Archive: removes the theme from foobar2000 (64-bit). Double-click it, or run it with
rem uninstall.ps1's options, e.g.  uninstall.cmd -Foobar "D:\Apps\foobar2000"
rem a PowerShell 7 module path breaks Windows PowerShell: let it use its own
set "PSModulePath="
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
echo.
pause
