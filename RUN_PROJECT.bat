@echo off
setlocal
cd /d "%~dp0"
echo ========================================
echo       Skillora - Local Development
echo ========================================
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Install the current LTS version from https://nodejs.org/ and reopen this file.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found. Reinstall Node.js LTS.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing project dependencies. This may take a few minutes...
  call npm install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo.
echo Starting Skillora. Keep this window open.
echo When Vite starts, open the Local URL shown below, usually http://localhost:5173
call npm run dev
pause
