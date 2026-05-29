import { getApiClient, getServer } from "../builders";
import { getToken } from "../helper";
import {API_BASE} from "../builders";
import { credencialesOk } from "../helper";
import {errorCredenciales} from "../helper";
import { z } from 'zod';
/*lacks of after cursor*/
getServer().registerTool(
  'listar_cuentas_publicitarias',
  { description: 'Listar todas las cuentas de anuncios disponibles con sus nombres e IDs, buscar hasta encontrar la que se solicite, utilizar la paginacion para seguir navegando.' },
  async () => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const data = await getApiClient().fetchData('/me/adaccounts', { fields: 'id,name',limit:200 });
      const json = await data.json();
    return { content: [{ type: 'text', text: JSON.stringify(json) }] };  
  }
);