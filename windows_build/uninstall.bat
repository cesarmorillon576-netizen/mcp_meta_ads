@echo off
chcp 65001 >nul 2>&1

where powershell >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: PowerShell no encontrado. Esto no deberia ocurrir en Windows 10/11.
    pause
    exit /b 1
)

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"

if %ERRORLEVEL% neq 0 (
    echo.
    echo El desinstalador termino con un error ^(codigo %ERRORLEVEL%^).
    echo Revisa el mensaje de arriba para mas detalles.
    pause
)
