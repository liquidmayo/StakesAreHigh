@echo off
title OUPS Center - Ticket Sampler
color 0E

REM ============================================================
REM  OUPS Center launcher
REM  Place this file on the Desktop. It starts the ticket
REM  sampler (installed in C:\OUPSCenter) and opens the browser.
REM ============================================================

set "APPDIR=C:\OUPSCenter"
set "URL=http://localhost:8811"

echo.
echo   Starting OUPS Center...
echo   App folder: %APPDIR%
echo.

REM --- Make sure the app is actually installed there ---
if not exist "%APPDIR%\package.json" (
    echo   ERROR: Could not find the app at %APPDIR%.
    echo   Make sure the OUPS Center files are installed in that folder.
    echo.
    pause
    exit /b 1
)

cd /d "%APPDIR%"

REM --- Make sure Node.js / npm is available ---
where npm >nul 2>&1
if errorlevel 1 (
    echo   ERROR: npm was not found. Please install Node.js from
    echo   https://nodejs.org and try again.
    echo.
    pause
    exit /b 1
)

REM --- Wait (in the background) until the server responds, then open the browser ---
start "" /b powershell -NoProfile -WindowStyle Hidden -Command ^
  "for($i=0; $i -lt 60; $i++){ try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%' | Out-Null; break } catch { Start-Sleep -Milliseconds 500 } }; Start-Process '%URL%'"

echo   Server starting - your browser will open at %URL% shortly.
echo   Keep this window open while you use the app.
echo   Close this window (or press Ctrl+C) to stop the server.
echo.

REM --- Run the server in this window so its logs are visible ---
call npm start

REM --- If the server exits/crashes, keep the window open to show why ---
echo.
echo   The server has stopped.
pause
