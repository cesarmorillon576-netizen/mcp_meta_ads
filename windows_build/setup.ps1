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
# Nota: se comprueba $tempPath solo si no esta vacio para evitar que "**" coincida
# con cualquier ruta cuando $env:TEMP no esta definido.
$tempPath = $env:TEMP
$enZip = ($scriptDir -like "*\AppData\Local\Temp*") -or
         (-not [string]::IsNullOrEmpty($tempPath) -and ($scriptDir -like "*$tempPath*"))
if ($enZip) {
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

# Opcion A: Instalacion estandar desde la Web (%APPDATA%\Claude)
$pathWeb = Join-Path $env:APPDATA "Claude"
if (Test-Path $pathWeb) {
    $claudeConfigDir  = $pathWeb
    $claudeConfigPath = Join-Path $claudeConfigDir "claude_desktop_config.json"
}

# Opcion B: Instalacion desde la Microsoft Store
# Se busca con wildcard "Claude_*" para no depender del hash exacto del publicador,
# que puede cambiar entre versiones o actualizaciones de la app en la Store.
if ($null -eq $claudeConfigDir) {
    $packagesDir = Join-Path $env:LOCALAPPDATA "Packages"
    if (Test-Path $packagesDir) {
        $claudePkg = Get-ChildItem $packagesDir -Directory -Filter "Claude_*" `
                     -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($claudePkg) {
            $localState = Join-Path $claudePkg.FullName "LocalState"
            # Crear LocalState si la app existe pero no se ha ejecutado aun
            if (-not (Test-Path $localState)) {
                $null = New-Item -ItemType Directory -Path $localState -Force
            }
            $claudeConfigDir  = $localState
            $claudeConfigPath = Join-Path $claudeConfigDir "claude_desktop_config.json"
        }
    }
}

# Si no se encontro en ningun lado
if ($null -eq $claudeConfigDir) {
    Exit-Error `
        "Claude Desktop no esta instalado o no se detecto su ruta de configuracion." `
        "Descargalo desde https://claude.ai/download , abrelo al menos una vez y vuelve a intentar."
}

Write-OK "Claude Desktop detectado: $claudeConfigDir"

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
            $config = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
        } else {
            $config = $raw | ConvertFrom-Json
        }
        Write-OK "Configuracion existente leida"
    } catch {
        $backup = "$claudeConfigPath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        try {
            Copy-Item $claudeConfigPath $backup -ErrorAction SilentlyContinue
        } catch {}
        Write-Warn "Config corrupta - se creo un backup en: $(Split-Path -Leaf $backup)"
        $config = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
    }
} else {
    $config = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
    Write-OK "Se creara un nuevo archivo de configuracion"
}

# Normalizar mcpServers a HashTable mutable.
# ConvertFrom-Json devuelve PSCustomObject (inmutable), lo pasamos a Hashtable.
# Se distingue PSCustomObject de Hashtable para no copiar propiedades del sistema
# (Count, Keys, IsReadOnly…) en el caso en que mcpServers ya sea un Hashtable.
$ht = @{}
if ($config.PSObject.Properties['mcpServers'] -and $null -ne $config.mcpServers) {
    $src = $config.mcpServers
    if ($src -is [hashtable]) {
        foreach ($key in $src.Keys) { $ht[$key] = $src[$key] }
    } else {
        foreach ($prop in $src.PSObject.Properties) { $ht[$prop.Name] = $prop.Value }
    }
}
$config | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue $ht -Force

# --- 6b. Mostrar MCPs actuales y detectar si ya estan instalados --------------
# $config.mcpServers es ahora un Hashtable; se usa .Keys para enumerar entradas.
$servidoresActuales = @($config.mcpServers.Keys)

Write-Host ""
if ($servidoresActuales.Count -eq 0) {
    Write-Info "No hay servidores MCP configurados actualmente."
} else {
    Write-Info "Servidores MCP actualmente en Claude Desktop:"
    foreach ($nombre in $servidoresActuales) {
        $val = $config.mcpServers[$nombre]
        $cmd = if ($val -and $val.PSObject.Properties['command']) { $val.command } else { "(sin ruta)" }
        if ($nombre -eq 'MetaAds' -or $nombre -eq 'GoogleAds') {
            Write-Host ("    {0,-18} [YA INSTALADO]  {1}" -f $nombre, $cmd) -ForegroundColor Yellow
        } else {
            Write-Host ("    {0,-18}                 {1}" -f $nombre, $cmd) -ForegroundColor Gray
        }
    }
}
Write-Host ""

$tieneMeta   = $servidoresActuales -contains 'MetaAds'
$tieneGoogle = $servidoresActuales -contains 'GoogleAds'

# Flags que indican que instalar (pueden cambiar segun eleccion del usuario)
$instalarMeta   = $true
$instalarGoogle = $true

if ($tieneMeta -or $tieneGoogle) {
    $cuales   = @(if ($tieneMeta) { "MetaAds" }; if ($tieneGoogle) { "GoogleAds" })
    $listaStr = $cuales -join " y "
    $verbo    = if ($cuales.Count -gt 1) { "estan instalados" } else { "esta instalado" }

    Write-Warn "$listaStr ya $verbo."
    Write-Host ""
    Write-Host "    [S] Sobreescribir - reemplaza MetaAds y GoogleAds con la ruta actual" -ForegroundColor Gray
    Write-Host "    [A] Agregar faltantes - solo instala los que aun no estan" -ForegroundColor Gray
    Write-Host "    [N] Cancelar - salir sin modificar nada" -ForegroundColor Gray
    Write-Host ""
    $respOver = Read-Host "  Que deseas hacer? (s/a/n)"

    if ($respOver -match '^[aA]$') {
        $instalarMeta   = -not $tieneMeta
        $instalarGoogle = -not $tieneGoogle

        $faltantes = @(if ($instalarMeta) { "MetaAds" }; if ($instalarGoogle) { "GoogleAds" })
        if ($faltantes.Count -eq 0) {
            Write-Host ""
            Write-Info "Ambos servidores ya estan instalados. No hay nada que agregar."
            Write-Host ""
            Read-Host "  Presiona Enter para salir"
            exit 0
        }
        Write-Host ""
        Write-Info "Se instalaran solo: $($faltantes -join ', ')"
        Write-Host ""
    } elseif ($respOver -notmatch '^[sS]$') {
        Write-Host ""
        Write-Info "Instalacion cancelada. Tu configuracion no fue modificada."
        Write-Host ""
        Read-Host "  Presiona Enter para salir"
        exit 0
    }
    Write-Host ""
}

# --- 6c. Backup de seguridad antes de modificar --------------------------------
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

if (Test-Path $claudeConfigPath) {
    $backup = "$claudeConfigPath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    try {
        Copy-Item $claudeConfigPath $backup -ErrorAction Stop
        Write-OK "Backup creado: $(Split-Path -Leaf $backup)"
    } catch {
        Write-Warn "No se pudo crear backup (se continuara de todas formas): $_"
    }
}

# --- 7. Inyectar servidores MCP -----------------------------------------------
try {
    # [string[]]@() garantiza serializacion como [] en vez de null (bug de PowerShell 5.x con @() vacio)
    $metaConfig   = [PSCustomObject]@{ command = $metaExe;   args = [string[]]@() }
    $googleConfig = [PSCustomObject]@{ command = $googleExe; args = [string[]]@() }

    if ($instalarMeta)   { $config.mcpServers["MetaAds"]   = $metaConfig }
    if ($instalarGoogle) { $config.mcpServers["GoogleAds"] = $googleConfig }
    Write-OK "Servidores MCP preparados"
} catch {
    Exit-Error "No se pudieron estructurar los servidores MCP: $_"
}

# --- 8. Guardar config sin BOM ------------------------------------------------
$jsonOut = $config | ConvertTo-Json -Depth 10

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
    $faltanTras = @()
    if ($instalarMeta   -and -not $saved.mcpServers.PSObject.Properties['MetaAds'])   { $faltanTras += 'MetaAds'   }
    if ($instalarGoogle -and -not $saved.mcpServers.PSObject.Properties['GoogleAds']) { $faltanTras += 'GoogleAds' }
    if ($faltanTras.Count -gt 0) {
        throw "Nodos MCP ausentes tras el guardado: $($faltanTras -join ', ')"
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
# =============================================================
# Meta Ads
# Token de acceso largo (nunca expira) desde:
#   Meta Business Suite > Configuracion > Seguridad > Tokens
#   o: https://developers.facebook.com/tools/explorer/
# =============================================================
META_ACCESS_TOKEN=

# =============================================================
# Google Ads
# =============================================================
# Token de desarrollador (aprobado por Google):
#   https://ads.google.com/aw/apicenter
GOOGLE_ADS_DEVELOPER_TOKEN=

# OAuth2 - Client ID y Secret desde Google Cloud Console:
#   https://console.cloud.google.com/apis/credentials
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=

# Refresh Token - Generalo con OAuth Playground:
#   https://developers.google.com/oauthplayground/
#   (scope: https://www.googleapis.com/auth/adwords)
GOOGLE_ADS_REFRESH_TOKEN=

# ID del cliente administrador MCC sin guiones (ej: 1234567890)
# Dejalo vacio si solo manejas una cuenta directa.
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
