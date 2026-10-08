@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo   ============================================
echo    卫戍协议：盟约  ·  罗德岛 MOD  安装
echo   ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   没找到 Node.js。
  echo   请先安装 Node.js 22 或 24 LTS： https://nodejs.org/zh-cn/download
  echo.
  pause
  exit /b 1
)

rem 直接把游戏文件夹拖到这个 bat 上，就等于 --game "该文件夹"
set "EXTRA=%*"
if not "%~1"=="" if exist "%~1\" set "EXTRA=--game "%~1""

node "tools\install.mjs" %EXTRA%

echo.
pause
