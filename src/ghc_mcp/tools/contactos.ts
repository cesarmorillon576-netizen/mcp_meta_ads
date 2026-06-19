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
    'crear_contacto',
    {
      description: 'Crea un nuevo contacto (lead) en GoHighLevel. Indica al menos un dato de identificación (nombre, email o teléfono).',
      inputSchema: {
        nombre: z.string().default('').describe('Nombre (firstName)'),
        apellido: z.string().default('').describe('Apellido (lastName)'),
        nombre_completo: z.string().default('').describe('Nombre completo (si no separas nombre/apellido)'),
        email: z.string().default('').describe('Correo electrónico'),
        telefono: z.string().default('').describe('Teléfono (con código de país, ej +52...)'),
        etiquetas: z.array(z.string()).default([]).describe('Etiquetas a asignar'),
        origen: z.string().default('').describe('Origen del contacto (source)'),
        empresa: z.string().default('').describe('Nombre de la empresa'),
        ciudad: z.string().default('').describe('Ciudad'),
        pais: z.string().default('').describe('País (código ISO, ej MX)'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ nombre, apellido, nombre_completo, email, telefono, etiquetas, origen, empresa, ciudad, pais, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      if (!loc) return faltaLocation();
      if (!nombre.trim() && !apellido.trim() && !nombre_completo.trim() && !email.trim() && !telefono.trim())
        return { content: [{ type: 'text', text: 'Error: indica al menos nombre, email o teléfono.' }] };
      const body: any = { locationId: loc };
      if (nombre.trim()) body.firstName = nombre.trim();
      if (apellido.trim()) body.lastName = apellido.trim();
      if (nombre_completo.trim()) body.name = nombre_completo.trim();
      if (email.trim()) body.email = email.trim();
      if (telefono.trim()) body.phone = telefono.trim();
      if (etiquetas.length) body.tags = etiquetas;
      if (origen.trim()) body.source = origen.trim();
      if (empresa.trim()) body.companyName = empresa.trim();
      if (ciudad.trim()) body.city = ciudad.trim();
      if (pais.trim()) body.country = pais.trim();
      try {
        const resp: any = await getCliente().contacts.createContact(body);
        const c = resp?.contact ?? resp;
        return { content: [{ type: 'text', text: `✅ Contacto creado (ID: ${c?.id ?? 'creado'}).\n- ${c?.contactName || nombre_completo || `${nombre} ${apellido}`.trim() || email || telefono}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al crear el contacto', e) }] };
      }
    },
  );

  server.registerTool(
    'editar_contacto',
    {
      description: 'Edita los datos de un contacto de GoHighLevel (nombre, email, teléfono, etc.). Solo cambia los campos que envíes.',
      inputSchema: {
        contacto_id: z.string().describe('ID del contacto'),
        nombre: z.string().default('').describe('Nuevo nombre (firstName)'),
        apellido: z.string().default('').describe('Nuevo apellido (lastName)'),
        nombre_completo: z.string().default('').describe('Nuevo nombre completo (name)'),
        email: z.string().default('').describe('Nuevo correo electrónico'),
        telefono: z.string().default('').describe('Nuevo teléfono'),
        origen: z.string().default('').describe('Nuevo origen (source)'),
        ciudad: z.string().default('').describe('Nueva ciudad'),
        pais: z.string().default('').describe('Nuevo país (código ISO, ej MX)'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ contacto_id, nombre, apellido, nombre_completo, email, telefono, origen, ciudad, pais, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const body: any = {};
      if (nombre.trim()) body.firstName = nombre.trim();
      if (apellido.trim()) body.lastName = apellido.trim();
      if (nombre_completo.trim()) body.name = nombre_completo.trim();
      if (email.trim()) body.email = email.trim();
      if (telefono.trim()) body.phone = telefono.trim();
      if (origen.trim()) body.source = origen.trim();
      if (ciudad.trim()) body.city = ciudad.trim();
      if (pais.trim()) body.country = pais.trim();
      if (!Object.keys(body).length)
        return { content: [{ type: 'text', text: 'Error: indica al menos un campo a editar.' }] };
      const loc = resolverLocation(location_id);
      try {
        const resp: any = await getCliente().contacts.updateContact(
          { contactId: contacto_id },
          body,
          loc ? { headers: { locationId: loc } } : undefined,
        );
        const c = resp?.contact ?? resp;
        return { content: [{ type: 'text', text: `✏️ Contacto ${contacto_id} actualizado (${Object.keys(body).join(', ')}).` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al editar el contacto', e) }] };
      }
    },
  );

  server.registerTool(
    'eliminar_contacto',
    {
      description: 'Elimina permanentemente un contacto de GoHighLevel. Acción irreversible: requiere confirmar=true.',
      inputSchema: {
        contacto_id: z.string().describe('ID del contacto'),
        confirmar: z.boolean().default(false).describe('Debe ser true para confirmar el borrado.'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ contacto_id, confirmar, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      if (!confirmar) return { content: [{ type: 'text', text: 'Acción no ejecutada: para eliminar el contacto envía confirmar=true.' }] };
      const loc = resolverLocation(location_id);
      try {
        await getCliente().contacts.deleteContact(
          { contactId: contacto_id },
          loc ? { headers: { locationId: loc } } : undefined,
        );
        return { content: [{ type: 'text', text: `🗑️ Contacto ${contacto_id} eliminado.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al eliminar el contacto', e) }] };
      }
    },
  );

  server.registerTool(
    'obtener_notas_contacto',
    {
      description: 'Obtiene todas las notas internas de un contacto de GoHighLevel (su historial de notas).',
      inputSchema: {
        contacto_id: z.string().describe('ID del contacto'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ contacto_id, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      try {
        const resp: any = await getCliente().contacts.getAllNotes(
          { contactId: contacto_id },
          loc ? { headers: { locationId: loc } } : undefined,
        );
        const notas: any[] = resp?.notes ?? [];
        if (!notas.length) return { content: [{ type: 'text', text: `El contacto ${contacto_id} no tiene notas.` }] };
        const lineas = notas.map((n) => {
          const titulo = n.title ? `${n.title} — ` : '';
          return `- [${n.dateAdded ?? 'sin fecha'}] (ID: ${n.id})\n  ${titulo}${n.body ?? '(sin texto)'}`;
        });
        return { content: [{ type: 'text', text: `Notas del contacto ${contacto_id} (${notas.length}):\n${lineas.join('\n')}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al obtener las notas', e) }] };
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
    'editar_nota_contacto',
    {
      description: 'Edita el texto de una nota existente de un contacto de GoHighLevel (usa el ID de nota de obtener_notas_contacto).',
      inputSchema: {
        contacto_id: z.string().describe('ID del contacto'),
        nota_id: z.string().describe('ID de la nota (de obtener_notas_contacto)'),
        nota: z.string().describe('Nuevo texto de la nota'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ contacto_id, nota_id, nota, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      try {
        await getCliente().contacts.updateNote(
          { contactId: contacto_id, id: nota_id },
          { body: nota } as any,
          loc ? { headers: { locationId: loc } } : undefined,
        );
        return { content: [{ type: 'text', text: `✏️ Nota ${nota_id} del contacto ${contacto_id} actualizada.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al editar la nota', e) }] };
      }
    },
  );

  server.registerTool(
    'eliminar_nota_contacto',
    {
      description: 'Elimina una nota de un contacto de GoHighLevel (usa el ID de nota de obtener_notas_contacto).',
      inputSchema: {
        contacto_id: z.string().describe('ID del contacto'),
        nota_id: z.string().describe('ID de la nota a eliminar'),
        location_id: z.string().default('').describe('ID de la ubicación. Si se omite, usa GHL_LOCATION_ID del .env'),
      },
    },
    async ({ contacto_id, nota_id, location_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const loc = resolverLocation(location_id);
      try {
        await getCliente().contacts.deleteNote(
          { contactId: contacto_id, id: nota_id },
          loc ? { headers: { locationId: loc } } : undefined,
        );
        return { content: [{ type: 'text', text: `🗑️ Nota ${nota_id} del contacto ${contacto_id} eliminada.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errGhl('Error al eliminar la nota', e) }] };
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
