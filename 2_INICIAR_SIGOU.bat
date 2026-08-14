@echo off
chcp 65001 >nul
title Abrir SIGOU
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo O Node.js nao esta instalado.
  echo Execute primeiro 1_INSTALAR_SIGOU.bat.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo O SIGOU ainda nao foi instalado.
  echo Execute primeiro 1_INSTALAR_SIGOU.bat.
  pause
  exit /b 1
)
echo Iniciando o SIGOU...
start "Servidor SIGOU" /min cmd /k "cd /d ""%~dp0"" && npm.cmd start"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
echo O SIGOU foi aberto no navegador.
echo Mantenha a janela Servidor SIGOU aberta durante o uso.
timeout /t 5 /nobreak >nul
