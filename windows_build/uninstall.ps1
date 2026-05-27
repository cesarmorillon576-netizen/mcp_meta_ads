# uninstall.ps1 - Desinstalador de Meta & Google Ads Manager para Claude Desktop
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
Write-Info "Este proceso eliminara los servidores MCP de Claude Desktop."
Write-Info "Los archivos .exe y .env de esta carpeta NO se tocaran."
Write-Host ""

$confirm = Read-Host "  Continuar con la desinstalacion? (s/n)"
if ($confirm -notmatch '^[sS]$') {
    Write-Host ""
    Write-Info "Desinstalacion cancelada."
    Write-Host ""
    Read-Host "  Presiona Enter para salir"
    exit 0
}
Write-Host ""

# --- 1. Detectar Claude Desktop -----------------------------------------------
$claudeConfigDir  = $null
$claudeConfigPath = $null

# Opcion A: Instalacion estandar desde la Web (%APPDATA%\Claude)
$pathWeb = Join-Path $env:APPDATA "Claude"
if (Test-Path $pathWeb) {
    $claudeConfigDir  = $pathWeb
    $claudeConfigPath = Join-Path $claudeConfigDir "claude_desktop_config.json"
}

# Opcion B: Instalacion desde la Microsoft Store
# Se busca con wildcard "Claude_*" para no depender del hash exacto del publicador.
if ($null -eq $claudeConfigDir) {
    $packagesDir = Join-Path $env:LOCALAPPDATA "Packages"
    if (Test-Path $packagesDir) {
        $claudePkg = Get-ChildItem $packagesDir -Directory -Filter "Claude_*" `
                     -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($claudePkg) {
            $localState = Join-Path $claudePkg.FullName "LocalState"
            if (Test-Path $localState) {
                $claudeConfigDir  = $localState
                $claudeConfigPath = Join-Path $claudeConfigDir "claude_desktop_config.json"
            }
        }
    }
}

if ($null -eq $claudeConfigDir) {
    Exit-Error `
        "No se detecto Claude Desktop." `
        "Es posible que ya haya sido desinstalado o nunca se haya instalado."
}

if (-not (Test-Path $claudeConfigPath)) {
    Write-Warn "No existe archivo de configuracion en:"
    Write-Host "  $claudeConfigPath" -ForegroundColor Gray
    Write-Host ""
    Write-Info "No hay nada que desinstalar en Claude Desktop."
    Write-Host ""
    Read-Host "  Presiona Enter para salir"
    exit 0
}

Write-OK "Claude Desktop detectado"

# --- 2. Advertir si Claude Desktop esta corriendo -----------------------------
$claudeRunning = Get-Process -Name "Claude" -ErrorAction SilentlyContinue
if ($claudeRunning) {
    Write-Warn "Claude Desktop esta abierto."
    Write-Warn "Los cambios se aplicaran, pero debes cerrarlo y reabrirlo para que surtan efecto."
    Write-Host ""
}

# --- 3. Leer config -----------------------------------------------------------
$config = $null
try {
    $raw = Get-Content $claudeConfigPath -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) {
        Write-Info "El archivo de configuracion esta vacio. Nada que hacer."
        Write-Host ""
        Read-Host "  Presiona Enter para salir"
        exit 0
    }
    $config = $raw | ConvertFrom-Json
    Write-OK "Configuracion leida"
} catch {
    Exit-Error `
        "No se pudo leer la configuracion: $_" `
        "Revisa manualmente: $claudeConfigPath"
}

# --- 4. Verificar si los servidores existen -----------------------------------
$tieneMeta   = $false
$tieneGoogle = $false

if ($config.PSObject.Properties['mcpServers'] -and $null -ne $config.mcpServers) {
    $tieneMeta   = $config.mcpServers.PSObject.Properties['MetaAds']   -ne $null
    $tieneGoogle = $config.mcpServers.PSObject.Properties['GoogleAds'] -ne $null
}

if (-not $tieneMeta -and -not $tieneGoogle) {
    Write-Info "Los servidores MetaAds y GoogleAds no estan en la configuracion."
    Write-Info "No hay nada que eliminar."
    Write-Host ""
    Read-Host "  Presiona Enter para salir"
    exit 0
}

if ($tieneMeta)   { Write-Info "Encontrado: MetaAds" }
if ($tieneGoogle) { Write-Info "Encontrado: GoogleAds" }
Write-Host ""

# --- 5. Backup antes de modificar ---------------------------------------------
$backup = "$claudeConfigPath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
try {
    Copy-Item $claudeConfigPath $backup -ErrorAction Stop
    Write-OK "Backup creado: $(Split-Path -Leaf $backup)"
} catch {
    Write-Warn "No se pudo crear backup (se continuara de todas formas): $_"
}

# --- 6. Eliminar servidores MCP -----------------------------------------------
try {
    # Convertir a HashTable mutable para poder eliminar propiedades
    $mcpHash = @{}
    $config.mcpServers.PSObject.Properties | ForEach-Object {
        if ($_.Name -ne 'MetaAds' -and $_.Name -ne 'GoogleAds') {
            $mcpHash[$_.Name] = $_.Value
        }
    }
    $config.mcpServers = $mcpHash
    Write-OK "Servidores MCP eliminados de la config"
} catch {
    Exit-Error "No se pudieron eliminar los servidores MCP: $_"
}

# --- 7. Guardar config sin BOM ------------------------------------------------
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$jsonOut   = $config | ConvertTo-Json -Depth 10

try {
    [System.IO.File]::WriteAllText($claudeConfigPath, $jsonOut, $utf8NoBom)
    Write-OK "Configuracion guardada"
} catch {
    Exit-Error `
        "No se pudo guardar la configuracion: $_" `
        "Restaura el backup: $backup"
}

# --- 8. Verificar guardado ----------------------------------------------------
try {
    $saved = [System.IO.File]::ReadAllText($claudeConfigPath) | ConvertFrom-Json
    $quedaMeta   = $saved.PSObject.Properties['mcpServers'] -and $saved.mcpServers.PSObject.Properties['MetaAds']
    $quedaGoogle = $saved.PSObject.Properties['mcpServers'] -and $saved.mcpServers.PSObject.Properties['GoogleAds']
    if ($quedaMeta -or $quedaGoogle) {
        throw "Alguno de los servidores sigue presente tras guardar."
    }
    Write-OK "Verificacion correcta: servidores eliminados"
} catch {
    Exit-Error `
        "Verificacion fallida: $_" `
        "Revisa manualmente o restaura: $backup"
}

# --- 9. Ofrecer eliminar el .env (contiene credenciales) ----------------------
Write-Host ""
$envPath = Join-Path $scriptDir ".env"

if (Test-Path $envPath) {
    Write-Warn "Se encontro el archivo .env con tus credenciales:"
    Write-Host "  $envPath" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Si ya no usaras esta aplicacion, es recomendable eliminarlo" -ForegroundColor Yellow
    Write-Host "  para no dejar credenciales almacenadas en disco." -ForegroundColor Yellow
    Write-Host ""
    $respEnv = Read-Host "  Eliminar el archivo .env? (s/n)"
    if ($respEnv -match '^[sS]$') {
        try {
            Remove-Item $envPath -Force -ErrorAction Stop
            Write-OK ".env eliminado"
        } catch {
            Write-Warn "No se pudo eliminar .env: $_"
            Write-Warn "Eliminalo manualmente: $envPath"
        }
    } else {
        Write-Info ".env conservado (recuerda borrarlo si ya no lo necesitas)."
    }
}

# --- Fin -----------------------------------------------------------------------
Write-Host ""
Write-Host "  ================================================" -ForegroundColor Cyan
if ($claudeRunning) {
    Write-Host "   Cierra y reabre Claude Desktop para aplicar.  " -ForegroundColor Cyan
} else {
    Write-Host "   Desinstalacion completada correctamente.       " -ForegroundColor Cyan
}
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "  Presiona Enter para salir"
