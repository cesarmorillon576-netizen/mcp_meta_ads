import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, initApi, resolveAccount, cursorToArray, nextCursor, formatInsightRow, traducirSegmento } from '../helpers.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdAccount: FBAdAccount, User } = bizSdk;




export function registrarHerramientasReportesGenerales(server: McpServer) {
  server.registerTool(
    'reporte_rendimiento',
    {
      description: 'Obtener métricas clave (KPIs) por campaña para un rango de fechas.',
      inputSchema: {
        account_input: z.string(),
        fecha_inicio: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hace 30 días'),
        fecha_fin: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hoy'),
        limite: z.number().int().default(25),
        pagina_cursor: z.string().default(''),
      },
    },
    async ({ account_input, fecha_inicio, fecha_fin, limite, pagina_cursor }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const hoy = new Date();
        const dias = new Date();
        dias.setDate(hoy.getDate() - 30);
        const fFin = fecha_fin ?? hoy.toISOString().split('T')[0];
        const fInicio = fecha_inicio ?? dias.toISOString().split('T')[0];

        const accountId = await resolveAccount(account_input);
        initApi();
        const sdkParams: Record<string, any> = {
          time_range: JSON.stringify({ since: fInicio, until: fFin }), level: 'campaign', limit: limite,
        };
        if (pagina_cursor) sdkParams.after = pagina_cursor; 
        const cursor = await new FBAdAccount(accountId).getInsights(
          ['campaign_name', 'impressions', 'reach', 'clicks', 'ctr', 'spend', 'cpm', 'cpc', 'actions', 'cost_per_action_type', 'purchase_roas'],
          sdkParams,
        );

        const insights = cursorToArray(cursor);
        if (!insights?.length)
          return { content: [{ type: 'text', text: `No hay datos para el período ${fInicio} → ${fFin}` }] };
        const lineas = [`Reporte de rendimiento: ${fInicio} → ${fFin} (${insights.length} campañas)\n`];
        for (const i of insights) lineas.push(formatInsightRow(i));
        const nc = nextCursor(cursor);
        if (nc) lineas.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al obtener reporte: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'reporte_rendimiento_desglosado',
    {
      description: "Desglosa resultados por segmento ('age', 'gender' o 'publisher_platform').",
      inputSchema: {
        account_input: z.string(),
        fecha_inicio: z.string().describe('Formato YYYY-MM-DD'),
        fecha_fin: z.string().describe('Formato YYYY-MM-DD'),
        desglose: z.string().describe("'age', 'gender' o 'publisher_platform'"),
        limite: z.number().int().default(30),
        pagina_cursor: z.string().default(''),
      },
    },
    async ({ account_input, fecha_inicio, fecha_fin, desglose, limite, pagina_cursor }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const des = desglose.trim().toLowerCase();
      const titulos: Record<string, string> = { age: 'Edades', gender: 'Géneros', publisher_platform: 'Plataformas' };
      const titulo = titulos[des] ?? des.toUpperCase();
      try {
        const accountId = await resolveAccount(account_input);
        initApi();
        const sdkParams: Record<string, any> = {
          time_range: JSON.stringify({ since: fecha_inicio, until: fecha_fin }), level: 'campaign', breakdowns: des, limit: limite,
        };
        if (pagina_cursor) sdkParams.after = pagina_cursor;
        const cursor = await new FBAdAccount(accountId).getInsights(['campaign_name', 'impressions', 'clicks', 'ctr', 'spend'], sdkParams);
        const insights = cursorToArray(cursor);
        if (!insights?.length) return { content: [{ type: 'text', text: `No hay datos para desglosar.` }] };
        const lineas = [`Análisis de Rendimiento por ${titulo} (${fecha_inicio} → ${fecha_fin}) — ${insights.length} filas\n`];
        for (const i of insights) {
          const segmento = traducirSegmento(i[des]);
          lineas.push(
            `  ${i.campaign_name} — ${segmento}\n` +
            `    Gasto: $${parseFloat(i.spend ?? '0').toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Clics: ${i.clicks ?? 0} | CTR: ${parseFloat(i.ctr ?? '0').toFixed(2)}%\n`
          );
        }
        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
      }
    },
  );
}