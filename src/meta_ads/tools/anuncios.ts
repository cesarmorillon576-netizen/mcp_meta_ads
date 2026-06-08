import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  credencialesOk,
  errorCredenciales,
  errorMeta,
  initApi,
  resolveAccount,
  cursorToArray,
  nextCursor,
  traducirEstado,
  procesarIssues,
} from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdAccount: FBAdAccount, Campaign, AdSet, Ad } = bizSdk;

export function registrarHerramientasAnuncios(server: McpServer) {
  server.registerTool(
    'obtener_anuncios',
    {
      description: 'Obtener anuncios (Ads) de una cuenta, campaña o conjunto específico.',
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
        const fields = ['id', 'name', 'status', 'effective_status', 'adset_id', 'campaign_id', 'issues_info'];
        const sdkParams: Record<string, any> = { limit: limite };
        if (pagina_cursor) sdkParams.after = pagina_cursor;
        initApi();
        let cursor: any;
        let origen: string;
        if (adset_id.trim()) {
          cursor = await new AdSet(adset_id.trim()).getAds(fields, sdkParams);
          origen = `conjunto '${adset_id}'`;
        } else if (campaign_id.trim()) {
          cursor = await new Campaign(campaign_id.trim()).getAds(fields, sdkParams);
          origen = `campaña '${campaign_id}'`;
        } else {
          const accountId = await resolveAccount(account_input);
          cursor = await new FBAdAccount(accountId).getAds(fields, sdkParams);
          origen = `cuenta '${account_input}'`;
        }
        const anuncios = cursorToArray(cursor);
        if (!anuncios?.length)
          return { content: [{ type: 'text', text: `No se encontraron anuncios en ${origen}.` }] };

        const resultados = [`Anuncios en ${origen} (${anuncios.length} mostrados):\n`];

        for (const a of anuncios) {
          const estado = traducirEstado(a.effective_status ?? a.status ?? '');

          const infoErrores = (a.effective_status === 'WITH_ISSUES' || a.effective_status === 'DISAPPROVED')
            ? procesarIssues(a.issues_info) : '';

          resultados.push(
            `- ${a.name ?? 'Sin nombre'} (ID: ${a.id})\n` +
            `  Estado: ${estado}${infoErrores}\n` +
            `  Conjunto ID: ${a.adset_id ?? 'N/A'} | Campaña ID: ${a.campaign_id ?? 'N/A'}`,
          );
        }
        const nc = nextCursor(cursor);
        if (nc) resultados.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
        return { content: [{ type: 'text', text: resultados.join('\n\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al consultar los anuncios: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'cambiar_estado_anuncio',
    {
      description: "Encender o apagar un anuncio individual.",
      inputSchema: {
        ad_id: z.string().describe('ID del anuncio'),
        accion: z.string().describe("'encender' o 'apagar'"),
      },
    },
    async ({ ad_id, accion }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const acc = accion.trim().toLowerCase();
      if (acc !== 'encender' && acc !== 'apagar')
        return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'encender' o 'apagar'" }] };
      try {
        initApi();
        const ad = new Ad(ad_id);
        await ad.update([], { status: acc === 'encender' ? 'ACTIVE' : 'PAUSED' });
        return { content: [{ type: 'text', text: `Anuncio ${ad_id} ${acc === 'encender' ? 'activado' : 'pausado'} correctamente.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al cambiar estado del anuncio', e) }] };
      }
    },
  );
}