import os
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.ad import Ad
from facebook_business.adobjects.user import User

load_dotenv()

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN')
if ACCESS_TOKEN:
    FacebookAdsApi.init(access_token=ACCESS_TOKEN)

mcp = FastMCP("MetaAds")

def _credenciales_ok() -> bool:
    return bool(ACCESS_TOKEN)

def _error_credenciales() -> str:
    return "❌ Error: No se encontraron las credenciales de Meta Ads en el archivo de configuración (.env)."

def _account(account_id: str) -> AdAccount:
    aid = account_id if account_id.startswith('act_') else f'act_{account_id}'
    return AdAccount(aid)

def _resolve_account(account_input: str) -> AdAccount:
    """Acepta el ID numérico, 'act_XXX', o el nombre de la cuenta."""
    account_input = account_input.strip()
    if account_input.isdigit() or account_input.lower().startswith('act_'):
        aid = account_input if account_input.lower().startswith('act_') else f'act_{account_input}'
        return AdAccount(aid)
    try:
        cuentas = User('me').get_ad_accounts(fields=['id', 'name'])
        for cuenta in cuentas:
            if account_input.lower() in cuenta.get('name', '').lower():
                return AdAccount(cuenta['id'])
    except Exception:
        pass
    return AdAccount(account_input if account_input.lower().startswith('act_') else f'act_{account_input}')

def _traductor_estado(status: str) -> str:
    estados = {
        'ACTIVE': '🟢 Activa',
        'PAUSED': '⏸ Pausada',
        'PENDING_REVIEW': '⏳ En revisión por Meta',
        'DISAPPROVED': '❌ Rechazada',
        'WITH_ISSUES': '⚠ Con problemas técnicos',
        'ERROR': '❌ Error de configuración',
        'CAMPAIGN_PAUSED': '⏸ Pausada (campaña madre apagada)',
    }
    return estados.get(status, f"Estatus: {status}")


# ─────────────────────────────────────────────
# UTILIDADES DE CONTEXTO
# ─────────────────────────────────────────────

@mcp.tool()
def listar_cuentas_publicitarias() -> str:
    """Listar todas las cuentas de anuncios disponibles con sus nombres e IDs."""
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuentas = User('me').get_ad_accounts(fields=['id', 'name'])
        if not cuentas:
            return "No se encontraron cuentas publicitarias vinculadas a este perfil."
        lineas = ["Cuentas Publicitarias Disponibles:\n"]
        for cuenta in cuentas:
            lineas.append(f"  • {cuenta.get('name', 'Sin Nombre')} | ID: {cuenta['id']}")
        return "\n".join(lineas)
    except Exception as e:
        return f"No se pudieron listar las cuentas. Detalle: {str(e)}"


# ─────────────────────────────────────────────
# CONSULTA DE CAMPAÑAS
# ─────────────────────────────────────────────

@mcp.tool()
def obtener_campanas(account_input: str) -> str:
    """Obtener una lista de las campañas de una cuenta publicitaria con su estado y presupuesto, si no se especifica, ir a la tool de obtener todas las campañas activas"""
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = _resolve_account(account_input)
        campanas = cuenta.get_campaigns(fields=[
            'name', 'status', 'daily_budget', 'lifetime_budget',
            'start_time', 'stop_time', 'objective',
        ])
        if not campanas:
            return f"No se encontraron campañas para la cuenta '{account_input}'."
        resultados = [f"Campañas encontradas en '{account_input}':\n"]
        for c in campanas:
            daily = c.get('daily_budget')
            lifetime = c.get('lifetime_budget')
            if daily:
                presupuesto = f"${int(daily)/100:.2f}/día"
            elif lifetime:
                presupuesto = f"${int(lifetime)/100:.2f} total"
            else:
                presupuesto = "no definido"
            inicio = c.get('start_time', 'N/A')
            fin = c.get('stop_time', 'sin fecha fin')
            objetivo = c.get('objective', 'N/A')
            estado = _traductor_estado(c.get('status', ''))
            resultados.append(
                f"- {c['name']} (ID: {c['id']})\n"
                f"  Estado: {estado} | Objetivo: {objetivo}\n"
                f"  Presupuesto: {presupuesto}\n"
                f"  Inicio: {inicio} | Fin: {fin}"
            )
        return "\n\n".join(resultados)
    except Exception as e:
        return f"Error al consultar la API de Meta: {str(e)}"


@mcp.tool()
def obtener_campanas_activas(account_input: str) -> str:
    """Obtener solo las campañas con estado ACTIVE de una cuenta publicitaria."""
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = _resolve_account(account_input)
        campanas = cuenta.get_campaigns(
            fields=['name', 'status', 'daily_budget', 'objective'],
            params={'effective_status': ['ACTIVE']},
        )
        if not campanas:
            return f"No hay campañas activas en la cuenta '{account_input}'."
        resultados = [f"Campañas activas ({len(campanas)}):\n"]
        for c in campanas:
            presupuesto = c.get('daily_budget')
            p_str = f"${int(presupuesto)/100:.2f}/día" if presupuesto else "presupuesto variable"
            objetivo = c.get('objective', 'N/A')
            resultados.append(
                f"- {c['name']} (ID: {c['id']}) | Objetivo: {objetivo} | Inversión: {p_str}"
            )
        return "\n".join(resultados)
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
                    daily = c.get('daily_budget')
                    presupuesto = f"${int(daily)/100:.0f}/día" if daily else "no definido"
                    objetivo = c.get('objective', 'N/A')
                    resultados.append(f"  - {c['name']} | Objetivo: {objetivo} | Presupuesto: {presupuesto}")

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
    - campaign_id: ID de la campaña
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
        emoji = "🚀" if accion == 'encender' else "⏸"
        return f"{emoji} Campaña {campaign_id} {'activada' if accion == 'encender' else 'pausada'} correctamente."
    except Exception as e:
        return f"Error al cambiar estado de la campaña: {str(e)}"


@mcp.tool()
def modificar_presupuesto_campana(campaign_id: str, nuevo_presupuesto: float, tipo_presupuesto: str) -> str:
    """
    Ajusta el presupuesto asignado a una campaña.
    - campaign_id: ID de la campaña
    - nuevo_presupuesto: monto en moneda local (ej: 1500.00)
    - tipo_presupuesto: 'diario' o 'total'
    """
    if not _credenciales_ok():
        return _error_credenciales()
    tipo = tipo_presupuesto.strip().lower()
    if tipo not in ('diario', 'total'):
        return "Error: 'tipo_presupuesto' debe ser 'diario' o 'total'."
    campo = 'daily_budget' if tipo == 'diario' else 'lifetime_budget'
    monto_centavos = int(nuevo_presupuesto * 100)
    try:
        campana = Campaign(campaign_id)
        campana.api_update(params={campo: monto_centavos})
        return f"💰 Presupuesto {tipo} de la campaña {campaign_id} actualizado a ${nuevo_presupuesto:,.2f}."
    except Exception as e:
        return f"No se pudo actualizar el presupuesto: {str(e)}"


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
def reporte_rendimiento(account_input: str, fecha_inicio: str, fecha_fin: str) -> str:
    """
    Obtener métricas clave (KPIs) de la cuenta para un rango de fechas.
    - account_input: ID o nombre de la cuenta publicitaria
    - fecha_inicio / fecha_fin: formato YYYY-MM-DD
    Métricas: impresiones, clics, CTR, gasto, CPM, CPC, conversiones, CPA, ROAS.
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = _resolve_account(account_input)
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


@mcp.tool()
def reporte_rendimiento_todas(fecha_inicio: str, fecha_fin: str) -> str:
    """
    Obtener métricas clave (KPIs) de todas las cuentas publicitarias accesibles para un rango de fechas.
    - fecha_inicio / fecha_fin: formato YYYY-MM-DD
    Métricas: impresiones, clics, CTR, gasto, CPM, CPC, conversiones, CPA, ROAS.
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuentas = User('me').get_ad_accounts(fields=['id', 'name'])
        if not cuentas:
            return "No se encontraron cuentas publicitarias asociadas al token."

        lineas = [f"Reporte de rendimiento: {fecha_inicio} → {fecha_fin}\n"]

        for cuenta in cuentas:
            account_id = cuenta['id']
            account_name = cuenta.get('name', account_id)
            lineas.append(f"\n== Cuenta: {account_name} ({account_id}) ==")

            insights = AdAccount(account_id).get_insights(
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
                lineas.append("  Sin datos para este período.")
                continue

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
                    f"\n  Campaña: {i.get('campaign_name', 'N/A')}\n"
                    f"    Impresiones : {i.get('impressions', 0)}\n"
                    f"    Clics       : {i.get('clicks', 0)}\n"
                    f"    CTR         : {i.get('ctr', 0)}%\n"
                    f"    Gasto       : ${i.get('spend', 0)}\n"
                    f"    CPM         : ${i.get('cpm', 0)}\n"
                    f"    CPC         : ${i.get('cpc', 0)}\n"
                    f"    Conversiones: {conversiones}\n"
                    f"    CPA         : ${cpa}\n"
                    f"    ROAS        : {roas_val}"
                )

        return "\n".join(lineas)
    except Exception as e:
        return f"Error al obtener reporte de rendimiento: {str(e)}"


@mcp.tool()
def reporte_rendimiento_desglosado(account_input: str, fecha_inicio: str, fecha_fin: str, desglose: str) -> str:
    """
    Desglosa los resultados por segmento para saber a qué público o canal le va mejor.
    - account_input: ID o nombre de la cuenta
    - fecha_inicio / fecha_fin: formato YYYY-MM-DD
    - desglose: 'age' (edades), 'gender' (género), o 'publisher_platform' (Facebook vs Instagram)
    """
    if not _credenciales_ok():
        return _error_credenciales()
    desglose = desglose.strip().lower()
    titulos_desglose = {'age': 'Edades', 'gender': 'Géneros', 'publisher_platform': 'Plataformas (FB/IG)'}
    titulo_actual = titulos_desglose.get(desglose, desglose.upper())
    try:
        cuenta = _resolve_account(account_input)
        insights = cuenta.get_insights(
            fields=['campaign_name', 'impressions', 'clicks', 'ctr', 'spend'],
            params={
                'time_range': {'since': fecha_inicio, 'until': fecha_fin},
                'level': 'campaign',
                'breakdowns': [desglose],
            }
        )
        if not insights:
            return f"No hay datos para desglosar en el período {fecha_inicio} → {fecha_fin}."

        lineas = [f"Análisis de Rendimiento por {titulo_actual} ({fecha_inicio} → {fecha_fin})\n"]
        traducciones = {
            'instagram': 'Instagram',
            'facebook': 'Facebook',
            'messenger': 'Messenger',
            'audience_network': 'Sitios web aliados',
        }
        for i in insights:
            segmento = traducciones.get(i.get(desglose, 'Desconocido'), i.get(desglose, 'Desconocido'))
            lineas.append(
                f"  {i.get('campaign_name')} — {segmento}\n"
                f"    Gasto: ${float(i.get('spend', 0)):,.2f} | Clics: {i.get('clicks', 0)} | CTR: {float(i.get('ctr', 0)):.2f}%\n"
            )
        return "\n".join(lineas)
    except Exception as e:
        return f"No se pudo construir el reporte desglosado: {str(e)}"


# ─────────────────────────────────────────────
# AUDITORÍA DE CREATIVOS
# ─────────────────────────────────────────────

@mcp.tool()
def obtener_creativos_anuncio(account_input: str) -> str:
    """Audita los textos y contenidos visuales de los anuncios de la cuenta."""
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = _resolve_account(account_input)
        creativos = cuenta.get_ad_creatives(fields=['name', 'title', 'body'], params={'limit': 15})
        if not creativos:
            return "No se encontraron creativos registrados en esta cuenta."
        lineas = ["Creativos de anuncios auditados:\n"]
        for c in creativos:
            lineas.append(
                f"  Anuncio: {c.get('name', 'Sin nombre')} (ID: {c['id']})\n"
                f"    Título: {c.get('title', 'Sin título')}\n"
                f"    Texto:  {c.get('body', 'Sin texto')}\n"
            )
        return "\n".join(lineas)
    except Exception as e:
        return f"Error al leer los creativos: {str(e)}"


# ─────────────────────────────────────────────
# MONITOREO DE ERRORES Y FUGAS DE DINERO
# ─────────────────────────────────────────────

@mcp.tool()
def detectar_fugas_dinero(account_input: str, fecha_inicio: str, fecha_fin: str) -> str:
    """
    Analiza la cuenta en busca de campañas que gastan dinero sin generar resultados:
    campañas activas sin conversiones, CTR muy bajo, CPA excesivo, sin entregas.
    - account_input: ID o nombre de la cuenta
    - fecha_inicio / fecha_fin: formato YYYY-MM-DD
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = _resolve_account(account_input)
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
def monitorear_errores_cuenta(account_input: str) -> str:
    """
    Revisa el estado actual de campañas, conjuntos y anuncios en busca de errores de entrega,
    rechazos de anuncios, o configuraciones problemáticas.
    - account_input: ID o nombre de la cuenta
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = _resolve_account(account_input)

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
            return f"No se encontraron errores activos en la cuenta '{account_input}'."

        return f"Errores detectados en la cuenta '{account_input}':\n\n" + "\n".join(f"⚠ {e}" for e in errores)

    except Exception as e:
        return f"Error al monitorear la cuenta: {str(e)}"


if __name__ == "__main__":
    mcp.run()
