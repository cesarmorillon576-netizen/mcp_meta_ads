import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, errGhl, getCliente, resolverLocation, faltaLocation, parseCursor, cursorMeta, hintPagina, limiteSeguro } from './cliente.js';

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
        limite: z.number().int().default(20).describe('Cantidad por página (máx 100)'),
        pagina_cursor: z.string().default('').describe('Cursor de la siguiente página (lo devuelve esta misma herramienta)'),
      },
    },
    async ({ location_id, pipeline_id, estado, query, limite, pagina_cursor }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      if (!loc) return faltaLocation();
      const { sa, sai } = parseCursor(pagina_cursor);
      try {
        const resp: any = await getCliente().opportunities.searchOpportunity({
          locationId: loc,
          limit: limiteSeguro(limite),
          ...(pipeline_id ? { pipelineId: pipeline_id } : {}),
          ...(estado ? { status: estado } : {}),
          ...(query ? { q: query } : {}),
          ...(sa ? { startAfter: sa } : {}),
          ...(sai ? { startAfterId: sai } : {}),
        });
        const opps: any[] = resp?.opportunities ?? [];
        if (!opps.length) return { content: [{ type: 'text', text: `No se encontraron oportunidades en la ubicación ${loc}.` }] };
        const lineas = opps.map((o) => {
          const valor = o.monetaryValue != null ? `$${Number(o.monetaryValue).toLocaleString('es-MX')}` : 'sin valor';
          const contacto = o.contact?.name || o.contactId || 'N/A';
          return `- ${o.name ?? 'Sin nombre'} (ID: ${o.id})\n  Estado: ${o.status ?? 'N/A'} | Valor: ${valor} | Contacto: ${contacto}`;
        });
        return { content: [{ type: 'text', text: `Oportunidades (${opps.length}):\n${lineas.join('\n')}${hintPagina(cursorMeta(resp?.meta))}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al buscar oportunidades', e) }] };
      }
    },
  );

  server.registerTool(
    'crear_oportunidad',
    {
      description: 'Crea una nueva oportunidad (prospecto en el embudo de venta) en GoHighLevel para un contacto. Usa los IDs de obtener_pipelines.',
      inputSchema: {
        nombre: z.string().describe('Nombre de la oportunidad'),
        pipeline_id: z.string().describe('ID del pipeline (de obtener_pipelines)'),
        contacto_id: z.string().describe('ID del contacto asociado'),
        etapa_id: z.string().default('').describe('ID de la etapa inicial (pipelineStageId, de obtener_pipelines)'),
        estado: z.string().default('open').describe("Estado: 'open', 'won', 'lost' o 'abandoned'"),
        valor: z.number().optional().describe('Valor monetario de la oportunidad'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ nombre, pipeline_id, contacto_id, etapa_id, estado, valor, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      if (!loc) return faltaLocation();
      const body: any = {
        name: nombre,
        pipelineId: pipeline_id,
        locationId: loc,
        contactId: contacto_id,
        status: estado.trim().toLowerCase() || 'open',
      };
      if (etapa_id.trim()) body.pipelineStageId = etapa_id.trim();
      if (valor != null) body.monetaryValue = valor;
      try {
        const resp: any = await getCliente().opportunities.createOpportunity(body);
        const o = resp?.opportunity ?? resp;
        return { content: [{ type: 'text', text: `✅ Oportunidad creada (ID: ${o?.id ?? 'creada'}).\n- ${nombre} | Estado: ${o?.status ?? body.status}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al crear la oportunidad', e) }] };
      }
    },
  );

  server.registerTool(
    'eliminar_oportunidad',
    {
      description: 'Elimina permanentemente una oportunidad de GoHighLevel. Acción irreversible: requiere confirmar=true.',
      inputSchema: {
        oportunidad_id: z.string().describe('ID de la oportunidad'),
        confirmar: z.boolean().default(false).describe('Debe ser true para confirmar el borrado.'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ oportunidad_id, confirmar, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      if (!confirmar) return { content: [{ type: 'text', text: 'Acción no ejecutada: para eliminar la oportunidad envía confirmar=true.' }] };
      const loc = resolverLocation(location_id);
      try {
        await getCliente().opportunities.deleteOpportunity(
          { id: oportunidad_id },
          loc ? { headers: { locationId: loc } } : undefined,
        );
        return { content: [{ type: 'text', text: `🗑️ Oportunidad ${oportunidad_id} eliminada.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al eliminar la oportunidad', e) }] };
      }
    },
  );

  server.registerTool(
    'actualizar_oportunidad',
    {
      description: 'Actualiza una oportunidad de GoHighLevel: muévela de etapa, cambia su estado (ganada/perdida), su valor o su nombre. Solo cambia los campos que envíes.',
      inputSchema: {
        oportunidad_id: z.string().describe('ID de la oportunidad'),
        etapa_id: z.string().default('').describe('Nueva etapa (pipelineStageId, de obtener_pipelines)'),
        pipeline_id: z.string().default('').describe('Mover a otro pipeline (de obtener_pipelines)'),
        estado: z.string().default('').describe("Nuevo estado: 'open', 'won', 'lost' o 'abandoned'"),
        valor: z.number().optional().describe('Nuevo valor monetario'),
        nombre: z.string().default('').describe('Nuevo nombre de la oportunidad'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ oportunidad_id, etapa_id, pipeline_id, estado, valor, nombre, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const body: any = {};
      if (etapa_id) body.pipelineStageId = etapa_id;
      if (pipeline_id) body.pipelineId = pipeline_id;
      if (estado) body.status = estado.trim().toLowerCase();
      if (valor != null) body.monetaryValue = valor;
      if (nombre) body.name = nombre;
      if (!Object.keys(body).length)
        return { content: [{ type: 'text', text: 'Error: indica al menos un campo a actualizar (etapa, estado, valor, etc.).' }] };
      const loc = resolverLocation(location_id);
      try {
        const resp: any = await getCliente().opportunities.updateOpportunity(
          { id: oportunidad_id },
          body,
          loc ? { headers: { locationId: loc } } : undefined,
        );
        const o = resp?.opportunity ?? resp;
        const cambios = Object.keys(body).join(', ');
        return { content: [{ type: 'text', text: `📈 Oportunidad ${oportunidad_id} actualizada (${cambios}).\n- Estado: ${o?.status ?? body.status ?? 'sin cambio'}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al actualizar la oportunidad', e) }] };
      }
    },
  );
}
