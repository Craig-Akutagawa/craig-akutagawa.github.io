@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==================================================
echo           正在关闭本地博客预览 (Jekyll Server)
echo ==================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File ".\tools\stop-local-preview.ps1"
if %errorlevel% neq 0 (
    echo.
    echo [错误] 关闭本地预览服务失败。请检查后台是否有残留进程。
    echo.
    pause
) else (
    echo.
    echo [成功] 本地博客预览服务已关闭。
    echo.
    timeout /t 3
)
