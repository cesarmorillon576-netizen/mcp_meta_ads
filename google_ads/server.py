import os
from dotenv import load_dotenv
from mcp.server.FastMCP import FastMCP
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

load_dotenv()

mcp = FastMCP("GoogleAds")

def _get_client() -> GoogleAdsClient:
    return GoogleAdsClient.load_from_dict({
        "developer_token": os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN"),
        "client_id": os.getenv("GOOGLE_ADS_CLIENT_ID"),
        "client_secret": os.getenv("GOOGLE_ADS_CLIENT_SECRET"),
        "refresh_token": os.getenv("GOOGLE_ADS_REFRESH_TOKEN"),
        "login_customer_id": os.getenv("GOOGLE_ADS_LOGIN_CUSTOMER_ID"),
        "use_proto_plus": True,
    })

def _credenciales_ok() -> bool:
    return all([
        os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN"),
        os.getenv("GOOGLE_ADS_CLIENT_ID"),
        os.getenv("GOOGLE_ADS_CLIENT_SECRET"),
        os.getenv("GOOGLE_ADS_REFRESH_TOKEN"),
    ])

def _error_credenciales() -> str:
    return "Error: No se encontraron las credenciales de Google Ads en el archivo .env"

def _micros_a_pesos(micros) -> str:
    return f"${int(micros) / 1_000_000:.2f}"


# ─────────────────────────────────────────────
# CONSULTA DE CAMPAÑAS
# ─────────────────────────────────────────────

@mcp.tool()
def obtener_campanas(customer_id: str) -> str:
    """Obtener todas las campañas de una cuenta de Google Ads con su estado y presupuesto."""
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        client = _get_client()
        ga_service = client.get_service("GoogleAdsService")
        query = """
            SELECT campaign.id, campaign.name, campaign.status,
                   campaign_budget.amount_micros
            FROM campaign
            ORDER BY campaign.name
        """
        response = ga_service.search_stream(customer_id=customer_id, query=query)
        resultados = []
        for batch in response:
            for row in batch.results:
                c = row.campaign
                presupuesto = _micros_a_pesos(row.campaign_budget.amount_micros)
                resultados.append(f"- {c.name} | Estado: {c.status.name} | Presupuesto: {presupuesto}/día")
        if not resultados:
            return f"No se encontraron campañas para la cuenta {customer_id}"
        return f"Campañas encontradas:\n" + "\n".join(resultados)
    except GoogleAdsException as e:
        return f"Error de Google Ads API: {e.failure}"
    except Exception as e:
        return f"Error al consultar campañas: {str(e)}"


@mcp.tool()
def obtener_campanas_activas(customer_id: str) -> str:
    """Obtener solo las campañas ENABLED (activas) de una cuenta de Google Ads."""
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        client = _get_client()
        ga_service = client.get_service("GoogleAdsService")
        query = """
            SELECT campaign.id, campaign.name, campaign.status,
                   campaign.advertising_channel_type,
                   campaign_budget.amount_micros
            FROM campaign
            WHERE campaign.status = 'ENABLED'
            ORDER BY campaign.name
        """
        response = ga_service.search_stream(customer_id=customer_id, query=query)
        resultados = []
        for batch in response:
            for row in batch.results:
                c = row.campaign
                presupuesto = _micros_a_pesos(row.campaign_budget.amount_micros)
                canal = c.advertising_channel_type.name
                resultados.append(f"- {c.name} | Canal: {canal} | Presupuesto: {presupuesto}/día")
        if not resultados:
            return f"No hay campañas activas en la cuenta {customer_id}"
        return f"Campañas activas ({len(resultados)}):\n" + "\n".join(resultados)
    except GoogleAdsException as e:
        return f"Error de Google Ads API: {e.failure}"
    except Exception as e:
        return f"Error al consultar campañas activas: {str(e)}"


@mcp.tool()
def obtener_todas_campanas_activas() -> str:
    """Obtener campañas activas de todas las cuentas accesibles con las credenciales configuradas."""
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        client = _get_client()
        customer_service = client.get_service("CustomerService")
        clientes = customer_service.list_accessible_customers()

        resultados = []
        for resource_name in clientes.resource_names:
            customer_id = resource_name.split("/")[-1]
            try:
                ga_service = client.get_service("GoogleAdsService")
                query = """
                    SELECT campaign.id, campaign.name,
                           campaign.advertising_channel_type,
                           campaign_budget.amount_micros,
                           customer.descriptive_name
                    FROM campaign
                    WHERE campaign.status = 'ENABLED'
                    ORDER BY campaign.name
                """
                response = ga_service.search_stream(customer_id=customer_id, query=query)
                campanas = []
                nombre_cuenta = customer_id
                for batch in response:
                    for row in batch.results:
                        nombre_cuenta = row.customer.descriptive_name or customer_id
                        presupuesto = _micros_a_pesos(row.campaign_budget.amount_micros)
                        canal = row.campaign.advertising_channel_type.name
                        campanas.append(f"  - {row.campaign.name} | Canal: {canal} | Presupuesto: {presupuesto}/día")
                if campanas:
                    resultados.append(f"\nCuenta: {nombre_cuenta} ({customer_id}) — {len(campanas)} activa(s):")
                    resultados.extend(campanas)
            except Exception:
                continue

        if not resultados:
            return "No hay campañas activas en ninguna de las cuentas accesibles."
        total = sum(1 for r in resultados if r.startswith("  -"))
        return f"Total campañas activas: {total}" + "".join(resultados)
    except Exception as e:
        return f"Error al consultar cuentas: {str(e)}"


# ─────────────────────────────────────────────
# GESTIÓN DE ESTADOS (ENCENDER / APAGAR)
# ─────────────────────────────────────────────

@mcp.tool()
def cambiar_estado_campana(customer_id: str, campaign_id: str, accion: str) -> str:
    """
    Encender o apagar una campaña de Google Ads.
    - customer_id: ID de la cuenta (sin guiones)
    - campaign_id: ID de la campaña
    - accion: 'encender' o 'apagar'
    """
    if not _credenciales_ok():
        return _error_credenciales()
    accion = accion.strip().lower()
    if accion not in ("encender", "apagar"):
        return "Error: 'accion' debe ser 'encender' o 'apagar'"
    try:
        client = _get_client()
        campaign_service = client.get_service("CampaignService")
        campaign_operation = client.get_type("CampaignOperation")
        status_enum = client.enums.CampaignStatusEnum
        campaign = campaign_operation.update
        campaign.resource_name = campaign_service.campaign_path(customer_id, campaign_id)
        campaign.status = status_enum.ENABLED if accion == "encender" else status_enum.PAUSED
        client.copy_from(campaign_operation.update_mask, protobuf_helpers.field_mask(None, campaign._pb))
        campaign_service.mutate_campaigns(customer_id=customer_id, operations=[campaign_operation])
        return f"Campaña {campaign_id} {'activada' if accion == 'encender' else 'pausada'} correctamente."
    except GoogleAdsException as e:
        return f"Error de Google Ads API: {e.failure}"
    except Exception as e:
        return f"Error al cambiar estado: {str(e)}"


@mcp.tool()
def cambiar_estado_grupo(customer_id: str, ad_group_id: str, accion: str) -> str:
    """
    Encender o apagar un grupo de anuncios (Ad Group).
    - customer_id: ID de la cuenta
    - ad_group_id: ID del grupo de anuncios
    - accion: 'encender' o 'apagar'
    """
    if not _credenciales_ok():
        return _error_credenciales()
    accion = accion.strip().lower()
    if accion not in ("encender", "apagar"):
        return "Error: 'accion' debe ser 'encender' o 'apagar'"
    try:
        client = _get_client()
        ad_group_service = client.get_service("AdGroupService")
        ad_group_operation = client.get_type("AdGroupOperation")
        status_enum = client.enums.AdGroupStatusEnum
        ad_group = ad_group_operation.update
        ad_group.resource_name = ad_group_service.ad_group_path(customer_id, ad_group_id)
        ad_group.status = status_enum.ENABLED if accion == "encender" else status_enum.PAUSED
        client.copy_from(ad_group_operation.update_mask, protobuf_helpers.field_mask(None, ad_group._pb))
        ad_group_service.mutate_ad_groups(customer_id=customer_id, operations=[ad_group_operation])
        return f"Grupo {ad_group_id} {'activado' if accion == 'encender' else 'pausado'} correctamente."
    except GoogleAdsException as e:
        return f"Error de Google Ads API: {e.failure}"
    except Exception as e:
        return f"Error al cambiar estado del grupo: {str(e)}"


@mcp.tool()
def cambiar_estado_anuncio(customer_id: str, ad_group_id: str, ad_id: str, accion: str) -> str:
    """
    Encender o apagar un anuncio individual.
    - customer_id: ID de la cuenta
    - ad_group_id: ID del grupo de anuncios al que pertenece
    - ad_id: ID del anuncio
    - accion: 'encender' o 'apagar'
    """
    if not _credenciales_ok():
        return _error_credenciales()
    accion = accion.strip().lower()
    if accion not in ("encender", "apagar"):
        return "Error: 'accion' debe ser 'encender' o 'apagar'"
    try:
        client = _get_client()
        ad_group_ad_service = client.get_service("AdGroupAdService")
        ad_group_ad_operation = client.get_type("AdGroupAdOperation")
        status_enum = client.enums.AdGroupAdStatusEnum
        ad_group_ad = ad_group_ad_operation.update
        ad_group_ad.resource_name = ad_group_ad_service.ad_group_ad_path(customer_id, ad_group_id, ad_id)
        ad_group_ad.status = status_enum.ENABLED if accion == "encender" else status_enum.PAUSED
        client.copy_from(ad_group_ad_operation.update_mask, protobuf_helpers.field_mask(None, ad_group_ad._pb))
        ad_group_ad_service.mutate_ad_group_ads(customer_id=customer_id, operations=[ad_group_ad_operation])
        return f"Anuncio {ad_id} {'activado' if accion == 'encender' else 'pausado'} correctamente."
    except GoogleAdsException as e:
        return f"Error de Google Ads API: {e.failure}"
    except Exception as e:
        return f"Error al cambiar estado del anuncio: {str(e)}"


# ─────────────────────────────────────────────
# REPORTES DE RENDIMIENTO Y KPIs
# ─────────────────────────────────────────────

@mcp.tool()
def reporte_rendimiento(customer_id: str, fecha_inicio: str, fecha_fin: str) -> str:
    """
    Obtener métricas clave por campaña para un rango de fechas.
    - customer_id: ID de la cuenta
    - fecha_inicio / fecha_fin: formato YYYY-MM-DD
    Métricas: impresiones, clics, CTR, gasto, CPM, CPC, conversiones, CPA, ROAS.
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        client = _get_client()
        ga_service = client.get_service("GoogleAdsService")
        query = f"""
            SELECT campaign.name,
                   metrics.impressions, metrics.clicks, metrics.ctr,
                   metrics.cost_micros, metrics.average_cpm, metrics.average_cpc,
                   metrics.conversions, metrics.cost_per_conversion,
                   metrics.conversions_value, metrics.value_per_conversion
            FROM campaign
            WHERE segments.date BETWEEN '{fecha_inicio}' AND '{fecha_fin}'
              AND metrics.impressions > 0
            ORDER BY metrics.cost_micros DESC
        """
        response = ga_service.search_stream(customer_id=customer_id, query=query)
        lineas = [f"Reporte de rendimiento: {fecha_inicio} → {fecha_fin}\n"]
        for batch in response:
            for row in batch.results:
                m = row.metrics
                roas = (m.conversions_value / (m.cost_micros / 1_000_000)) if m.cost_micros > 0 else 0
                lineas.append(
                    f"Campaña: {row.campaign.name}\n"
                    f"  Impresiones : {m.impressions:,}\n"
                    f"  Clics       : {m.clicks:,}\n"
                    f"  CTR         : {m.ctr * 100:.2f}%\n"
                    f"  Gasto       : {_micros_a_pesos(m.cost_micros)}\n"
                    f"  CPM         : {_micros_a_pesos(m.average_cpm)}\n"
                    f"  CPC         : {_micros_a_pesos(m.average_cpc)}\n"
                    f"  Conversiones: {m.conversions:.0f}\n"
                    f"  CPA         : {_micros_a_pesos(m.cost_per_conversion)}\n"
                    f"  ROAS        : {roas:.2f}\n"
                )
        if len(lineas) == 1:
            return f"No hay datos de rendimiento para el período {fecha_inicio} → {fecha_fin}"
        return "\n".join(lineas)
    except GoogleAdsException as e:
        return f"Error de Google Ads API: {e.failure}"
    except Exception as e:
        return f"Error al obtener reporte: {str(e)}"


# ─────────────────────────────────────────────
# MONITOREO DE ERRORES Y FUGAS DE DINERO
# ─────────────────────────────────────────────

@mcp.tool()
def detectar_fugas_dinero(customer_id: str, fecha_inicio: str, fecha_fin: str) -> str:
    """
    Detecta campañas que gastan dinero sin generar resultados:
    sin conversiones, CTR bajo, CPA elevado.
    - customer_id: ID de la cuenta
    - fecha_inicio / fecha_fin: formato YYYY-MM-DD
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        client = _get_client()
        ga_service = client.get_service("GoogleAdsService")
        query = f"""
            SELECT campaign.name,
                   metrics.impressions, metrics.clicks, metrics.ctr,
                   metrics.cost_micros, metrics.conversions,
                   metrics.cost_per_conversion
            FROM campaign
            WHERE segments.date BETWEEN '{fecha_inicio}' AND '{fecha_fin}'
              AND metrics.impressions > 0
        """
        response = ga_service.search_stream(customer_id=customer_id, query=query)
        alertas = []
        for batch in response:
            for row in batch.results:
                m = row.metrics
                nombre = row.campaign.name
                gasto = m.cost_micros / 1_000_000
                ctr = m.ctr * 100
                cpa = m.cost_per_conversion / 1_000_000 if m.cost_per_conversion else 0
                problemas = []
                if gasto > 0 and m.conversions == 0:
                    problemas.append(f"Gasto ${gasto:.2f} sin conversiones")
                if m.impressions > 1000 and ctr < 0.5:
                    problemas.append(f"CTR muy bajo ({ctr:.2f}%) con {m.impressions:,} impresiones")
                if cpa > 100:
                    problemas.append(f"CPA elevado: ${cpa:.2f} por conversión")
                if problemas:
                    alertas.append(f"Campaña: {nombre}\n" + "\n".join(f"  - {p}" for p in problemas))
        if not alertas:
            return f"No se detectaron fugas de dinero en {fecha_inicio} → {fecha_fin}."
        return f"Fugas detectadas ({fecha_inicio} → {fecha_fin}):\n\n" + "\n\n".join(alertas)
    except GoogleAdsException as e:
        return f"Error de Google Ads API: {e.failure}"
    except Exception as e:
        return f"Error al analizar fugas: {str(e)}"


@mcp.tool()
def monitorear_errores_cuenta(customer_id: str) -> str:
    """
    Revisa campañas, grupos y anuncios con estado de error, desaprobación o problemas de entrega.
    - customer_id: ID de la cuenta de Google Ads
    """
    if not _credenciales_ok():
        return _error_credenciales()
    try:
        client = _get_client()
        ga_service = client.get_service("GoogleAdsService")
        query = """
            SELECT campaign.name, campaign.status,
                   ad_group.name, ad_group.status,
                   ad_group_ad.ad.id, ad_group_ad.ad.name,
                   ad_group_ad.status, ad_group_ad.policy_summary.approval_status
            FROM ad_group_ad
            WHERE ad_group_ad.status != 'REMOVED'
        """
        response = ga_service.search_stream(customer_id=customer_id, query=query)
        errores = []
        estados_problema = {"PAUSED", "DISAPPROVED", "UNKNOWN"}
        aprobacion_problema = {"DISAPPROVED", "AREA_OF_INTEREST_ONLY"}
        for batch in response:
            for row in batch.results:
                aprobacion = row.ad_group_ad.policy_summary.approval_status.name
                if aprobacion in aprobacion_problema:
                    errores.append(
                        f"[ANUNCIO RECHAZADO] Campaña: {row.campaign.name} | "
                        f"Grupo: {row.ad_group.name} | "
                        f"Anuncio ID: {row.ad_group_ad.ad.id} | "
                        f"Aprobación: {aprobacion}"
                    )
        if not errores:
            return f"No se encontraron errores activos en la cuenta {customer_id}."
        return f"Errores en cuenta {customer_id}:\n\n" + "\n".join(f"⚠ {e}" for e in errores)
    except GoogleAdsException as e:
        return f"Error de Google Ads API: {e.failure}"
    except Exception as e:
        return f"Error al monitorear cuenta: {str(e)}"


if __name__ == "__main__":
    mcp.run()
