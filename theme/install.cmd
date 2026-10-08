@echo off
rem RhinE - An Audio Archive: installs the theme into foobar2000 (64-bit). Double-click it, or run it with
rem install.ps1's options, e.g.  install.cmd -Foobar "D:\Apps\foobar2000"
rem a PowerShell 7 module path breaks Windows PowerShell: let it use its own
set "PSModulePath="
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
