import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, initApi, resolveAccount, cursorToArray, nextCursor, formatInsightRow, traducirSegmento, mejorResultado, money } from '../helpers.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdAccount: FBAdAccount, User, Campaign, AdSet, Ad } = bizSdk;




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

  server.registerTool(
    'reporte_rendimiento_todas',
    {
      description: 'Obtener métricas clave (KPIs) de todas las cuentas accesibles para un rango de fechas.',
      inputSchema: {
        fecha_inicio: z.string().optional().describe('Formato YYYY-MM-DD'),
        fecha_fin: z.string().optional().describe('Formato YYYY-MM-DD'),
        limite_por_cuenta: z.number().int().default(20),
      },
    },
    async ({ fecha_inicio, fecha_fin, limite_por_cuenta }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const hoy = new Date();
        const dias = new Date();
        dias.setDate(hoy.getDate() - 30);
        const fFin = fecha_fin ?? hoy.toISOString().split('T')[0];
        const fInicio = fecha_inicio ?? dias.toISOString().split('T')[0];

        initApi();
        const cuentasCursor = await new User('me').getAdAccounts(['id', 'name'], { limit: 200 });
        const cuentas = cursorToArray(cuentasCursor);
        if (!cuentas?.length)
          return { content: [{ type: 'text', text: 'No se encontraron cuentas publicitarias asociadas al token.' }] };
        const lineas = [`Reporte de rendimiento: ${fInicio} → ${fFin}\n`];
        for (const cuenta of cuentas) {
          lineas.push(`\n== Cuenta: ${cuenta.name ?? cuenta.id} (${cuenta.id}) ==`);
          try {
            const insightCursor = await new FBAdAccount(cuenta.id).getInsights(
              ['campaign_name', 'impressions', 'clicks', 'ctr', 'spend', 'cpm', 'cpc', 'actions', 'cost_per_action_type', 'purchase_roas'],
              {
                time_range: JSON.stringify({ since: fInicio, until: fFin }),
                level: 'campaign',
                limit: limite_por_cuenta,
              },
            );
            const insights = cursorToArray(insightCursor);
            if (!insights?.length) { lineas.push('  Sin datos para este período.'); continue; }
            for (const i of insights) lineas.push(formatInsightRow(i, '  '));
            if (nextCursor(insightCursor)) lineas.push('  📄 Hay más campañas en esta cuenta (usa reporte_rendimiento con pagina_cursor)');
          } catch { lineas.push('  Error al consultar esta cuenta.'); }
        }
        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al obtener reporte de rendimiento: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'desglose_resultados',
    {
      description: 'Desglosa el resultado real (conversaciones, leads, compras, llamadas o visitas) y su costo por segmento: edad, género, región, país, plataforma, ubicación (Feed/Stories/Reels), dispositivo u hora del día. Para toda la cuenta o un objeto específico (campaña, conjunto o anuncio).',
      inputSchema: {
        account_input: z.string(),
        segmento: z.enum(['edad', 'genero', 'region', 'pais', 'plataforma', 'ubicacion', 'dispositivo', 'hora']),
        fecha_inicio: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hace 30 días'),
        fecha_fin: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hoy'),
        objeto_id: z.string().optional().describe('Si se pasa, analiza solo esa campaña/conjunto/anuncio en vez de toda la cuenta'),
        objeto_tipo: z.enum(['campana', 'conjunto', 'anuncio']).default('campana'),
        limite: z.number().int().default(50),
        pagina_cursor: z.string().default(''),
      },
    },
    async ({ account_input, segmento, fecha_inicio, fecha_fin, objeto_id, objeto_tipo, limite, pagina_cursor }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const mapaSeg: Record<string, string> = { edad: 'age', genero: 'gender', region: 'region', pais: 'country', plataforma: 'publisher_platform', ubicacion: 'publisher_platform,platform_position', dispositivo: 'device_platform', hora: 'hourly_stats_aggregated_by_advertiser_time_zone' };
      const titulos: Record<string, string> = { edad: 'Edad', genero: 'Género', region: 'Región', pais: 'País', plataforma: 'Plataforma', ubicacion: 'Ubicación', dispositivo: 'Dispositivo', hora: 'Hora del día' };
      const breakdown = mapaSeg[segmento];
      try {
        const hoy = new Date();
        const dias = new Date();
        dias.setDate(hoy.getDate() - 30);
        const fFin = fecha_fin ?? hoy.toISOString().split('T')[0];
        const fInicio = fecha_inicio ?? dias.toISOString().split('T')[0];

        initApi();
        const sdkParams: Record<string, any> = {
          time_range: JSON.stringify({ since: fInicio, until: fFin }),
          breakdowns: breakdown,
          limit: limite,
        };
        if (pagina_cursor) sdkParams.after = pagina_cursor;

        const campos = ['impressions', 'clicks', 'ctr', 'spend', 'actions', 'cost_per_action_type'];
        let objeto: any;
        let etiquetaObjeto: string;
        if (objeto_id) {
          const constructores: Record<string, any> = { campana: Campaign, conjunto: AdSet, anuncio: Ad };
          objeto = new constructores[objeto_tipo](objeto_id);
          etiquetaObjeto = `${objeto_tipo} ${objeto_id}`;
        } else {
          const accountId = await resolveAccount(account_input);
          objeto = new FBAdAccount(accountId);
          etiquetaObjeto = `cuenta ${account_input}`;
        }

        const cursor = await objeto.getInsights(campos, sdkParams);
        const filas = cursorToArray(cursor);
        if (!filas?.length)
          return { content: [{ type: 'text', text: `No hay datos para desglosar por ${titulos[segmento]} en ${fInicio} → ${fFin}.` }] };

        const lineas = [`Resultados por ${titulos[segmento]} — ${etiquetaObjeto} (${fInicio} → ${fFin})\n`];
        for (const f of filas) {
          const seg = segmento === 'ubicacion'
            ? `${traducirSegmento(f.publisher_platform)} · ${traducirSegmento(f.platform_position)}`
            : traducirSegmento(f[breakdown]);
          const gasto = parseFloat(f.spend ?? '0');
          const r = mejorResultado(f);
          if (r && r.num > 0) {
            const cpa = gasto / r.num;
            const alerta = r.num <= 3 ? '   ⚠ pocos resultados' : '';
            lineas.push(`  ${seg} → ${r.num} ${r.etiqueta} · $${money(cpa)} c/u · gasto $${money(gasto)}${alerta}`);
          } else {
            const clics = parseInt(f.clicks ?? '0');
            lineas.push(`  ${seg} → sin resultados · ${clics} clics · gasto $${money(gasto)}`);
          }
        }
        const nc = nextCursor(cursor);
        if (nc) lineas.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al desglosar resultados: ${e.message}` }] };
      }
    },
  );
}