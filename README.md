# Meta & Google Ads Manager — MCP Server

Servidor MCP (Model Context Protocol) para gestionar campañas de **Meta Ads** y **Google Ads** directamente desde Claude Desktop o Claude Code, usando lenguaje natural.

---

## Requisitos

- **Node.js 20+** y **npm**
- Claude Desktop o Claude Code
- Credenciales de Meta Ads y/o Google Ads (ver sección de configuración)

---

## Instalación (desarrollo / Linux & macOS)

```bash
git clone https://github.com/tu-usuario/mcp-ads-manager.git
cd mcp-ads-manager
npm install
npm run build
```

Copia el archivo de credenciales y complétalo:

```bash
cp .env.example .env
# edita .env con tus credenciales
```

El archivo `.mcp.json` ya está configurado; Claude Code lo detecta automáticamente.

---

## Instalación en Windows (ejecutable)

Descarga el paquete `MetaAdsManager-Windows.zip` desde la sección de **Releases** o **Artifacts** de GitHub Actions.

1. Extrae todos los archivos a una carpeta (ej. `C:\MetaAdsManager\`)
2. Ejecuta `setup.bat` como usuario normal (no requiere administrador)
3. Sigue las instrucciones en pantalla para completar el archivo `.env`
4. Reinicia Claude Desktop

Para desinstalar, ejecuta `uninstall.bat`.

---

## Configuración de credenciales

### Meta Ads

En el archivo `.env`:

```env
META_ACCESS_TOKEN=tu_token_permanente_aqui
```

**Cómo obtener el token:**
1. Ve a [Meta for Developers](https://developers.facebook.com/) → Mis Apps
2. Crea una App de tipo **Business** con permisos de **Marketing API**
3. Genera un token de larga duración (Long-Lived Token) en el Explorador de la API
4. Activa los permisos: `ads_read`, `ads_management`, `business_management`

### Google Ads

```env
GOOGLE_ADS_DEVELOPER_TOKEN=tu_developer_token
GOOGLE_ADS_CLIENT_ID=tu_client_id.apps.googleusercontent.com
GOOGLE_ADS_CLIENT_SECRET=tu_client_secret
GOOGLE_ADS_REFRESH_TOKEN=tu_refresh_token
GOOGLE_ADS_LOGIN_CUSTOMER_ID=1234567890  # ID del MCC, vacío si es cuenta directa
```

**Cómo obtener las credenciales:**
1. **Developer Token:** [Google Ads API Center](https://ads.google.com/aw/apicenter)
2. **Client ID & Secret:** [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Credenciales OAuth 2.0
3. **Refresh Token:** [OAuth Playground](https://developers.google.com/oauthplayground/) con scope `https://www.googleapis.com/auth/adwords`

---

## Herramientas disponibles

### Meta Ads (18 herramientas)

| Herramienta | Descripción |
|---|---|
| `listar_cuentas_publicitarias` | Lista todas las cuentas vinculadas al token |
| `obtener_campanas` | Campañas de una cuenta (estado, presupuesto, fechas) |
| `obtener_campanas_activas` | Solo campañas activas de una cuenta |
| `obtener_todas_campanas_activas` | Activas de todas las cuentas accesibles |
| `obtener_conjuntos` | Ad Sets de una cuenta o campaña |
| `obtener_anuncios` | Ads de una cuenta, campaña o conjunto |
| `obtener_creativos_anuncio` | Textos y títulos de los creativos |
| `obtener_segmentacion_conjunto` | Targeting completo de un Ad Set |
| `cambiar_estado_campana` | Encender/apagar campaña |
| `cambiar_estado_conjunto` | Encender/apagar Ad Set |
| `cambiar_estado_anuncio` | Encender/apagar anuncio individual |
| `modificar_presupuesto_campana` | Ajustar presupuesto diario o total |
| `modificar_presupuesto_conjunto` | Ajustar presupuesto de Ad Set (ABO) |
| `reporte_rendimiento` | KPIs por campaña (impresiones, clics, CTR, gasto, CPM, CPC, conversiones, CPA, ROAS) |
| `reporte_rendimiento_todas` | KPIs de todas las cuentas |
| `reporte_rendimiento_desglosado` | Desglose por edad, género o plataforma |
| `detectar_fugas_dinero` | Campañas con gasto sin resultados, CTR bajo, CPA alto |
| `monitorear_errores_cuenta` | Campañas/conjuntos/anuncios con errores o rechazos |

**Paginación:** Las herramientas de consulta devuelven un `pagina_cursor` al final cuando hay más resultados. Pásalo en la siguiente llamada para ver la siguiente página.

### Google Ads (9 herramientas)

| Herramienta | Descripción |
|---|---|
| `obtener_campanas` | Todas las campañas de una cuenta |
| `obtener_campanas_activas` | Solo campañas ENABLED |
| `obtener_todas_campanas_activas` | Activas en todas las cuentas accesibles |
| `cambiar_estado_campana` | Encender/apagar campaña |
| `cambiar_estado_grupo` | Encender/apagar Ad Group |
| `cambiar_estado_anuncio` | Encender/apagar anuncio |
| `reporte_rendimiento` | KPIs por campaña para un rango de fechas |
| `detectar_fugas_dinero` | Campañas con gasto sin conversiones, CTR bajo, CPA alto |
| `monitorear_errores_cuenta` | Anuncios rechazados o con problemas de política |

---

## Estructura del proyecto

```
mcp-ads-manager/
├── src/
│   ├── meta_ads/
│   │   └── server.ts        # Servidor Meta Ads (18 herramientas)
│   └── google_ads/
│       └── server.ts        # Servidor Google Ads (9 herramientas)
├── dist/                    # Salida compilada (generada por tsc)
├── windows_build/
│   ├── setup.bat            # Instalador Windows (lanzador)
│   ├── setup.ps1            # Instalador Windows (lógica principal)
│   ├── uninstall.bat        # Desinstalador (lanzador)
│   └── uninstall.ps1        # Desinstalador (lógica principal)
├── .github/workflows/
│   └── build-windows.yml    # CI/CD: compila y empaqueta .exe en Windows
├── package.json
├── tsconfig.json
├── .env.example
└── .mcp.json                # Config MCP para Claude Code (desarrollo)
```

---

## Compilar y empaquetar (desarrollo)

```bash
# Compilar TypeScript → JavaScript
npm run build

# Iniciar servidores en modo desarrollo
npm run start:meta
npm run start:google

# Crear ejecutables Windows (requiere Windows o GitHub Actions)
npm run package:all
```

Los ejecutables se generan en `dist/meta_ads.exe` y `dist/google_ads.exe`.

---

## CI/CD — Build automático de Windows

El workflow `.github/workflows/build-windows.yml` se activa al hacer push a la rama `build/windows-exe` o manualmente desde GitHub Actions → **Run workflow**.

Pasos automáticos:
1. Instala Node.js 20 y dependencias (`npm ci`)
2. Compila TypeScript (`npm run build`)
3. Genera los `.exe` con `@yao-pkg/pkg` (Node.js embebido, sin dependencias externas)
4. Sube el artefacto `MetaAdsManager-Windows` con todo listo para distribuir

---

## Tecnologías

- **Runtime:** Node.js 20 + TypeScript 5
- **MCP Framework:** `@modelcontextprotocol/sdk`
- **HTTP:** `axios` (Meta Graph API v21.0, Google Ads REST API v18)
- **Validación:** `zod`
- **Empaquetado Windows:** `@yao-pkg/pkg`
