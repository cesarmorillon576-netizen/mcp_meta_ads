import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, errGhl, getCliente, resolverLocation, faltaLocation, hintPagina, limiteSeguro } from './cliente.js';

export function registrarHerramientasConversaciones(server: McpServer): void {
  server.registerTool(
    'buscar_conversaciones',
    {
      description: 'Busca conversaciones de una ubicación de GoHighLevel (chats de WhatsApp, SMS, email, etc.). Puede filtrar por contacto.',
      inputSchema: {
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
        contacto_id: z.string().default('').describe('Filtrar por un contacto específico'),
        query: z.string().default('').describe('Texto a buscar'),
        limite: z.number().int().default(20).describe('Cantidad por página (máx 100)'),
        pagina_cursor: z.string().default('').describe('Cursor de la siguiente página (lo devuelve esta misma herramienta)'),
      },
    },
    async ({ location_id, contacto_id, query, limite, pagina_cursor }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      if (!loc) return faltaLocation();
      const tope = limiteSeguro(limite);
      try {
        const resp: any = await getCliente().conversations.searchConversation({
          locationId: loc,
          limit: tope,
          ...(contacto_id ? { contactId: contacto_id } : {}),
          ...(query ? { query } : {}),
          ...(pagina_cursor ? { startAfterDate: Number(pagina_cursor) || pagina_cursor } : {}),
        });
        const convs: any[] = resp?.conversations ?? [];
        if (!convs.length) return { content: [{ type: 'text', text: `No se encontraron conversaciones en la ubicación ${loc}.` }] };
        const lineas = convs.map((c) => {
          const noLeidos = c.unreadCount ? ` | ${c.unreadCount} sin leer` : '';
          return `- ${c.contactName || c.fullName || 'Sin nombre'} (conv: ${c.id})\n  Último [${c.lastMessageType ?? '?'}]: ${c.lastMessageBody ?? '(vacío)'}${noLeidos}`;
        });
        let nc = '';
        if (convs.length >= tope) {
          const u = convs[convs.length - 1];
          const d = u?.sort?.[0] ?? u?.lastMessageDate ?? u?.dateUpdated;
          if (d != null) nc = String(d);
        }
        return { content: [{ type: 'text', text: `Conversaciones (${convs.length}):\n${lineas.join('\n')}${hintPagina(nc)}` }] };
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
        limite: z.number().int().default(20).describe('Cantidad por página (máx 100)'),
        pagina_cursor: z.string().default('').describe('Cursor de la siguiente página (lo devuelve esta misma herramienta)'),
      },
    },
    async ({ conversacion_id, location_id, limite, pagina_cursor }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      try {
        const resp: any = await getCliente().conversations.getMessages(
          { conversationId: conversacion_id, limit: limiteSeguro(limite), ...(pagina_cursor ? { lastMessageId: pagina_cursor } : {}) },
          loc ? { headers: { locationId: loc } } : undefined,
        );
        const cont: any = resp?.messages && Array.isArray(resp.messages.messages) ? resp.messages : resp;
        const mensajes: any[] = cont?.messages ?? [];
        if (!mensajes.length) return { content: [{ type: 'text', text: `La conversación ${conversacion_id} no tiene mensajes.` }] };
        const lineas = mensajes.map((m) => {
          const dir = m.direction === 'inbound' ? '←' : '→';
          return `${dir} [${m.messageType ?? m.type ?? '?'}] ${m.dateAdded ?? ''}\n  ${m.body ?? '(sin texto)'}`;
        });
        const nc = cont?.nextPage && cont?.lastMessageId ? String(cont.lastMessageId) : '';
        return { content: [{ type: 'text', text: `Mensajes de ${conversacion_id} (${mensajes.length}):\n${lineas.join('\n')}${hintPagina(nc)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al obtener mensajes', e) }] };
      }
    },
  );

  server.registerTool(
    'enviar_mensaje',
    {
      description: 'Envía (responde) un mensaje a un contacto de GoHighLevel por el canal indicado. El mensaje sale del canal ya conectado en la ubicación (debe haber proveedor configurado para ese canal).',
      inputSchema: {
        contacto_id: z.string().describe('ID del contacto destinatario'),
        mensaje: z.string().describe('Texto del mensaje a enviar'),
        canal: z.string().default('SMS').describe("Canal: 'SMS', 'WhatsApp', 'Email', 'IG' (Instagram), 'FB' (Messenger), 'Live_Chat' o 'GMB'"),
        asunto: z.string().default('').describe('Solo para Email: asunto del correo'),
      },
    },
    async ({ contacto_id, mensaje, canal, asunto }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const tipos: Record<string, string> = {
        sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email', ig: 'IG', instagram: 'IG',
        fb: 'FB', messenger: 'FB', live_chat: 'Live_Chat', chat: 'Live_Chat', gmb: 'GMB',
      };
      const tipo = tipos[canal.trim().toLowerCase()];
      if (!tipo) return { content: [{ type: 'text', text: "Error: 'canal' debe ser SMS, WhatsApp, Email, IG, FB, Live_Chat o GMB." }] };
      try {
        const body: any = { type: tipo, contactId: contacto_id, message: mensaje };
        if (tipo === 'Email' && asunto.trim()) body.subject = asunto.trim();
        const resp: any = await getCliente().conversations.sendANewMessage(body);
        const convId = resp?.conversationId ?? resp?.conversation?.id ?? 'N/A';
        const msgId = resp?.messageId ?? resp?.messageIds?.[0] ?? 'N/A';
        return { content: [{ type: 'text', text: `✅ Mensaje (${tipo}) enviado al contacto ${contacto_id}.\n- Conversación: ${convId}\n- Mensaje: ${msgId}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al enviar el mensaje', e) }] };
      }
    },
  );
}
