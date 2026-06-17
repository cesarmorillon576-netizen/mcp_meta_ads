import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, errGhl, getCliente, resolverLocation, faltaLocation, parseCursor, cursorMeta, hintPagina, limiteSeguro } from './cliente.js';

export function registrarHerramientasContactos(server: McpServer): void {
  server.registerTool(
    'obtener_contactos',
    {
      description: 'Lista contactos (leads) de una ubicación de GoHighLevel. Devuelve nombre, email, teléfono, etiquetas y origen.',
      inputSchema: {
        location_id: z.string().default('').describe('ID de la ubicación (sub-cuenta). Si se omite, usa GHL_LOCATION_ID del .env'),
        query: z.string().default('').describe('Texto a buscar (nombre, email, teléfono)'),
        limite: z.number().int().default(20).describe('Cantidad por página (máx 100)'),
        pagina_cursor: z.string().default('').describe('Cursor de la siguiente página (lo devuelve esta misma herramienta)'),
      },
    },
    async ({ location_id, query, limite, pagina_cursor }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      if (!loc) return faltaLocation();
      const { sa, sai } = parseCursor(pagina_cursor);
      try {
        const resp: any = await getCliente().contacts.getContacts({
          locationId: loc,
          limit: limiteSeguro(limite),
          ...(query ? { query } : {}),
          ...(sa ? { startAfter: Number(sa) } : {}),
          ...(sai ? { startAfterId: sai } : {}),
        });
        const contactos: any[] = resp?.contacts ?? [];
        if (!contactos.length) return { content: [{ type: 'text', text: `No se encontraron contactos en la ubicación ${loc}.` }] };
        const lineas = contactos.map((c) => {
          const nombre = c.contactName || c.fullName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.name || 'Sin nombre';
          const tags = c.tags?.length ? ` | tags: ${c.tags.join(', ')}` : '';
          return `- ${nombre} (ID: ${c.id})\n  Email: ${c.email ?? 'N/A'} | Tel: ${c.phone ?? 'N/A'} | Origen: ${c.source ?? 'N/A'}${tags}`;
        });
        let nc = cursorMeta(resp?.meta);
        if (!nc && contactos.length >= limiteSeguro(limite)) {
          const u = contactos[contactos.length - 1];
          const ts = u?.dateAdded ? new Date(u.dateAdded).getTime() : '';
          if (u?.id) nc = `${Number.isNaN(ts as number) ? '' : ts}|${u.id}`;
        }
        return { content: [{ type: 'text', text: `Contactos (${contactos.length}):\n${lineas.join('\n')}${hintPagina(nc)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al obtener contactos', e) }] };
      }
    },
  );

  server.registerTool(
    'ver_contacto',
    {
      description: 'Muestra el detalle de un contacto específico de GoHighLevel por su ID.',
      inputSchema: {
        contacto_id: z.string().describe('ID del contacto'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ contacto_id, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      try {
        const resp: any = await getCliente().contacts.getContact(
          { contactId: contacto_id },
          loc ? { headers: { locationId: loc } } : undefined,
        );
        const c = resp?.contact ?? resp;
        if (!c) return { content: [{ type: 'text', text: `No se encontró el contacto ${contacto_id}.` }] };
        const nombre = c.contactName || c.fullName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.name || 'Sin nombre';
        const lineas = [
          `Contacto: ${nombre} (ID: ${c.id ?? contacto_id})`,
          `- Email: ${c.email ?? 'N/A'}`,
          `- Teléfono: ${c.phone ?? 'N/A'}`,
          `- Origen: ${c.source ?? 'N/A'}`,
          `- País: ${c.country ?? 'N/A'}`,
          `- Etiquetas: ${c.tags?.length ? c.tags.join(', ') : 'ninguna'}`,
          `- Alta: ${c.dateAdded ?? 'N/A'}`,
        ];
        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al ver el contacto', e) }] };
      }
    },
  );

  server.registerTool(
    'agregar_nota_contacto',
    {
      description: 'Agrega una nota interna a un contacto de GoHighLevel (queda en su historial, no se le envía nada al contacto).',
      inputSchema: {
        contacto_id: z.string().describe('ID del contacto'),
        nota: z.string().describe('Texto de la nota'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ contacto_id, nota, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      try {
        const resp: any = await getCliente().contacts.createNote(
          { contactId: contacto_id },
          { body: nota } as any,
          loc ? { headers: { locationId: loc } } : undefined,
        );
        const id = resp?.note?.id ?? resp?.id ?? 'creada';
        return { content: [{ type: 'text', text: `📝 Nota agregada al contacto ${contacto_id} (ID: ${id}).` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al agregar la nota', e) }] };
      }
    },
  );

  server.registerTool(
    'etiquetar_contacto',
    {
      description: 'Agrega o quita etiquetas (tags) de un contacto de GoHighLevel. Útil para segmentar o disparar automatizaciones.',
      inputSchema: {
        contacto_id: z.string().describe('ID del contacto'),
        etiquetas: z.array(z.string()).describe('Lista de etiquetas a agregar o quitar'),
        accion: z.string().default('agregar').describe("'agregar' o 'quitar'"),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ contacto_id, etiquetas, accion, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      if (!etiquetas.length) return { content: [{ type: 'text', text: 'Error: indica al menos una etiqueta.' }] };
      const acc = accion.trim().toLowerCase();
      if (acc !== 'agregar' && acc !== 'quitar')
        return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'agregar' o 'quitar'." }] };
      const loc = resolverLocation(location_id);
      const opts = loc ? { headers: { locationId: loc } } : undefined;
      try {
        const cli = getCliente();
        if (acc === 'agregar') await cli.contacts.addTags({ contactId: contacto_id }, { tags: etiquetas } as any, opts);
        else await cli.contacts.removeTags({ contactId: contacto_id }, { tags: etiquetas } as any, opts);
        return { content: [{ type: 'text', text: `🏷️ Etiquetas ${acc === 'agregar' ? 'agregadas a' : 'quitadas de'} el contacto ${contacto_id}: ${etiquetas.join(', ')}.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al modificar etiquetas', e) }] };
      }
    },
  );
}
