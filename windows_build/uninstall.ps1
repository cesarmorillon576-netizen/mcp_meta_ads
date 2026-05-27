# uninstall.ps1 - Desinstalador de Meta & Google Ads Manager para Claude Desktop y Claude Code
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- helpers ------------------------------------------------------------------
function Write-OK   { param($m) Write-Host "  [OK]    $m" -ForegroundColor Green }
function Write-Fail { param($m) Write-Host "  [ERROR] $m" -ForegroundColor Red }
function Write-Warn { param($m) Write-Host "  [AVISO] $m" -ForegroundColor Yellow }
function Write-Info { param($m) Write-Host "  $m"         -ForegroundColor White }

function Exit-Error {
    param($titulo, $detalle = "")
    Write-Host ""
    Write-Fail $titulo
    if ($detalle) { Write-Host "          $detalle" -ForegroundColor Gray }
    Write-Host ""
    Read-Host "  Presiona Enter para salir"
    exit 1
}

# --- cabecera ------------------------------------------------------------------
Clear-Host
Write-Host ""
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host "   Meta & Google Ads Manager - Desinstalacion    " -ForegroundColor Cyan
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host ""
Write-Info "Este proceso eliminara MetaAds y GoogleAds de:"
Write-Host "    - Claude Desktop  (%APPDATA%\Claude\claude_desktop_config.json)" -ForegroundColor Gray
Write-Host "    - Claude Code CLI (%USERPROFILE%\.claude.json)" -ForegroundColor Gray
Write-Info "Los archivos .js y .env de esta carpeta NO se tocaran."
Write-Host ""

$confirm = Read-Host "  Continuar con la desinstalacion? (s/n)"
if ($confirm -notmatch '^[sS]$') {
    Write-Host ""; Write-Info "Desinstalacion cancelada."; Write-Host ""; Read-Host "  Presiona Enter para salir"; exit 0
}
Write-Host ""

$utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Remove-McpEntries {
    param($configPath, $label)
    if (-not (Test-Path $configPath)) { Write-Info "$label : no existe config, nada que hacer."; return }

    try {
        $raw = Get-Content $configPath -Raw -Encoding UTF8
        if ([string]::IsNullOrWhiteSpace($raw)) { Write-Info "$label : config vacia, nada que hacer."; return }
        $config = $raw | ConvertFrom-Json
    } catch {
        Write-Warn "No se pudo leer $label config: $_"; return
    }

    $tieneMeta   = $config.PSObject.Properties['mcpServers'] -and $config.mcpServers.PSObject.Properties['MetaAds']
    $tieneGoogle = $config.PSObject.Properties['mcpServers'] -and $config.mcpServers.PSObject.Properties['GoogleAds']

    if (-not $tieneMeta -and -not $tieneGoogle) {
        Write-Info "$label : MetaAds y GoogleAds no estaban configurados."; return
    }

    $bak = "$configPath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    try { Copy-Item $configPath $bak -ErrorAction Stop; Write-OK "Backup $label : $(Split-Path -Leaf $bak)" } catch {}

    $mcpHash = @{}
    if ($config.PSObject.Properties['mcpServers'] -and $null -ne $config.mcpServers) {
        $config.mcpServers.PSObject.Properties | ForEach-Object {
            if ($_.Name -ne 'MetaAds' -and $_.Name -ne 'GoogleAds') { $mcpHash[$_.Name] = $_.Value }
        }
    }
    $config | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue $mcpHash -Force

    try {
        [System.IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 20), $utf8NoBom)
        Write-OK "$label : servidores eliminados correctamente"
    } catch {
        Write-Warn "No se pudo guardar $label config: $_"
    }
}

# --- Advertir si Claude Desktop esta corriendo --------------------------------
$claudeRunning = Get-Process -Name "Claude" -ErrorAction SilentlyContinue
if ($claudeRunning) {
    Write-Warn "Claude Desktop esta abierto. Deberas cerrarlo y reabrirlo al terminar."; Write-Host ""
}

# --- Claude Desktop -----------------------------------------------------------
$claudeConfigDir  = $null
$claudeConfigPath = $null

$pathWeb = Join-Path $env:APPDATA "Claude"
if (Test-Path $pathWeb) {
    $claudeConfigDir  = $pathWeb
    $claudeConfigPath = Join-Path $claudeConfigDir "claude_desktop_config.json"
}
if ($null -eq $claudeConfigDir) {
    $packagesDir = Join-Path $env:LOCALAPPDATA "Packages"
    if (Test-Path $packagesDir) {
        $claudePkg = Get-ChildItem $packagesDir -Directory -Filter "Claude_*" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($claudePkg) {
            $localState = Join-Path $claudePkg.FullName "LocalState"
            if (Test-Path $localState) {
                $claudeConfigDir  = $localState
                $claudeConfigPath = Join-Path $claudeConfigDir "claude_desktop_config.json"
            }
        }
    }
}
if ($claudeConfigPath) { Remove-McpEntries $claudeConfigPath "Claude Desktop" }
else { Write-Info "Claude Desktop: no detectado, se omite." }

# --- Claude Code --------------------------------------------------------------
$claudeCodeConfigPath = Join-Path $env:USERPROFILE ".claude.json"
Remove-McpEntries $claudeCodeConfigPath "Claude Code"

# --- Ofrecer eliminar el .env -------------------------------------------------
Write-Host ""
$envPath = Join-Path $scriptDir ".env"

if (Test-Path $envPath) {
    Write-Warn "Se encontro el archivo .env con tus credenciales: $envPath"
    Write-Host ""
    $respEnv = Read-Host "  Eliminar el archivo .env? (s/n)"
    if ($respEnv -match '^[sS]$') {
        try { Remove-Item $envPath -Force -ErrorAction Stop; Write-OK ".env eliminado" }
        catch { Write-Warn "No se pudo eliminar .env: $_" }
    } else {
        Write-Info ".env conservado."
    }
}

# --- Fin -----------------------------------------------------------------------
Write-Host ""
Write-Host "  ================================================" -ForegroundColor Cyan
if ($claudeRunning) {
    Write-Host "   Cierra y reabre Claude Desktop para aplicar.  " -ForegroundColor Cyan
}
Write-Host "   Desinstalacion completada correctamente.       " -ForegroundColor Cyan
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "  Presiona Enter para salir"
