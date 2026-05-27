import os
import sys
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.ad import Ad
from facebook_business.adobjects.user import User

if getattr(sys, 'frozen', False):
    _base_dir = os.path.dirname(sys.executable)
    load_dotenv(os.path.join(_base_dir, '.env'))
else:
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env'))

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

def _paginar(cursor_obj, limite: int):
    """Extrae hasta `limite` items de la primera página sin auto-paginar."""
    items = []
    for item in cursor_obj:
        items.append(item)
        if len(items) >= limite:
            break
    if not cursor_obj._finished_iteration:
        try:
            next_cursor = cursor_obj._json_data.get('paging', {}).get('cursors', {}).get('after')
        except Exception:
            next_cursor = None
    else:
        next_cursor = None
    return items, next_cursor

def _traductor_estado(status: str) -> str:
    estados = {
        'ACTIVE': '🟢 Activa',
        'PAUSED': '⏸ Pausada',
        'PENDING_REVIEW': '⏳ En revisión por Meta',
        'DISAPPROVED': '❌ Rechazada',
        'WITH_ISSUES': '⚠ Con problemas técnicos',
        'ERROR': '❌ Error de configuración',
        'CAMPAIGN_PAUSED': '⏸ Pausada (campaña madre apagada)',
        'ADSET_PAUSED': '⏸ Pausada (conjunto apagado)',
        'PENDING_BILLING_INFO': '💳 Sin información de facturación',
        'IN_PROCESS': '⏳ Procesando',
        'ARCHIVED': '🗄 Archivada',
        'DELETED': '🗑 Eliminada',
    }
    return estados.get(status, f"Estatus: {status}")


# ─────────────────────────────────────────────
# CONSULTA DE CONFIGURACIÓN Y TARGETING (SEGMENTACIÓN)
# ─────────────────────────────────────────────

@mcp.tool()
def obtener_segmentacion_conjunto(adset_id: str) -> str:
    """
    Obtiene la segmentación completa y detallada (Targeting) de un conjunto de anuncios (Ad Set).
    Trae datos geográficos, demográficos, intereses, comportamientos, exclusiones y públicos personalizados.
    - adset_id: ID del conjunto de anuncios (Ad Set)
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        # Solicitamos el campo 'targeting' y otros datos relevantes del Ad Set para dar contexto
        conjunto = AdSet(adset_id).api_get(fields=[
            'name',
            'campaign_id',
            'status',
            'effective_status',
            'targeting'
        ])
        
        targeting = conjunto.get('targeting')
        if not targeting:
            return f"El conjunto de anuncios '{conjunto.get('name')}' (ID: {adset_id}) no tiene datos de segmentación definidos."
        
        lineas = [
            f"🎯 Segmentación Detallada del Conjunto: {conjunto.get('name')} (ID: {adset_id})",
            f"   Estado: {_traductor_estado(conjunto.get('effective_status', ''))}\n",
            "📊 CONFIGURACIÓN DE AUDIENCIA:",
            "─────────────────────────────────────────────"
        ]
        
        # 1. Demografía Básica (Edad y Género)
        min_age = targeting.get('age_min', 'Cualquiera')
        max_age = targeting.get('age_max', 'Cualquiera')
        lineas.append(f"• 👥 Edades: {min_age} a {max_age} años")
        
        genders = targeting.get('genders')
        genero_str = "Todos"
        if genders == [1]: genero_str = "Hombres"
        elif genders == [2]: genero_str = "Mujeres"
        lineas.append(f"• ⚥ Género: {genero_str}")
        
        # Idiomas
        locales = targeting.get('locales', [])
        if locales:
            # Algunas respuestas traen diccionarios con id/name, otras solo IDs numéricos
            idiomas = [str(l.get('name', l.get('id', l))) if isinstance(l, dict) else str(l) for l in locales]
            lineas.append(f"• 🗣 Idiomas: {', '.join(idiomas)}")
        else:
            lineas.append("• 🗣 Idiomas: Todos los idiomas")

        # 2. Ubicaciones Geográficas (Geotargeting)
        geo = targeting.get('geo_locations', {})
        lineas.append("\n📍 UBICACIONES GEOGRÁFICAS:")
        
        tipos_geo = {
            'countries': 'Países',
            'regions': 'Regiones/Estados',
            'cities': 'Ciudades',
            'zips': 'Códigos Postales',
            'custom_locations': 'Radios personalizados (Pines)'
        }
        
        hay_geo = False
        for clave, etiqueta in tipos_geo.items():
            items = geo.get(clave, [])
            if items:
                hay_geo = True
                lineas.append(f"  ▪ {etiqueta}:")
                for item in items:
                    if isinstance(item, dict):
                        if 'latitude' in item:
                            nombre = f"Lat {item['latitude']:.4f}, Lon {item['longitude']:.4f}"
                        else:
                            nombre = item.get('name', item.get('key', 'Desconocido'))
                        radio = f" (+{item['radius']} {item['distance_unit']})" if 'radius' in item else ""
                        lineas.append(f"    - {nombre}{radio}")
                    else:
                        lineas.append(f"    - {item}")
                        
        if not hay_geo:
            lineas.append("  ▪ Abierta (Sin restricciones geográficas específicas)")

        # 3. Públicos Personalizados y Similares (Custom & Lookalike Audiences)
        custom_aud = targeting.get('custom_audiences', [])
        if custom_aud:
            lineas.append("\n👥 PÚBLICOS PERSONALIZADOS / SIMILARES INCLUIDOS:")
            for aud in custom_aud:
                lineas.append(f"  ▪ {aud.get('name', 'ID: ' + aud.get('id'))}")
                
        excluded_custom_aud = targeting.get('excluded_custom_audiences', [])
        if excluded_custom_aud:
            lineas.append("\n🚫 PÚBLICOS PERSONALIZADOS EXCLUIDOS:")
            for aud in excluded_custom_aud:
                lineas.append(f"  ▪ {aud.get('name', 'ID: ' + aud.get('id'))}")

        # 4. Segmentación Detallada (Intereses, Comportamientos, Datos Demográficos de Meta)
        flexible = targeting.get('flexible_spec', [])
        if flexible:
            lineas.append("\n🎯 INCLUSIONES DE SEGMENTACIÓN DETALLADA:")
            # Meta agrupa las condiciones con operadores lógicos (OR entre elementos del mismo bloque, AND entre bloques)
            for indice, bloque in enumerate(flexible, 1):
                lineas.append(f"  ▪ Bloque de Coincidencia #{indice} (Cumplir al menos uno):")
                for clave_segmento in ['interests', 'behaviors', 'demographics']:
                    items = bloque.get(clave_segmento, [])
                    if items:
                        tipo_str = 'Intereses' if clave_segmento == 'interests' else ('Comportamientos' if clave_segmento == 'behaviors' else 'Datos Demográficos')
                        lineas.append(f"    🔹 {tipo_str}:")
                        for item in items:
                            lineas.append(f"      - {item.get('name')} (ID: {item.get('id')})")
                            
        exclusions = targeting.get('exclusions', {})
        if exclusions:
            lineas.append("\n❌ EXCLUSIONES DE SEGMENTACIÓN DETALLADA:")
            for clave_segmento in ['interests', 'behaviors', 'demographics']:
                items = exclusions.get(clave_segmento, [])
                if items:
                    tipo_str = 'Intereses' if clave_segmento == 'interests' else ('Comportamientos' if clave_segmento == 'behaviors' else 'Datos Demográficos')
                    lineas.append(f"    🔹 Excluyendo {tipo_str}:")
                    for item in items:
                        lineas.append(f"      - {item.get('name')} (ID: {item.get('id')})")

        # 5. Ubicaciones en Plataformas (Placements)
        lineas.append("\n📱 UBICACIONES DE ANUNCIOS (PLACEMENTS):")
        if not targeting.get('publisher_platforms'):
            lineas.append("  ▪ Ubicaciones Advantage+ (Automáticas - Recomendado por Meta)")
        else:
            plataformas = targeting.get('publisher_platforms', [])
            dispositivos = targeting.get('device_platforms', [])
            lineas.append(f"  ▪ Dispositivos: {', '.join(dispositivos)}")
            lineas.append(f"  ▪ Plataformas: {', '.join(plataformas)}")
            
            # Sub-ubicaciones específicas (ej: instagram_story, facebook_feeds)
            posiciones = targeting.get('facebook_positions', []) + \
                        targeting.get('instagram_positions', []) + \
                        targeting.get('messenger_positions', []) + \
                        targeting.get('audience_network_positions', [])
            if posiciones:
                lineas.append(f"  ▪ Posiciones específicas: {', '.join(posiciones)}")

        return "\n".join(lineas)

    except Exception as e:
        return f"Error al extraer la segmentación del Ad Set {adset_id}: {str(e)}"

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
def obtener_campanas(account_input: str, limite: int = 20, pagina_cursor: str = "") -> str:
    """
    Obtener campañas de una cuenta publicitaria con estado y presupuesto.
    - limite: cuántas campañas traer por página (default 20)
    - pagina_cursor: cursor devuelto en la respuesta anterior para ver la siguiente página
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = _resolve_account(account_input)
        params = {'limit': limite}
        if pagina_cursor:
            params['after'] = pagina_cursor
        cursor_obj = cuenta.get_campaigns(fields=[
            'name', 'status', 'effective_status', 'daily_budget', 'lifetime_budget',
            'start_time', 'stop_time', 'objective',
        ], params=params)
        campanas, next_cursor = _paginar(cursor_obj, limite)
        if not campanas:
            return f"No se encontraron campañas para la cuenta '{account_input}'."
        resultados = [f"Campañas en '{account_input}' ({len(campanas)} mostradas):\n"]
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
            estado = _traductor_estado(c.get('effective_status') or c.get('status', ''))
            resultados.append(
                f"- {c['name']} (ID: {c['id']})\n"
                f"  Estado: {estado} | Objetivo: {objetivo}\n"
                f"  Presupuesto: {presupuesto}\n"
                f"  Inicio: {inicio} | Fin: {fin}"
            )
        if next_cursor:
            resultados.append(f"\n📄 Siguiente página → pagina_cursor='{next_cursor}'")
        return "\n\n".join(resultados)
    except Exception as e:
        return f"Error al consultar la API de Meta: {str(e)}"


@mcp.tool()
def obtener_campanas_activas(account_input: str, limite: int = 20, pagina_cursor: str = "") -> str:
    """
    Obtener campañas ACTIVE de una cuenta publicitaria.
    - limite: cuántas traer por página (default 20)
    - pagina_cursor: cursor de la respuesta anterior para ver más
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = _resolve_account(account_input)
        params = {'effective_status': ['ACTIVE'], 'limit': limite}
        if pagina_cursor:
            params['after'] = pagina_cursor
        cursor_obj = cuenta.get_campaigns(
            fields=['name', 'status', 'daily_budget', 'objective'],
            params=params,
        )
        campanas, next_cursor = _paginar(cursor_obj, limite)
        if not campanas:
            return f"No hay campañas activas en la cuenta '{account_input}'."
        resultados = [f"Campañas activas ({len(campanas)} mostradas):\n"]
        for c in campanas:
            presupuesto = c.get('daily_budget')
            p_str = f"${int(presupuesto)/100:.2f}/día" if presupuesto else "presupuesto variable"
            objetivo = c.get('objective', 'N/A')
            resultados.append(
                f"- {c['name']} (ID: {c['id']}) | Objetivo: {objetivo} | Inversión: {p_str}"
            )
        if next_cursor:
            resultados.append(f"\n📄 Siguiente página → pagina_cursor='{next_cursor}'")
        return "\n".join(resultados)
    except Exception as e:
        return f"Error al consultar campañas activas: {str(e)}"


# ─────────────────────────────────────────────
# CONSULTA DE CONJUNTOS DE ANUNCIOS (AD SETS)
# ─────────────────────────────────────────────

@mcp.tool()
def obtener_conjuntos(account_input: str, campaign_id: str = "", limite: int = 20, pagina_cursor: str = "") -> str:
    """
    Obtener conjuntos de anuncios (Ad Sets) de una cuenta o campaña específica.
    - account_input: ID o nombre de la cuenta publicitaria
    - campaign_id: (opcional) filtra los conjuntos de una campaña específica
    - limite: cuántos conjuntos traer por página (default 20)
    - pagina_cursor: cursor devuelto en la respuesta anterior para ver la siguiente página
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        params = {'limit': limite}
        if pagina_cursor:
            params['after'] = pagina_cursor

        if campaign_id:
            cursor_obj = Campaign(campaign_id.strip()).get_ad_sets(
                fields=['name', 'status', 'effective_status', 'daily_budget', 'lifetime_budget', 'campaign_id'],
                params=params,
            )
            origen = f"campaña '{campaign_id}'"
        else:
            cuenta = _resolve_account(account_input)
            cursor_obj = cuenta.get_ad_sets(
                fields=['name', 'status', 'effective_status', 'daily_budget', 'lifetime_budget', 'campaign_id'],
                params=params,
            )
            origen = f"cuenta '{account_input}'"

        conjuntos, next_cursor = _paginar(cursor_obj, limite)
        if not conjuntos:
            return f"No se encontraron conjuntos de anuncios en {origen}."

        resultados = [f"Conjuntos de anuncios en {origen} ({len(conjuntos)} mostrados):\n"]
        for cs in conjuntos:
            daily = cs.get('daily_budget')
            lifetime = cs.get('lifetime_budget')
            if daily:
                presupuesto = f"${int(daily)/100:.2f}/día"
            elif lifetime:
                presupuesto = f"${int(lifetime)/100:.2f} total"
            else:
                presupuesto = "heredado de campaña"
            estado = _traductor_estado(cs.get('effective_status', ''))
            resultados.append(
                f"- {cs['name']} (ID: {cs['id']})\n"
                f"  Estado: {estado} | Presupuesto: {presupuesto}\n"
                f"  Campaña ID: {cs.get('campaign_id', 'N/A')}"
            )
        if next_cursor:
            resultados.append(f"\n📄 Siguiente página → pagina_cursor='{next_cursor}'")
        return "\n\n".join(resultados)
    except Exception as e:
        return f"Error al consultar los conjuntos de anuncios: {str(e)}"


@mcp.tool()
def obtener_anuncios(account_input: str, adset_id: str = "", campaign_id: str = "", limite: int = 20, pagina_cursor: str = "") -> str:
    """
    Obtener anuncios (Ads) de una cuenta, campaña o conjunto de anuncios específico.
    - account_input: ID o nombre de la cuenta publicitaria
    - adset_id: (opcional) filtra los anuncios de un conjunto específico
    - campaign_id: (opcional) filtra los anuncios de una campaña específica
    - limite: cuántos anuncios traer por página (default 20)
    - pagina_cursor: cursor devuelto en la respuesta anterior para ver la siguiente página
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        params = {'limit': limite}
        if pagina_cursor:
            params['after'] = pagina_cursor
        fields = ['name', 'status', 'effective_status', 'adset_id', 'campaign_id']

        if adset_id:
            cursor_obj = AdSet(adset_id.strip()).get_ads(fields=fields, params=params)
            origen = f"conjunto '{adset_id}'"
        elif campaign_id:
            cursor_obj = Campaign(campaign_id.strip()).get_ads(fields=fields, params=params)
            origen = f"campaña '{campaign_id}'"
        else:
            cuenta = _resolve_account(account_input)
            cursor_obj = cuenta.get_ads(fields=fields, params=params)
            origen = f"cuenta '{account_input}'"

        anuncios, next_cursor = _paginar(cursor_obj, limite)
        if not anuncios:
            return f"No se encontraron anuncios en {origen}."

        resultados = [f"Anuncios en {origen} ({len(anuncios)} mostrados):\n"]
        for a in anuncios:
            estado = _traductor_estado(a.get('effective_status') or a.get('status', ''))
            resultados.append(
                f"- {a.get('name', 'Sin nombre')} (ID: {a['id']})\n"
                f"  Estado: {estado}\n"
                f"  Conjunto ID: {a.get('adset_id', 'N/A')} | Campaña ID: {a.get('campaign_id', 'N/A')}"
            )
        if next_cursor:
            resultados.append(f"\n📄 Siguiente página → pagina_cursor='{next_cursor}'")
        return "\n\n".join(resultados)
    except Exception as e:
        return f"Error al consultar los anuncios: {str(e)}"


# ─────────────────────────────────────────────
# GESTIÓN DE ESTADOS (ENCENDER / APAGAR)
# ─────────────────────────────────────────────

@mcp.tool()
def obtener_todas_campanas_activas(limite_por_cuenta: int = 10) -> str:
    """
    Obtener campañas activas de todas las cuentas accesibles.
    - limite_por_cuenta: máximo de campañas a mostrar por cuenta (default 10)
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuentas = User('me').get_ad_accounts(fields=['id', 'name'])
        if not cuentas:
            return "No se encontraron cuentas publicitarias asociadas al token."

        resultados = []
        total = 0
        for cuenta in cuentas:
            account_id = cuenta['id']
            account_name = cuenta.get('name', account_id)
            cursor_obj = AdAccount(account_id).get_campaigns(
                fields=['name', 'daily_budget', 'objective'],
                params={'effective_status': ['ACTIVE'], 'limit': limite_por_cuenta},
            )
            campanas, next_cursor = _paginar(cursor_obj, limite_por_cuenta)
            if campanas:
                hay_mas = f" (y más...)" if next_cursor else ""
                resultados.append(f"\nCuenta: {account_name} ({account_id}) — {len(campanas)} activa(s){hay_mas}:")
                for c in campanas:
                    daily = c.get('daily_budget')
                    presupuesto = f"${int(daily)/100:.0f}/día" if daily else "no definido"
                    objetivo = c.get('objective', 'N/A')
                    resultados.append(f"  - {c['name']} | Objetivo: {objetivo} | Presupuesto: {presupuesto}")
                total += len(campanas)

        if not resultados:
            return "No hay campañas activas en ninguna de las cuentas accesibles."

        return f"Total campañas activas (mostrando hasta {limite_por_cuenta} por cuenta): {total}" + "".join(resultados)
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
def modificar_presupuesto_conjunto(adset_id: str, nuevo_presupuesto: float, tipo_presupuesto: str) -> str:
    """
    Ajusta el presupuesto de un conjunto de anuncios (Ad Set) — útil en cuentas con ABO.
    - adset_id: ID del conjunto de anuncios
    - nuevo_presupuesto: monto en moneda local (ej: 500.00)
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
        conjunto = AdSet(adset_id)
        conjunto.api_update(params={campo: monto_centavos})
        return f"💰 Presupuesto {tipo} del conjunto {adset_id} actualizado a ${nuevo_presupuesto:,.2f}."
    except Exception as e:
        return f"No se pudo actualizar el presupuesto del conjunto: {str(e)}"


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
def reporte_rendimiento(account_input: str, fecha_inicio: str, fecha_fin: str, limite: int = 25, pagina_cursor: str = "") -> str:
    """
    Obtener métricas clave (KPIs) de la cuenta para un rango de fechas.
    - account_input: ID o nombre de la cuenta publicitaria
    - fecha_inicio / fecha_fin: formato YYYY-MM-DD
    - limite: campañas por página (default 25)
    - pagina_cursor: cursor de la respuesta anterior para ver más
    Métricas: impresiones, clics, CTR, gasto, CPM, CPC, conversiones, CPA, ROAS.
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = _resolve_account(account_input)
        params = {
            'time_range': {'since': fecha_inicio, 'until': fecha_fin},
            'level': 'campaign',
            'limit': limite,
        }
        if pagina_cursor:
            params['after'] = pagina_cursor
        cursor_obj = cuenta.get_insights(
            fields=[
                'campaign_name', 'impressions', 'clicks', 'ctr', 'spend',
                'cpm', 'cpc', 'actions', 'cost_per_action_type', 'purchase_roas',
            ],
            params=params,
        )
        insights, next_cursor = _paginar(cursor_obj, limite)
        if not insights:
            return f"No hay datos de rendimiento para el período {fecha_inicio} → {fecha_fin}"

        lineas = [f"Reporte de rendimiento: {fecha_inicio} → {fecha_fin} ({len(insights)} campañas)\n"]
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
        if next_cursor:
            lineas.append(f"\n📄 Siguiente página → pagina_cursor='{next_cursor}'")
        return "\n".join(lineas)
    except Exception as e:
        return f"Error al obtener reporte de rendimiento: {str(e)}"


@mcp.tool()
def reporte_rendimiento_todas(fecha_inicio: str, fecha_fin: str, limite_por_cuenta: int = 20) -> str:
    """
    Obtener métricas clave (KPIs) de todas las cuentas publicitarias accesibles para un rango de fechas.
    - fecha_inicio / fecha_fin: formato YYYY-MM-DD
    - limite_por_cuenta: máximo de campañas a mostrar por cuenta (default 20)
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

            cursor_obj = AdAccount(account_id).get_insights(
                fields=[
                    'campaign_name', 'impressions', 'clicks', 'ctr', 'spend',
                    'cpm', 'cpc', 'actions', 'cost_per_action_type', 'purchase_roas',
                ],
                params={
                    'time_range': {'since': fecha_inicio, 'until': fecha_fin},
                    'level': 'campaign',
                    'limit': limite_por_cuenta,
                },
            )
            insights, next_cursor = _paginar(cursor_obj, limite_por_cuenta)

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
            if next_cursor:
                lineas.append(f"  📄 Hay más campañas en esta cuenta (usa reporte_rendimiento con pagina_cursor)")

        return "\n".join(lineas)
    except Exception as e:
        return f"Error al obtener reporte de rendimiento: {str(e)}"


@mcp.tool()
def reporte_rendimiento_desglosado(account_input: str, fecha_inicio: str, fecha_fin: str, desglose: str, limite: int = 30, pagina_cursor: str = "") -> str:
    """
    Desglosa los resultados por segmento para saber a qué público o canal le va mejor.
    - account_input: ID o nombre de la cuenta
    - fecha_inicio / fecha_fin: formato YYYY-MM-DD
    - desglose: 'age' (edades), 'gender' (género), o 'publisher_platform' (Facebook vs Instagram)
    - limite: filas por página (default 30)
    - pagina_cursor: cursor de la respuesta anterior para ver más
    """
    if not _credenciales_ok():
        return _error_credenciales()
    desglose = desglose.strip().lower()
    titulos_desglose = {'age': 'Edades', 'gender': 'Géneros', 'publisher_platform': 'Plataformas (FB/IG)'}
    titulo_actual = titulos_desglose.get(desglose, desglose.upper())
    try:
        cuenta = _resolve_account(account_input)
        params = {
            'time_range': {'since': fecha_inicio, 'until': fecha_fin},
            'level': 'campaign',
            'breakdowns': [desglose],
            'limit': limite,
        }
        if pagina_cursor:
            params['after'] = pagina_cursor
        cursor_obj = cuenta.get_insights(
            fields=['campaign_name', 'impressions', 'clicks', 'ctr', 'spend'],
            params=params,
        )
        insights, next_cursor = _paginar(cursor_obj, limite)
        if not insights:
            return f"No hay datos para desglosar en el período {fecha_inicio} → {fecha_fin}."

        lineas = [f"Análisis de Rendimiento por {titulo_actual} ({fecha_inicio} → {fecha_fin}) — {len(insights)} filas\n"]
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
        if next_cursor:
            lineas.append(f"\n📄 Siguiente página → pagina_cursor='{next_cursor}'")
        return "\n".join(lineas)
    except Exception as e:
        return f"No se pudo construir el reporte desglosado: {str(e)}"


# ─────────────────────────────────────────────
# AUDITORÍA DE CREATIVOS
# ─────────────────────────────────────────────

@mcp.tool()
def obtener_creativos_anuncio(account_input: str, limite: int = 15, pagina_cursor: str = "") -> str:
    """
    Audita los textos y contenidos visuales de los anuncios de la cuenta.
    - limite: creativos por página (default 15)
    - pagina_cursor: cursor de la respuesta anterior para ver más
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = _resolve_account(account_input)
        params = {'limit': limite}
        if pagina_cursor:
            params['after'] = pagina_cursor
        cursor_obj = cuenta.get_ad_creatives(fields=['name', 'title', 'body'], params=params)
        creativos, next_cursor = _paginar(cursor_obj, limite)
        if not creativos:
            return "No se encontraron creativos registrados en esta cuenta."
        lineas = [f"Creativos de anuncios ({len(creativos)} mostrados):\n"]
        for c in creativos:
            lineas.append(
                f"  Anuncio: {c.get('name', 'Sin nombre')} (ID: {c['id']})\n"
                f"    Título: {c.get('title', 'Sin título')}\n"
                f"    Texto:  {c.get('body', 'Sin texto')}\n"
            )
        if next_cursor:
            lineas.append(f"\n📄 Siguiente página → pagina_cursor='{next_cursor}'")
        return "\n".join(lineas)
    except Exception as e:
        return f"Error al leer los creativos: {str(e)}"


# ─────────────────────────────────────────────
# MONITOREO DE ERRORES Y FUGAS DE DINERO
# ─────────────────────────────────────────────

@mcp.tool()
def detectar_fugas_dinero(account_input: str, fecha_inicio: str, fecha_fin: str, limite: int = 30, pagina_cursor: str = "") -> str:
    """
    Analiza la cuenta en busca de campañas que gastan dinero sin generar resultados:
    campañas activas sin conversiones, CTR muy bajo, CPA excesivo, sin entregas.
    - account_input: ID o nombre de la cuenta
    - fecha_inicio / fecha_fin: formato YYYY-MM-DD
    - limite: campañas a analizar por página (default 30)
    - pagina_cursor: cursor de la respuesta anterior para continuar análisis
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = _resolve_account(account_input)
        params = {
            'time_range': {'since': fecha_inicio, 'until': fecha_fin},
            'level': 'campaign',
            'limit': limite,
        }
        if pagina_cursor:
            params['after'] = pagina_cursor
        cursor_obj = cuenta.get_insights(
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
            params=params,
        )
        insights, next_cursor = _paginar(cursor_obj, limite)

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

        pagina_info = f"\n\n📄 Siguiente página → pagina_cursor='{next_cursor}'" if next_cursor else ""

        if not alertas:
            return f"No se detectaron fugas de dinero en el período {fecha_inicio} → {fecha_fin}. Todo parece en orden.{pagina_info}"

        resumen = f"Fugas de dinero detectadas ({fecha_inicio} → {fecha_fin}):\n\n"
        return resumen + "\n\n".join(alertas) + pagina_info

    except Exception as e:
        return f"Error al analizar fugas de dinero: {str(e)}"


@mcp.tool()
def monitorear_errores_cuenta(account_input: str, limite: int = 50) -> str:
    """
    Revisa el estado de campañas, conjuntos y anuncios en busca de errores.
    - account_input: ID o nombre de la cuenta
    - limite: máximo de objetos a revisar por tipo (campañas, conjuntos, anuncios) (default 50)
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        cuenta = _resolve_account(account_input)

        campanas_cur = cuenta.get_campaigns(
            fields=['name', 'status', 'effective_status'],
            params={'limit': limite},
        )
        conjuntos_cur = cuenta.get_ad_sets(
            fields=['name', 'status', 'effective_status', 'issues_info'],
            params={'limit': limite},
        )
        anuncios_cur = cuenta.get_ads(
            fields=['name', 'status', 'effective_status', 'issues_info'],
            params={'limit': limite},
        )

        campanas, _ = _paginar(campanas_cur, limite)
        conjuntos, _ = _paginar(conjuntos_cur, limite)
        anuncios, anuncios_next = _paginar(anuncios_cur, limite)

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

        nota_paginacion = f"\n⚠ Se revisaron los primeros {limite} objetos de cada tipo. Aumenta 'limite' si la cuenta es grande." if anuncios_next else ""

        if not errores:
            return f"No se encontraron errores activos en la cuenta '{account_input}'.{nota_paginacion}"

        return f"Errores detectados en la cuenta '{account_input}':\n\n" + "\n".join(f"⚠ {e}" for e in errores) + nota_paginacion

    except Exception as e:
        return f"Error al monitorear la cuenta: {str(e)}"


if __name__ == "__main__":
    mcp.run()
