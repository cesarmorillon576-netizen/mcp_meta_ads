# MCP Meta Ads

Servidor MCP que conecta Claude con la API de Meta Ads (Facebook Ads), permitiéndote consultar campañas publicitarias directamente desde el chat.

## Requisitos

- Python 3.10 o superior
- Una cuenta de [Meta for Developers](https://developers.facebook.com) con acceso a la Marketing API
- Claude Desktop instalado

---

## Instalación en Windows

### 1. Clona o descarga el repositorio

```cmd
git clone https://github.com/cesarmorillon576-netizen/mcp_meta_ads.git
cd MCP_meta_ads
```

### 2. Crea un entorno virtual

```cmd
python -m venv venv
venv\Scripts\activate
```

### 3. Instala las dependencias

```cmd
pip install -r requirements.txt
```

### 4. Configura tus credenciales

Copia el archivo de ejemplo y completa tus datos:

```cmd
copy .env.example .env
```

Abre el archivo `.env` con el Bloc de notas o cualquier editor y reemplaza los valores:

```env
META_APP_ID=tu_app_id
META_APP_SECRET=tu_app_secret
META_ACCESS_TOKEN=tu_token_permanente
```

> No sabes cómo obtener estas credenciales? Revisa la sección [Obtener credenciales de Meta](#obtener-credenciales-de-meta) al final de este archivo.

---

## Configuración en Claude Desktop

Abre el archivo de configuración de Claude Desktop. En Windows se encuentra en:

```
%APPDATA%\Claude\claude_desktop_config.json
```

Agrega el servidor MCP dentro de `mcpServers`:

```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "C:\\ruta\\a\\tu\\proyecto\\venv\\Scripts\\python.exe",
      "args": ["C:\\ruta\\a\\tu\\proyecto\\server.py"]
    }
  }
}
```

> Reemplaza `C:\\ruta\\a\\tu\\proyecto\\` con la ruta real donde clonaste el repositorio.

Reinicia Claude Desktop para que detecte el nuevo servidor.

---

## Uso

Una vez configurado, puedes pedirle a Claude cosas como:

- *"Revisa las campañas de la cuenta 12345"*
- *"¿Qué campañas activas tengo en la cuenta 67890?"*

---

## Herramientas disponibles

| Herramienta | Descripción |
|---|---|
| `obtener_campanas` | Lista las campañas de una cuenta publicitaria con nombre, estado y presupuesto diario |

---

## Obtener credenciales de Meta

1. Ve a [developers.facebook.com](https://developers.facebook.com) y crea una app de tipo **Business**
2. Agrega el producto **Marketing API**
3. En **Configuración → Básica** copia tu `App ID` y `App Secret`
4. Para el token, ve a **Business Manager → Configuración → Usuarios del sistema**, crea uno y genera un token con los permisos `ads_read` y `ads_management`
5. Pega esos tres valores en tu archivo `.env`

---

## Estructura del proyecto

```
MCP_meta_ads/
├── server.py          # Servidor MCP principal
├── requirements.txt   # Dependencias de Python
├── .env.example       # Plantilla de variables de entorno
├── .env               # Tus credenciales (no subir a git)
└── README.md
```
