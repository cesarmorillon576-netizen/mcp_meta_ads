import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, initApi, resolveAccount, cursorToArray, nextCursor, clasificarPorObjetivo, detectarResultado } from '../helpers.js';
import { ACCIONES } from '../types.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdAccount: FBAdAccount } = bizSdk;

export function registrarHerramientasMonitoreo(server: McpServer) {
  const sustantivoResultado = (tipo: string): string => {
    if (tipo.includes('Mensajería')) return 'conversaciones';
    if (tipo.includes('Leads')) return 'leads';
    if (tipo.includes('Conversiones')) return 'compras/conversiones';
    if (tipo.includes('Llamadas')) return 'llamadas';
    if (tipo.includes('Tráfico')) return 'visitas a la página';
    if (tipo.includes('Interacciones')) return 'interacciones';
    return 'resultados';
  };

  server.registerTool(
    'detectar_fugas_dinero',
    {
      description: 'Analiza la cuenta buscando campañas que gastan sin lograr el resultado de SU objetivo (mensajes, leads, compras, llamadas, etc.), con CTR bajo, sin entregas, o con CPA por encima de un umbral. Es consciente del objetivo de cada campaña, no asume ventas.',
      inputSchema: {
        account_input: z.string(),
        fecha_inicio: z.string().describe('Formato YYYY-MM-DD'),
        fecha_fin: z.string().describe('Formato YYYY-MM-DD'),
        limite: z.number().int().default(30),
        cpa_max: z.number().optional().describe('Umbral de costo por resultado (CPA/CPL/costo por conversación). Si una campaña lo supera, se marca como CPA elevado. Opcional; si no se pasa, no se evalúa el CPA absoluto.'),
        pagina_cursor: z.string().default(''),
      },
    },
    async ({ account_input, fecha_inicio, fecha_fin, limite, cpa_max, pagina_cursor }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const accountId = await resolveAccount(account_input);
        initApi();
        const sdkParams: Record<string, any> = {
          time_range: JSON.stringify({ since: fecha_inicio, until: fecha_fin }),
          level: 'campaign',
          limit: limite,
        };
        if (pagina_cursor) sdkParams.after = pagina_cursor;
        const cursor = await new FBAdAccount(accountId).getInsights(
          ['campaign_name', 'campaign_id', 'objective', 'impressions', 'clicks', 'ctr', 'spend', 'actions', 'cost_per_action_type'],
          sdkParams,
        );
        const insights = cursorToArray(cursor);
        const alertas: string[] = [];
        for (const i of insights) {
          const gasto = parseFloat(i.spend ?? '0');
          const impresiones = parseInt(i.impressions ?? '0');
          const ctr = parseFloat(i.ctr ?? '0');

          const tipoObjetivo = clasificarPorObjetivo(i.objective);

          const conversaciones = parseInt(
            (i.actions ?? []).find((a: any) => a.action_type === ACCIONES.CONVERSACION_INICIADA)?.value ?? '0', 10,
          ) || 0;

          const resObjetivo = detectarResultado(i, tipoObjetivo);
          const numObjetivo = resObjetivo ? parseInt(resObjetivo.value ?? '0', 10) || 0 : 0;

          let tipo: string;
          let numResultado: number;
          let etiquetaResultado: string;
          if (conversaciones > 0) {
            tipo = '💬 Mensajería / Conversaciones';
            numResultado = conversaciones;
            etiquetaResultado = 'conversaciones';
          } else {
            tipo = tipoObjetivo;
            numResultado = numObjetivo;
            etiquetaResultado = sustantivoResultado(tipoObjetivo);
          }
          const esEvaluable = conversaciones > 0 || ['Mensajería', 'Leads', 'Conversiones', 'Llamadas', 'Tráfico', 'Interacciones'].some((t) => tipo.includes(t));

          const problemas: string[] = [];
          if (impresiones === 0 && gasto === 0) {
            problemas.push('Sin entregas ni gasto — posible error de configuración o audiencia');
          } else {
            if (gasto > 0 && esEvaluable && numResultado === 0)
              problemas.push(`Gasto $${gasto.toFixed(2)} sin lograr ${etiquetaResultado} (objetivo: ${tipo})`);
            if (impresiones > 1000 && ctr < 0.5)
              problemas.push(`CTR muy bajo (${ctr.toFixed(2)}%) con ${impresiones.toLocaleString('es-MX')} impresiones`);
            if (cpa_max != null && numResultado > 0) {
              const cpa = gasto / numResultado;
              if (cpa > cpa_max)
                problemas.push(`CPA elevado: $${cpa.toFixed(2)} por ${etiquetaResultado} (umbral $${cpa_max.toFixed(2)}; logró ${numResultado})`);
            }
          }
          if (problemas.length)
            alertas.push(`⚠ Campaña: ${i.campaign_name} [${tipo}]\n` + problemas.map((p) => `  - ${p}`).join('\n'));
        }
        const nc = nextCursor(cursor);
        const paginaInfo = nc ? `\n\n📄 Siguiente página → pagina_cursor='${nc}'` : '';
        if (!alertas.length)
          return { content: [{ type: 'text', text: `No se detectaron fugas de dinero en el período ${fecha_inicio} → ${fecha_fin}. Todo parece en orden.${paginaInfo}` }] };
        return { content: [{ type: 'text', text: `Fugas de dinero detectadas (${fecha_inicio} → ${fecha_fin}):\n\n${alertas.join('\n\n')}${paginaInfo}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al analizar fugas de dinero: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'monitorear_errores_cuenta',
    {
      description: 'Revisa campañas, conjuntos y anuncios con errores, rechazos o problemas de entrega.',
      inputSchema: {
        account_input: z.string(),
        limite: z.number().int().default(50).describe('Máximo de objetos a revisar por tipo'),
      },
    },
    async ({ account_input, limite }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const accountId = await resolveAccount(account_input);
        initApi();
        const account = new FBAdAccount(accountId);
        const [campCursor, conjCursor, adsCursor] = await Promise.all([
          account.getCampaigns(['id', 'name', 'status', 'effective_status'], { limit: limite }),
          account.getAdSets(['id', 'name', 'status', 'effective_status', 'issues_info'], { limit: limite }),
          account.getAds(['id', 'name', 'status', 'effective_status', 'issues_info'], { limit: limite }),
        ]);
        const errores: string[] = [];
        const estadosProblema = new Set(['DISAPPROVED', 'WITH_ISSUES', 'ERROR', 'CAMPAIGN_PAUSED']);
        for (const c of cursorToArray(campCursor)) {
          if (estadosProblema.has(c.effective_status))
            errores.push(`[CAMPAÑA] ${c.name} — Estado: ${c.effective_status}`);
        }
        for (const cs of cursorToArray(conjCursor)) {
          if (estadosProblema.has(cs.effective_status)) {
            const detalle = (cs.issues_info ?? []).map((i: any) => i.error_message).filter(Boolean).join('; ') || 'sin detalle';
            errores.push(`[CONJUNTO] ${cs.name} — Estado: ${cs.effective_status} | ${detalle}`);
          }
        }
        const adsNext = nextCursor(adsCursor);
        for (const a of cursorToArray(adsCursor)) {
          if (estadosProblema.has(a.effective_status)) {
            const detalle = (a.issues_info ?? []).map((i: any) => i.error_message).filter(Boolean).join('; ') || 'sin detalle';
            errores.push(`[ANUNCIO] ${a.name} — Estado: ${a.effective_status} | ${detalle}`);
          }
        }
        const notaPaginacion = adsNext
          ? `\n⚠ Se revisaron los primeros ${limite} objetos de cada tipo. Aumenta 'limite' si la cuenta es grande.`
          : '';
        if (!errores.length)
          return { content: [{ type: 'text', text: `No se encontraron errores activos en la cuenta '${account_input}'.${notaPaginacion}` }] };
        return { content: [{ type: 'text', text: `Errores detectados en la cuenta '${account_input}':\n\n${errores.map((e) => `⚠ ${e}`).join('\n')}${notaPaginacion}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al monitorear la cuenta: ${e.message}` }] };
      }
    },
  );
}
