import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, errGhl, getCliente, resolverLocation, faltaLocation } from './cliente.js';

export function registrarHerramientasContactos(server: McpServer): void {
  server.registerTool(
    'obtener_contactos',
    {
      description: 'Lista contactos (leads) de una ubicación de GoHighLevel. Devuelve nombre, email, teléfono, etiquetas y origen.',
      inputSchema: {
        location_id: z.string().default('').describe('ID de la ubicación (sub-cuenta). Si se omite, usa GHL_LOCATION_ID del .env'),
        query: z.string().default('').describe('Texto a buscar (nombre, email, teléfono)'),
        limite: z.number().int().default(20),
      },
    },
    async ({ location_id, query, limite }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      if (!loc) return faltaLocation();
      try {
        const resp: any = await getCliente().contacts.getContacts({
          locationId: loc,
          limit: limite,
          ...(query ? { query } : {}),
        });
        const contactos: any[] = resp?.contacts ?? [];
        if (!contactos.length) return { content: [{ type: 'text', text: `No se encontraron contactos en la ubicación ${loc}.` }] };
        const lineas = contactos.map((c) => {
          const nombre = c.contactName || c.fullName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.name || 'Sin nombre';
          const tags = c.tags?.length ? ` | tags: ${c.tags.join(', ')}` : '';
          return `- ${nombre} (ID: ${c.id})\n  Email: ${c.email ?? 'N/A'} | Tel: ${c.phone ?? 'N/A'} | Origen: ${c.source ?? 'N/A'}${tags}`;
        });
        return { content: [{ type: 'text', text: `Contactos (${contactos.length}):\n${lineas.join('\n')}` }] };
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
}
