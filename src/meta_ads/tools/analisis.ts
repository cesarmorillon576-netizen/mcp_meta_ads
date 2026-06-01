import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, initApi, resolveAccount, cursorToArray, nextCursor, mejorResultado, money, rangoPorDefecto, resolverObjeto } from '../helpers.js';

export function registrarHerramientasAnalisis(server: McpServer) {
  server.registerTool(
    'tendencia_diaria',
    {
      description: 'Serie día a día de gasto y resultado (conversaciones/leads/etc.) para detectar tendencias y el día exacto de una caída. Toda la cuenta o un objeto específico.',
      inputSchema: {
        account_input: z.string(),
        fecha_inicio: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hace 30 días'),
        fecha_fin: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hoy'),
        objeto_id: z.string().optional(),
        objeto_tipo: z.enum(['campana', 'conjunto', 'anuncio']).default('campana'),
      },
    },
    async ({ account_input, fecha_inicio, fecha_fin, objeto_id, objeto_tipo }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const { fInicio, fFin } = rangoPorDefecto(fecha_inicio, fecha_fin);
        const accountId = await resolveAccount(account_input);
        initApi();
        const objeto = resolverObjeto(objeto_id, objeto_tipo, accountId);
        const cursor = await objeto.getInsights(['spend', 'clicks', 'impressions', 'actions'], {
          time_range: JSON.stringify({ since: fInicio, until: fFin }),
          time_increment: 1,
        });
        const filas = cursorToArray(cursor);
        if (!filas?.length) return { content: [{ type: 'text', text: `Sin datos para ${fInicio} → ${fFin}.` }] };

        const serie = filas.map((f: any) => {
          const r = mejorResultado(f);
          return { dia: f.date_start, gasto: parseFloat(f.spend ?? '0'), num: r?.num ?? 0, etiqueta: r?.etiqueta ?? 'resultados' };
        }).sort((a: any, b: any) => String(a.dia).localeCompare(String(b.dia)));
        const etiqueta = serie.find((s: any) => s.num > 0)?.etiqueta ?? 'resultados';
        const lineas = [`Tendencia diaria — ${objeto_id ? `${objeto_tipo} ${objeto_id}` : `cuenta ${account_input}`} (${fInicio} → ${fFin})\n`];
        let caidaMax = { dia: '', baja: 0 };
        for (let k = 0; k < serie.length; k++) {
          const s = serie[k];
          const cpa = s.num > 0 ? ` · $${money(s.gasto / s.num)} c/u` : '';
          lineas.push(`  ${s.dia} → ${s.num} ${etiqueta} · gasto $${money(s.gasto)}${cpa}`);
          if (k > 0) {
            const baja = serie[k - 1].num - s.num;
            if (baja > caidaMax.baja) caidaMax = { dia: s.dia, baja };
          }
        }
        const totalNum = serie.reduce((a: number, s: any) => a + s.num, 0);
        const totalGasto = serie.reduce((a: number, s: any) => a + s.gasto, 0);
        lineas.push(`\nTotal: ${totalNum} ${etiqueta} · gasto $${money(totalGasto)}${totalNum > 0 ? ` · CPA $${money(totalGasto / totalNum)}` : ''}`);
        if (caidaMax.baja > 0) lineas.push(`⚠ Mayor caída: ${caidaMax.dia} (${caidaMax.baja} ${etiqueta} menos que el día anterior)`);
        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error en tendencia diaria: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'comparar_periodos',
    {
      description: 'Compara dos periodos (gasto, resultados y CPA) y muestra el cambio porcentual. Si no se da el periodo anterior, usa automáticamente el periodo inmediato anterior de igual duración.',
      inputSchema: {
        account_input: z.string(),
        fecha_inicio: z.string().describe('Inicio del periodo actual, YYYY-MM-DD'),
        fecha_fin: z.string().describe('Fin del periodo actual, YYYY-MM-DD'),
        comparar_inicio: z.string().optional().describe('Inicio del periodo anterior. Opcional.'),
        comparar_fin: z.string().optional().describe('Fin del periodo anterior. Opcional.'),
        objeto_id: z.string().optional(),
        objeto_tipo: z.enum(['campana', 'conjunto', 'anuncio']).default('campana'),
      },
    },
    async ({ account_input, fecha_inicio, fecha_fin, comparar_inicio, comparar_fin, objeto_id, objeto_tipo }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const dia = 86400000;
        const ini = new Date(fecha_inicio);
        const fin = new Date(fecha_fin);
        const largo = Math.round((fin.getTime() - ini.getTime()) / dia) + 1;
        const antFin = comparar_fin ?? new Date(ini.getTime() - dia).toISOString().split('T')[0];
        const antIni = comparar_inicio ?? new Date(ini.getTime() - largo * dia).toISOString().split('T')[0];

        const accountId = await resolveAccount(account_input);
        initApi();
        const objeto = resolverObjeto(objeto_id, objeto_tipo, accountId);
        const medir = async (desde: string, hasta: string) => {
          const cursor = await objeto.getInsights(['spend', 'actions'], { time_range: JSON.stringify({ since: desde, until: hasta }) });
          const fila = cursorToArray(cursor)[0];
          const r = mejorResultado(fila);
          return { gasto: parseFloat(fila?.spend ?? '0'), num: r?.num ?? 0, etiqueta: r?.etiqueta ?? 'resultados' };
        };
        const actual = await medir(fecha_inicio, fecha_fin);
        const anterior = await medir(antIni, antFin);
        const etiqueta = actual.etiqueta !== 'resultados' ? actual.etiqueta : anterior.etiqueta;

        const delta = (a: number, b: number) => {
          if (b === 0) return a === 0 ? '0%' : 'nuevo';
          const pct = ((a - b) / b) * 100;
          return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
        };
        const cpaA = actual.num > 0 ? actual.gasto / actual.num : 0;
        const cpaB = anterior.num > 0 ? anterior.gasto / anterior.num : 0;
        const lineas = [
          `Comparación — ${objeto_id ? `${objeto_tipo} ${objeto_id}` : `cuenta ${account_input}`}`,
          `  Actual:   ${fecha_inicio} → ${fecha_fin}`,
          `  Anterior: ${antIni} → ${antFin}\n`,
          `Gasto:        $${money(anterior.gasto)} → $${money(actual.gasto)}  (${delta(actual.gasto, anterior.gasto)})`,
          `${etiqueta}: ${anterior.num} → ${actual.num}  (${delta(actual.num, anterior.num)})`,
          `CPA:          $${money(cpaB)} → $${money(cpaA)}  (${cpaB ? delta(cpaA, cpaB) : 'nuevo'})`,
        ];
        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al comparar periodos: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'ranking_anuncios',
    {
      description: 'Ordena los anuncios de mejor a peor por costo por resultado (CPA) o por número de resultados, mostrando los mejores y los peores. Toda la cuenta o una campaña.',
      inputSchema: {
        account_input: z.string(),
        fecha_inicio: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hace 30 días'),
        fecha_fin: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hoy'),
        objeto_id: z.string().optional().describe('Si se pasa, solo esa campaña'),
        objeto_tipo: z.enum(['campana', 'conjunto']).default('campana'),
        ordenar_por: z.enum(['cpa', 'resultados']).default('cpa'),
        top: z.number().int().default(5),
      },
    },
    async ({ account_input, fecha_inicio, fecha_fin, objeto_id, objeto_tipo, ordenar_por, top }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const { fInicio, fFin } = rangoPorDefecto(fecha_inicio, fecha_fin);
        const accountId = await resolveAccount(account_input);
        initApi();
        const objeto = resolverObjeto(objeto_id, objeto_tipo, accountId);
        const cursor = await objeto.getInsights(['ad_name', 'spend', 'impressions', 'actions'], {
          time_range: JSON.stringify({ since: fInicio, until: fFin }),
          level: 'ad',
          limit: 200,
        });
        const filas = cursorToArray(cursor);
        if (!filas?.length) return { content: [{ type: 'text', text: `Sin anuncios con datos en ${fInicio} → ${fFin}.` }] };

        const anuncios = filas.map((f: any) => {
          const r = mejorResultado(f);
          const gasto = parseFloat(f.spend ?? '0');
          const num = r?.num ?? 0;
          return { nombre: f.ad_name, gasto, num, etiqueta: r?.etiqueta ?? 'resultados', cpa: num > 0 ? gasto / num : Infinity };
        });
        const conResultado = anuncios.filter((a: any) => a.num > 0);
        const sinResultado = anuncios.filter((a: any) => a.num === 0 && a.gasto > 0);

        const orden = ordenar_por === 'cpa'
          ? [...conResultado].sort((a, b) => a.cpa - b.cpa)
          : [...conResultado].sort((a, b) => b.num - a.num);

        const fmt = (a: any) => `  ${a.nombre} — ${a.num} ${a.etiqueta} · $${money(a.cpa)} c/u · gasto $${money(a.gasto)}`;
        const lineas = [`Ranking de anuncios por ${ordenar_por === 'cpa' ? 'CPA' : 'resultados'} — ${objeto_id ? `${objeto_tipo} ${objeto_id}` : `cuenta ${account_input}`} (${fInicio} → ${fFin})\n`];
        lineas.push(`🏆 Mejores ${Math.min(top, orden.length)}:`);
        orden.slice(0, top).forEach((a) => lineas.push(fmt(a)));
        const peores = orden.slice(top).reverse().slice(0, top);
        if (peores.length) {
          lineas.push(`\n🔻 Peores ${peores.length}:`);
          peores.forEach((a) => lineas.push(fmt(a)));
        }
        if (sinResultado.length) {
          lineas.push(`\n⚠ ${sinResultado.length} anuncio(s) con gasto y sin resultados:`);
          sinResultado.sort((a: any, b: any) => b.gasto - a.gasto).slice(0, top).forEach((a: any) => lineas.push(`  ${a.nombre} · gasto $${money(a.gasto)}`));
        }
        if (nextCursor(cursor)) lineas.push(`\n📄 Se analizaron los primeros ${filas.length} anuncios; hay más. Acota con objeto_id (campaña) para un análisis completo.`);
        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error en ranking de anuncios: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'resumen_cuenta',
    {
      description: 'Panorama ejecutivo de una cuenta en una sola llamada: gasto total, resultados, CPA promedio, campañas activas y alertas rápidas.',
      inputSchema: {
        account_input: z.string(),
        fecha_inicio: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hace 30 días'),
        fecha_fin: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hoy'),
      },
    },
    async ({ account_input, fecha_inicio, fecha_fin }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const { fInicio, fFin } = rangoPorDefecto(fecha_inicio, fecha_fin);
        const accountId = await resolveAccount(account_input);
        initApi();
        const cuenta = resolverObjeto(undefined, 'campana', accountId);
        const [insCursor, campCursor] = await Promise.all([
          cuenta.getInsights(['spend', 'impressions', 'clicks', 'ctr', 'actions'], { time_range: JSON.stringify({ since: fInicio, until: fFin }) }),
          cuenta.getCampaigns(['name', 'effective_status'], { limit: 500 }),
        ]);
        const fila = cursorToArray(insCursor)[0];
        const campañas = cursorToArray(campCursor);
        const activas = campañas.filter((c: any) => c.effective_status === 'ACTIVE');

        const gasto = parseFloat(fila?.spend ?? '0');
        const r = mejorResultado(fila);
        const num = r?.num ?? 0;
        const etiqueta = r?.etiqueta ?? 'resultados';
        const ctr = parseFloat(fila?.ctr ?? '0');

        const lineas = [
          `📋 Resumen — cuenta ${account_input} (${fInicio} → ${fFin})\n`,
          `  Gasto total:     $${money(gasto)}`,
          `  ${etiqueta[0].toUpperCase() + etiqueta.slice(1)}: ${num}${num > 0 ? ` · CPA $${money(gasto / num)}` : ''}`,
          `  CTR promedio:    ${ctr.toFixed(2)}%`,
          `  Campañas:        ${activas.length} activas de ${campañas.length}`,
        ];
        const alertas: string[] = [];
        if (gasto > 0 && num === 0) alertas.push('Gasto sin resultados registrados');
        if (ctr > 0 && ctr < 0.8) alertas.push(`CTR bajo (${ctr.toFixed(2)}%)`);
        if (activas.length === 0 && campañas.length > 0) alertas.push('Ninguna campaña activa');
        if (alertas.length) lineas.push(`\n⚠ Alertas: ${alertas.join(' · ')}`);
        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error en resumen de cuenta: ${e.message}` }] };
      }
    },
  );
}
