import { HighLevel } from '@gohighlevel/api-client';

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
