# setup.ps1 — Configurador automatico de Meta & Google Ads Manager para Claude Desktop
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Meta & Google Ads Manager — Configuracion     " -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar que los ejecutables existen
$metaExe   = Join-Path $scriptDir "meta_ads.exe"
$googleExe = Join-Path $scriptDir "google_ads.exe"

if (-not (Test-Path $metaExe) -or -not (Test-Path $googleExe)) {
    Write-Host "ERROR: No se encontraron los archivos .exe en esta carpeta." -ForegroundColor Red
    Write-Host "Asegurate de ejecutar este script desde la carpeta MetaAdsManager." -ForegroundColor Yellow
    Read-Host "`nPresiona Enter para salir"
    exit 1
}

# 2. Verificar Claude Desktop
$claudeConfigDir  = "$env:APPDATA\Claude"
$claudeConfigPath = "$claudeConfigDir\claude_desktop_config.json"

if (-not (Test-Path $claudeConfigDir)) {
    Write-Host "ERROR: No se encontro Claude Desktop instalado." -ForegroundColor Red
    Write-Host "Descargalo desde: https://claude.ai/download" -ForegroundColor Yellow
    Read-Host "`nPresiona Enter para salir"
    exit 1
}

Write-Host "Claude Desktop encontrado." -ForegroundColor Green

# 3. Leer o crear config existente
if (Test-Path $claudeConfigPath) {
    $configRaw = Get-Content $claudeConfigPath -Raw -Encoding UTF8
    $config    = $configRaw | ConvertFrom-Json
} else {
    $config = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
}

if (-not $config.PSObject.Properties['mcpServers']) {
    $config | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue ([PSCustomObject]@{})
}

# 4. Agregar los dos servidores MCP
$config.mcpServers | Add-Member -NotePropertyName 'MetaAds' -NotePropertyValue ([PSCustomObject]@{
    command = $metaExe
    args    = @()
}) -Force

$config.mcpServers | Add-Member -NotePropertyName 'GoogleAds' -NotePropertyValue ([PSCustomObject]@{
    command = $googleExe
    args    = @()
}) -Force

# 5. Guardar config
$config | ConvertTo-Json -Depth 10 | Set-Content $claudeConfigPath -Encoding UTF8
Write-Host "Claude Desktop configurado correctamente." -ForegroundColor Green

# 6. Verificar archivo .env
$envPath = Join-Path $scriptDir ".env"
Write-Host ""
Write-Host "------------------------------------------------" -ForegroundColor Yellow
Write-Host "  PASO FINAL: completar credenciales en .env    " -ForegroundColor Yellow
Write-Host "------------------------------------------------" -ForegroundColor Yellow
Write-Host ""
Write-Host "Archivo: $envPath" -ForegroundColor White
Write-Host ""
Write-Host "Necesitas rellenar los tokens de:" -ForegroundColor White
Write-Host "  - Meta Ads   (META_ACCESS_TOKEN)" -ForegroundColor White
Write-Host "  - Google Ads (GOOGLE_ADS_DEVELOPER_TOKEN, CLIENT_ID, etc.)" -ForegroundColor White
Write-Host ""

$abrir = Read-Host "Abrir el archivo .env ahora para completarlo? (s/n)"
if ($abrir -eq "s" -or $abrir -eq "S") {
    Start-Process notepad $envPath
}

Write-Host ""
Write-Host "Listo! Reinicia Claude Desktop para que los cambios tengan efecto." -ForegroundColor Cyan
Write-Host ""
Read-Host "Presiona Enter para salir"
