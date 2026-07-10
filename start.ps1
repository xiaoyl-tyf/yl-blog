# YL 个人博客 - 一键安装启动脚本 (PowerShell)
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  YL 个人博客 - 一键安装启动脚本" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js
try {
    $nodeVersion = node --version
    Write-Host "✓ 检测到 Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ 未检测到 Node.js，请先安装：https://nodejs.org/" -ForegroundColor Red
    Read-Host "按回车键退出"
    exit 1
}

Set-Location (Split-Path $MyInvocation.MyCommand.Path)

# 安装后端依赖
Write-Host "[1/4] 安装后端依赖..." -ForegroundColor Yellow
Set-Location server
npm install --loglevel=error
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 后端依赖安装失败" -ForegroundColor Red
    Read-Host "按回车键退出"
    exit 1
}
Write-Host "  ✓ 完成" -ForegroundColor Green

# 安装前端依赖
Write-Host "[2/4] 安装前端依赖..." -ForegroundColor Yellow
Set-Location ..\client
npm install --loglevel=error
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 前端依赖安装失败" -ForegroundColor Red
    Read-Host "按回车键退出"
    exit 1
}
Write-Host "  ✓ 完成" -ForegroundColor Green

# 初始化数据库
Write-Host "[3/4] 初始化数据库..." -ForegroundColor Yellow
Set-Location ..\server
node src/seed.js
Write-Host "  ✓ 完成" -ForegroundColor Green

# 启动
Write-Host "[4/4] 启动博客服务..." -ForegroundColor Yellow
Set-Location ..
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   启动成功！" -ForegroundColor Green
Write-Host "   博客前台：http://localhost:5173" -ForegroundColor White
Write-Host "   管理后台：http://localhost:5173/admin" -ForegroundColor White
Write-Host "   管理员账号：admin / admin123" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "   提示：按 Ctrl+C 可停止服务" -ForegroundColor Yellow
Write-Host ""

Start-Process "http://localhost:5173"
npm run dev

Read-Host "按回车键退出"
