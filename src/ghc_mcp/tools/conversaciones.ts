import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, errGhl, getCliente, resolverLocation, faltaLocation } from './cliente.js';

export function registrarHerramientasConversaciones(server: McpServer): void {
  server.registerTool(
    'buscar_conversaciones',
    {
      description: 'Busca conversaciones de una ubicación de GoHighLevel (chats de WhatsApp, SMS, email, etc.). Puede filtrar por contacto.',
      inputSchema: {
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
        contacto_id: z.string().default('').describe('Filtrar por un contacto específico'),
        query: z.string().default('').describe('Texto a buscar'),
        limite: z.number().int().default(20),
      },
    },
    async ({ location_id, contacto_id, query, limite }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      if (!loc) return faltaLocation();
      try {
        const resp: any = await getCliente().conversations.searchConversation({
          locationId: loc,
          limit: limite,
          ...(contacto_id ? { contactId: contacto_id } : {}),
          ...(query ? { query } : {}),
        });
        const convs: any[] = resp?.conversations ?? [];
        if (!convs.length) return { content: [{ type: 'text', text: `No se encontraron conversaciones en la ubicación ${loc}.` }] };
        const lineas = convs.map((c) => {
          const noLeidos = c.unreadCount ? ` | ${c.unreadCount} sin leer` : '';
          return `- ${c.contactName || c.fullName || 'Sin nombre'} (conv: ${c.id})\n  Último [${c.lastMessageType ?? '?'}]: ${c.lastMessageBody ?? '(vacío)'}${noLeidos}`;
        });
        return { content: [{ type: 'text', text: `Conversaciones (${convs.length}):\n${lineas.join('\n')}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al buscar conversaciones', e) }] };
      }
    },
  );

  server.registerTool(
    'obtener_mensajes',
    {
      description: 'Obtiene los mensajes de una conversación específica de GoHighLevel por su ID.',
      inputSchema: {
        conversacion_id: z.string().describe('ID de la conversación'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
        limite: z.number().int().default(20),
      },
    },
    async ({ conversacion_id, location_id, limite }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      try {
        const resp: any = await getCliente().conversations.getMessages(
          { conversationId: conversacion_id, limit: limite },
          loc ? { headers: { locationId: loc } } : undefined,
        );
        const mensajes: any[] = resp?.messages?.messages ?? resp?.messages ?? [];
        if (!mensajes.length) return { content: [{ type: 'text', text: `La conversación ${conversacion_id} no tiene mensajes.` }] };
        const lineas = mensajes.map((m) => {
          const dir = m.direction === 'inbound' ? '←' : '→';
          return `${dir} [${m.messageType ?? m.type ?? '?'}] ${m.dateAdded ?? ''}\n  ${m.body ?? '(sin texto)'}`;
        });
        return { content: [{ type: 'text', text: `Mensajes de ${conversacion_id} (${mensajes.length}):\n${lineas.join('\n')}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al obtener mensajes', e) }] };
      }
    },
  );
}
