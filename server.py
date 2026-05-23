import os
from dotenv import loadt_dotenv
from mcp.server.FastMCP import FastMCP
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount

load_dotenv()

APP_ID = os.getenv('META_APP_ID')
APP_SECRET = os.getenv('META_APP_SECRET')
ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN')

if APP_ID and APP_SECRET and ACCESS_TOKEN:
    FacebookAdsApi.init(APP_ID, APP_SECRET, ACCESS_TOKEN)

mcp = FastMCP("MetaAdsMock")

@mcp.tool()
def obtener_campanas(account_id: str) -> str:
    """"
        Obtener una lista de las campañas activas de una cuenta publiciatria
    """""
    if not APP_ID or not APP_SECRET or not ACCESS_TOKEN:
        return "Error: No se encontraron las credenciales de Meta Ads API"
    
    try:
        cuenta = AdAccount(f'act_{account_id}')
        camp = cuenta.get_campaigns(
            fields = [
                'name',
                'status',
                'daily_budget'
            ])
        
        if not camp:
            return f"No se encontraron campañas para {account_id}"

        resultados = []
        for c in camp:
            presupuesto = c.get('daily_budget', 'no definido')
            resultados.append(f"- Nombre: {c['name']} | Estado: {c['status']} | Presupuesto: {presupuesto}")

        return "Campañas encontradas: \n" + "\n".join(resultados)

    except Exception as e:
        return f"Error al consultar la API de meta: {str(e)}"
    
if __name__ == "__main__":
    mcp.run()