import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, errorMeta, initApi } from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { Campaign, AdSet, Ad } = bizSdk;

function idDeCopia(copia: any): string {
  if (!copia) return 'ver en el administrador';
  if (copia.id) return copia.id;
  for (const k of Object.keys(copia)) {
    if (/^copied_.*_id$/.test(k) && copia[k]) return copia[k];
  }
  if (Array.isArray(copia.ad_object_ids) && copia.ad_object_ids.length) return copia.ad_object_ids[0];
  return 'ver en el administrador';
}

function claseDe(tipo: string): { Clase: any; etiqueta: string } | null {
  const t = tipo.trim().toLowerCase();
  if (t === 'campana' || t === 'campaña' || t === 'campaign') return { Clase: Campaign, etiqueta: 'campaña' };
  if (t === 'conjunto' || t === 'adset' || t === 'ad_set') return { Clase: AdSet, etiqueta: 'conjunto' };
  if (t === 'anuncio' || t === 'ad') return { Clase: Ad, etiqueta: 'anuncio' };
  return null;
}

export function registrarHerramientasAccionesEstructura(server: McpServer) {

  server.registerTool(
    'archivar_objeto',
    {
      description: "Archiva o elimina una campaña, conjunto o anuncio. 'archivar' lo saca de la vista activa pero conserva su historial (recomendado para limpiar zombies). 'eliminar' lo borra de forma permanente. Ninguna de las dos gasta presupuesto.",
      inputSchema: {
        tipo: z.string().describe("'campana', 'conjunto' o 'anuncio'"),
        objeto_id: z.string().describe('ID del objeto a archivar/eliminar'),
        accion: z.string().default('archivar').describe("'archivar' (ARCHIVED, reversible) o 'eliminar' (DELETED, permanente)"),
      },
    },
    async ({ tipo, objeto_id, accion }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const c = claseDe(tipo);
      if (!c) return { content: [{ type: 'text', text: "Error: 'tipo' debe ser 'campana', 'conjunto' o 'anuncio'." }] };
      const acc = accion.trim().toLowerCase();
      if (acc !== 'archivar' && acc !== 'eliminar')
        return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'archivar' o 'eliminar'." }] };
      const status = acc === 'archivar' ? 'ARCHIVED' : 'DELETED';
      try {
        initApi();
        await new c.Clase(objeto_id).update([], { status });
        return { content: [{ type: 'text', text: `🗄️ ${c.etiqueta} ${objeto_id} ${acc === 'archivar' ? 'archivada/o' : 'eliminada/o'} (status ${status}).` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al archivar/eliminar', e) }] };
      }
    },
  );

  server.registerTool(
    'duplicar_objeto',
    {
      description: 'Duplica una campaña, conjunto o anuncio. La copia se crea SIEMPRE en PAUSADO. Para campañas y conjuntos puede copiar también su contenido (conjuntos/anuncios hijos). Es la jugada estándar para escalar a un ganador sin tocar el original.',
      inputSchema: {
        tipo: z.string().describe("'campana', 'conjunto' o 'anuncio'"),
        objeto_id: z.string().describe('ID del objeto a duplicar'),
        incluir_contenido: z.boolean().default(true).describe('Solo campaña/conjunto: si true, copia también sus hijos (conjuntos/anuncios)'),
      },
    },
    async ({ tipo, objeto_id, incluir_contenido }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const c = claseDe(tipo);
      if (!c) return { content: [{ type: 'text', text: "Error: 'tipo' debe ser 'campana', 'conjunto' o 'anuncio'." }] };
      try {
        initApi();
        const params: Record<string, any> = { status_option: 'PAUSED' };
        if (c.etiqueta !== 'anuncio') params.deep_copy = incluir_contenido;
        const copia = await new c.Clase(objeto_id).createCopy([], params);
        const nuevoId = idDeCopia(copia);
        return { content: [{ type: 'text', text: `📑 ${c.etiqueta} ${objeto_id} duplicada/o en PAUSADO.\n- Nueva/o ID: ${nuevoId}${c.etiqueta !== 'anuncio' ? `\n- Contenido copiado: ${incluir_contenido ? 'sí' : 'no'}` : ''}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al duplicar', e) }] };
      }
    },
  );

  server.registerTool(
    'renombrar_objeto',
    {
      description: 'Cambia el nombre de una campaña, conjunto o anuncio. Útil para mantener una nomenclatura consistente que el orquestador pueda identificar.',
      inputSchema: {
        tipo: z.string().describe("'campana', 'conjunto' o 'anuncio'"),
        objeto_id: z.string().describe('ID del objeto a renombrar'),
        nuevo_nombre: z.string().describe('Nuevo nombre'),
      },
    },
    async ({ tipo, objeto_id, nuevo_nombre }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const c = claseDe(tipo);
      if (!c) return { content: [{ type: 'text', text: "Error: 'tipo' debe ser 'campana', 'conjunto' o 'anuncio'." }] };
      try {
        initApi();
        await new c.Clase(objeto_id).update([], { name: nuevo_nombre });
        return { content: [{ type: 'text', text: `✏️ ${c.etiqueta} ${objeto_id} renombrada/o a "${nuevo_nombre}".` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al renombrar', e) }] };
      }
    },
  );

  server.registerTool(
    'mover_anuncio',
    {
      description: 'Mueve un anuncio a otro conjunto. Meta no permite mover en sitio: copia el anuncio (en PAUSADO) al conjunto destino y, por defecto, archiva el original. Útil para reagrupar ganadores bajo otra segmentación.',
      inputSchema: {
        anuncio_id: z.string().describe('ID del anuncio a mover'),
        conjunto_destino_id: z.string().describe('ID del conjunto (ad set) destino'),
        archivar_original: z.boolean().default(true).describe('Si true, archiva el anuncio original tras copiarlo'),
      },
    },
    async ({ anuncio_id, conjunto_destino_id, archivar_original }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        initApi();
        const copia = await new Ad(anuncio_id).createCopy([], { adset_id: conjunto_destino_id, status_option: 'PAUSED' });
        const nuevoId = idDeCopia(copia);
        let nota = '';
        if (archivar_original) {
          await new Ad(anuncio_id).update([], { status: 'ARCHIVED' });
          nota = '\n- Original archivado.';
        }
        return { content: [{ type: 'text', text: `↪️ Anuncio ${anuncio_id} movido al conjunto ${conjunto_destino_id} (en PAUSADO).\n- Nuevo ID: ${nuevoId}${nota}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al mover el anuncio', e) }] };
      }
    },
  );
}
