@echo off
chcp 65001 >nul 2>&1

:: Verificar que PowerShell existe
where powershell >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: PowerShell no encontrado. Esto no deberia ocurrir en Windows 10/11.
    pause
    exit /b 1
)

:: Lanzar el script con bypass total de politica de ejecucion
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

if %ERRORLEVEL% neq 0 (
    echo.
    echo El instalador termino con un error ^(codigo %ERRORLEVEL%^).
    echo Revisa el mensaje de arriba para mas detalles.
    pause
)
