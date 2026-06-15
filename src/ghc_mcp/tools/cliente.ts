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
