import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  credencialesOk,
  errorCredenciales,
  initApi,
  resolveAccount,
  cursorToArray,
  money,
  rangoPorDefecto,
  mejorResultado,
} from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdAccount: FBAdAccount, Campaign, AdSet, Ad } = bizSdk;

function horaDe(valor: string): number {
  const h = parseInt(String(valor ?? '').split(':')[0], 10);
  return Number.isFinite(h) ? h : -1;
}

function geoTokens(targeting: any): Set<string> {
  const geo = targeting?.geo_locations ?? {};
  const t = new Set<string>();
  for (const c of geo.countries ?? []) t.add(`pais:${c}`);
  for (const r of geo.regions ?? []) t.add(`reg:${r.key ?? r.name}`);
  for (const c of geo.cities ?? []) t.add(`ciu:${c.key ?? c.name}`);
  for (const z of geo.zips ?? []) t.add(`cp:${z.key ?? z.name}`);
  for (const p of geo.custom_locations ?? []) {
    if (p.latitude != null && p.longitude != null) t.add(`pin:${Number(p.latitude).toFixed(2)},${Number(p.longitude).toFixed(2)}`);
  }
  return t;
}

function interesesTokens(targeting: any): Set<string> {
  const t = new Set<string>();
  for (const bloque of targeting?.flexible_spec ?? []) {
    for (const i of bloque.interests ?? []) t.add(String(i.id));
    for (const b of bloque.behaviors ?? []) t.add(`b:${b.id}`);
  }
  for (const i of targeting?.interests ?? []) t.add(String(i.id));
  return t;
}

function intersectan(a: Set<string>, b: Set<string>): string[] {
  const r: string[] = [];
  for (const x of a) if (b.has(x)) r.push(x);
  return r;
}

function geoSolapa(a: Set<string>, b: Set<string>): string[] | null {
  if (a.size === 0 || b.size === 0) return [];
  const inter = intersectan(a, b);
  return inter.length ? inter : null;
}

function interesSolapa(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return true;
  return intersectan(a, b).length > 0;
}

function edadSolapa(a: any, b: any): boolean {
  const aMin = a?.age_min ?? 13, aMax = a?.age_max ?? 65;
  const bMin = b?.age_min ?? 13, bMax = b?.age_max ?? 65;
  return aMin <= bMax && bMin <= aMax;
}

function generoSolapa(a: any, b: any): boolean {
  const ga = JSON.stringify(a?.genders ?? []);
  const gb = JSON.stringify(b?.genders ?? []);
  if (ga === '[]' || gb === '[]') return true;
  return ga === gb;
}

export type HoraBucket = { spend: number; res: number; clics: number };

export function agregarHoras(filas: any[]): {
  horas: HoraBucket[];
  etiquetaRes: string;
  totalRes: number;
  totalSpend: number;
  totalFuga: number;
  ventana: number[];
  pctVentana: number;
} {
  const horas: HoraBucket[] = Array.from({ length: 24 }, () => ({ spend: 0, res: 0, clics: 0 }));
  let etiquetaRes = 'resultados';
  for (const f of filas) {
    const h = horaDe(f.hourly_stats_aggregated_by_advertiser_time_zone);
    if (h < 0 || h > 23) continue;
    horas[h].spend += parseFloat(f.spend ?? '0');
    horas[h].clics += parseInt(f.clicks ?? '0', 10) || 0;
    const r = mejorResultado(f);
    if (r && r.num > 0) { horas[h].res += r.num; etiquetaRes = r.etiqueta; }
  }
  const totalRes = horas.reduce((s, h) => s + h.res, 0);
  const totalSpend = horas.reduce((s, h) => s + h.spend, 0);
  const totalFuga = horas.reduce((s, h) => s + (h.res === 0 ? h.spend : 0), 0);
  const ranking = horas.map((d, h) => ({ h, ...d })).filter((d) => d.res > 0).sort((a, b) => b.res - a.res);
  const ventana: number[] = [];
  let acum = 0;
  for (const d of ranking) {
    ventana.push(d.h);
    acum += d.res;
    if (totalRes > 0 && acum / totalRes >= 0.7) break;
  }
  ventana.sort((a, b) => a - b);
  const pctVentana = totalRes > 0 ? Math.round((acum / totalRes) * 100) : 0;
  return { horas, etiquetaRes, totalRes, totalSpend, totalFuga, ventana, pctVentana };
}

export function paresSolapados(conjuntos: any[]): { a: string; b: string; mismaCampana: boolean; geoTxt: string; intTxt: string }[] {
  const items = conjuntos.map((c: any) => ({
    name: c.name,
    campaign_id: c.campaign_id,
    targeting: c.targeting ?? {},
    geo: geoTokens(c.targeting),
    intereses: interesesTokens(c.targeting),
  }));
  const res: { a: string; b: string; mismaCampana: boolean; geoTxt: string; intTxt: string }[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      const geo = geoSolapa(a.geo, b.geo);
      if (geo === null) continue;
      if (!edadSolapa(a.targeting, b.targeting)) continue;
      if (!generoSolapa(a.targeting, b.targeting)) continue;
      if (!interesSolapa(a.intereses, b.intereses)) continue;
      const geoTxt = geo.length ? geo.slice(0, 3).join(', ') : 'geografía amplia compartida';
      const intComun = intersectan(a.intereses, b.intereses);
      const intTxt = intComun.length ? ` · ${intComun.length} interés(es) en común` : (a.intereses.size === 0 && b.intereses.size === 0 ? ' · ambos sin intereses (abiertos)' : '');
      res.push({ a: a.name, b: b.name, mismaCampana: a.campaign_id === b.campaign_id, geoTxt, intTxt });
    }
  }
  return res;
}

export function registrarHerramientasOptimizacion(server: McpServer) {
  server.registerTool(
    'horarios_calientes',
    {
      description: 'Day-parting accionable: a qué HORA del día entran los resultados (conversaciones/leads) y a qué hora se gasta sin retorno. Detecta la ventana óptima y las horas fuga, y revisa si el conjunto tiene programación horaria (adset_schedule) configurada.',
      inputSchema: {
        account_input: z.string().describe('ID, act_XXX o nombre de la cuenta'),
        objeto_id: z.string().optional().describe('Si se pasa, analiza solo esa campaña/conjunto/anuncio'),
        objeto_tipo: z.enum(['campana', 'conjunto', 'anuncio']).default('campana'),
        fecha_inicio: z.string().optional().describe('YYYY-MM-DD, por defecto hace 30 días'),
        fecha_fin: z.string().optional().describe('YYYY-MM-DD, por defecto hoy'),
      },
    },
    async ({ account_input, objeto_id, objeto_tipo, fecha_inicio, fecha_fin }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const { fInicio, fFin } = rangoPorDefecto(fecha_inicio, fecha_fin, 30);
        initApi();

        let objeto: any;
        let etiqueta: string;
        if (objeto_id) {
          const constructores: Record<string, any> = { campana: Campaign, conjunto: AdSet, anuncio: Ad };
          objeto = new constructores[objeto_tipo](objeto_id);
          etiqueta = `${objeto_tipo} ${objeto_id}`;
        } else {
          const accountId = await resolveAccount(account_input);
          objeto = new FBAdAccount(accountId);
          etiqueta = `cuenta ${account_input}`;
        }

        const cursor = await objeto.getInsights(
          ['spend', 'actions', 'clicks'],
          {
            time_range: JSON.stringify({ since: fInicio, until: fFin }),
            breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
            limit: 500,
          },
        );
        const filas = cursorToArray(cursor);
        if (!filas?.length) return { content: [{ type: 'text', text: `No hay datos horarios para ${etiqueta} en ${fInicio} → ${fFin}.` }] };

        const { horas, etiquetaRes, totalRes, totalSpend, totalFuga, ventana, pctVentana } = agregarHoras(filas);

        const L = [`🕐 Horarios — ${etiqueta} (${fInicio} → ${fFin})`, ''];
        L.push(`Totales: ${totalRes} ${etiquetaRes} · gasto $${money(totalSpend)}`, '');
        for (let h = 0; h < 24; h++) {
          const d = horas[h];
          if (d.spend === 0 && d.res === 0) continue;
          const hh = `${String(h).padStart(2, '0')}h`;
          if (d.res > 0) {
            L.push(`- ${hh}: ${d.res} ${etiquetaRes} · $${money(d.spend / d.res)} c/u · gasto $${money(d.spend)}`);
          } else {
            L.push(`- ${hh}: sin resultados · ${d.clics} clics · gasto $${money(d.spend)}${d.spend > 0 ? ' 🔴 fuga' : ''}`);
          }
        }

        if (totalRes > 0) {
          L.push('', `🎯 Ventana caliente: el ${pctVentana}% de ${etiquetaRes} se concentra en estas horas → ${ventana.map((h) => `${String(h).padStart(2, '0')}h`).join(', ')}`);
        }
        if (totalFuga > 0 && totalSpend > 0) {
          L.push(`💸 Gasto en horas sin ningún resultado: $${money(totalFuga)} (${Math.round((totalFuga / totalSpend) * 100)}% del total)`);
        }

        if (objeto_id && objeto_tipo === 'conjunto') {
          try {
            const adset = await new AdSet(objeto_id).read(['adset_schedule', 'pacing_type']);
            const sched = (adset as any).adset_schedule ?? [];
            if (!sched.length) {
              L.push('', '⏰ Este conjunto NO tiene programación horaria (adset_schedule) activa: gasta las 24h. Considera limitarlo a la ventana caliente para bajar el CPA.');
            } else {
              L.push('', `⏰ Programación horaria activa: ${sched.length} bloque(s) configurado(s).`);
            }
          } catch {}
        }

        return { content: [{ type: 'text', text: L.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al analizar horarios: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'detectar_solapamiento',
    {
      description: 'Detecta conjuntos ACTIVOS que compiten entre sí en la misma subasta (canibalización): misma geografía, edad, género e intereses solapados. El solapamiento sube tu propio CPM y reparte el aprendizaje. Heurística sobre la segmentación real, no inventa datos.',
      inputSchema: {
        account_input: z.string().describe('ID, act_XXX o nombre de la cuenta'),
        campana_id: z.string().optional().describe('Si se pasa, solo revisa los conjuntos de esa campaña'),
        limite: z.number().int().default(100).describe('Máximo de conjuntos a revisar'),
      },
    },
    async ({ account_input, campana_id, limite }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        initApi();
        let contenedor: any;
        let etiqueta: string;
        if (campana_id) {
          contenedor = new Campaign(campana_id);
          etiqueta = `campaña ${campana_id}`;
        } else {
          const accountId = await resolveAccount(account_input);
          contenedor = new FBAdAccount(accountId);
          etiqueta = `cuenta ${account_input}`;
        }

        const cursor = await contenedor.getAdSets(
          ['id', 'name', 'campaign_id', 'effective_status', 'targeting'],
          { limit: limite, effective_status: JSON.stringify(['ACTIVE']) },
        );
        const conjuntos = cursorToArray(cursor).filter((a: any) => a.effective_status === 'ACTIVE');
        if (conjuntos.length < 2) {
          return { content: [{ type: 'text', text: `Hay menos de 2 conjuntos activos en ${etiqueta}; no hay solapamiento posible.` }] };
        }

        const pares = paresSolapados(conjuntos);
        const hallazgos = pares.map((p) => `⚠️ "${p.a}" ↔ "${p.b}"${p.mismaCampana ? ' (misma campaña)' : ''}\n   Comparten: ${p.geoTxt}${p.intTxt}`);

        if (!hallazgos.length) {
          return { content: [{ type: 'text', text: `✅ No se detectó solapamiento evidente entre los ${conjuntos.length} conjuntos activos de ${etiqueta}.` }] };
        }
        const L = [`🔁 Posible canibalización en ${etiqueta} (${conjuntos.length} conjuntos activos, ${hallazgos.length} pares solapados):`, ''];
        L.push(...hallazgos);
        L.push('', 'ℹ️ Conjuntos que se solapan compiten en la misma subasta y suben tu CPM. Considera consolidarlos o diferenciar geografía/intereses.');
        return { content: [{ type: 'text', text: L.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al detectar solapamiento: ${e.message}` }] };
      }
    },
  );
}
