@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo   YL 个人博客 - 一键安装启动脚本
echo ============================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] 安装后端依赖...
cd /d "%~dp0server"
call npm install --loglevel=error
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 后端依赖安装失败
    pause
    exit /b 1
)
echo      完成！

echo [2/4] 安装前端依赖...
cd /d "%~dp0client"
call npm install --loglevel=error
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 前端依赖安装失败
    pause
    exit /b 1
)
echo      完成！

echo [3/4] 初始化数据库...
cd /d "%~dp0server"
node src/seed.js
echo      完成！

echo [4/4] 启动博客服务...
echo.
echo ============================================
echo   启动成功！
echo   博客前台：http://localhost:5173
echo   管理后台：http://localhost:5173/admin
echo   管理员账号：admin / admin123
echo ============================================
echo.
echo   提示：按 Ctrl+C 可停止服务
echo.

cd /d "%~dp0"
start http://localhost:5173
npm run dev

pause
