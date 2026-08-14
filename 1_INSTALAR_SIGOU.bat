@echo off
chcp 65001 >nul
title Instalador do SIGOU
cd /d "%~dp0"
echo ========================================
echo       INSTALACAO DO SIGOU
echo ========================================
where node >nul 2>&1
if errorlevel 1 (
  echo O Node.js ainda nao esta instalado.
  echo Abrindo a pagina oficial para baixar a versao LTS...
  start "" "https://nodejs.org/pt/download"
  echo Instale, reinicie o computador e execute este arquivo novamente.
  pause
  exit /b 1
)
echo Instalando os componentes. Aguarde...
call npm.cmd install
if errorlevel 1 (
  echo Nao foi possivel instalar. Confira a internet e tente novamente.
  pause
  exit /b 1
)
echo ========================================
echo       INSTALACAO CONCLUIDA!
echo ========================================
echo Agora use o arquivo 2_INICIAR_SIGOU.bat.
pause
