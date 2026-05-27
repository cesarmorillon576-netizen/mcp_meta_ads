import path from 'path';
import * as dotenv from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Detect pkg executable vs development
const isFrozen = (process as any).pkg !== undefined;
const baseDir = isFrozen
  ? path.dirname(process.execPath)
  : path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(baseDir, '.env') });

const GADS_BASE = 'https://googleads.googleapis.com/v18';

const server = new McpServer({ name: 'GoogleAds', version: '2.0.0' });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function credencialesOk(): boolean {
  return !!(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN
  );
}

function errorCredenciales(): string {
  return 'Error: No se encontraron las credenciales de Google Ads en el archivo .env';
}

// Token cache
let cachedToken = '';
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    grant_type: 'refresh_token',
  });
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await resp.json() as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function gadsHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    'Content-Type': 'application/json',
  };
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
    headers['login-customer-id'] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  return headers;
}

async function search(customerId: string, query: string): Promise<any[]> {
  const headers = await gadsHeaders();
  const resp = await fetch(
    `${GADS_BASE}/customers/${customerId}/googleAds:search`,
    { method: 'POST', headers, body: JSON.stringify({ query, pageSize: 1000 }) },
  );
  const data = await resp.json() as any;
  return data.results ?? [];
}

function microsToMoney(micros: string | number): string {
  return `$${(Number(micros) / 1_000_000).toFixed(2)}`;
}

// ─── CONSULTA DE CAMPAÑAS ─────────────────────────────────────────────────────

server.registerTool(
  'obtener_campanas',
  {
    description: 'Obtener todas las campañas de una cuenta de Google Ads con su estado y presupuesto.',
    inputSchema: {
      customer_id: z.string().describe('ID de la cuenta de Google Ads (sin guiones)'),
    },
  },
  async ({ customer_id }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const results = await search(
        customer_id,
        `SELECT campaign.id, campaign.name, campaign.status,
                campaign_budget.amount_micros
         FROM campaign
         ORDER BY campaign.name`,
      );
      if (!results.length)
        return { content: [{ type: 'text', text: `No se encontraron campañas para la cuenta ${customer_id}` }] };
      const lineas = results.map((r) => {
        const presupuesto = microsToMoney(r.campaignBudget?.amountMicros ?? 0);
        return `- ${r.campaign.name} | Estado: ${r.campaign.status} | Presupuesto: ${presupuesto}/día`;
      });
      return { content: [{ type: 'text', text: `Campañas encontradas:\n${lineas.join('\n')}` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar campañas: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'obtener_campanas_activas',
  {
    description: 'Obtener solo las campañas ENABLED (activas) de una cuenta de Google Ads.',
    inputSchema: {
      customer_id: z.string().describe('ID de la cuenta de Google Ads'),
    },
  },
  async ({ customer_id }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const results = await search(
        customer_id,
        `SELECT campaign.id, campaign.name, campaign.status,
                campaign.advertising_channel_type,
                campaign_budget.amount_micros
         FROM campaign
         WHERE campaign.status = 'ENABLED'
         ORDER BY campaign.name`,
      );
      if (!results.length)
        return { content: [{ type: 'text', text: `No hay campañas activas en la cuenta ${customer_id}` }] };
      const lineas = results.map((r) => {
        const presupuesto = microsToMoney(r.campaignBudget?.amountMicros ?? 0);
        const canal = r.campaign.advertisingChannelType ?? 'N/A';
        return `- ${r.campaign.name} | Canal: ${canal} | Presupuesto: ${presupuesto}/día`;
      });
      return { content: [{ type: 'text', text: `Campañas activas (${results.length}):\n${lineas.join('\n')}` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar campañas activas: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'obtener_todas_campanas_activas',
  { description: 'Obtener campañas activas de todas las cuentas accesibles con las credenciales configuradas.' },
  async () => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const headers = await gadsHeaders();
      const listResp = await fetch(`${GADS_BASE}/customers:listAccessibleCustomers`, { headers });
      const listData = await listResp.json() as any;
      const resourceNames: string[] = listData.resourceNames ?? [];
      const resultados: string[] = [];
      for (const rn of resourceNames) {
        const customerId = rn.split('/').pop()!;
        try {
          const results = await search(
            customerId,
            `SELECT campaign.name, campaign.advertising_channel_type,
                    campaign_budget.amount_micros, customer.descriptive_name
             FROM campaign
             WHERE campaign.status = 'ENABLED'
             ORDER BY campaign.name`,
          );
          if (results.length) {
            const nombreCuenta = results[0]?.customer?.descriptiveName || customerId;
            resultados.push(`\nCuenta: ${nombreCuenta} (${customerId}) — ${results.length} activa(s):`);
            for (const r of results) {
              const presupuesto = microsToMoney(r.campaignBudget?.amountMicros ?? 0);
              const canal = r.campaign.advertisingChannelType ?? 'N/A';
              resultados.push(`  - ${r.campaign.name} | Canal: ${canal} | Presupuesto: ${presupuesto}/día`);
            }
          }
        } catch {}
      }
      if (!resultados.length)
        return { content: [{ type: 'text', text: 'No hay campañas activas en ninguna de las cuentas accesibles.' }] };
      const total = resultados.filter((r) => r.startsWith('  -')).length;
      return { content: [{ type: 'text', text: `Total campañas activas: ${total}${resultados.join('')}` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar cuentas: ${e.message}` }] };
    }
  },
);

// ─── GESTIÓN DE ESTADOS ───────────────────────────────────────────────────────

async function mutateResource(
  endpoint: string,
  customerId: string,
  resourceName: string,
  status: string,
): Promise<void> {
  const headers = await gadsHeaders();
  await fetch(
    `${GADS_BASE}/customers/${customerId}/${endpoint}:mutate`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        operations: [{ updateMask: 'status', update: { resourceName, status } }],
      }),
    },
  );
}

server.registerTool(
  'cambiar_estado_campana',
  {
    description: "Encender o apagar una campaña de Google Ads. Parámetros: customer_id, campaign_id, accion ('encender' o 'apagar').",
    inputSchema: {
      customer_id: z.string().describe('ID de la cuenta (sin guiones)'),
      campaign_id: z.string().describe('ID de la campaña'),
      accion: z.string().describe("'encender' o 'apagar'"),
    },
  },
  async ({ customer_id, campaign_id, accion }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const acc = accion.trim().toLowerCase();
    if (acc !== 'encender' && acc !== 'apagar')
      return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'encender' o 'apagar'" }] };
    try {
      await mutateResource('campaigns', customer_id, `customers/${customer_id}/campaigns/${campaign_id}`, acc === 'encender' ? 'ENABLED' : 'PAUSED');
      return { content: [{ type: 'text', text: `Campaña ${campaign_id} ${acc === 'encender' ? 'activada' : 'pausada'} correctamente.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al cambiar estado: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'cambiar_estado_grupo',
  {
    description: "Encender o apagar un grupo de anuncios (Ad Group). Parámetros: customer_id, ad_group_id, accion ('encender' o 'apagar').",
    inputSchema: {
      customer_id: z.string(),
      ad_group_id: z.string().describe('ID del grupo de anuncios'),
      accion: z.string().describe("'encender' o 'apagar'"),
    },
  },
  async ({ customer_id, ad_group_id, accion }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const acc = accion.trim().toLowerCase();
    if (acc !== 'encender' && acc !== 'apagar')
      return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'encender' o 'apagar'" }] };
    try {
      await mutateResource('adGroups', customer_id, `customers/${customer_id}/adGroups/${ad_group_id}`, acc === 'encender' ? 'ENABLED' : 'PAUSED');
      return { content: [{ type: 'text', text: `Grupo ${ad_group_id} ${acc === 'encender' ? 'activado' : 'pausado'} correctamente.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al cambiar estado del grupo: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'cambiar_estado_anuncio',
  {
    description: "Encender o apagar un anuncio individual. Parámetros: customer_id, ad_group_id, ad_id, accion ('encender' o 'apagar').",
    inputSchema: {
      customer_id: z.string(),
      ad_group_id: z.string(),
      ad_id: z.string().describe('ID del anuncio'),
      accion: z.string().describe("'encender' o 'apagar'"),
    },
  },
  async ({ customer_id, ad_group_id, ad_id, accion }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const acc = accion.trim().toLowerCase();
    if (acc !== 'encender' && acc !== 'apagar')
      return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'encender' o 'apagar'" }] };
    try {
      // AdGroupAd resource name: customers/{customerId}/adGroupAds/{adGroupId}~{adId}
      await mutateResource('adGroupAds', customer_id, `customers/${customer_id}/adGroupAds/${ad_group_id}~${ad_id}`, acc === 'encender' ? 'ENABLED' : 'PAUSED');
      return { content: [{ type: 'text', text: `Anuncio ${ad_id} ${acc === 'encender' ? 'activado' : 'pausado'} correctamente.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al cambiar estado del anuncio: ${e.message}` }] };
    }
  },
);

// ─── REPORTES DE RENDIMIENTO ──────────────────────────────────────────────────

server.registerTool(
  'reporte_rendimiento',
  {
    description: 'Obtener métricas clave por campaña para un rango de fechas. Métricas: impresiones, clics, CTR, gasto, CPM, CPC, conversiones, CPA, ROAS.',
    inputSchema: {
      customer_id: z.string(),
      fecha_inicio: z.string().describe('Formato YYYY-MM-DD'),
      fecha_fin: z.string().describe('Formato YYYY-MM-DD'),
    },
  },
  async ({ customer_id, fecha_inicio, fecha_fin }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const results = await search(
        customer_id,
        `SELECT campaign.name,
                metrics.impressions, metrics.clicks, metrics.ctr,
                metrics.cost_micros, metrics.average_cpm, metrics.average_cpc,
                metrics.conversions, metrics.cost_per_conversion,
                metrics.conversions_value
         FROM campaign
         WHERE segments.date BETWEEN '${fecha_inicio}' AND '${fecha_fin}'
           AND metrics.impressions > 0
         ORDER BY metrics.cost_micros DESC`,
      );
      if (!results.length)
        return { content: [{ type: 'text', text: `No hay datos de rendimiento para el período ${fecha_inicio} → ${fecha_fin}` }] };
      const lineas = [`Reporte de rendimiento: ${fecha_inicio} → ${fecha_fin}\n`];
      for (const r of results) {
        const m = r.metrics;
        const costMicros = Number(m.costMicros ?? 0);
        const roas = costMicros > 0 ? ((m.conversionsValue ?? 0) / (costMicros / 1_000_000)).toFixed(2) : '0';
        lineas.push(
          `Campaña: ${r.campaign.name}\n` +
          `  Impresiones : ${Number(m.impressions ?? 0).toLocaleString()}\n` +
          `  Clics       : ${Number(m.clicks ?? 0).toLocaleString()}\n` +
          `  CTR         : ${((m.ctr ?? 0) * 100).toFixed(2)}%\n` +
          `  Gasto       : ${microsToMoney(m.costMicros ?? 0)}\n` +
          `  CPM         : ${microsToMoney(m.averageCpm ?? 0)}\n` +
          `  CPC         : ${microsToMoney(m.averageCpc ?? 0)}\n` +
          `  Conversiones: ${Math.round(m.conversions ?? 0)}\n` +
          `  CPA         : ${microsToMoney(m.costPerConversion ?? 0)}\n` +
          `  ROAS        : ${roas}\n`,
        );
      }
      return { content: [{ type: 'text', text: lineas.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al obtener reporte: ${e.message}` }] };
    }
  },
);

// ─── MONITOREO ────────────────────────────────────────────────────────────────

server.registerTool(
  'detectar_fugas_dinero',
  {
    description: 'Detecta campañas que gastan sin generar resultados: sin conversiones, CTR bajo, CPA elevado.',
    inputSchema: {
      customer_id: z.string(),
      fecha_inicio: z.string().describe('Formato YYYY-MM-DD'),
      fecha_fin: z.string().describe('Formato YYYY-MM-DD'),
    },
  },
  async ({ customer_id, fecha_inicio, fecha_fin }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const results = await search(
        customer_id,
        `SELECT campaign.name,
                metrics.impressions, metrics.clicks, metrics.ctr,
                metrics.cost_micros, metrics.conversions,
                metrics.cost_per_conversion
         FROM campaign
         WHERE segments.date BETWEEN '${fecha_inicio}' AND '${fecha_fin}'
           AND metrics.impressions > 0`,
      );
      const alertas: string[] = [];
      for (const r of results) {
        const m = r.metrics;
        const gasto = Number(m.costMicros ?? 0) / 1_000_000;
        const ctr = (m.ctr ?? 0) * 100;
        const conversiones = m.conversions ?? 0;
        const cpa = Number(m.costPerConversion ?? 0) / 1_000_000;
        const impresiones = Number(m.impressions ?? 0);
        const problemas: string[] = [];
        if (gasto > 0 && conversiones === 0)
          problemas.push(`Gasto $${gasto.toFixed(2)} sin conversiones`);
        if (impresiones > 1000 && ctr < 0.5)
          problemas.push(`CTR muy bajo (${ctr.toFixed(2)}%) con ${impresiones.toLocaleString()} impresiones`);
        if (cpa > 100)
          problemas.push(`CPA elevado: $${cpa.toFixed(2)} por conversión`);
        if (problemas.length)
          alertas.push(`Campaña: ${r.campaign.name}\n` + problemas.map((p) => `  - ${p}`).join('\n'));
      }
      if (!alertas.length)
        return { content: [{ type: 'text', text: `No se detectaron fugas de dinero en ${fecha_inicio} → ${fecha_fin}.` }] };
      return { content: [{ type: 'text', text: `Fugas detectadas (${fecha_inicio} → ${fecha_fin}):\n\n${alertas.join('\n\n')}` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al analizar fugas: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'monitorear_errores_cuenta',
  {
    description: 'Revisa campañas, grupos y anuncios con errores, desaprobaciones o problemas de entrega.',
    inputSchema: {
      customer_id: z.string().describe('ID de la cuenta de Google Ads'),
    },
  },
  async ({ customer_id }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const results = await search(
        customer_id,
        `SELECT campaign.name, campaign.status,
                ad_group.name, ad_group.status,
                ad_group_ad.ad.id, ad_group_ad.ad.name,
                ad_group_ad.status, ad_group_ad.policy_summary.approval_status
         FROM ad_group_ad
         WHERE ad_group_ad.status != 'REMOVED'`,
      );
      const aprobacionProblema = new Set(['DISAPPROVED', 'AREA_OF_INTEREST_ONLY']);
      const errores: string[] = [];
      for (const r of results) {
        const aprobacion = r.adGroupAd?.policySummary?.approvalStatus ?? '';
        if (aprobacionProblema.has(aprobacion)) {
          errores.push(
            `[ANUNCIO RECHAZADO] Campaña: ${r.campaign.name} | ` +
            `Grupo: ${r.adGroup.name} | ` +
            `Anuncio ID: ${r.adGroupAd.ad.id} | ` +
            `Aprobación: ${aprobacion}`,
          );
        }
      }
      if (!errores.length)
        return { content: [{ type: 'text', text: `No se encontraron errores activos en la cuenta ${customer_id}.` }] };
      return { content: [{ type: 'text', text: `Errores en cuenta ${customer_id}:\n\n${errores.map((e) => `⚠ ${e}`).join('\n')}` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al monitorear cuenta: ${e.message}` }] };
    }
  },
);

// ─── Inicio ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Error fatal: ${err}\n`);
  process.exit(1);
});
