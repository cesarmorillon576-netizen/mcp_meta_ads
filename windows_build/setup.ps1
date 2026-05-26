# setup.ps1 - Configurador de Meta & Google Ads Manager para Claude Desktop
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
Write-Host "   Meta & Google Ads Manager - Instalacion       " -ForegroundColor Cyan
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Detectar ejecucion desde dentro de un ZIP (carpeta temporal) -----------
$tempPath = $env:TEMP
if ($scriptDir -like "*$tempPath*" -or $scriptDir -like "*\AppData\Local\Temp*") {
    Exit-Error `
        "Estas ejecutando el instalador desde dentro del ZIP." `
        "Extrae todos los archivos a una carpeta real (p.ej. Escritorio) y vuelve a ejecutar."
}
Write-OK "Carpeta de instalacion: $scriptDir"

# --- 2. Desbloquear archivos descargados de internet ---------------------------
try {
    Get-ChildItem $scriptDir -File -ErrorAction SilentlyContinue |
        ForEach-Object { Unblock-File -Path $_.FullName -ErrorAction SilentlyContinue }
    Write-OK "Archivos desbloqueados"
} catch {
    Write-Warn "No se pudo desbloquear alguno de los archivos (normalmente no es problema)"
}

# --- 3. Validar ejecutables ----------------------------------------------------
$metaExe   = Join-Path $scriptDir "meta_ads.exe"
$googleExe = Join-Path $scriptDir "google_ads.exe"

foreach ($pair in @(
    @{ Path = $metaExe;   Name = "meta_ads.exe"   },
    @{ Path = $googleExe; Name = "google_ads.exe" }
)) {
    if (-not (Test-Path $pair.Path)) {
        Exit-Error `
            "$($pair.Name) no se encuentra en esta carpeta." `
            "Asegurate de extraer TODOS los archivos del ZIP antes de ejecutar."
    }
    if ((Get-Item $pair.Path).Length -lt 1024) {
        Exit-Error `
            "$($pair.Name) parece estar vacio o corrupto." `
            "Descarga el paquete nuevamente desde la fuente original."
    }
}
Write-OK "Ejecutables validados"

# --- 4. Verificar Claude Desktop instalado (Soporte Web y Microsoft Store) -------
$claudeConfigDir  = $null
$claudeConfigPath = $null

# Opción A: Instalación estándar desde la Web (Roaming)
$pathWeb = Join-Path $env:APPDATA "Claude"
# Opción B: Instalación desde la Microsoft Store (Packages Local)
$pathStore = Join-Path $env:LOCALAPPDATA "Packages\Claude_pzs8sxrjxfjjc\LocalState"

if (Test-Path $pathWeb) {
    $claudeConfigDir  = $pathWeb
    $claudeConfigPath = Join-Path $claudeConfigDir "claude_desktop_config.json"
} elseif (Test-Path $pathStore) {
    $claudeConfigDir  = $pathStore
    $claudeConfigPath = Join-Path $claudeConfigDir "claude_desktop_config.json"
} else {
    # Si la carpeta de la Store existe pero no la ruta interna completa, forzar la creación del directorio
    $storeBase = Join-Path $env:LOCALAPPDATA "Packages\Claude_pzs8sxrjxfjjc"
    if (Test-Path $storeBase) {
        $claudeConfigDir  = $pathStore
        $null = New-Item -ItemType Directory -Path $claudeConfigDir -Force
        $claudeConfigPath = Join-Path $claudeConfigDir "claude_desktop_config.json"
    }
}

# Si no se encontró en ningún lado
if ($null -eq $claudeConfigDir) {
    Exit-Error `
        "Claude Desktop no esta instalado o no se detecto su ruta de configuracion." `
        "Descargalo desde https://claude.ai/download , abrelo al menos una vez y vuelve a intentar."
}

Write-OK "Claude Desktop detectado"

# --- 5. Advertir si Claude Desktop esta corriendo ------------------------------
$claudeRunning = Get-Process -Name "Claude" -ErrorAction SilentlyContinue
if ($claudeRunning) {
    Write-Warn "Claude Desktop esta abierto. Se aplicaran los cambios igual, pero"
    Write-Warn "deberas cerrarlo y reabrirlo al finalizar para que surtan efecto."
    Write-Host ""
}

# --- 6. Leer configuracion existente ------------------------------------------
$config = $null

if (Test-Path $claudeConfigPath) {
    try {
        $raw = Get-Content $claudeConfigPath -Raw -Encoding UTF8
        if ([string]::IsNullOrWhiteSpace($raw)) {
            $config = [PSCustomObject]@{ mcpServers = @{} }
        } else {
            $config = $raw | ConvertFrom-Json
        }
        Write-OK "Configuracion existente leida"
    } catch {
        $backup = "$claudeConfigPath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        try {
            Copy-Item $claudeConfigPath $backup -ErrorAction SilentlyContinue
        } catch {}
        Write-Warn "Config corrupta - se creo un backup"
        $config = [PSCustomObject]@{ mcpServers = @{} }
    }
} else {
    $config = [PSCustomObject]@{ mcpServers = @{} }
    Write-OK "Se creara un nuevo archivo de configuracion"
}

# Asegurar que mcpServers exista y sea una estructura mutable (HashTable) si está vacío
if (-not $config.PSObject.Properties['mcpServers'] -or $null -eq $config.mcpServers) {
    $config | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue @{} -Force
}

# --- 7. Inyectar servidores MCP -----------------------------------------------
try {
    $metaConfig = [PSCustomObject]@{ command = $metaExe; args = @() }
    $googleConfig = [PSCustomObject]@{ command = $googleExe; args = @() }

    # Manejar compatibilidad si mcpServers es HashTable u Objeto nativo deserializado
    if ($config.mcpServers -is [System.Collections.IDictionary]) {
        $config.mcpServers["MetaAds"] = $metaConfig
        $config.mcpServers["GoogleAds"] = $googleConfig
    } else {
        $config.mcpServers.MetaAds = $metaConfig
        $config.mcpServers.GoogleAds = $googleConfig
    }
    Write-OK "Servidores MCP preparados"
} catch {
    Exit-Error "No se pudieron estructurar los servidores MCP: $_"
}

# --- 8. Guardar config sin BOM ------------------------------------------------
$jsonOut   = $config | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

try {
    [System.IO.File]::WriteAllText($claudeConfigPath, $jsonOut, $utf8NoBom)
} catch {
    Exit-Error `
        "No se pudo escribir la configuracion: $_" `
        "Intenta cerrar Claude Desktop e intentar de nuevo."
}

# --- 9. Verificar que se guardo correctamente ----------------------------------
try {
    $saved = [System.IO.File]::ReadAllText($claudeConfigPath) | ConvertFrom-Json
    if (-not $saved.mcpServers.PSObject.Properties['MetaAds'] -or -not $saved.mcpServers.PSObject.Properties['GoogleAds']) {
        throw "Nodos MCP ausentes tras el guardado."
    }
    Write-OK "Configuracion guardada y verificada"
} catch {
    Exit-Error `
        "La configuracion se guardo pero la verificacion fallo: $_" `
        "Revisa el archivo manualmente: $claudeConfigPath"
}

# --- 10. Gestionar archivo .env ------------------------------------------------
$envPath = Join-Path $scriptDir ".env"

if (-not (Test-Path $envPath)) {
    Write-Warn "El archivo .env no existe. Se creara uno de plantilla."
    $plantilla = @"
# Meta Ads
META_ACCESS_TOKEN=

# Google Ads
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
"@
    [System.IO.File]::WriteAllText($envPath, $plantilla, $utf8NoBom)
}

Write-Host ""
Write-Host "  ------------------------------------------------" -ForegroundColor Yellow
Write-Host "   ULTIMO PASO: completa tus credenciales en .env " -ForegroundColor Yellow
Write-Host "  ------------------------------------------------" -ForegroundColor Yellow
Write-Host ""
Write-Info "Archivo: $envPath"
Write-Host ""
Write-Info "Valores a completar:"
Write-Host "    META_ACCESS_TOKEN          (Meta Business)" -ForegroundColor Gray
Write-Host "    GOOGLE_ADS_DEVELOPER_TOKEN" -ForegroundColor Gray
Write-Host "    GOOGLE_ADS_CLIENT_ID" -ForegroundColor Gray
Write-Host "    GOOGLE_ADS_CLIENT_SECRET" -ForegroundColor Gray
Write-Host "    GOOGLE_ADS_REFRESH_TOKEN" -ForegroundColor Gray
Write-Host ""

$resp = Read-Host "  Abrir .env en Notepad ahora? (s/n)"
if ($resp -match '^[sS]$') {
    Start-Process notepad.exe -ArgumentList "`"$envPath`""
    Write-Host ""
    Write-Info "Completa los valores y guarda con Ctrl+S."
}

# --- Fin -----------------------------------------------------------------------
Write-Host ""
Write-Host "  ================================================" -ForegroundColor Cyan
if ($claudeRunning) {
    Write-Host "   Cierra y reabre Claude Desktop para aplicar.  " -ForegroundColor Cyan
} else {
    Write-Host "   Abre Claude Desktop para comenzar a usarlo.   " -ForegroundColor Cyan
}
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "  Presiona Enter para salir"