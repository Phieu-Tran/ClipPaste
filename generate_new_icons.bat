@echo off
chcp 65001 >nul
cls

echo 🎨 ClipPaste NEW Icon Generator
echo ================================
echo 📍 Source: src-tauri\icons\logo_new.svg
echo ✨ Features: Gradient, Shadows, Professional Design
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python not found. Please install Python first.
    echo    Download from: https://python.org/
    pause
    exit /b 1
)

REM Check if PIL is available
python -c "import PIL" >nul 2>&1
if errorlevel 1 (
    echo ❌ PIL not found. Installing...
    pip install Pillow
    if errorlevel 1 (
        echo ❌ Failed to install PIL.
        echo    Please run manually: pip install Pillow
        pause
        exit /b 1
    )
)

REM Check if new SVG exists
if not exist "src-tauri\icons\logo_new.svg" (
    echo ❌ New SVG not found!
    echo    Expected: src-tauri\icons\logo_new.svg
    pause
    exit /b 1
)

REM Run the generator
echo 🚀 Generating NEW icons with enhanced design...
echo.
python gen_new_icons.py

if errorlevel 1 (
    echo.
    echo ❌ Icon generation failed!
    pause
    exit /b 1
)

echo.
echo ✅ NEW icons generated successfully!
echo.
echo 📁 Check your new icons:
echo    📂 icons_new\     - Standard icons (16px-512px)
echo    📂 logos_new\     - High-res logos (512px-2048px)
echo.
echo 🎯 New design features:
echo    ✨ Gradient background
echo    ✨ Enhanced shadows
echo    ✨ More detailed clipboard
echo    ✨ Professional appearance
echo.
echo 💡 To use these icons in your app:
echo    1. Copy icons_new\* to src-tauri\icons\
echo    2. Update tauri.conf.json if needed
echo    3. Build: pnpm tauri build
echo.
pause
