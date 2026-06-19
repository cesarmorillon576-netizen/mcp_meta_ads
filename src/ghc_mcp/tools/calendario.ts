import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, errGhl, getCliente, resolverLocation, faltaLocation } from './cliente.js';

export function registrarHerramientasCalendario(server: McpServer): void {
  server.registerTool(
    'obtener_calendarios',
    {
      description: 'Lista los calendarios de una ubicación de GoHighLevel. Usa los IDs en obtener_citas.',
      inputSchema: {
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      if (!loc) return faltaLocation();
      try {
        const resp: any = await getCliente().calendars.getCalendars({ locationId: loc });
        const calendarios: any[] = resp?.calendars ?? [];
        if (!calendarios.length) return { content: [{ type: 'text', text: `No hay calendarios en la ubicación ${loc}.` }] };
        const lineas = calendarios.map((c) => {
          const activo = c.isActive === false ? 'inactivo' : 'activo';
          return `- ${c.name} (ID: ${c.id})\n  Tipo: ${c.calendarType ?? c.eventType ?? 'N/A'} | ${activo}`;
        });
        return { content: [{ type: 'text', text: `Calendarios (${calendarios.length}):\n${lineas.join('\n')}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al obtener calendarios', e) }] };
      }
    },
  );

  server.registerTool(
    'obtener_citas',
    {
      description: 'Obtiene las citas/eventos agendados de un rango de fechas en GoHighLevel. Requiere fecha de inicio y fin.',
      inputSchema: {
        fecha_inicio: z.string().describe('Fecha de inicio (ISO, ej: 2026-06-01 o 2026-06-01T00:00:00)'),
        fecha_fin: z.string().describe('Fecha de fin (ISO, ej: 2026-06-30)'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
        calendario_id: z.string().default('').describe('Filtrar por un calendario específico (de obtener_calendarios)'),
      },
    },
    async ({ fecha_inicio, fecha_fin, location_id, calendario_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      if (!loc) return faltaLocation();
      const ini = Date.parse(fecha_inicio);
      const fin = Date.parse(fecha_fin);
      if (Number.isNaN(ini) || Number.isNaN(fin))
        return { content: [{ type: 'text', text: 'Error: fecha_inicio o fecha_fin no son fechas válidas.' }] };
      try {
        const resp: any = await getCliente().calendars.getCalendarEvents({
          locationId: loc,
          startTime: String(ini),
          endTime: String(fin),
          ...(calendario_id ? { calendarId: calendario_id } : {}),
        });
        const eventos: any[] = resp?.events ?? [];
        if (!eventos.length) return { content: [{ type: 'text', text: `No hay citas entre ${fecha_inicio} y ${fecha_fin}.` }] };
        const lineas = eventos.map((ev) => {
          return `- ${ev.title ?? 'Cita'} (ID: ${ev.id})\n  ${ev.startTime ?? '?'} → ${ev.endTime ?? '?'} | Estado: ${ev.appointmentStatus ?? 'N/A'} | Contacto: ${ev.contactId ?? 'N/A'}`;
        });
        return { content: [{ type: 'text', text: `Citas (${eventos.length}):\n${lineas.join('\n')}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al obtener citas', e) }] };
      }
    },
  );

  server.registerTool(
    'agendar_cita',
    {
      description: 'Agenda una cita para un contacto en un calendario de GoHighLevel. Usa los IDs de obtener_calendarios. La hora debe ir en ISO 8601 con zona horaria, ej: 2026-06-20T10:00:00-06:00.',
      inputSchema: {
        calendario_id: z.string().describe('ID del calendario (de obtener_calendarios)'),
        contacto_id: z.string().describe('ID del contacto'),
        inicio: z.string().describe('Inicio en ISO 8601 con zona, ej: 2026-06-20T10:00:00-06:00'),
        fin: z.string().default('').describe('Fin en ISO 8601 (opcional; si se omite, usa la duración del calendario)'),
        titulo: z.string().default('').describe('Título de la cita (opcional)'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ calendario_id, contacto_id, inicio, fin, titulo, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      if (!loc) return faltaLocation();
      if (Number.isNaN(Date.parse(inicio)))
        return { content: [{ type: 'text', text: 'Error: "inicio" no es una fecha/hora válida (usa ISO 8601 con zona).' }] };
      try {
        const body: any = { calendarId: calendario_id, locationId: loc, contactId: contacto_id, startTime: inicio };
        if (fin.trim()) body.endTime = fin.trim();
        if (titulo.trim()) body.title = titulo.trim();
        const resp: any = await getCliente().calendars.createAppointment(body);
        const ev = resp?.appointment ?? resp;
        return { content: [{ type: 'text', text: `📅 Cita agendada (ID: ${ev?.id ?? 'creada'}).\n- Contacto: ${contacto_id}\n- Inicio: ${ev?.startTime ?? inicio}${ev?.endTime ? `\n- Fin: ${ev.endTime}` : ''}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al agendar la cita', e) }] };
      }
    },
  );

  server.registerTool(
    'editar_cita',
    {
      description: 'Edita una cita existente de GoHighLevel: reagéndala (nueva hora), cámbiale el título o su estado (confirmar, cancelar, no-show). Usa el ID de cita de obtener_citas. Solo cambia los campos que envíes.',
      inputSchema: {
        cita_id: z.string().describe('ID de la cita/evento (de obtener_citas)'),
        inicio: z.string().default('').describe('Nuevo inicio en ISO 8601 con zona, ej: 2026-06-20T10:00:00-06:00'),
        fin: z.string().default('').describe('Nuevo fin en ISO 8601 con zona'),
        titulo: z.string().default('').describe('Nuevo título'),
        estado: z.string().default('').describe("Nuevo estado: 'confirmed', 'cancelled', 'showed', 'noshow', 'invalid', 'new'"),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ cita_id, inicio, fin, titulo, estado, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const body: any = {};
      if (inicio.trim()) {
        if (Number.isNaN(Date.parse(inicio))) return { content: [{ type: 'text', text: 'Error: "inicio" no es una fecha/hora válida (usa ISO 8601 con zona).' }] };
        body.startTime = inicio.trim();
      }
      if (fin.trim()) {
        if (Number.isNaN(Date.parse(fin))) return { content: [{ type: 'text', text: 'Error: "fin" no es una fecha/hora válida (usa ISO 8601 con zona).' }] };
        body.endTime = fin.trim();
      }
      if (titulo.trim()) body.title = titulo.trim();
      if (estado.trim()) body.appointmentStatus = estado.trim().toLowerCase();
      if (!Object.keys(body).length)
        return { content: [{ type: 'text', text: 'Error: indica al menos un campo a editar (inicio, fin, título o estado).' }] };
      const loc = resolverLocation(location_id);
      try {
        const resp: any = await getCliente().calendars.editAppointment(
          { eventId: cita_id },
          body,
          loc ? { headers: { locationId: loc } } : undefined,
        );
        const ev = resp?.appointment ?? resp;
        return { content: [{ type: 'text', text: `✏️ Cita ${cita_id} actualizada (${Object.keys(body).join(', ')}).\n- Inicio: ${ev?.startTime ?? body.startTime ?? 'sin cambio'} | Estado: ${ev?.appointmentStatus ?? body.appointmentStatus ?? 'sin cambio'}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al editar la cita', e) }] };
      }
    },
  );

  server.registerTool(
    'eliminar_cita',
    {
      description: 'Elimina permanentemente una cita/evento de GoHighLevel. Acción irreversible: requiere confirmar=true. (Para solo cancelarla sin borrarla, usa editar_cita con estado=cancelled.)',
      inputSchema: {
        cita_id: z.string().describe('ID de la cita/evento (de obtener_citas)'),
        confirmar: z.boolean().default(false).describe('Debe ser true para confirmar el borrado.'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ cita_id, confirmar, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      if (!confirmar) return { content: [{ type: 'text', text: 'Acción no ejecutada: para eliminar la cita envía confirmar=true.' }] };
      const loc = resolverLocation(location_id);
      try {
        await getCliente().calendars.deleteEvent(
          { eventId: cita_id },
          {} as any,
          loc ? { headers: { locationId: loc } } : undefined,
        );
        return { content: [{ type: 'text', text: `🗑️ Cita ${cita_id} eliminada.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al eliminar la cita', e) }] };
      }
    },
  );
}
