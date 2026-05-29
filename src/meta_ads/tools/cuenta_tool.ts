import { getApiClient, getServer } from "../builders";
import { getToken } from "../helper";
import {API_BASE} from "../builders";
import { credencialesOk } from "../helper";
import {errorCredenciales} from "../helper";
import { resolveAccount,metaGet,metaPost,nextCursor,presupuestoStr,traducirEstado } from "./anuncio_tool";
import { z } from 'zod';


getServer().registerTool(
  'obtener_anuncios',
  {
    description: 'Obtener anuncios (Ads) de una cuenta, campaña o conjunto específico. Parámetros: account_input, adset_id (opcional), campaign_id (opcional), limite (default 20), pagina_cursor.',
    inputSchema: {
      account_input: z.string().describe('ID o nombre de la cuenta'),
      adset_id: z.string().default('').describe('ID de conjunto de anuncios para filtrar (opcional)'),
      campaign_id: z.string().default('').describe('ID de campaña para filtrar (opcional)'),
      limite: z.number().int().default(20),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, adset_id, campaign_id, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const params: Record<string, unknown> = {
        fields: 'id,name,status,effective_status,adset_id,campaign_id',
        limit: limite,
      };
      if (pagina_cursor) params['after'] = pagina_cursor;
      let endpoint: string;
      let origen: string;
      if (adset_id.trim()) {
        endpoint = `/${adset_id.trim()}/ads`;
        origen = `conjunto '${adset_id}'`;
      } else if (campaign_id.trim()) {
        endpoint = `/${campaign_id.trim()}/ads`;
        origen = `campaña '${campaign_id}'`;
      } else {
        const accountId = await resolveAccount(account_input);
        endpoint = `/${accountId}/ads`;
        origen = `cuenta '${account_input}'`;
      }
      const data = await metaGet(endpoint, params);
      const anuncios = data.data as any[];
      if (!anuncios?.length)
        return { content: [{ type: 'text', text: `No se encontraron anuncios en ${origen}.` }] };
      const resultados = [`Anuncios en ${origen} (${anuncios.length} mostrados):\n`];
      for (const a of anuncios) {
        const estado = traducirEstado(a.effective_status ?? a.status ?? '');
        resultados.push(
          `- ${a.name ?? 'Sin nombre'} (ID: ${a.id})\n` +
          `  Estado: ${estado}\n` +
          `  Conjunto ID: ${a.adset_id ?? 'N/A'} | Campaña ID: ${a.campaign_id ?? 'N/A'}`,
        );
      }
      const nc = nextCursor(data);
      if (nc) resultados.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: resultados.join('\n\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar los anuncios: ${e.message}` }] };
    }
  },
);