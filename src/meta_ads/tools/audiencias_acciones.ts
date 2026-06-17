import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, errorMeta, initApi, resolveAccount } from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdAccount: FBAdAccount } = bizSdk;

export function registrarHerramientasAudienciasAcciones(server: McpServer) {

  server.registerTool(
    'crear_audiencia',
    {
      description: "Crea una audiencia nueva. Modo 'lookalike': público similar a una audiencia de origen existente. Modo 'website': retargeting de visitantes del sitio vía píxel. Devuelve el ID para usar en modificar_audiencias_conjunto.",
      inputSchema: {
        account_input: z.string().describe('ID o nombre de la cuenta publicitaria'),
        modo: z.string().describe("'lookalike' o 'website'"),
        nombre: z.string().describe('Nombre de la nueva audiencia'),
        origen_id: z.string().default('').describe("Modo lookalike: ID de la audiencia de origen (semilla)"),
        pais: z.string().default('MX').describe('Modo lookalike: país objetivo (ISO), ej "MX"'),
        ratio: z.number().default(0.01).describe('Modo lookalike: similitud 0.01–0.20 (0.01 = 1% más parecido)'),
        pixel_id: z.string().default('').describe('Modo website: ID del píxel'),
        dias_retencion: z.number().int().default(30).describe('Modo website: ventana de días de visitantes a incluir (máx 180)'),
        url_contiene: z.string().default('').describe('Modo website: filtrar visitantes cuya URL contenga este texto (opcional)'),
      },
    },
    async ({ account_input, modo, nombre, origen_id, pais, ratio, pixel_id, dias_retencion, url_contiene }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const m = modo.trim().toLowerCase();
      try {
        initApi();
        const accountId = await resolveAccount(account_input);
        const cuenta = new FBAdAccount(accountId);
        let params: Record<string, any>;
        if (m === 'lookalike') {
          if (!origen_id) return { content: [{ type: 'text', text: "Error: el modo 'lookalike' requiere 'origen_id'." }] };
          const r = Math.min(Math.max(ratio, 0.01), 0.20);
          params = {
            name: nombre,
            subtype: 'LOOKALIKE',
            origin_audience_id: origen_id,
            lookalike_spec: { type: 'custom_ratio', ratio: r, country: pais.trim().toUpperCase() },
          };
        } else if (m === 'website') {
          if (!pixel_id) return { content: [{ type: 'text', text: "Error: el modo 'website' requiere 'pixel_id'." }] };
          const dias = Math.min(Math.max(Math.trunc(dias_retencion), 1), 180);
          const filtros: any[] = [{ field: 'event', operator: 'eq', value: 'PageView' }];
          if (url_contiene.trim()) filtros.push({ field: 'url', operator: 'i_contains', value: url_contiene.trim() });
          params = {
            name: nombre,
            subtype: 'WEBSITE',
            prefill: true,
            rule: {
              inclusions: {
                operator: 'or',
                rules: [{
                  event_sources: [{ type: 'pixel', id: pixel_id }],
                  retention_seconds: dias * 86400,
                  filter: { operator: 'and', filters: filtros },
                }],
              },
            },
          };
        } else {
          return { content: [{ type: 'text', text: "Error: 'modo' debe ser 'lookalike' o 'website'." }] };
        }
        const aud = await cuenta.createCustomAudience([], params);
        const detalle = m === 'lookalike'
          ? `\n- Origen: ${origen_id}\n- País: ${pais.toUpperCase()} | Similitud: ${(Math.min(Math.max(ratio, 0.01), 0.20) * 100).toFixed(0)}%`
          : `\n- Píxel: ${pixel_id}\n- Retención: ${Math.min(Math.max(Math.trunc(dias_retencion), 1), 180)} días${url_contiene.trim() ? `\n- URL contiene: "${url_contiene.trim()}"` : ''}`;
        return { content: [{ type: 'text', text: `👥 Audiencia "${nombre}" creada (${m}).\n- ID: ${(aud as any).id}${detalle}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al crear la audiencia', e) }] };
      }
    },
  );
}
