@echo off
echo Killing stuck dev processes...
taskkill /F /IM clippaste.exe >nul 2>&1
taskkill /F /IM cargo.exe >nul 2>&1
REM Kill anything on port 1420 (Vite)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :1420 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
REM Kill node processes that might be Vite
for /f "tokens=2" %%a in ('wmic process where "commandline like '%%vite%%'" get processid 2^>nul ^| findstr /r "[0-9]"') do taskkill /F /PID %%a >nul 2>&1
echo Done! You can run "pnpm tauri dev" now.
