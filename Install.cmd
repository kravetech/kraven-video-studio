@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install.ps1" %*
set "result=%ERRORLEVEL%"
if not "%result%"=="0" echo Setup did not complete. Read the error above and rerun after correcting it.
pause
exit /b %result%
