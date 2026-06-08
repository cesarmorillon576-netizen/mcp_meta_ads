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
  presupuestoStr,
  traducirEstado,
  procesarIssues,
  formatSegmentacion,
  truncar
} from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdAccount: FBAdAccount, Campaign, AdSet } = bizSdk;

export function registrarHerramientasConjuntos(server: McpServer) {
  server.registerTool(
    'obtener_config_mensajeria_adset',
    {
      description: 'Obtiene la configuracion de mensajería para un Ad Set leyendo fields desde SDK',
      inputSchema: {
        adsset_id: z.string().describe('ID del conjunto de anuncios'),
        debug: z.boolean().optional().describe('Mostrar información de depuración')
      }
    },
    async ({ adsset_id, debug }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        initApi();

        const baseFields = [
          'id', 'name', 'status', 'effective_status',
          'daily_budget', 'lifetime_budget', 'campaign_id',
          'optimization_goal', 'destination_type', 'billing_event',
          'promoted_object', 'targeting',
        ];

        const candidateFields = [
          'attribution_spec',
          'is_dynamic_creative',
          'configured_status',
        ];

        const adset = new AdSet(adsset_id);
        const extra: Record<string, any> = {};

        try {
          await adset.read([...baseFields, ...candidateFields]);
          for (const field of candidateFields) extra[field] = (adset as any)[field] ?? null;
        } catch {
          await adset.read(baseFields);
          for (const field of candidateFields) {
            try {
              const tmp = new AdSet(adsset_id);
              await tmp.read([field]);
              extra[field] = (tmp as any)[field] ?? null;
            } catch {
              extra[field] = 'No disponible';
            }
          }
        }

        if (debug) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ base: adset, extra }, null, 2)
            }]
          };
        }

        const d = adset as any;
        const lines = [
          `Configuración de mensajería (Ad Set) — ${adsset_id}`,
          `- name: ${d.name}`,
          `- status: ${d.effective_status ?? d.status}`,
          `- optimization_goal: ${d.optimization_goal ?? 'N/A'}`,
          `- destination_type: ${d.destination_type ?? 'N/A'}`,
          `- billing_event: ${d.billing_event ?? 'N/A'}`,
          `- promoted_object: ${d.promoted_object ? JSON.stringify(d.promoted_object) : 'N/A'}`,
          `- targeting (resumen): ${d.targeting ? truncar(JSON.stringify(d.targeting), 200) : 'N/A'}`,
        ];

        for (const [k, v] of Object.entries(extra)) {
          const display = v === null ? 'null'
            : typeof v === 'object' ? JSON.stringify(v)
              : String(v);
          lines.push(`- ${k}: ${display}`);
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };

      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al consultar configuración de mensajería: ${e.message}` }] };
      }
    }
  );

  server.registerTool(
    'obtener_conjuntos',
    {
      description: 'Obtener conjuntos de anuncios (Ad Sets) de una cuenta o campaña específica.',
      inputSchema: {
        account_input: z.string().describe('ID o nombre de la cuenta publicitaria'),
        campaign_id: z.string().default('').describe('ID de campaña para filtrar (opcional)'),
        limite: z.number().int().default(20),
        pagina_cursor: z.string().default(''),
      },
    },
    async ({ account_input, campaign_id, limite, pagina_cursor }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const fields = ['id', 'name', 'status', 'effective_status', 'daily_budget', 'lifetime_budget', 'campaign_id', 'optimization_goal', 'destination_type', 'billing_event', 'issues_info'];
        const sdkParams: Record<string, any> = { limit: limite };
        if (pagina_cursor) sdkParams.after = pagina_cursor;
        initApi();
        let cursor: any;
        let origen: string;
        if (campaign_id.trim()) {
          cursor = await new Campaign(campaign_id.trim()).getAdSets(fields, sdkParams);
          origen = `campaña '${campaign_id}'`;
        } else {
          const accountId = await resolveAccount(account_input);
          cursor = await new FBAdAccount(accountId).getAdSets(fields, sdkParams);
          origen = `cuenta '${account_input}'`;
        }
        const conjuntos = cursorToArray(cursor);
        if (!conjuntos?.length)
          return { content: [{ type: 'text', text: `No se encontraron conjuntos de anuncios en ${origen}.` }] };
        const resultados = [`Conjuntos de anuncios en ${origen} (${conjuntos.length} mostrados):\n`];
        for (const cs of conjuntos) {
          const raw = presupuestoStr(cs.daily_budget, cs.lifetime_budget);
          const presupuesto = raw === 'no definido' ? 'heredado de campaña' : raw;
          const estado = traducirEstado(cs.effective_status ?? '');
          const infoErrores = (cs.effective_status === 'WITH_ISSUES' || cs.effective_status === 'DISAPPROVED')
            ? procesarIssues(cs.issues_info) : '';
          resultados.push(
            `- ${cs.name} (ID: ${cs.id})\n` +
            `  Estado: ${estado}${infoErrores}\n` +
            `  Presupuesto: ${presupuesto}\n` +
            `  Optimización: ${cs.optimization_goal ?? 'N/A'} → ${cs.destination_type ?? 'N/A'}\n` +
            `  Campaña ID: ${cs.campaign_id ?? 'N/A'}`,
          );
        }
        const nc = nextCursor(cursor);
        if (nc) resultados.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
        return { content: [{ type: 'text', text: resultados.join('\n\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al consultar los conjuntos de anuncios: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'obtener_segmentacion_conjunto',
    {
      description: 'Obtiene la segmentación completa (Targeting) de un Ad Set: geografía, demografía, intereses, comportamientos, exclusiones y públicos personalizados.',
      inputSchema: {
        adset_id: z.string().describe('ID del conjunto de anuncios (Ad Set)'),
      },
    },
    async ({ adset_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        initApi();
        const conjunto = new AdSet(adset_id);
        await conjunto.read(['name', 'campaign_id', 'status', 'effective_status', 'targeting']);
        const targeting = conjunto.targeting;
        if (!targeting)
          return { content: [{ type: 'text', text: `El conjunto '${conjunto.name}' (ID: ${adset_id}) no tiene datos de segmentación definidos.` }] };

        const lineas = [
          `🎯 Segmentación Detallada del Conjunto: ${conjunto.name} (ID: ${adset_id})`,
          `   Estado: ${traducirEstado(conjunto.effective_status ?? '')}`,
          '─────────────────────────────────────────────',
          ...formatSegmentacion(targeting),
        ];

        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al extraer la segmentación del Ad Set ${adset_id}: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'cambiar_estado_conjunto',
    {
      description: "Encender o apagar un conjunto de anuncios (Ad Set).",
      inputSchema: {
        adset_id: z.string().describe('ID del conjunto de anuncios'),
        accion: z.string().describe("'encender' o 'apagar'"),
      },
    },
    async ({ adset_id, accion }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const acc = accion.trim().toLowerCase();
      if (acc !== 'encender' && acc !== 'apagar')
        return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'encender' o 'apagar'" }] };
      try {
        initApi();
        const adset = new AdSet(adset_id);
        await adset.update([], { status: acc === 'encender' ? 'ACTIVE' : 'PAUSED' });
        return { content: [{ type: 'text', text: `Conjunto ${adset_id} ${acc === 'encender' ? 'activado' : 'pausado'} correctamente.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al cambiar estado del conjunto', e) }] };
      }
    },
  );

  server.registerTool(
    'modificar_presupuesto_conjunto',
    {
      description: "Ajusta el presupuesto de un Ad Set (útil en cuentas con ABO).",
      inputSchema: {
        adset_id: z.string(),
        nuevo_presupuesto: z.number().describe('Monto en moneda local, ej: 500.00'),
        tipo_presupuesto: z.string().describe("'diario' o 'total'"),
      },
    },
    async ({ adset_id, nuevo_presupuesto, tipo_presupuesto }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const tipo = tipo_presupuesto.trim().toLowerCase();
      if (tipo !== 'diario' && tipo !== 'total')
        return { content: [{ type: 'text', text: "Error: 'tipo_presupuesto' debe ser 'diario' o 'total'." }] };
      const campo = tipo === 'diario' ? 'daily_budget' : 'lifetime_budget';
      const centavos = Math.round(nuevo_presupuesto * 100);
      try {
        initApi();
        const adset = new AdSet(adset_id);
        await adset.update([], { [campo]: centavos });
        return { content: [{ type: 'text', text: `💰 Presupuesto ${tipo} del conjunto ${adset_id} actualizado a $${nuevo_presupuesto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('No se pudo actualizar el presupuesto del conjunto', e) }] };
      }
    },
  );
}