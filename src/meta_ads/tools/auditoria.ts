import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, initApi, resolveAccount, cursorToArray, mejorResultado, money, rangoPorDefecto, resolverObjeto, construirEmbudo, evaluarResultadoCampana, flagsCalidad, ESTADOS_PROBLEMA } from '../helpers.js';
import { generarReporteCompletoCampana } from './reporte_completo.js';
import { agregarHoras, paresSolapados } from './optimizacion.js';
import { analizarSaludCuenta } from './informacion.js';

const DIA = 86400000;
const flt = (v: any) => parseFloat(v ?? '0') || 0;
const int = (v: any) => parseInt(v ?? '0', 10) || 0;

async function mapLimitado<T, R>(items: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(items.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (true) {
      const i = siguiente++;
      if (i >= items.length) return;
      resultados[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
  return resultados;
}

type Seccion = { titulo: string; lineas: string[]; alertas: string[] };

async function seccResumen(cuenta: any, fInicio: string, fFin: string): Promise<Seccion> {
  const [insCur, campCur] = await Promise.all([
    cuenta.getInsights(['spend', 'ctr', 'impressions', 'actions'], { time_range: JSON.stringify({ since: fInicio, until: fFin }) }),
    cuenta.getCampaigns(['effective_status'], { limit: 500 }),
  ]);
  const fila = cursorToArray(insCur)[0];
  const camps = cursorToArray(campCur);
  const activas = camps.filter((c: any) => c.effective_status === 'ACTIVE').length;
  const gasto = flt(fila?.spend);
  const r = mejorResultado(fila);
  const numR = r?.num ?? 0;
  const etiqueta = r?.etiqueta ?? 'resultados';
  const ctr = flt(fila?.ctr);
  const lineas = [
    `Gasto total: $${money(gasto)}`,
    `${etiqueta}: ${numR}${numR > 0 ? ` · CPA $${money(gasto / numR)}` : ''}`,
    `CTR promedio: ${ctr.toFixed(2)}%`,
    `Campañas activas: ${activas} de ${camps.length}`,
  ];
  const alertas: string[] = [];
  if (gasto > 0 && numR === 0) alertas.push('🔴 La cuenta gastó sin resultados registrados');
  if (ctr > 0 && ctr < 0.8) alertas.push(`🟠 CTR bajo a nivel cuenta (${ctr.toFixed(2)}%)`);
  if (activas === 0 && camps.length > 0) alertas.push('🟠 Ninguna campaña activa');
  return { titulo: '1. Resumen ejecutivo', lineas, alertas };
}

async function seccComparacion(cuenta: any, fInicio: string, fFin: string): Promise<Seccion> {
  const ini = new Date(fInicio);
  const largo = Math.round((new Date(fFin).getTime() - ini.getTime()) / DIA) + 1;
  const antFin = new Date(ini.getTime() - DIA).toISOString().split('T')[0];
  const antIni = new Date(ini.getTime() - largo * DIA).toISOString().split('T')[0];
  const medir = async (desde: string, hasta: string) => {
    const fila = cursorToArray(await cuenta.getInsights(['spend', 'actions'], { time_range: JSON.stringify({ since: desde, until: hasta }) }))[0];
    const r = mejorResultado(fila);
    return { gasto: flt(fila?.spend), num: r?.num ?? 0, etiqueta: r?.etiqueta ?? 'resultados' };
  };
  const [act, ant] = await Promise.all([medir(fInicio, fFin), medir(antIni, antFin)]);
  const etiqueta = act.etiqueta !== 'resultados' ? act.etiqueta : ant.etiqueta;
  const delta = (a: number, b: number) => (b === 0 ? (a === 0 ? '0%' : 'nuevo') : `${a - b >= 0 ? '+' : ''}${(((a - b) / b) * 100).toFixed(1)}%`);
  const cpaA = act.num > 0 ? act.gasto / act.num : 0;
  const cpaB = ant.num > 0 ? ant.gasto / ant.num : 0;
  const lineas = [
    `Periodo anterior: ${antIni} → ${antFin}`,
    `Gasto: $${money(ant.gasto)} → $${money(act.gasto)} (${delta(act.gasto, ant.gasto)})`,
    `${etiqueta}: ${ant.num} → ${act.num} (${delta(act.num, ant.num)})`,
    `CPA: $${money(cpaB)} → $${money(cpaA)} (${cpaB ? delta(cpaA, cpaB) : 'nuevo'})`,
  ];
  const alertas: string[] = [];
  if (ant.num > 0 && act.num < ant.num * 0.8) alertas.push(`🔴 Caída de ${etiqueta}: ${delta(act.num, ant.num)} vs periodo anterior`);
  if (cpaB > 0 && cpaA > cpaB * 1.2) alertas.push(`🟠 CPA subió ${delta(cpaA, cpaB)} vs periodo anterior`);
  return { titulo: '2. Comparación con el periodo anterior', lineas, alertas };
}

async function seccFunnel(cuenta: any, fInicio: string, fFin: string): Promise<Seccion> {
  const fila = cursorToArray(await cuenta.getInsights(['spend', 'inline_link_clicks', 'actions'], { time_range: JSON.stringify({ since: fInicio, until: fFin }) }))[0];
  const gasto = flt(fila?.spend);
  const { pasos, base, cpaNominal, cpaReal, bloqueos } = construirEmbudo(fila, gasto);
  if (!pasos.length) return { titulo: '3. Embudo de conversación (WhatsApp)', lineas: ['Sin datos de mensajería en el periodo.'], alertas: [] };
  const lineas: string[] = [];
  const alertas: string[] = [];
  for (let k = 0; k < pasos.length; k++) {
    const p = pasos[k];
    const pctBase = base > 0 ? ((p.num / base) * 100).toFixed(0) : '0';
    let caida = '';
    if (k > 0 && pasos[k - 1].num > 0) {
      const c = ((pasos[k - 1].num - p.num) / pasos[k - 1].num) * 100;
      if (c > 0) caida = ` (↓ ${c.toFixed(0)}%)`;
      if (c >= 50) alertas.push(`🔴 Fuga fuerte en el embudo: "${p.label}" cae ${c.toFixed(0)}% desde el paso anterior`);
    }
    lineas.push(`${p.label}: ${p.num} · ${pctBase}% del inicio${caida}`);
  }
  if (cpaNominal != null) lineas.push(`\nCPA nominal (por conversación): $${money(cpaNominal)}`);
  if (cpaReal != null) lineas.push(`CPA real (hasta 3 msgs, prospecto interesado): $${money(cpaReal)}`);
  if (bloqueos > 0) lineas.push(`🚫 Bloqueos: ${bloqueos}`);
  return { titulo: '3. Embudo de conversación (WhatsApp)', lineas, alertas };
}

async function seccRanking(cuenta: any, fInicio: string, fFin: string): Promise<Seccion> {
  const filas = cursorToArray(await cuenta.getInsights(['ad_name', 'spend', 'actions'], { time_range: JSON.stringify({ since: fInicio, until: fFin }), level: 'ad', limit: 200 }));
  if (!filas.length) return { titulo: '4. Ranking de anuncios', lineas: ['Sin anuncios con datos.'], alertas: [] };
  const anuncios = filas.map((f: any) => {
    const r = mejorResultado(f);
    const gasto = flt(f.spend);
    const n = r?.num ?? 0;
    return { nombre: f.ad_name, gasto, num: n, etiqueta: r?.etiqueta ?? 'resultados', cpa: n > 0 ? gasto / n : Infinity };
  });
  const conR = anuncios.filter((a: any) => a.num > 0).sort((a: any, b: any) => a.cpa - b.cpa);
  const sinR = anuncios.filter((a: any) => a.num === 0 && a.gasto > 0).sort((a: any, b: any) => b.gasto - a.gasto);
  const fmt = (a: any) => `${a.nombre} — ${a.num} ${a.etiqueta} · $${money(a.cpa)} c/u · gasto $${money(a.gasto)}`;
  const lineas: string[] = [];
  const alertas: string[] = [];
  if (conR.length) {
    lineas.push('🏆 Mejores:');
    conR.slice(0, 3).forEach((a: any) => lineas.push(`  ${fmt(a)}`));
    const peores = conR.slice(3).reverse().slice(0, 3);
    if (peores.length) { lineas.push('🔻 Peores:'); peores.forEach((a: any) => lineas.push(`  ${fmt(a)}`)); }
  }
  if (sinR.length) {
    lineas.push(`⚠ ${sinR.length} anuncio(s) con gasto y sin resultados:`);
    sinR.slice(0, 3).forEach((a: any) => lineas.push(`  ${a.nombre} · gasto $${money(a.gasto)}`));
    const desperdicio = sinR.reduce((s: number, a: any) => s + a.gasto, 0);
    if (desperdicio > 0) alertas.push(`🟠 $${money(desperdicio)} gastados en anuncios sin ningún resultado`);
  }
  return { titulo: '4. Ranking de anuncios', lineas, alertas };
}

async function seccSegmentos(cuenta: any, fInicio: string, fFin: string): Promise<Seccion> {
  const tr = JSON.stringify({ since: fInicio, until: fFin });
  const traer = async (breakdown: string) => cursorToArray(await cuenta.getInsights(['spend', 'actions'], { time_range: tr, breakdowns: breakdown, limit: 50 }));
  const [edad, genero] = await Promise.all([traer('age'), traer('gender')]);
  const lineas: string[] = [];
  const alertas: string[] = [];
  const analizar = (filas: any[], etiquetaSeg: string, traduc: (v: any) => string) => {
    const segs = filas.map((f: any) => {
      const r = mejorResultado(f);
      const gasto = flt(f.spend);
      const n = r?.num ?? 0;
      return { seg: traduc(f.age ?? f.gender), gasto, num: n, cpa: n > 0 ? gasto / n : Infinity };
    }).filter((s: any) => s.gasto > 0);
    if (!segs.length) return;
    const conR = segs.filter((s: any) => s.num > 0);
    const cpaProm = conR.length ? conR.reduce((a: number, s: any) => a + s.cpa, 0) / conR.length : 0;
    lineas.push(`Por ${etiquetaSeg}:`);
    segs.sort((a: any, b: any) => a.cpa - b.cpa).forEach((s: any) => {
      const caro = cpaProm > 0 && s.cpa > cpaProm * 1.8 && s.num > 0 ? '  ⚠ caro' : '';
      lineas.push(`  ${s.seg}: ${s.num > 0 ? `${s.num} a $${money(s.cpa)} c/u` : 'sin resultados'} · gasto $${money(s.gasto)}${caro}`);
      if (caro) alertas.push(`🟡 Segmento caro (${etiquetaSeg} ${s.seg}): CPA $${money(s.cpa)} vs promedio $${money(cpaProm)}`);
    });
  };
  const traducGenero: Record<string, string> = { male: 'Hombres', female: 'Mujeres', unknown: 'Desconocido' };
  analizar(edad, 'edad', (v) => v ?? '(s/d)');
  analizar(genero, 'género', (v) => traducGenero[v] ?? v ?? '(s/d)');
  if (!lineas.length) lineas.push('Sin datos de segmentación en el periodo.');
  return { titulo: '5. Segmentación (entrega real)', lineas, alertas };
}

async function seccFugas(cuenta: any, fInicio: string, fFin: string): Promise<Seccion> {
  const filas = cursorToArray(await cuenta.getInsights(['campaign_name', 'objective', 'impressions', 'ctr', 'spend', 'actions'], { time_range: JSON.stringify({ since: fInicio, until: fFin }), level: 'campaign', limit: 100 }));
  const lineas: string[] = [];
  const alertas: string[] = [];
  for (const f of filas) {
    const gasto = flt(f.spend);
    const impresiones = int(f.impressions);
    const { tipo, numResultado, evaluable } = evaluarResultadoCampana(f);
    if (gasto > 0 && evaluable && numResultado === 0) {
      lineas.push(`🔴 ${f.campaign_name} [${tipo}]: gastó $${money(gasto)} sin resultados`);
      alertas.push(`🔴 Fuga: "${f.campaign_name}" gastó $${money(gasto)} sin resultados`);
    } else if (impresiones === 0 && gasto === 0) {
      lineas.push(`⚪ ${f.campaign_name}: sin entregas`);
    }
  }
  if (!lineas.length) lineas.push('No se detectaron fugas de dinero evidentes.');
  return { titulo: '6. Fugas de dinero', lineas, alertas };
}

async function seccCalidad(cuenta: any, fInicio: string, fFin: string): Promise<Seccion> {
  const filas = cursorToArray(await cuenta.getInsights(['ad_name', 'quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking', 'frequency', 'spend'], { time_range: JSON.stringify({ since: fInicio, until: fFin }), level: 'ad', limit: 200 }));
  const lineas: string[] = [];
  const alertas: string[] = [];
  for (const f of filas) {
    const { problemas, frecuencia, esMalo } = flagsCalidad(f);
    if (problemas.length) {
      lineas.push(`⚠ ${f.ad_name}: ${problemas.join(', ')}`);
      if (frecuencia >= 4 || esMalo(f.conversion_rate_ranking)) alertas.push(`🟠 Anuncio "${f.ad_name}": ${problemas.join(', ')}`);
    }
  }
  if (!lineas.length) lineas.push('Sin problemas de calidad ni fatiga detectados.');
  return { titulo: '7. Calidad y fatiga de anuncios', lineas, alertas };
}

async function seccErrores(cuenta: any): Promise<Seccion> {
  const [campC, conjC, adsC] = await Promise.all([
    cuenta.getCampaigns(['name', 'effective_status'], { limit: 100 }),
    cuenta.getAdSets(['name', 'effective_status', 'issues_info'], { limit: 100 }),
    cuenta.getAds(['name', 'effective_status', 'issues_info'], { limit: 100 }),
  ]);
  const problema = new Set(ESTADOS_PROBLEMA);
  const lineas: string[] = [];
  const revisar = (items: any[], etiqueta: string) => {
    for (const it of items) {
      if (problema.has(it.effective_status)) {
        const detalle = (it.issues_info ?? []).map((i: any) => i.error_message).filter(Boolean).join('; ') || it.effective_status;
        lineas.push(`⚠ [${etiqueta}] ${it.name}: ${detalle}`);
      }
    }
  };
  revisar(cursorToArray(conjC), 'CONJUNTO');
  revisar(cursorToArray(adsC), 'ANUNCIO');
  const alertas = lineas.length ? [`🟠 ${lineas.length} objeto(s) con errores o rechazos de Meta`] : [];
  if (!lineas.length) lineas.push('Sin errores ni rechazos activos.');
  return { titulo: '8. Errores y rechazos', lineas, alertas };
}

async function seccSalud(cuenta: any, fInicio: string, fFin: string): Promise<Seccion> {
  const dias = Math.max(1, Math.round((new Date(fFin).getTime() - new Date(fInicio).getTime()) / DIA) + 1);
  const [conjC, insC] = await Promise.all([
    cuenta.getAdSets(['id', 'name', 'effective_status', 'learning_stage_info', 'daily_budget'], { limit: 100 }),
    cuenta.getInsights(['adset_id', 'spend'], { time_range: JSON.stringify({ since: fInicio, until: fFin }), level: 'adset', limit: 500 }),
  ]);
  const gastoPorId: Record<string, number> = {};
  for (const i of cursorToArray(insC)) gastoPorId[i.adset_id] = flt(i.spend);
  const fases: Record<string, string> = { LEARNING: '📚 Aprendiendo', SUCCESS: '✅ Completo', LEARNING_LIMITED: '⚠ Limitado', FAIL: '🔴 Fallido' };
  const lineas: string[] = [];
  const alertas: string[] = [];
  for (const cs of cursorToArray(conjC)) {
    if (cs.effective_status !== 'ACTIVE') continue;
    const fase = fases[cs.learning_stage_info?.status] ?? '';
    const pres = cs.daily_budget ? flt(cs.daily_budget) / 100 : 0;
    const gasto = gastoPorId[cs.id] ?? 0;
    let pacing = '';
    if (pres > 0) {
      const pct = (gasto / (pres * dias)) * 100;
      if (pct < 50) { pacing = `  ⚠ sub-gastando (${pct.toFixed(0)}%)`; alertas.push(`🟡 Conjunto "${cs.name}" sub-gastando (${pct.toFixed(0)}% de su presupuesto)`); }
    }
    if (fase || pacing) lineas.push(`${cs.name}: ${fase}${pres > 0 ? ` · presup. $${money(pres)}/día` : ''}${pacing}`);
  }
  if (!lineas.length) lineas.push('Sin conjuntos activos con datos de aprendizaje/pacing.');
  return { titulo: '9. Salud de conjuntos', lineas, alertas };
}

async function seccSaludCuenta(cuenta: any): Promise<Seccion> {
  const c: any = await cuenta.read(['account_status', 'disable_reason', 'currency', 'amount_spent', 'spend_cap', 'balance']);
  const salud = analizarSaludCuenta(c);
  const lineas = [`Estado: ${salud.estado}`, `Moneda: ${c.currency ?? 'N/A'}`];
  if (salud.razonBloqueo) lineas.push(`Motivo de restricción: ${salud.razonBloqueo}`);
  if (salud.topeMonto != null) lineas.push(`Tope de gasto: $${money(salud.topeMonto)} — usado ${salud.topePct}%`);
  if (salud.saldo > 0) lineas.push(`Saldo pendiente por cobrar: $${money(salud.saldo)}`);
  return { titulo: '0. Salud de la cuenta', lineas, alertas: salud.alertas };
}

async function seccSolapamiento(cuenta: any): Promise<Seccion> {
  const conjuntos = cursorToArray(await cuenta.getAdSets(
    ['id', 'name', 'campaign_id', 'effective_status', 'targeting'],
    { limit: 100, effective_status: JSON.stringify(['ACTIVE']) },
  )).filter((a: any) => a.effective_status === 'ACTIVE');
  if (conjuntos.length < 2) return { titulo: '11. Solapamiento de audiencias', lineas: ['Menos de 2 conjuntos activos; sin solapamiento posible.'], alertas: [] };
  const pares = paresSolapados(conjuntos);
  if (!pares.length) return { titulo: '11. Solapamiento de audiencias', lineas: [`No se detectó solapamiento evidente entre los ${conjuntos.length} conjuntos activos.`], alertas: [] };
  const TOPE = 8;
  const lineas = pares.slice(0, TOPE).map((p) => `⚠️ "${p.a}" ↔ "${p.b}"${p.mismaCampana ? ' (misma campaña)' : ''} — comparten ${p.geoTxt}${p.intTxt}`);
  if (pares.length > TOPE) lineas.push(`(+${pares.length - TOPE} par(es) más con solapamiento)`);
  const alertas = [`🟠 ${pares.length} par(es) de conjuntos activos se solapan (canibalización: suben tu propio CPM)`];
  return { titulo: '11. Solapamiento de audiencias', lineas, alertas };
}

async function seccHorarios(cuenta: any, fInicio: string, fFin: string): Promise<Seccion> {
  const filas = cursorToArray(await cuenta.getInsights(
    ['spend', 'actions', 'clicks'],
    { time_range: JSON.stringify({ since: fInicio, until: fFin }), breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone', limit: 500 },
  ));
  if (!filas.length) return { titulo: '12. Day-parting (horarios)', lineas: ['Sin datos horarios en el periodo.'], alertas: [] };
  const { etiquetaRes, totalRes, totalSpend, totalFuga, ventana, pctVentana } = agregarHoras(filas);
  const lineas: string[] = [];
  const alertas: string[] = [];
  if (totalRes > 0) lineas.push(`Ventana caliente: el ${pctVentana}% de ${etiquetaRes} se concentra en → ${ventana.map((h) => `${String(h).padStart(2, '0')}h`).join(', ')}`);
  if (totalFuga > 0 && totalSpend > 0) {
    const pctFuga = Math.round((totalFuga / totalSpend) * 100);
    lineas.push(`Gasto en horas sin ningún resultado: $${money(totalFuga)} (${pctFuga}% del total)`);
    if (pctFuga >= 15) alertas.push(`🟠 $${money(totalFuga)} (${pctFuga}%) se gasta en horas que no generan ${etiquetaRes} — considera programación horaria`);
  }
  if (!lineas.length) lineas.push('Sin concentración horaria relevante.');
  return { titulo: '12. Day-parting (horarios)', lineas, alertas };
}

async function seccCampanas(cuenta: any, fInicio: string, fFin: string): Promise<Seccion> {
  const filas = cursorToArray(await cuenta.getInsights(
    ['campaign_id', 'campaign_name', 'spend', 'cpm', 'impressions', 'inline_link_clicks', 'actions'],
    { time_range: JSON.stringify({ since: fInicio, until: fFin }), level: 'campaign', limit: 100 },
  ));
  const conGasto = filas.filter((f: any) => flt(f.spend) > 0).sort((a: any, b: any) => flt(b.spend) - flt(a.spend));
  if (!conGasto.length) return { titulo: '10. Detalle exhaustivo por campaña', lineas: ['Sin campañas con gasto en el periodo.'], alertas: [] };

  const cpms = conGasto.map((f: any) => flt(f.cpm)).filter((x: number) => x > 0).sort((a: number, b: number) => a - b);
  const cpmMed = cpms.length ? cpms[Math.floor(cpms.length / 2)] : 0;
  const TOPE = 4;
  const objetivo = conGasto.slice(0, TOPE);
  const alertas: string[] = [];
  for (const f of objetivo) {
    const { pasos } = construirEmbudo(f, flt(f.spend));
    const clics = pasos.find((p) => p.label.startsWith('Clics'))?.num ?? 0;
    const iniciadas = pasos.find((p) => p.label.startsWith('Conversaciones'))?.num ?? 0;
    if (clics > 30 && iniciadas > 0 && iniciadas < clics * 0.25)
      alertas.push(`🔴 "${f.campaign_name}": de ${clics} clics solo ${iniciadas} escribieron (${((iniciadas / clics) * 100).toFixed(0)}%) — fuga al saltar a WhatsApp`);
    const cpm = flt(f.cpm);
    if (cpmMed > 0 && cpm > cpmMed * 1.8)
      alertas.push(`🟠 "${f.campaign_name}": CPM $${money(cpm)} (${(cpm / cpmMed).toFixed(1)}x la mediana) — audiencia probablemente muy chica`);
  }

  const reportes = await mapLimitado(objetivo, 2, async (f: any) => {
    try { return await generarReporteCompletoCampana(String(f.campaign_id), { timeRange: { since: fInicio, until: fFin }, incluirAnuncios: true }); }
    catch (e: any) { return `(no se pudo detallar "${f.campaign_name}": ${e.message})`; }
  });
  const lineas: string[] = [];
  reportes.forEach((r) => { lineas.push(r, ''); });
  if (conGasto.length > TOPE) lineas.push(`(+${conGasto.length - TOPE} campañas más con gasto, no detalladas por límite de tamaño)`);
  return { titulo: '10. Detalle exhaustivo por campaña', lineas, alertas };
}

export function registrarHerramientasAuditoria(server: McpServer) {
  server.registerTool(
    'auditoria_completa',
    {
      description: 'Auditoría exhaustiva de una cuenta en UNA sola llamada: orquesta internamente resumen, comparación con el periodo anterior, embudo de WhatsApp (con CPA real), ranking de anuncios, segmentación, fugas de dinero, calidad/fatiga, errores y salud de conjuntos, con un bloque de hallazgos priorizados. Úsala para la "auditoría rápida". Importante: los importes suelen estar en MXN (pesos), no USD.',
      inputSchema: {
        account_input: z.string(),
        fecha_inicio: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hace 30 días'),
        fecha_fin: z.string().optional().describe('Formato YYYY-MM-DD. Por defecto: hoy'),
        profundidad: z.enum(['resumen', 'completo']).default('completo').describe("'resumen' = solo lo esencial; 'completo' = todas las secciones"),
      },
    },
    async ({ account_input, fecha_inicio, fecha_fin, profundidad }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const { fInicio, fFin } = rangoPorDefecto(fecha_inicio, fecha_fin);
        const accountId = await resolveAccount(account_input);
        initApi();
        const cuenta = resolverObjeto(undefined, 'campana', accountId);

        const safe = async (fn: Promise<Seccion>, titulo: string): Promise<Seccion> => {
          try { return await fn; } catch (e: any) { return { titulo, lineas: [`(no disponible: ${e.message})`], alertas: [] }; }
        };
        const tareas: Promise<Seccion>[] = [
          safe(seccSaludCuenta(cuenta), '0. Salud de la cuenta'),
          safe(seccResumen(cuenta, fInicio, fFin), '1. Resumen ejecutivo'),
          safe(seccComparacion(cuenta, fInicio, fFin), '2. Comparación con el periodo anterior'),
          safe(seccFunnel(cuenta, fInicio, fFin), '3. Embudo de conversación (WhatsApp)'),
        ];
        if (profundidad === 'completo') {
          tareas.push(
            safe(seccRanking(cuenta, fInicio, fFin), '4. Ranking de anuncios'),
            safe(seccSegmentos(cuenta, fInicio, fFin), '5. Segmentación (entrega real)'),
            safe(seccFugas(cuenta, fInicio, fFin), '6. Fugas de dinero'),
            safe(seccCalidad(cuenta, fInicio, fFin), '7. Calidad y fatiga de anuncios'),
            safe(seccErrores(cuenta), '8. Errores y rechazos'),
            safe(seccSalud(cuenta, fInicio, fFin), '9. Salud de conjuntos'),
            safe(seccCampanas(cuenta, fInicio, fFin), '10. Detalle exhaustivo por campaña'),
            safe(seccSolapamiento(cuenta), '11. Solapamiento de audiencias'),
            safe(seccHorarios(cuenta, fInicio, fFin), '12. Day-parting (horarios)'),
          );
        }
        const secciones = await Promise.all(tareas);
        const todasAlertas = secciones.flatMap((s) => s.alertas);

        const out: string[] = [`# Auditoría — cuenta ${account_input}`, `Periodo: ${fInicio} → ${fFin} · Moneda: MXN (asumida) · Profundidad: ${profundidad}\n`];
        if (todasAlertas.length) {
          out.push('## 🚨 Hallazgos priorizados');
          const sev = (s: string) => (s.startsWith('🔴') ? 0 : s.startsWith('🟠') ? 1 : 2);
          todasAlertas.sort((a, b) => sev(a) - sev(b));
          todasAlertas.forEach((a) => out.push(`- ${a}`));
          out.push('');
        } else {
          out.push('## ✅ Sin alertas críticas detectadas\n');
        }
        for (const s of secciones) {
          out.push(`## ${s.titulo}`);
          s.lineas.forEach((l) => out.push(l));
          out.push('');
        }
        out.push('_Auditoría de solo lectura. Para ejecutar cambios usa cambiar_estado_* y modificar_presupuesto_* (confírmalo antes)._');
        return { content: [{ type: 'text', text: out.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error en auditoría completa: ${e.message}` }] };
      }
    },
  );

  server.registerPrompt(
    'auditoria',
    {
      title: 'Auditoría de cuenta Meta Ads',
      description: 'Audita una cuenta de Meta Ads. Ofrece elegir entre auditoría rápida (una sola tool) o metódica (paso a paso).',
      argsSchema: { cuenta: z.string().describe('Nombre del cliente/doctor o act_id de la cuenta') },
    },
    ({ cuenta }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Quiero una auditoría de la cuenta de Meta Ads: "${cuenta}".`,
              '',
              'Primero pregúntame cuál de estos dos modos prefiero antes de empezar:',
              '',
              '🚀 EXHAUSTIVA (una sola tool) — llama `auditoria_completa` con el account_input y profundidad="completo" (por defecto). Trae en UN golpe: resumen, comparación con el periodo anterior, embudo de WhatsApp desde el CLIC (clic → vio bienvenida → conversación → profundidad) con CPA real, ranking de anuncios, segmentación, fugas, calidad/fatiga, errores, salud de conjuntos, hallazgos priorizados, Y además la sección 10 con el reporte completo de CADA campaña con gasto (conjuntos, segmentación configurada, entrega real por plataforma/edad/género, anuncios y CTA). Es el modo recomendado para entregar un documento. Usa profundidad="resumen" solo si quieres el panorama de 3 secciones sin el detalle por campaña.',
              '',
              '🔬 METÓDICA — recorre las herramientas una por una razonando entre cada paso: reporte_rendimiento → obtener_campanas_activas → reporte_completo_campana (por cada campaña con gasto) → obtener_reporte_mensajeria → obtener_config_mensajeria_adset, y profundiza con desglose_resultados / diagnostico_calidad / funnel_conversacion donde haga falta. Útil cuando quieres ir validando hipótesis paso a paso en vez de recibir todo de golpe.',
              '',
              'Reglas para interpretar (ambos modos):',
              '- La mayoría de las campañas son click-to-WhatsApp (objetivo CONVERSATIONS / OUTCOME_ENGAGEMENT). El dato decisivo es el embudo de mensajería.',
              '- Calcula el CPA real: si solo una fracción de las conversaciones llega a 3+ mensajes, el costo real por prospecto interesado se multiplica. Comunícalo en pesos, no solo en %.',
              '- Diagnostica cada fuga: clics » conversaciones = fricción al saltar a WhatsApp; primera respuesta < iniciadas = problema operativo de atención; profundidad cae aunque respondan = el guion no engancha.',
              '- Los importes están en MXN (pesos), no USD. Nunca estimes el presupuesto restante restando; usa el que da la herramienta.',
              '- Si la profundidad 5 sale mayor que la 2/3, no fuerces un embudo descendente: señala la inconsistencia.',
              '- Entrega SIEMPRE análisis y recomendaciones priorizadas (rojo/naranja/amarillo), no solo datos. Prioriza por dinero: arreglar el embudo de WhatsApp suele rendir más que tocar segmentación.',
              '- Sé honesto con los límites: no ves el contenido de los chats ni el mensaje de bienvenida; si el diagnóstico depende de eso, pídeme 2-3 conversaciones caídas.',
              '- La auditoría es de solo lectura; cualquier cambio (pausar, mover presupuesto) se confirma aparte.',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
