@echo off
setlocal
title 3d-print-calculator dev server (port 4001)
cd /d "%~dp0"

set PORT=4001

echo Freeing port %PORT% if anything is still listening...
call :killport

echo Starting dev server on http://localhost:%PORT%
echo Close this window (or press Ctrl+C) to stop it.
echo.

rem Run in the foreground so this console owns the process.
call node_modules\.bin\next dev -p %PORT%

echo.
echo Dev server exited - cleaning up port %PORT%...
call :killport
exit /b 0

:killport
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /r /c:"LISTENING" ^| findstr ":%PORT% "') do (
  taskkill /F /T /PID %%P >nul 2>&1
)
exit /b 0
