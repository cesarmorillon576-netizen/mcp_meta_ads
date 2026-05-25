import os
from dotenv import load_dotenv
from mcp.server.FastMCP import FastMCP
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.ad import Ad
from facebook_business.adobjects.user import User

load_dotenv()

APP_ID = os.getenv('META_APP_ID')
APP_SECRET = os.getenv('META_APP_SECRET')
ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN')
if APP_ID and APP_SECRET and ACCESS_TOKEN:
    FacebookAdsApi.init(APP_ID, APP_SECRET, ACCESS_TOKEN)

mcp = FastMCP("MetaAds")

def _credenciales_ok() -> bool:
    return bool(APP_ID and APP_SECRET and ACCESS_TOKEN)

def _error_credenciales() -> str:
    return "Error: No se encontraron las credenciales de Meta Ads API en el archivo .env"


# ─────────────────────────────────────────────
# CONSULTA DE CAMPAÑAS
# ─────────────────────────────────────────────

@mcp.tool()
def obtener_campanas(account_id: str) -> str:
    """Obtener una lista de las campañas de una cuenta publicitaria con su estado y presupuesto."""
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = AdAccount(f'act_{account_id}')
        campanas = cuenta.get_campaigns(fields=['name', 'status', 'daily_budget'])
        if not campanas:
            return f"No se encontraron campañas para la cuenta {account_id}"
        resultados = []
        for c in campanas:
            presupuesto = c.get('daily_budget', 'no definido')
            resultados.append(f"- Nombre: {c['name']} | Estado: {c['status']} | Presupuesto: ${presupuesto}/día")
        return "Campañas encontradas:\n" + "\n".join(resultados)
    except Exception as e:
        return f"Error al consultar la API de Meta: {str(e)}"


@mcp.tool()
def obtener_campanas_activas(account_id: str) -> str:
    """Obtener solo las campañas con estado ACTIVE de una cuenta publicitaria."""
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = AdAccount(f'act_{account_id}')
        campanas = cuenta.get_campaigns(
            fields=['name', 'status', 'daily_budget', 'objective'],
            params={'effective_status': ['ACTIVE']},
        )
        if not campanas:
            return f"No hay campañas activas en la cuenta {account_id}"
        resultados = []
        for c in campanas:
            presupuesto = c.get('daily_budget', 'no definido')
            objetivo = c.get('objective', 'N/A')
            resultados.append(
                f"- Nombre: {c['name']} | Objetivo: {objetivo} | Presupuesto: ${presupuesto}/día"
            )
        return f"Campañas activas ({len(resultados)}):\n" + "\n".join(resultados)
    except Exception as e:
        return f"Error al consultar campañas activas: {str(e)}"


# ─────────────────────────────────────────────
# GESTIÓN DE ESTADOS (ENCENDER / APAGAR)
# ─────────────────────────────────────────────

@mcp.tool()
def obtener_todas_campanas_activas() -> str:
    """Obtener todas las campañas activas de todas las cuentas publicitarias accesibles con el token configurado."""
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuentas = User('me').get_ad_accounts(fields=['id', 'name'])
        if not cuentas:
            return "No se encontraron cuentas publicitarias asociadas al token."

        resultados = []
        for cuenta in cuentas:
            account_id = cuenta['id']
            account_name = cuenta.get('name', account_id)
            campanas = AdAccount(account_id).get_campaigns(
                fields=['name', 'daily_budget', 'objective'],
                params={'effective_status': ['ACTIVE']},
            )
            if campanas:
                resultados.append(f"\nCuenta: {account_name} ({account_id}) — {len(campanas)} activa(s):")
                for c in campanas:
                    presupuesto = c.get('daily_budget', 'no definido')
                    objetivo = c.get('objective', 'N/A')
                    resultados.append(f"  - {c['name']} | Objetivo: {objetivo} | Presupuesto: ${presupuesto}/día")

        if not resultados:
            return "No hay campañas activas en ninguna de las cuentas accesibles."

        total = sum(1 for r in resultados if r.startswith('  -'))
        return f"Total campañas activas: {total}" + "".join(resultados)
    except Exception as e:
        return f"Error al consultar campañas activas: {str(e)}"


@mcp.tool()
def cambiar_estado_campana(campaign_id: str, accion: str) -> str:
    """
    Encender o apagar una campaña.
    - campaign_id: ID de la campaña (sin 'act_')
    - accion: 'encender' o 'apagar'
    """
    if not _credenciales_ok():
        return _error_credenciales()
    accion = accion.strip().lower()
    if accion not in ('encender', 'apagar'):
        return "Error: 'accion' debe ser 'encender' o 'apagar'"
    nuevo_estado = Campaign.Status.active if accion == 'encender' else Campaign.Status.paused
    try:
        campana = Campaign(campaign_id)
        campana.api_update(params={'status': nuevo_estado})
        return f"Campaña {campaign_id} {'activada' if accion == 'encender' else 'pausada'} correctamente."
    except Exception as e:
        return f"Error al cambiar estado de la campaña: {str(e)}"


@mcp.tool()
def cambiar_estado_conjunto(adset_id: str, accion: str) -> str:
    """
    Encender o apagar un conjunto de anuncios (Ad Set).
    - adset_id: ID del conjunto
    - accion: 'encender' o 'apagar'
    """
    if not _credenciales_ok():
        return _error_credenciales()
    accion = accion.strip().lower()
    if accion not in ('encender', 'apagar'):
        return "Error: 'accion' debe ser 'encender' o 'apagar'"
    nuevo_estado = AdSet.Status.active if accion == 'encender' else AdSet.Status.paused
    try:
        conjunto = AdSet(adset_id)
        conjunto.api_update(params={'status': nuevo_estado})
        return f"Conjunto {adset_id} {'activado' if accion == 'encender' else 'pausado'} correctamente."
    except Exception as e:
        return f"Error al cambiar estado del conjunto: {str(e)}"


@mcp.tool()
def cambiar_estado_anuncio(ad_id: str, accion: str) -> str:
    """
    Encender o apagar un anuncio individual.
    - ad_id: ID del anuncio
    - accion: 'encender' o 'apagar'
    """
    if not _credenciales_ok():
        return _error_credenciales()
    accion = accion.strip().lower()
    if accion not in ('encender', 'apagar'):
        return "Error: 'accion' debe ser 'encender' o 'apagar'"
    nuevo_estado = Ad.Status.active if accion == 'encender' else Ad.Status.paused
    try:
        anuncio = Ad(ad_id)
        anuncio.api_update(params={'status': nuevo_estado})
        return f"Anuncio {ad_id} {'activado' if accion == 'encender' else 'pausado'} correctamente."
    except Exception as e:
        return f"Error al cambiar estado del anuncio: {str(e)}"


# ─────────────────────────────────────────────
# REPORTES DE RENDIMIENTO Y KPIs
# ─────────────────────────────────────────────

@mcp.tool()
def reporte_rendimiento(account_id: str, fecha_inicio: str, fecha_fin: str) -> str:
    """
    Obtener métricas clave (KPIs) de la cuenta para un rango de fechas.
    - account_id: ID de la cuenta publicitaria
    - fecha_inicio: formato YYYY-MM-DD
    - fecha_fin: formato YYYY-MM-DD
    Métricas: impresiones, clics, CTR, gasto, CPM, CPC, conversiones, CPA, ROAS.
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = AdAccount(f'act_{account_id}')
        insights = cuenta.get_insights(
            fields=[
                'campaign_name',
                'impressions',
                'clicks',
                'ctr',
                'spend',
                'cpm',
                'cpc',
                'actions',
                'cost_per_action_type',
                'purchase_roas',
            ],
            params={
                'time_range': {'since': fecha_inicio, 'until': fecha_fin},
                'level': 'campaign',
            }
        )
        if not insights:
            return f"No hay datos de rendimiento para el período {fecha_inicio} → {fecha_fin}"

        lineas = [f"Reporte de rendimiento: {fecha_inicio} → {fecha_fin}\n"]
        for i in insights:
            conversiones = next(
                (a['value'] for a in i.get('actions', []) if a['action_type'] == 'purchase'),
                '0'
            )
            cpa = next(
                (a['value'] for a in i.get('cost_per_action_type', []) if a['action_type'] == 'purchase'),
                'N/A'
            )
            roas = i.get('purchase_roas', [{}])
            roas_val = roas[0].get('value', 'N/A') if roas else 'N/A'

            lineas.append(
                f"Campaña: {i.get('campaign_name', 'N/A')}\n"
                f"  Impresiones : {i.get('impressions', 0)}\n"
                f"  Clics       : {i.get('clicks', 0)}\n"
                f"  CTR         : {i.get('ctr', 0)}%\n"
                f"  Gasto       : ${i.get('spend', 0)}\n"
                f"  CPM         : ${i.get('cpm', 0)}\n"
                f"  CPC         : ${i.get('cpc', 0)}\n"
                f"  Conversiones: {conversiones}\n"
                f"  CPA         : ${cpa}\n"
                f"  ROAS        : {roas_val}\n"
            )
        return "\n".join(lineas)
    except Exception as e:
        return f"Error al obtener reporte de rendimiento: {str(e)}"


# ─────────────────────────────────────────────
# MONITOREO DE ERRORES Y FUGAS DE DINERO
# ─────────────────────────────────────────────

@mcp.tool()
def detectar_fugas_dinero(account_id: str, fecha_inicio: str, fecha_fin: str) -> str:
    """
    Analiza la cuenta en busca de campañas o conjuntos que gastan dinero sin generar resultados:
    campañas activas sin conversiones, CTR muy bajo, CPA excesivo, y presupuesto sin entregas.
    - account_id: ID de la cuenta publicitaria
    - fecha_inicio / fecha_fin: formato YYYY-MM-DD
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = AdAccount(f'act_{account_id}')
        insights = cuenta.get_insights(
            fields=[
                'campaign_name',
                'campaign_id',
                'impressions',
                'clicks',
                'ctr',
                'spend',
                'actions',
                'cost_per_action_type',
            ],
            params={
                'time_range': {'since': fecha_inicio, 'until': fecha_fin},
                'level': 'campaign',
            }
        )

        alertas = []
        for i in insights:
            nombre = i.get('campaign_name', 'N/A')
            gasto = float(i.get('spend', 0))
            impresiones = int(i.get('impressions', 0))
            ctr = float(i.get('ctr', 0))
            conversiones = next(
                (int(a['value']) for a in i.get('actions', []) if a['action_type'] == 'purchase'),
                0
            )
            cpa_val = next(
                (float(a['value']) for a in i.get('cost_per_action_type', []) if a['action_type'] == 'purchase'),
                None
            )

            problemas = []

            if gasto > 0 and conversiones == 0:
                problemas.append(f"Gasto ${gasto:.2f} sin ninguna conversión")

            if impresiones > 1000 and ctr < 0.5:
                problemas.append(f"CTR muy bajo ({ctr:.2f}%) con {impresiones} impresiones")

            if cpa_val and cpa_val > 100:
                problemas.append(f"CPA elevado: ${cpa_val:.2f} por conversión")

            if impresiones == 0 and gasto == 0:
                problemas.append("Sin entregas ni gasto — posible error de configuración o audiencia")

            if problemas:
                alertas.append(f"⚠ Campaña: {nombre}\n" + "\n".join(f"  - {p}" for p in problemas))

        if not alertas:
            return f"No se detectaron fugas de dinero en el período {fecha_inicio} → {fecha_fin}. Todo parece en orden."

        resumen = f"Fugas de dinero detectadas ({fecha_inicio} → {fecha_fin}):\n\n"
        return resumen + "\n\n".join(alertas)

    except Exception as e:
        return f"Error al analizar fugas de dinero: {str(e)}"


@mcp.tool()
def monitorear_errores_cuenta(account_id: str) -> str:
    """
    Revisa el estado actual de campañas, conjuntos y anuncios en busca de errores de entrega,
    rechazos de anuncios, o configuraciones problemáticas.
    - account_id: ID de la cuenta publicitaria
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = AdAccount(f'act_{account_id}')

        campanas = cuenta.get_campaigns(fields=['name', 'status', 'effective_status'])
        conjuntos = cuenta.get_ad_sets(fields=['name', 'status', 'effective_status', 'issues_info'])
        anuncios = cuenta.get_ads(fields=['name', 'status', 'effective_status', 'issues_info'])

        errores = []

        estados_problema = {'DISAPPROVED', 'WITH_ISSUES', 'ERROR', 'CAMPAIGN_PAUSED'}

        for c in campanas:
            if c.get('effective_status') in estados_problema:
                errores.append(f"[CAMPAÑA] {c['name']} — Estado: {c.get('effective_status')}")

        for cs in conjuntos:
            if cs.get('effective_status') in estados_problema:
                issues = cs.get('issues_info', [])
                detalle = "; ".join(i.get('error_message', '') for i in issues) if issues else "sin detalle"
                errores.append(f"[CONJUNTO] {cs['name']} — Estado: {cs.get('effective_status')} | {detalle}")

        for a in anuncios:
            if a.get('effective_status') in estados_problema:
                issues = a.get('issues_info', [])
                detalle = "; ".join(i.get('error_message', '') for i in issues) if issues else "sin detalle"
                errores.append(f"[ANUNCIO] {a['name']} — Estado: {a.get('effective_status')} | {detalle}")

        if not errores:
            return f"No se encontraron errores activos en la cuenta {account_id}."

        return f"Errores detectados en la cuenta {account_id}:\n\n" + "\n".join(f"⚠ {e}" for e in errores)

    except Exception as e:
        return f"Error al monitorear la cuenta: {str(e)}"


if __name__ == "__main__":
    mcp.run()
