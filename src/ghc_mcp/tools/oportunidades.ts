import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, errGhl, getCliente, resolverLocation, faltaLocation } from './cliente.js';

export function registrarHerramientasOportunidades(server: McpServer): void {
  server.registerTool(
    'obtener_pipelines',
    {
      description: 'Lista los pipelines (embudos de venta) y sus etapas de una ubicación de GoHighLevel. Usa los IDs en buscar_oportunidades.',
      inputSchema: {
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      if (!loc) return faltaLocation();
      try {
        const resp: any = await getCliente().opportunities.getPipelines({ locationId: loc });
        const pipelines: any[] = resp?.pipelines ?? [];
        if (!pipelines.length) return { content: [{ type: 'text', text: `No hay pipelines en la ubicación ${loc}.` }] };
        const lineas = pipelines.map((p) => {
          const etapas = Array.isArray(p.stages)
            ? p.stages.map((s: any) => `${s?.name ?? '?'} (${s?.id ?? '?'})`).join(' → ')
            : 'sin etapas';
          return `- ${p.name} (ID: ${p.id})\n  Etapas: ${etapas}`;
        });
        return { content: [{ type: 'text', text: `Pipelines (${pipelines.length}):\n${lineas.join('\n')}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al obtener pipelines', e) }] };
      }
    },
  );

  server.registerTool(
    'buscar_oportunidades',
    {
      description: 'Busca oportunidades (prospectos en el embudo de venta) de una ubicación de GoHighLevel. Filtra por pipeline o estado.',
      inputSchema: {
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
        pipeline_id: z.string().default('').describe('Filtrar por pipeline (de obtener_pipelines)'),
        estado: z.string().default('').describe("Filtrar por estado: 'open', 'won', 'lost', 'abandoned'"),
        query: z.string().default('').describe('Texto a buscar'),
        limite: z.number().int().default(20),
      },
    },
    async ({ location_id, pipeline_id, estado, query, limite }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      if (!loc) return faltaLocation();
      try {
        const resp: any = await getCliente().opportunities.searchOpportunity({
          locationId: loc,
          limit: limite,
          ...(pipeline_id ? { pipelineId: pipeline_id } : {}),
          ...(estado ? { status: estado } : {}),
          ...(query ? { q: query } : {}),
        });
        const opps: any[] = resp?.opportunities ?? [];
        if (!opps.length) return { content: [{ type: 'text', text: `No se encontraron oportunidades en la ubicación ${loc}.` }] };
        const lineas = opps.map((o) => {
          const valor = o.monetaryValue != null ? `$${Number(o.monetaryValue).toLocaleString('es-MX')}` : 'sin valor';
          const contacto = o.contact?.name || o.contactId || 'N/A';
          return `- ${o.name ?? 'Sin nombre'} (ID: ${o.id})\n  Estado: ${o.status ?? 'N/A'} | Valor: ${valor} | Contacto: ${contacto}`;
        });
        return { content: [{ type: 'text', text: `Oportunidades (${opps.length}):\n${lineas.join('\n')}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al buscar oportunidades', e) }] };
      }
    },
  );
}
