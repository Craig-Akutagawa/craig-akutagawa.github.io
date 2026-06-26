@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==================================================
echo           正在启动本地博客预览 (Jekyll Server)
echo ==================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File ".\tools\start-local-preview.ps1"
if %errorlevel% neq 0 (
    echo.
    echo [错误] 启动本地预览失败。请检查上方的错误提示信息。
    echo.
    pause
)
