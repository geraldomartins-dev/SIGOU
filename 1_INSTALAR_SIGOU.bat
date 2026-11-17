@echo off
chcp 65001 >nul
setlocal
title Instalacao do ResolveJa
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows.ps1" -Mode Install
set "resultado=%errorlevel%"
echo.
pause
exit /b %resultado%
