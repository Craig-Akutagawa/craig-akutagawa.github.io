@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==================================================
echo           正在关闭本地文章发帖器 (Post Composer)
echo ==================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File ".\tools\stop-post-composer.ps1"
if %errorlevel% neq 0 (
    echo.
    echo [错误] 关闭发帖器失败。请检查后台是否有残留的 Python 进程。
    echo.
    pause
) else (
    echo.
    echo [成功] 本地发帖器已成功关闭。
    echo.
    timeout /t 3
)
