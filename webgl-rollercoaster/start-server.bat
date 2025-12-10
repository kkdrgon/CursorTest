@echo off
echo 正在启动过山车排行榜服务器...
echo.

cd /d %~dp0

echo 检查依赖...
if not exist "node_modules" (
    echo 正在安装依赖...
    call npm install
    echo.
)

echo 启动服务器...
node server.js

pause

