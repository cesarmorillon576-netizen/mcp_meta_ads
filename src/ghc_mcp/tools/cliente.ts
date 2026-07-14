import { HighLevel } from '@gohighlevel/api-client';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { truncar } from '../../meta_ads/helpers.js';

export function credencialesOk(): boolean {
  return !!process.env.GHL_PRIVATE_TOKEN;
}

export function errorCredenciales(): string {
  return 'Error: falta GHL_PRIVATE_TOKEN en el archivo .env';
}

export function errGhl(prefijo: string, e: any): string {
  const detalle = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'error desconocido';
  return `${prefijo}: ${detalle}`;
}

let cliente: HighLevel | null = null;

export function getCliente(): HighLevel {
  if (!cliente) {
    cliente = new HighLevel({ privateIntegrationToken: process.env.GHL_PRIVATE_TOKEN! } as any);
  }
  return cliente;
}

export function resolverLocation(location_id: string): string {
  return (location_id || process.env.GHL_LOCATION_ID || '').trim();
}

export function faltaLocation(): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: 'Error: falta GHL_LOCATION_ID en el .env (o pásalo en location_id).' }] };
}

export function parseCursor(cursor: string): { sa: string; sai: string } {
  if (!cursor) return { sa: '', sai: '' };
  const i = cursor.indexOf('|');
  if (i === -1) return { sa: cursor, sai: '' };
  return { sa: cursor.slice(0, i), sai: cursor.slice(i + 1) };
}

export function cursorMeta(meta: any): string {
  if (!meta) return '';
  const haySiguiente = !!meta.nextPageUrl || (meta.nextPage != null && meta.nextPage !== false);
  if (!haySiguiente) return '';
  const sa = meta.startAfter ?? '';
  const sai = meta.startAfterId ?? '';
  if (sa === '' && sai === '') return '';
  return `${sa}|${sai}`;
}

export function hintPagina(cursor: string): string {
  return cursor ? `\n\n📄 Siguiente página → pagina_cursor='${cursor}'` : '';
}

export function limiteSeguro(n: number): number {
  if (!Number.isFinite(n)) return 20;
  return Math.min(Math.max(1, Math.trunc(n)), 100);
}

const nombresUsuario = new Map<string, string>();

export async function nombreUsuario(userId: string): Promise<string> {
  if (!userId) return '';
  const enCache = nombresUsuario.get(userId);
  if (enCache !== undefined) return enCache;
  let nombre = '';
  try {
    const resp: any = await getCliente().users.getUser({ userId });
    const u = resp?.user ?? resp;
    nombre = u?.name || `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || u?.email || '';
  } catch {
    nombre = '';
  }
  nombresUsuario.set(userId, nombre);
  return nombre;
}

export async function nombresDeUsuarios(userIds: string[]): Promise<Map<string, string>> {
  const unicos = Array.from(new Set(userIds.filter(Boolean)));
  const pares = await Promise.all(unicos.map(async (id) => [id, await nombreUsuario(id)] as const));
  return new Map(pares);
}

export function autorNota(userId: string, nombres: Map<string, string>): string {
  if (!userId) return 'sistema/automatización';
  const nombre = nombres.get(userId);
  return nombre ? `${nombre} (${userId})` : `usuario ${userId}`;
}

const ENTIDADES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", hellip: '…', mdash: '—', ndash: '–',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
  iexcl: '¡', iquest: '¿', deg: '°', euro: '€', laquo: '«', raquo: '»',
};

export function limpiarHtml(texto: string, maxCaracteres = 600): string {
  if (!texto) return '';
  const plano = texto
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*(?=<\/li>)/gi, '')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>\s*(<p[^>]*>)?/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, nombre) => ENTIDADES[nombre] ?? ENTIDADES[nombre.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n{2,}(?=• )/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
  return truncar(plano, maxCaracteres);
}

export type UsuarioElegido = { id: string } | { pedirAlModelo: string };

export async function elegirUsuario(server: McpServer, loc: string, accion: string): Promise<UsuarioElegido> {
  let usuarios: any[] = [];
  try {
    const resp: any = await getCliente().users.getUserByLocation({ locationId: loc });
    usuarios = resp?.users ?? [];
  } catch {
    usuarios = [];
  }
  if (!usuarios.length)
    return { pedirAlModelo: 'No se pudo obtener la lista de usuarios. Vuelve a llamar pasando usuario_id, o usuario_id="sistema" para no atribuir la nota.' };

  const opciones = usuarios
    .map((u) => ({
      id: String(u.id ?? ''),
      nombre: u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || 'Sin nombre',
    }))
    .filter((u) => u.id);

  const nucleo: any = (server as any).server;
  if (nucleo?.getClientCapabilities?.()?.elicitation) {
    try {
      const r: any = await nucleo.elicitInput({
        message: `¿A qué usuario se atribuye ${accion}?`,
        requestedSchema: {
          type: 'object',
          properties: {
            usuario_id: {
              type: 'string',
              title: 'Usuario',
              description: 'Usuario al que quedará atribuida la nota',
              enum: opciones.map((u) => u.id),
              enumNames: opciones.map((u) => u.nombre),
            },
          },
          required: ['usuario_id'],
        },
      });
      if (r?.action === 'accept' && r?.content?.usuario_id) return { id: String(r.content.usuario_id) };
      return { pedirAlModelo: 'Selección de usuario cancelada: la nota no se creó.' };
    } catch {
      // el cliente dice soportar elicitation pero falló: caemos a la lista
    }
  }

  const lista = opciones.map((u) => `- ${u.nombre} → usuario_id="${u.id}"`).join('\n');
  return {
    pedirAlModelo:
      `Antes de crear la nota, pregúntale al usuario a nombre de quién debe quedar y vuelve a llamar a esta herramienta con ese usuario_id.\n\nUsuarios disponibles:\n${lista}\n\n(Si debe quedar sin autor, usa usuario_id="sistema".)`,
  };
}
