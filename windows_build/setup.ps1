# setup.ps1 - Configurador de Meta & Google Ads Manager para Claude Desktop y Claude Code
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

# --- 3. Validar archivos del paquete ------------------------------------------
$metaJs   = Join-Path $scriptDir "meta_ads.js"
$googleJs = Join-Path $scriptDir "google_ads.js"
$localNodeExe = Join-Path $scriptDir "node.exe"

foreach ($pair in @(
    @{ Path = $metaJs;   Name = "meta_ads.js"   },
    @{ Path = $googleJs; Name = "google_ads.js" },
    @{ Path = $localNodeExe; Name = "node.exe"  }
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
Write-OK "Archivos del paquete validados"

# --- 4. Usar node.exe incluido en el paquete ----------------------------------
$nodeExe = $localNodeExe
$nodeVersion = & "$nodeExe" --version 2>&1
Write-OK "Node.js listo: $nodeVersion (incluido en el paquete)"

# --- 5. Verificar Claude Desktop instalado ------------------------------------
$claudeConfigDir  = $null
$claudeConfigPath = $null

# Opcion A: Instalacion estandar desde la Web (%APPDATA%\Claude)
$pathWeb = Join-Path $env:APPDATA "Claude"
if (Test-Path $pathWeb) {
    $claudeConfigDir  = $pathWeb
    $claudeConfigPath = Join-Path $claudeConfigDir "claude_desktop_config.json"
}

# Opcion B: Instalacion desde la Microsoft Store
if ($null -eq $claudeConfigDir) {
    $packagesDir = Join-Path $env:LOCALAPPDATA "Packages"
    if (Test-Path $packagesDir) {
        $claudePkg = Get-ChildItem $packagesDir -Directory -Filter "Claude_*" `
                     -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($claudePkg) {
            $localState = Join-Path $claudePkg.FullName "LocalState"
            if (-not (Test-Path $localState)) {
                $null = New-Item -ItemType Directory -Path $localState -Force
            }
            $claudeConfigDir  = $localState
            $claudeConfigPath = Join-Path $claudeConfigDir "claude_desktop_config.json"
        }
    }
}

$tieneDesktop = $null -ne $claudeConfigDir
if ($tieneDesktop) {
    Write-OK "Claude Desktop detectado: $claudeConfigDir"
} else {
    Write-Warn "Claude Desktop no detectado. Se omitira su configuracion."
}

# --- 6. Verificar Claude Code -------------------------------------------------
$claudeCodeConfigPath = Join-Path $env:USERPROFILE ".claude.json"
$tieneCode = Test-Path (Split-Path -Parent $claudeCodeConfigPath)  # el directorio Home siempre existe
Write-Info "Claude Code (CLI) config: $claudeCodeConfigPath"

# --- 7. Advertir si Claude Desktop esta corriendo -----------------------------
$claudeRunning = Get-Process -Name "Claude" -ErrorAction SilentlyContinue
if ($claudeRunning) {
    Write-Host ""
    Write-Warn "Claude Desktop esta abierto. Los cambios se aplican, pero"
    Write-Warn "deberas cerrarlo y reabrirlo al finalizar para que surtan efecto."
}

# --- 8. Leer configuracion existente de Claude Desktop ------------------------
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$configDesktop = $null
if ($tieneDesktop) {
    if (Test-Path $claudeConfigPath) {
        try {
            $raw = Get-Content $claudeConfigPath -Raw -Encoding UTF8
            if ([string]::IsNullOrWhiteSpace($raw)) {
                $configDesktop = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
            } else {
                $configDesktop = $raw | ConvertFrom-Json
            }
            Write-OK "Config existente de Claude Desktop leida"
        } catch {
            $backup = "$claudeConfigPath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
            try { Copy-Item $claudeConfigPath $backup -ErrorAction SilentlyContinue } catch {}
            Write-Warn "Config corrupta - se creo backup: $(Split-Path -Leaf $backup)"
            $configDesktop = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
        }
    } else {
        $configDesktop = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
        Write-OK "Se creara nueva config de Claude Desktop"
    }
}

# --- 8b. Leer configuracion existente de Claude Code -------------------------
$configCode = $null
if (Test-Path $claudeCodeConfigPath) {
    try {
        $raw = Get-Content $claudeCodeConfigPath -Raw -Encoding UTF8
        if ([string]::IsNullOrWhiteSpace($raw)) {
            $configCode = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
        } else {
            $configCode = $raw | ConvertFrom-Json
            if (-not $configCode.PSObject.Properties['mcpServers']) {
                $configCode | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue ([PSCustomObject]@{}) -Force
            }
        }
    } catch {
        $configCode = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
    }
} else {
    $configCode = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
}

# Funcion: Normalizar mcpServers a HashTable mutable
function Get-McpHashtable {
    param($config)
    $ht = @{}
    if ($config.PSObject.Properties['mcpServers'] -and $null -ne $config.mcpServers) {
        $src = $config.mcpServers
        if ($src -is [hashtable]) {
            foreach ($key in $src.Keys) { $ht[$key] = $src[$key] }
        } else {
            foreach ($prop in $src.PSObject.Properties) { $ht[$prop.Name] = $prop.Value }
        }
    }
    return $ht
}

# --- 8c. Mostrar MCPs actuales y preguntar que instalar -----------------------
$htDesktop = if ($tieneDesktop) { Get-McpHashtable $configDesktop } else { @{} }
$htCode    = Get-McpHashtable $configCode

function Get-McpJsPath {
    param($entry)
    if ($null -eq $entry) { return $null }
    $a = $null
    if ($entry -is [hashtable]) {
        if ($entry.ContainsKey('args')) { $a = $entry['args'] }
    } else {
        try { $a = $entry.args } catch {}
    }
    if ($null -eq $a) { return $null }
    $arr = @($a)
    if ($arr.Count -gt 0) { return $arr[0] }
    return $null
}

Write-Host ""
Write-Host "  ---- Claude Desktop ----------------------------------------" -ForegroundColor DarkCyan
if ($tieneDesktop) {
    if ($htDesktop.Count -eq 0) {
        Write-Info "  Sin servidores MCP configurados."
    } else {
        foreach ($nombre in $htDesktop.Keys) {
            $jsPath = Get-McpJsPath $htDesktop[$nombre]
            $tag = if ($nombre -eq 'MetaAds' -or $nombre -eq 'GoogleAds') { " [YA INSTALADO]" } else { "" }
            $display = if ($jsPath) { $jsPath } else { "(sin ruta)" }
            Write-Host ("    {0,-18}{1,-16}  {2}" -f $nombre, $tag, $display) -ForegroundColor $(if ($tag) { "Yellow" } else { "Gray" })
        }
    }
} else {
    Write-Info "  No detectado (se omitira)."
}

Write-Host ""
Write-Host "  ---- Claude Code (CLI) -------------------------------------" -ForegroundColor DarkCyan
if ($htCode.Count -eq 0) {
    Write-Info "  Sin servidores MCP configurados."
} else {
    foreach ($nombre in $htCode.Keys) {
        $jsPath = Get-McpJsPath $htCode[$nombre]
        $tag = if ($nombre -eq 'MetaAds' -or $nombre -eq 'GoogleAds') { " [YA INSTALADO]" } else { "" }
        $display = if ($jsPath) { $jsPath } else { "(sin ruta)" }
        Write-Host ("    {0,-18}{1,-16}  {2}" -f $nombre, $tag, $display) -ForegroundColor $(if ($tag) { "Yellow" } else { "Gray" })
    }
}
Write-Host ""

# Detectar si ya estan instalados
$desktopTieneMeta   = $htDesktop.ContainsKey('MetaAds')
$desktopTieneGoogle = $htDesktop.ContainsKey('GoogleAds')
$codeTieneMeta      = $htCode.ContainsKey('MetaAds')
$codeTieneGoogle    = $htCode.ContainsKey('GoogleAds')

# Advertir si las rutas guardadas no coinciden con la carpeta actual
$rutasDesactualizadas = $false
foreach ($ht in @($htDesktop, $htCode)) {
    foreach ($key in @('MetaAds', 'GoogleAds')) {
        if ($ht.ContainsKey($key)) {
            $jsGuardado = Get-McpJsPath $ht[$key]
            $jsEsperado = if ($key -eq 'MetaAds') { $metaJs } else { $googleJs }
            if ($jsGuardado -and ($jsGuardado -ne $jsEsperado)) {
                $rutasDesactualizadas = $true
            }
        }
    }
}
if ($rutasDesactualizadas) {
    Write-Host ""
    Write-Warn "ATENCION: Las rutas guardadas NO coinciden con esta carpeta."
    Write-Warn "Si moviste la carpeta del instalador, elige [S] Sobreescribir."
    Write-Host ""
}

# Preguntar donde instalar
Write-Host "  Donde instalar los servidores MCP?" -ForegroundColor White
Write-Host "    [1] Claude Desktop + Claude Code  (ambos)" -ForegroundColor Gray
Write-Host "    [2] Solo Claude Desktop" -ForegroundColor Gray
Write-Host "    [3] Solo Claude Code (CLI)" -ForegroundColor Gray
Write-Host "    [N] Cancelar" -ForegroundColor Gray
Write-Host ""
$destResp = Read-Host "  Elige una opcion (1/2/3/n)"

$instalarDesktop = $false
$instalarCode    = $false

if ($destResp -match '^[1]$') {
    $instalarDesktop = $tieneDesktop
    $instalarCode    = $true
    if (-not $tieneDesktop) { Write-Warn "Claude Desktop no detectado; se configurara solo Claude Code." }
} elseif ($destResp -match '^[2]$') {
    if (-not $tieneDesktop) {
        Exit-Error "Claude Desktop no esta instalado." "Descargalo desde https://claude.ai/download y ejecutalo al menos una vez."
    }
    $instalarDesktop = $true
} elseif ($destResp -match '^[3]$') {
    $instalarCode = $true
} else {
    Write-Host ""; Write-Info "Instalacion cancelada."; Write-Host ""; Read-Host "  Presiona Enter para salir"; exit 0
}

# Preguntar sobreescribir si ya existen
$instalarMeta   = $true
$instalarGoogle = $true

$yaHayMeta   = ($instalarDesktop -and $desktopTieneMeta)   -or ($instalarCode -and $codeTieneMeta)
$yaHayGoogle = ($instalarDesktop -and $desktopTieneGoogle) -or ($instalarCode -and $codeTieneGoogle)

if ($yaHayMeta -or $yaHayGoogle) {
    $cuales = @(if ($yaHayMeta) { "MetaAds" }; if ($yaHayGoogle) { "GoogleAds" })
    Write-Host ""
    Write-Warn "$($cuales -join ' y ') ya esta(n) instalado(s)."
    Write-Host "    [S] Sobreescribir - reemplazar con la ruta actual" -ForegroundColor Gray
    Write-Host "    [A] Agregar faltantes - solo instalar los que no estan" -ForegroundColor Gray
    Write-Host "    [N] Cancelar" -ForegroundColor Gray
    Write-Host ""
    $overResp = Read-Host "  Que deseas hacer? (s/a/n)"

    if ($overResp -match '^[aA]$') {
        if ($instalarDesktop) {
            $instalarMeta   = -not $desktopTieneMeta
            $instalarGoogle = -not $desktopTieneGoogle
        }
        if ($instalarCode) {
            $instalarMeta   = $instalarMeta   -or (-not $codeTieneMeta)
            $instalarGoogle = $instalarGoogle -or (-not $codeTieneGoogle)
        }
        if (-not $instalarMeta -and -not $instalarGoogle) {
            Write-Host ""; Write-Info "Ambos ya estan instalados. Nada que agregar."; Write-Host ""; Read-Host "  Presiona Enter"; exit 0
        }
    } elseif ($overResp -notmatch '^[sS]$') {
        Write-Host ""; Write-Info "Cancelado."; Write-Host ""; Read-Host "  Presiona Enter para salir"; exit 0
    }
}

# --- 9. Backup y escritura de configuraciones ---------------------------------
# Claude Desktop no usa "type", Claude Code requiere "type": "stdio"
$metaConfigDesktop   = [PSCustomObject]@{ command = $nodeExe; args = [string[]]@($metaJs) }
$googleConfigDesktop = [PSCustomObject]@{ command = $nodeExe; args = [string[]]@($googleJs) }
$metaConfigCode   = [PSCustomObject]@{ type = "stdio"; command = $nodeExe; args = [string[]]@($metaJs) }
$googleConfigCode = [PSCustomObject]@{ type = "stdio"; command = $nodeExe; args = [string[]]@($googleJs) }

# Guardar Claude Desktop
if ($instalarDesktop -and $tieneDesktop) {
    if (Test-Path $claudeConfigPath) {
        $bak = "$claudeConfigPath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        try { Copy-Item $claudeConfigPath $bak -ErrorAction Stop; Write-OK "Backup Desktop: $(Split-Path -Leaf $bak)" } catch {}
    }
    $configDesktop | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue $htDesktop -Force
    if ($instalarMeta)   { $htDesktop['MetaAds']   = $metaConfigDesktop }
    if ($instalarGoogle) { $htDesktop['GoogleAds'] = $googleConfigDesktop }
    try {
        [System.IO.File]::WriteAllText($claudeConfigPath, ($configDesktop | ConvertTo-Json -Depth 20), $utf8NoBom)
        # Verificar
        $saved = [System.IO.File]::ReadAllText($claudeConfigPath) | ConvertFrom-Json
        $ok = $true
        if ($instalarMeta   -and -not $saved.mcpServers.PSObject.Properties['MetaAds'])   { $ok = $false }
        if ($instalarGoogle -and -not $saved.mcpServers.PSObject.Properties['GoogleAds']) { $ok = $false }
        if ($ok) { Write-OK "Claude Desktop configurado" } else { throw "Verificacion fallo" }
    } catch {
        Exit-Error "No se pudo guardar config de Claude Desktop: $_"
    }
}

# Guardar Claude Code
if ($instalarCode) {
    if (Test-Path $claudeCodeConfigPath) {
        $bak = "$claudeCodeConfigPath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        try { Copy-Item $claudeCodeConfigPath $bak -ErrorAction Stop; Write-OK "Backup Code: $(Split-Path -Leaf $bak)" } catch {}
    }
    $configCode | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue $htCode -Force
    if ($instalarMeta)   { $htCode['MetaAds']   = $metaConfigCode }
    if ($instalarGoogle) { $htCode['GoogleAds'] = $googleConfigCode }
    try {
        [System.IO.File]::WriteAllText($claudeCodeConfigPath, ($configCode | ConvertTo-Json -Depth 20), $utf8NoBom)
        $savedCode = [System.IO.File]::ReadAllText($claudeCodeConfigPath) | ConvertFrom-Json
        $okCode = $true
        if ($instalarMeta   -and -not $savedCode.mcpServers.PSObject.Properties['MetaAds'])   { $okCode = $false }
        if ($instalarGoogle -and -not $savedCode.mcpServers.PSObject.Properties['GoogleAds']) { $okCode = $false }
        if ($okCode) { Write-OK "Claude Code configurado: $claudeCodeConfigPath" } else { throw "Verificacion fallo" }
    } catch {
        Exit-Error "No se pudo guardar config de Claude Code: $_"
    }
}

# --- 10. Gestionar archivo .env -----------------------------------------------
$envPath   = Join-Path $scriptDir ".env"
$envNuevo  = $false

if (-not (Test-Path $envPath)) {
    $envNuevo = $true
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
if ($envNuevo) {
    Write-Host "  ------------------------------------------------" -ForegroundColor Yellow
    Write-Host "   ULTIMO PASO: completa tus credenciales en .env " -ForegroundColor Yellow
    Write-Host "  ------------------------------------------------" -ForegroundColor Yellow
    Write-Host ""
    Write-Info "Archivo: $envPath"
    Write-Host ""
    Write-Info "Valores a completar:"
    Write-Host "    META_ACCESS_TOKEN              (Meta Ads)"    -ForegroundColor Gray
    Write-Host "    GOOGLE_ADS_DEVELOPER_TOKEN     (Google Ads)"  -ForegroundColor Gray
    Write-Host "    GOOGLE_ADS_CLIENT_ID           (Google Ads)"  -ForegroundColor Gray
    Write-Host "    GOOGLE_ADS_CLIENT_SECRET       (Google Ads)"  -ForegroundColor Gray
    Write-Host "    GOOGLE_ADS_REFRESH_TOKEN       (Google Ads)"  -ForegroundColor Gray
    Write-Host "    GOOGLE_ADS_LOGIN_CUSTOMER_ID   (Google Ads, opcional)" -ForegroundColor Gray
    Write-Host ""
    $resp = Read-Host "  Abrir .env en Notepad ahora? (s/n)"
    if ($resp -match '^[sS]$') {
        Start-Process notepad.exe -ArgumentList "`"$envPath`""
        Write-Host ""
        Write-Info "Completa los valores y guarda con Ctrl+S."
    }
} else {
    Write-OK "Credenciales existentes (.env): $envPath"
    $resp = Read-Host "  Revisar o editar .env en Notepad? (s/n)"
    if ($resp -match '^[sS]$') {
        Start-Process notepad.exe -ArgumentList "`"$envPath`""
        Write-Host ""
        Write-Info "Guarda cualquier cambio con Ctrl+S."
    }
}

# --- Fin -----------------------------------------------------------------------
Write-Host ""
Write-Host "  ================================================" -ForegroundColor Cyan
if ($instalarDesktop -and $tieneDesktop) {
    if ($claudeRunning) {
        Write-Host "   Cierra y reabre Claude Desktop para aplicar.  " -ForegroundColor Cyan
    } else {
        Write-Host "   Abre Claude Desktop para comenzar a usarlo.   " -ForegroundColor Cyan
    }
}
if ($instalarCode) {
    Write-Host "   Claude Code: inicia una nueva sesion de CLI.   " -ForegroundColor Cyan
}
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "  Presiona Enter para salir"
