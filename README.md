# MCP Ads

Servidor MCP que conecta Claude con la API de **Meta Ads** y **Google Ads**, permitiéndote consultar y gestionar campañas publicitarias directamente desde el chat.

---

## Requisitos

- Python 3.10 o superior
- Claude Code instalado
- Credenciales de Meta Ads y/o Google Ads

---

## Instalación

### 1. Clona el repositorio

```bash
git clone https://github.com/cesarmorillon576-netizen/mcp_meta_ads.git
cd MCP_meta_ads
```

### 2. Crea el entorno virtual

**Linux / macOS / Servidor**
```bash
python -m venv venv
source venv/bin/activate
```

**Windows**
```cmd
python -m venv venv
venv\Scripts\activate
```

### 3. Instala las dependencias

```bash
pip install -r requirements.txt
```

### 4. Configura las credenciales

```bash
cp .env.example .env   # Linux/macOS
copy .env.example .env  # Windows
```

Abre `.env` y completa los valores según las plataformas que vayas a usar:

```env
# Meta Ads
META_APP_ID=
META_APP_SECRET=
META_ACCESS_TOKEN=

# Google Ads
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
```

---

## Configuración del MCP en Claude Code

El archivo `.mcp.json` ya está incluido en el repositorio. Claude Code lo detecta automáticamente al abrir la carpeta del proyecto.

**Importante:** el venv debe estar activo cuando inicies Claude Code para que el comando `python` apunte al entorno correcto.

```bash
source venv/bin/activate   # Linux/macOS
venv\Scripts\activate       # Windows
```

Luego abre Claude Code desde esa misma terminal o carpeta y los servidores `meta-ads` y `google-ads` estarán disponibles.

---

## Obtener credenciales

### Meta Ads

1. Ve a [developers.facebook.com](https://developers.facebook.com) y crea una app de tipo **Business**
2. Agrega el producto **Marketing API**
3. En **Configuración → Básica** copia tu `App ID` y `App Secret`
4. Ve a **Business Manager → Configuración → Usuarios del sistema**, crea un usuario de sistema y genera un token con los permisos `ads_read` y `ads_management`
5. Asigna las cuentas publicitarias que quieras consultar al usuario de sistema desde **Agregar activos**

### Google Ads

1. Ve a [Google Cloud Console](https://console.cloud.google.com) y crea un proyecto
2. Activa la **Google Ads API**
3. Crea credenciales OAuth 2.0 y obtén tu `client_id` y `client_secret`
4. Genera un `refresh_token` con los scopes de Google Ads
5. Solicita un `developer_token` en [Google Ads API Center](https://developers.google.com/google-ads/api/docs/get-started/dev-token)

---

## Herramientas disponibles

### Meta Ads (`meta-ads`)

| Herramienta | Parámetros | Descripción |
|---|---|---|
| `obtener_campanas` | `account_id` | Lista todas las campañas con estado y presupuesto |
| `obtener_campanas_activas` | `account_id` | Solo campañas activas de una cuenta |
| `obtener_todas_campanas_activas` | — | Campañas activas de todas las cuentas del token |
| `cambiar_estado_campana` | `campaign_id`, `accion` | Encender o apagar una campaña |
| `cambiar_estado_conjunto` | `adset_id`, `accion` | Encender o apagar un conjunto de anuncios |
| `cambiar_estado_anuncio` | `ad_id`, `accion` | Encender o apagar un anuncio |
| `reporte_rendimiento` | `account_id`, `fecha_inicio`, `fecha_fin` | KPIs: impresiones, clics, CTR, gasto, CPM, CPC, conversiones, CPA, ROAS |
| `detectar_fugas_dinero` | `account_id`, `fecha_inicio`, `fecha_fin` | Detecta gasto sin conversiones, CTR bajo o CPA excesivo |
| `monitorear_errores_cuenta` | `account_id` | Busca anuncios rechazados o con problemas de entrega |

### Google Ads (`google-ads`)

| Herramienta | Parámetros | Descripción |
|---|---|---|
| `obtener_campanas` | `customer_id` | Lista todas las campañas con estado y presupuesto |
| `obtener_campanas_activas` | `customer_id` | Solo campañas activas de una cuenta |
| `obtener_todas_campanas_activas` | — | Campañas activas de todas las cuentas accesibles |
| `cambiar_estado_campana` | `customer_id`, `campaign_id`, `accion` | Encender o apagar una campaña |
| `cambiar_estado_grupo` | `customer_id`, `ad_group_id`, `accion` | Encender o apagar un grupo de anuncios |
| `cambiar_estado_anuncio` | `customer_id`, `ad_group_id`, `ad_id`, `accion` | Encender o apagar un anuncio |
| `reporte_rendimiento` | `customer_id`, `fecha_inicio`, `fecha_fin` | KPIs por campaña |
| `detectar_fugas_dinero` | `customer_id`, `fecha_inicio`, `fecha_fin` | Detecta gasto ineficiente |
| `monitorear_errores_cuenta` | `customer_id` | Busca anuncios desaprobados o con problemas |

> `accion` acepta: `"encender"` o `"apagar"`

---

## Estructura del proyecto

```
MCP_meta_ads/
├── meta_ads/
│   └── server.py
├── google_ads/
│   └── server.py
├── .mcp.json
├── requirements.txt
├── .env.example
├── .env               # no se sube a git
└── README.md
```
