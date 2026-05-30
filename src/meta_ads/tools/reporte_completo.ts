import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  credencialesOk,
  errorCredenciales,
  initApi,
  cursorToArray,
  presupuestoStr,
  presupuestoDetalle,
  traducirEstado,
  procesarIssues,
  formatSegmentacion,
  formatDesglose,
  formatResumenMensajeria,
  clasificarTipo,
  clasificarPorObjetivo,
  traducirObjetivo,
  formatTasasChat,
  formatResultado,
  esTipoMensajeria,
  detectarResultado,
  alertaCpa,
  formatCreativo,
} from '../helpers.js';
import { ACCIONES } from '../types.js';
import type { MetaInsight, MetaAction, CampaignData, AdSetData, AdData } from '../types.js';

function cpaPromedio(insight: MetaInsight | undefined): number {
  if (!insight) return 0;
  const spend = parseFloat(insight.spend ?? '0');
  const conv = (insight.actions ?? []).find((a: MetaAction) => a.action_type === ACCIONES.CONVERSACION_INICIADA);
  const c = conv ? parseFloat(conv.value) : 0;
  return c > 0 ? spend / c : 0;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { Campaign } = bizSdk;

const INSIGHT_FIELDS = ['spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpm', 'cpc', 'actions', 'cost_per_action_type'];

// Formatea las métricas básicas de un insight (gasto, alcance, clics, etc.)
function metricasBasicas(i: MetaInsight | undefined, indent: string): string[] {
  if (!i) return [`${indent}(sin datos de rendimiento en el periodo)`];
  const num = (v: any) => parseInt(v ?? '0', 10).toLocaleString('es-MX');
  const dec = (v: any) => parseFloat(v ?? '0').toFixed(2);
  const spend = i.spend ? parseFloat(i.spend).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
  return [
    `${indent}Gasto: $${spend} | Impresiones: ${num(i.impressions)} | Alcance: ${num(i.reach)}`,
    `${indent}Clics: ${num(i.clicks)} | CTR: ${dec(i.ctr)}% | CPM: $${dec(i.cpm)} | CPC: $${dec(i.cpc)}`,
  ];
}

function indexarInsights(cursor: unknown, clave: 'adset_id' | 'ad_id'): Map<string, MetaInsight> {
  const map = new Map<string, MetaInsight>();
  for (const row of cursorToArray(cursor) as MetaInsight[]) {
    const k = row[clave];
    if (k) map.set(String(k), row);
  }
  return map;
}

export function registrarHerramientasReporteCompleto(server: McpServer) {
  server.registerTool(
    'reporte_completo_campana',
    {
      description:
        'Super desglose de una campaña: datos generales (objetivo, presupuesto, fechas, puja), rendimiento (gasto, alcance, clics, costos), mensajería (conversaciones, contactos, profundidad), y por cada conjunto su segmentación + optimizaciones, bajando hasta los anuncios individuales.',
      inputSchema: {
        campaign_id: z.string().describe('ID de la campaña'),
        rango_fechas: z
          .enum(['today', 'yesterday', 'last_7d', 'last_30d', 'this_month', 'maximum'])
          .default('last_30d')
          .describe('Rango de tiempo para las métricas'),
        incluir_anuncios: z.boolean().default(true).describe('Desglosar también cada anuncio individual'),
      },
    },
    async ({ campaign_id, rango_fechas, incluir_anuncios }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        initApi();
        const camp = new Campaign(campaign_id);
        await camp.read([
          'id', 'name', 'status', 'effective_status', 'objective',
          'daily_budget', 'lifetime_budget', 'budget_remaining', 'start_time', 'stop_time',
          'bid_strategy', 'issues_info',
        ]);
        const c = camp as unknown as CampaignData;

        const totalCursor = await camp.getInsights(INSIGHT_FIELDS, { date_preset: rango_fechas });
        const total = cursorToArray(totalCursor)[0];

        const adsetInsCursor = await camp.getInsights([...INSIGHT_FIELDS, 'adset_id'], { date_preset: rango_fechas, level: 'adset', limit: 500 });
        const metricasAdset = indexarInsights(adsetInsCursor, 'adset_id');

        let metricasAd = new Map<string, any>();
        if (incluir_anuncios) {
          const adInsCursor = await camp.getInsights([...INSIGHT_FIELDS, 'ad_id', 'adset_id'], { date_preset: rango_fechas, level: 'ad', limit: 500 });
          metricasAd = indexarInsights(adInsCursor, 'ad_id');
        }

        const agruparPorAdset = (cursor: unknown): Map<string, MetaInsight[]> => {
          const m = new Map<string, MetaInsight[]>();
          for (const row of cursorToArray(cursor) as MetaInsight[]) {
            const k = String(row.adset_id ?? '');
            if (!m.has(k)) m.set(k, []);
            m.get(k)!.push(row);
          }
          return m;
        };
        const insightsDesglose = (bk: string) =>
          camp.getInsights([...INSIGHT_FIELDS, 'adset_id'], { date_preset: rango_fechas, level: 'adset', breakdowns: [bk], limit: 500 });
        const [desglosePlataforma, desgloseEdad, desgloseGenero] = await Promise.all([
          insightsDesglose('publisher_platform').then(agruparPorAdset),
          insightsDesglose('age').then(agruparPorAdset),
          insightsDesglose('gender').then(agruparPorAdset),
        ]);

        const adsetsCursor = await camp.getAdSets(
          ['id', 'name', 'effective_status', 'optimization_goal', 'destination_type', 'billing_event', 'daily_budget', 'lifetime_budget', 'targeting', 'issues_info'],
          { limit: 500 },
        );
        const adsets = cursorToArray(adsetsCursor) as AdSetData[];

        const adsPorAdset = new Map<string, AdData[]>();
        if (incluir_anuncios) {
          const adsCursor = await camp.getAds(
            ['id', 'name', 'effective_status', 'adset_id', 'issues_info', 'creative{title,body,call_to_action_type,object_type,instagram_permalink_url}'],
            { limit: 500 },
          );
          for (const ad of cursorToArray(adsCursor) as AdData[]) {
            const k = String(ad.adset_id);
            if (!adsPorAdset.has(k)) adsPorAdset.set(k, []);
            adsPorAdset.get(k)!.push(ad);
          }
        }

        const tiposConjuntos = new Set(adsets.map((a) => clasificarTipo(a.optimization_goal, a.destination_type)));
        const tipoCampana = adsets.length === 0
          ? clasificarPorObjetivo(c.objective)
          : tiposConjuntos.size === 1
            ? [...tiposConjuntos][0]
            : '🔀 Mixta (ver conjuntos)';

        const L: string[] = [];
        L.push('═══════════════════════════════════════════════');
        L.push(` 📋 REPORTE COMPLETO — ${c.name}`);
        L.push(` Periodo: ${rango_fechas}`);
        L.push('═══════════════════════════════════════════════');

        L.push('\n══ CAMPAÑA ══');
        L.push(`• ID: ${c.id}`);
        L.push(`• Estado: ${traducirEstado(c.effective_status ?? c.status ?? '')}`);
        L.push(`• Tipo (objetivo real): ${tipoCampana}`);
        L.push(`• Objetivo Meta: ${traducirObjetivo(c.objective)} (${c.objective ?? 'N/A'})`);
        L.push(`• Presupuesto: ${presupuestoDetalle(c.daily_budget, c.lifetime_budget, c.budget_remaining)} | Puja: ${c.bid_strategy ?? 'no especificada (a nivel conjunto)'}`);
        L.push(`• Inicio: ${c.start_time ?? 'N/A'} | Fin: ${c.stop_time ?? 'sin fecha fin'}`);
        if (c.effective_status === 'WITH_ISSUES' || c.effective_status === 'DISAPPROVED') {
          const issues = procesarIssues(c.issues_info, '');
          if (issues) L.push(issues.slice(1));
        }

        L.push('\n══ RENDIMIENTO (total campaña) ══');
        L.push(...metricasBasicas(total, '  '));
        if (esTipoMensajeria(tipoCampana)) {
          L.push(...formatResumenMensajeria(total, '  '));
          L.push(...formatTasasChat(total, '  '));
        } else {
          L.push(...formatResultado(total, tipoCampana, '  '));
        }

        const cpaCamp = cpaPromedio(total);

        L.push(`\n══ CONJUNTOS (${adsets.length}) ══`);
        if (!adsets.length) L.push('  (Esta campaña no tiene conjuntos)');
        for (const a of adsets) {
          const mAdset = metricasAdset.get(String(a.id));
          const tipoAdset = clasificarTipo(a.optimization_goal, a.destination_type);
          L.push(`\n▸ ${a.name} (ID: ${a.id})`);
          L.push(`  Tipo: ${tipoAdset}`);
          L.push(`  Estado: ${traducirEstado(a.effective_status ?? '')} | Optimización: ${a.optimization_goal ?? 'N/A'} → ${a.destination_type ?? 'N/A'} | Cobro: ${a.billing_event ?? 'N/A'}`);
          const presupuesto = presupuestoStr(a.daily_budget, a.lifetime_budget);
          L.push(`  Presupuesto: ${presupuesto === 'no definido' ? 'heredado de campaña' : presupuesto}`);
          if (a.effective_status === 'WITH_ISSUES' || a.effective_status === 'DISAPPROVED') {
            const issues = procesarIssues(a.issues_info, '  ');
            if (issues) L.push(issues.slice(1));
          }
          L.push('  ── Rendimiento del conjunto ──');
          L.push(...metricasBasicas(mAdset, '    '));
          if (esTipoMensajeria(tipoAdset)) {
            L.push(...formatResumenMensajeria(mAdset, '    '));
            L.push(...formatTasasChat(mAdset, '    '));
          } else {
            L.push(...formatResultado(mAdset, tipoAdset, '    '));
          }
          L.push('  ── Segmentación (configurada) ──');
          L.push(...formatSegmentacion(a.targeting, '    '));

          L.push('  ── Desglose de entrega (real) ──');
          L.push(...formatDesglose(desglosePlataforma.get(String(a.id)) ?? [], 'publisher_platform', '📱 Por plataforma', tipoAdset, '    '));
          L.push(...formatDesglose(desgloseEdad.get(String(a.id)) ?? [], 'age', '👥 Por edad', tipoAdset, '    '));
          L.push(...formatDesglose(desgloseGenero.get(String(a.id)) ?? [], 'gender', '⚥ Por género', tipoAdset, '    '));

          if (incluir_anuncios) {
            const ads = adsPorAdset.get(String(a.id)) ?? [];
            L.push(`  ── Anuncios (${ads.length}) ──`);
            if (!ads.length) L.push('    (Sin anuncios en este conjunto)');
            for (const ad of ads) {
              const mAd = metricasAd.get(String(ad.id));
              L.push(`    • ${ad.name ?? 'Sin nombre'} (ID: ${ad.id}) — ${traducirEstado(ad.effective_status ?? '')}`);
              if (mAd) {
                const num = (v: any) => parseInt(v ?? '0', 10).toLocaleString('es-MX');
                const spend = mAd.spend ? parseFloat(mAd.spend).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
                const res = detectarResultado(mAd, tipoAdset);
                const alerta = esTipoMensajeria(tipoAdset) && res
                  ? alertaCpa(parseFloat(mAd.spend ?? '0'), parseFloat(res.value), cpaCamp)
                  : '';
                L.push(`        Gasto: $${spend} | Impresiones: ${num(mAd.impressions)} | Clics: ${num(mAd.clicks)}${res ? ` | ${res.label}: ${res.value}` : ''}${alerta}`);
              } else {
                L.push('        (sin datos de rendimiento en el periodo)');
              }
              if (ad.effective_status === 'WITH_ISSUES' || ad.effective_status === 'DISAPPROVED') {
                const issuesAd = procesarIssues(ad.issues_info, '      ');
                if (issuesAd) L.push(issuesAd.slice(1));
              }
              if (ad.creative) L.push(...formatCreativo(ad.creative, '      '));
            }
          }
        }

        return { content: [{ type: 'text', text: L.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al generar el reporte completo: ${e.message}` }] };
      }
    },
  );
}
