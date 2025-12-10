# 过山车排行榜服务器启动脚本

Write-Host "正在启动过山车排行榜服务器..." -ForegroundColor Green
Write-Host ""

# 切换到脚本所在目录
Set-Location $PSScriptRoot

# 检查依赖
if (-not (Test-Path "node_modules")) {
    Write-Host "正在安装依赖..." -ForegroundColor Yellow
    npm install
    Write-Host ""
}

# 启动服务器
Write-Host "启动服务器..." -ForegroundColor Green
Write-Host "服务器将在 http://localhost:3000 启动" -ForegroundColor Cyan
Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Yellow
Write-Host ""

node server.js

