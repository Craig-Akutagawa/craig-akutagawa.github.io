@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==================================================
echo           正在启动本地文章发帖器 (Post Composer)
echo ==================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File ".\tools\start-post-composer.ps1"
if %errorlevel% neq 0 (
    echo.
    echo [错误] 启动发帖器失败。请检查上方的错误提示信息。
    echo.
    pause
) else (
    echo.
    echo [成功] 发帖器已在后台启动！
    echo [提示] 浏览器已自动打开。如需关闭服务，请运行 "Close Post Composer.cmd"
    echo.
    timeout /t 5
)
