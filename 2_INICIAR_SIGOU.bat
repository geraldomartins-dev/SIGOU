@echo off
chcp 65001 >nul
setlocal
title Servidor ResolveJa - mantenha esta janela aberta
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows.ps1" -Mode Start
set "resultado=%errorlevel%"
echo.
if not "%resultado%"=="0" pause
exit /b %resultado%
