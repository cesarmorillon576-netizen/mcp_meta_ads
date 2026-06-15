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
}
