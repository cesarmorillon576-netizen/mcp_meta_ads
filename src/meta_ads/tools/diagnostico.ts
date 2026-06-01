import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, initApi, resolveAccount, cursorToArray, nextCursor, money, rangoPorDefecto, resolverObjeto, construirEmbudo, flagsCalidad } from '../helpers.js';

const traducirRanking: Record<string, string> = {
  ABOVE_AVERAGE: 'Por encima del promedio ✅',
  AVERAGE: 'Promedio',
  BELOW_AVERAGE_10: 'Por debajo — peor 10% 🔴',
  BELOW_AVERAGE_20: 'Por debajo — peor 20% 🔴',
  BELOW_AVERAGE_35: 'Por debajo — peor 35% 🔴',
};
const rk = (v?: string) => (v && v !== 'UNKNOWN' ? traducirRanking[v] ?? v : 'Sin datos suficientes');

export function registrarHerramientasDiagnostico(server: McpServer) {
  server.registerTool(
    'diagnostico_calidad',
    {
      description: 'Diagnóstico de calidad de Meta por anuncio: clasificación de calidad, interacción y conversión (Meta dice si está por debajo del promedio) más la frecuencia para detectar fatiga del anuncio.',
      inputSchema: {
        account_input: z.string(),
        fecha_inicio: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hace 30 días'),
        fecha_fin: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hoy'),
        objeto_id: z.string().optional().describe('Si se pasa, solo esa campaña'),
        solo_problemas: z.boolean().default(false).describe('Si true, solo muestra anuncios con algún problema'),
      },
    },
    async ({ account_input, fecha_inicio, fecha_fin, objeto_id, solo_problemas }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const { fInicio, fFin } = rangoPorDefecto(fecha_inicio, fecha_fin);
        const accountId = await resolveAccount(account_input);
        initApi();
        const objeto = resolverObjeto(objeto_id, 'campana', accountId);
        const cursor = await objeto.getInsights(
          ['ad_name', 'quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking', 'frequency', 'impressions', 'spend'],
          { time_range: JSON.stringify({ since: fInicio, until: fFin }), level: 'ad', limit: 200 },
        );
        const filas = cursorToArray(cursor);
        if (!filas?.length) return { content: [{ type: 'text', text: `Sin anuncios con datos en ${fInicio} → ${fFin}.` }] };

        const lineas = [`Diagnóstico de calidad — ${objeto_id ? `campaña ${objeto_id}` : `cuenta ${account_input}`} (${fInicio} → ${fFin})\n`];
        let mostrados = 0;
        for (const f of filas) {
          const { problemas, frecuencia } = flagsCalidad(f);
          if (solo_problemas && !problemas.length) continue;
          mostrados++;
          lineas.push(
            `  ${f.ad_name}${problemas.length ? `  ⚠ ${problemas.join(', ')}` : '  ✅'}\n` +
            `    Calidad: ${rk(f.quality_ranking)} | Interacción: ${rk(f.engagement_rate_ranking)} | Conversión: ${rk(f.conversion_rate_ranking)}\n` +
            `    Frecuencia: ${frecuencia.toFixed(1)} | Gasto: $${money(parseFloat(f.spend ?? '0'))}`,
          );
        }
        if (!mostrados) return { content: [{ type: 'text', text: `Sin anuncios con problemas en ${fInicio} → ${fFin}. Todo en orden.` }] };
        if (nextCursor(cursor)) lineas.push(`\n📄 Se analizaron los primeros ${filas.length} anuncios; hay más. Acota con objeto_id (campaña).`);
        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error en diagnóstico de calidad: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'salud_conjunto',
    {
      description: 'Salud de los conjuntos de anuncios: fase de aprendizaje (si todavía está aprendiendo no conviene tocarlo) y ritmo de gasto (si está sub-gastando su presupuesto).',
      inputSchema: {
        account_input: z.string(),
        fecha_inicio: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hace 7 días'),
        fecha_fin: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hoy'),
        limite: z.number().int().default(50),
      },
    },
    async ({ account_input, fecha_inicio, fecha_fin, limite }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const { fInicio, fFin } = rangoPorDefecto(fecha_inicio, fecha_fin, 7);
        const dia = 86400000;
        const dias = Math.max(1, Math.round((new Date(fFin).getTime() - new Date(fInicio).getTime()) / dia) + 1);
        const accountId = await resolveAccount(account_input);
        initApi();
        const cuenta = resolverObjeto(undefined, 'campana', accountId);
        const [conjCursor, insCursor] = await Promise.all([
          cuenta.getAdSets(['id', 'name', 'effective_status', 'learning_stage_info', 'daily_budget', 'lifetime_budget'], { limit: limite }),
          cuenta.getInsights(['adset_id', 'spend'], { time_range: JSON.stringify({ since: fInicio, until: fFin }), level: 'adset', limit: 500 }),
        ]);
        const conjuntos = cursorToArray(conjCursor);
        if (!conjuntos?.length) return { content: [{ type: 'text', text: 'No se encontraron conjuntos en la cuenta.' }] };
        const gastoPorId: Record<string, number> = {};
        for (const i of cursorToArray(insCursor)) gastoPorId[i.adset_id] = parseFloat(i.spend ?? '0');

        const fases: Record<string, string> = { LEARNING: '📚 Aprendiendo', SUCCESS: '✅ Aprendizaje completo', LEARNING_LIMITED: '⚠ Aprendizaje limitado', FAIL: '🔴 Aprendizaje fallido' };
        const lineas = [`Salud de conjuntos — cuenta ${account_input} (${fInicio} → ${fFin})\n`];
        for (const cs of conjuntos) {
          if (cs.effective_status !== 'ACTIVE') continue;
          const fase = fases[cs.learning_stage_info?.status] ?? 'Sin fase';
          const presDiario = cs.daily_budget ? parseFloat(cs.daily_budget) / 100 : 0;
          const gasto = gastoPorId[cs.id] ?? 0;
          let pacing = '';
          if (presDiario > 0) {
            const esperado = presDiario * dias;
            const pct = esperado > 0 ? (gasto / esperado) * 100 : 0;
            pacing = pct < 50 ? `  ⚠ sub-gastando (${pct.toFixed(0)}% de su presupuesto)` : '';
          }
          lineas.push(`  ${cs.name}\n    ${fase} | Gasto: $${money(gasto)}${presDiario > 0 ? ` | Presup. diario: $${money(presDiario)}` : ''}${pacing}`);
        }
        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error en salud de conjuntos: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'funnel_conversacion',
    {
      description: 'Embudo de conversaciones de mensajería: contactos, conversaciones iniciadas, primera respuesta, profundidad (2/3/5 mensajes) y bloqueos, con el porcentaje de caída en cada paso. Toda la cuenta o una campaña.',
      inputSchema: {
        account_input: z.string(),
        fecha_inicio: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hace 30 días'),
        fecha_fin: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hoy'),
        objeto_id: z.string().optional().describe('Si se pasa, solo esa campaña'),
      },
    },
    async ({ account_input, fecha_inicio, fecha_fin, objeto_id }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const { fInicio, fFin } = rangoPorDefecto(fecha_inicio, fecha_fin);
        const accountId = await resolveAccount(account_input);
        initApi();
        const objeto = resolverObjeto(objeto_id, 'campana', accountId);
        const cursor = await objeto.getInsights(['spend', 'actions'], { time_range: JSON.stringify({ since: fInicio, until: fFin }) });
        const fila = cursorToArray(cursor)[0];
        const gasto = parseFloat(fila?.spend ?? '0') || 0;
        const { pasos, base, cpaNominal, cpaReal, bloqueos } = construirEmbudo(fila?.actions, gasto);

        if (!pasos.length) return { content: [{ type: 'text', text: `Sin datos de mensajería para ${fInicio} → ${fFin}.` }] };
        const lineas = [`Embudo de conversación — ${objeto_id ? `campaña ${objeto_id}` : `cuenta ${account_input}`} (${fInicio} → ${fFin})\n`];
        for (let k = 0; k < pasos.length; k++) {
          const p = pasos[k];
          const pctBase = base > 0 ? ((p.num / base) * 100).toFixed(0) : '0';
          let caida = '';
          if (k > 0 && pasos[k - 1].num > 0) {
            const c = ((pasos[k - 1].num - p.num) / pasos[k - 1].num) * 100;
            if (c > 0) caida = `  (↓ ${c.toFixed(0)}% vs paso anterior)`;
          }
          lineas.push(`  ${p.label}: ${p.num} · ${pctBase}% del inicio${caida}`);
        }
        if (cpaNominal != null) lineas.push(`\nCPA nominal (por conversación): $${money(cpaNominal)}`);
        if (cpaReal != null) lineas.push(`CPA real (hasta 3 msgs, prospecto interesado): $${money(cpaReal)}`);
        if (bloqueos > 0) lineas.push(`🚫 Bloqueos: ${bloqueos}`);
        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error en funnel de conversación: ${e.message}` }] };
      }
    },
  );
}
