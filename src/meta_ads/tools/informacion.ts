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
  traducirObjetivo,
} from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdAccount: FBAdAccount, AdSet, Campaign, Ad } = bizSdk;

export const ESTADO_CUENTA: Record<number, string> = {
  1: '🟢 Activa',
  2: '🔴 Desactivada',
  3: '⚠️ Sin liquidar (deuda pendiente)',
  7: '⏳ En revisión de riesgo',
  8: '⏳ Pendiente de liquidación',
  9: '🟡 En periodo de gracia',
  100: '⏳ Cierre pendiente',
  101: '🔴 Cerrada',
  201: '🟢 Activa',
  202: '🔴 Cerrada',
};

export const RAZON_BLOQUEO: Record<number, string> = {
  0: 'Ninguna',
  1: 'Política de integridad de anuncios',
  2: 'Revisión de propiedad intelectual',
  3: 'Riesgo de pago',
  4: 'Cierre de cuenta gris',
  5: 'Revisión AFC',
  6: 'Revisión de integridad del negocio',
  7: 'Cierre permanente',
  8: 'Cuenta de revendedor sin uso',
  9: 'Cuenta sin uso',
};

export type SaludCuenta = {
  estado: string;
  activa: boolean;
  razonBloqueo: string | null;
  topeMonto: number | null;
  topePct: number | null;
  topeNivel: 'ok' | 'cerca' | 'alcanzado' | null;
  saldo: number;
  alertas: string[];
};

export function analizarSaludCuenta(c: any): SaludCuenta {
  const estado = ESTADO_CUENTA[c.account_status] ?? `Desconocido (${c.account_status})`;
  const activa = c.account_status === 1 || c.account_status === 201;
  const alertas: string[] = [];
  if (!activa) alertas.push(`🔴 Cuenta no activa (${estado}) — revísalo antes que cualquier métrica`);
  let razonBloqueo: string | null = null;
  if (c.disable_reason && c.disable_reason !== 0) {
    razonBloqueo = RAZON_BLOQUEO[c.disable_reason] ?? `código ${c.disable_reason}`;
    alertas.push(`🔴 Cuenta restringida por Meta: ${razonBloqueo}`);
  }
  const topeRaw = parseInt(c.spend_cap ?? '0', 10) || 0;
  let topeMonto: number | null = null;
  let topePct: number | null = null;
  let topeNivel: 'ok' | 'cerca' | 'alcanzado' | null = null;
  if (topeRaw > 0) {
    const gastado = parseInt(c.amount_spent ?? '0', 10) || 0;
    topeMonto = topeRaw / 100;
    topePct = Math.round((gastado / topeRaw) * 100);
    if (topePct >= 100) { topeNivel = 'alcanzado'; alertas.push('🔴 Tope de gasto ALCANZADO — la cuenta dejó de entregar hasta subirlo'); }
    else if (topePct >= 85) { topeNivel = 'cerca'; alertas.push(`🟠 Cuenta cerca del tope de gasto (${topePct}%)`); }
    else topeNivel = 'ok';
  }
  const saldo = (parseInt(c.balance ?? '0', 10) || 0) / 100;
  return { estado, activa, razonBloqueo, topeMonto, topePct, topeNivel, saldo, alertas };
}

function primeroDe(cursor: any): any {
  const arr = cursorToArray(cursor);
  return arr.length ? arr[0] : null;
}

function aMoneda(valorCentavos: any): string {
  const n = parseInt(valorCentavos ?? '0', 10);
  if (!Number.isFinite(n)) return money(0);
  return money(n / 100);
}

export function registrarHerramientasInformacion(server: McpServer) {
  server.registerTool(
    'estado_cuenta',
    {
      description: 'Salud administrativa de la cuenta: estado, motivo de bloqueo, saldo, gasto acumulado, tope de gasto, moneda y huso horario. Responde "¿por qué se detuvieron los anuncios?" cuando no es un problema de rendimiento.',
      inputSchema: {
        account_input: z.string().describe('ID, act_XXX o nombre de la cuenta'),
      },
    },
    async ({ account_input }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const accountId = await resolveAccount(account_input);
        initApi();
        const cuenta = await new FBAdAccount(accountId).read([
          'name', 'account_status', 'disable_reason', 'currency', 'timezone_name',
          'balance', 'amount_spent', 'spend_cap', 'funding_source_details', 'min_daily_budget',
        ]);
        const c = cuenta as any;
        const salud = analizarSaludCuenta(c);
        const moneda = c.currency ?? 'N/A';

        const L: string[] = [`🏦 Estado de la cuenta '${c.name ?? account_input}' (${accountId}):\n`];
        L.push(`- Estado: ${salud.estado}`);
        if (salud.razonBloqueo) L.push(`- Motivo de bloqueo: ${salud.razonBloqueo}`);
        L.push(`- Moneda: ${moneda} | Huso horario: ${c.timezone_name ?? 'N/A'}`);
        L.push(`- Gasto acumulado histórico: $${aMoneda(c.amount_spent)} ${moneda}`);

        if (salud.topeMonto != null) {
          const aviso = salud.topeNivel === 'alcanzado' ? ' 🔴 TOPE ALCANZADO (entrega detenida)' : salud.topeNivel === 'cerca' ? ' ⚠️ cerca del tope' : '';
          L.push(`- Tope de gasto: $${money(salud.topeMonto)} ${moneda} — usado ${salud.topePct}%${aviso}`);
        } else {
          L.push('- Tope de gasto: sin límite configurado');
        }

        if (salud.saldo > 0) L.push(`- Saldo pendiente por cobrar: $${money(salud.saldo)} ${moneda}`);
        if (c.funding_source_details?.display_string) L.push(`- Método de pago: ${c.funding_source_details.display_string}`);
        if (c.min_daily_budget != null) L.push(`- Presupuesto diario mínimo de la cuenta: $${aMoneda(c.min_daily_budget)} ${moneda}`);

        return { content: [{ type: 'text', text: L.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al consultar el estado de la cuenta: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'limites_presupuesto',
    {
      description: 'Presupuesto diario MÍNIMO que exige Meta para esta cuenta, por tipo de optimización (impresiones, frecuencia alta/baja, reproducciones de video). Evita el error de crear conjuntos con presupuesto por debajo del mínimo.',
      inputSchema: {
        account_input: z.string().describe('ID, act_XXX o nombre de la cuenta'),
      },
    },
    async ({ account_input }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const accountId = await resolveAccount(account_input);
        initApi();
        const cuenta = await new FBAdAccount(accountId).read(['currency', 'min_daily_budget']);
        const monedaCuenta = (cuenta as any).currency ?? '';
        const cursor = await new FBAdAccount(accountId).getMinimumBudgets([
          'currency', 'min_daily_budget_imp', 'min_daily_budget_high_freq',
          'min_daily_budget_low_freq', 'min_daily_budget_video_views',
        ]);
        const filas = cursorToArray(cursor);
        const f = (filas.find((x: any) => x.currency === monedaCuenta) ?? filas[0]) as any;
        if (!f) {
          const minCuenta = (cuenta as any).min_daily_budget;
          if (minCuenta != null) return { content: [{ type: 'text', text: `💵 Presupuesto diario mínimo en '${account_input}' (${monedaCuenta}): $${aMoneda(minCuenta)}` }] };
          return { content: [{ type: 'text', text: `No se encontraron límites de presupuesto para '${account_input}'.` }] };
        }
        const moneda = f.currency ?? monedaCuenta;
        const L = [`💵 Presupuesto diario mínimo en '${account_input}' (${moneda}):\n`];
        L.push(`- Por impresiones: $${aMoneda(f.min_daily_budget_imp)}`);
        L.push(`- Optimización de frecuencia baja: $${aMoneda(f.min_daily_budget_low_freq)}`);
        L.push(`- Optimización de frecuencia alta: $${aMoneda(f.min_daily_budget_high_freq)}`);
        L.push(`- Reproducciones de video: $${aMoneda(f.min_daily_budget_video_views)}`);
        return { content: [{ type: 'text', text: L.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al consultar límites de presupuesto: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'estimar_alcance',
    {
      description: 'Estima el tamaño de la audiencia ANTES de gastar. Útil para detectar audiencias demasiado chicas (pines geográficos médicos). Acepta un adset_id existente (lee su segmentación real) o criterios manuales (países, edad, género).',
      inputSchema: {
        account_input: z.string().describe('ID, act_XXX o nombre de la cuenta'),
        adset_id: z.string().optional().describe('Si se da, estima sobre la segmentación REAL de ese conjunto existente'),
        paises: z.array(z.string()).default([]).describe("Códigos ISO, ej: ['MX']. Solo si NO usas adset_id"),
        edad_min: z.number().int().optional(),
        edad_max: z.number().int().optional(),
        genero: z.string().optional().describe("'hombres', 'mujeres' o vacío para todos"),
        optimizacion: z.string().default('REACH').describe('REACH, CONVERSATIONS, LINK_CLICKS, LANDING_PAGE_VIEWS, LEAD_GENERATION, IMPRESSIONS'),
      },
    },
    async ({ account_input, adset_id, paises, edad_min, edad_max, genero, optimizacion }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const accountId = await resolveAccount(account_input);
        initApi();

        let targeting: Record<string, any>;
        let optGoal = optimizacion;
        let origen: string;
        if (adset_id) {
          const adset = await new AdSet(adset_id).read(['targeting', 'optimization_goal', 'name']);
          targeting = (adset as any).targeting ?? {};
          optGoal = (adset as any).optimization_goal ?? optimizacion;
          origen = `conjunto existente "${(adset as any).name ?? adset_id}"`;
        } else {
          targeting = {};
          if (paises.length) targeting.geo_locations = { countries: paises };
          if (edad_min != null) targeting.age_min = edad_min;
          if (edad_max != null) targeting.age_max = edad_max;
          if (genero) {
            const g = genero.trim().toLowerCase();
            if (g === 'hombres') targeting.genders = [1];
            else if (g === 'mujeres') targeting.genders = [2];
          }
          if (!targeting.geo_locations) targeting.geo_locations = { countries: ['MX'] };
          origen = 'criterios manuales';
        }

        const cursor = await new FBAdAccount(accountId).getDeliveryEstimate(
          ['estimate_dau', 'estimate_mau_lower_bound', 'estimate_mau_upper_bound', 'estimate_ready'],
          { optimization_goal: optGoal, targeting_spec: targeting },
        );
        const est = primeroDe(cursor);
        if (!est) return { content: [{ type: 'text', text: `No se pudo estimar el alcance para ${origen}.` }] };
        const e = est as any;

        const mauLow = parseInt(e.estimate_mau_lower_bound ?? '0', 10);
        const mauUp = parseInt(e.estimate_mau_upper_bound ?? '0', 10);
        const dau = parseInt(e.estimate_dau ?? '0', 10);

        const L = [`📐 Estimación de alcance (${origen}, optimización ${optGoal}):\n`];
        L.push(`- Audiencia mensual estimada: ${mauLow.toLocaleString('es-MX')} – ${mauUp.toLocaleString('es-MX')} personas`);
        if (dau > 0) L.push(`- Audiencia diaria estimada: ~${dau.toLocaleString('es-MX')} personas`);
        L.push(`- Estimación lista: ${e.estimate_ready ? 'sí' : 'aún calculándose'}`);

        if (mauUp > 0 && mauUp < 20000) L.push('\n🔴 Audiencia MUY chica (<20k). Riesgo de CPM alto y entrega limitada — amplía geografía/intereses.');
        else if (mauUp > 0 && mauUp < 80000) L.push('\n⚠️ Audiencia chica (<80k). Vigila la frecuencia y el CPM.');

        return { content: [{ type: 'text', text: L.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al estimar alcance: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'registro_cambios',
    {
      description: 'Bitácora de cambios de la cuenta: quién modificó presupuestos, estados (encendió/apagó) o segmentación y cuándo. Para rendición de cuentas dentro de la agencia.',
      inputSchema: {
        account_input: z.string().describe('ID, act_XXX o nombre de la cuenta'),
        dias: z.number().int().default(7).describe('Días hacia atrás a revisar'),
        limite: z.number().int().default(50),
      },
    },
    async ({ account_input, dias, limite }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        const accountId = await resolveAccount(account_input);
        initApi();
        const { fInicio, fFin } = rangoPorDefecto(undefined, undefined, dias);
        const cursor = await new FBAdAccount(accountId).getActivities(
          ['event_type', 'translated_event_type', 'actor_name', 'object_name', 'object_type', 'event_time', 'extra_data'],
          { since: fInicio, until: fFin, limit: limite },
        );
        const eventos = cursorToArray(cursor);
        if (!eventos.length) return { content: [{ type: 'text', text: `Sin cambios registrados en '${account_input}' en los últimos ${dias} días.` }] };

        const L = [`📋 Cambios en '${account_input}' (últimos ${dias} días, ${eventos.length} eventos):\n`];
        for (const ev of eventos) {
          const cuando = ev.event_time ? new Date(ev.event_time).toLocaleString('es-MX') : 's/f';
          const quien = ev.actor_name ?? 'Sistema';
          const accion = ev.translated_event_type ?? ev.event_type ?? 'cambio';
          const objeto = ev.object_name ? ` → ${ev.object_name}` : '';
          let detalle = '';
          try {
            const extra = ev.extra_data ? JSON.parse(ev.extra_data) : null;
            if (extra && (extra.old_value != null || extra.new_value != null)) {
              detalle = ` (de ${extra.old_value ?? '∅'} a ${extra.new_value ?? '∅'})`;
            }
          } catch {}
          L.push(`- ${cuando} · ${quien}: ${accion}${objeto}${detalle}`);
        }
        return { content: [{ type: 'text', text: L.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al consultar el registro de cambios: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'previsualizar_anuncio',
    {
      description: 'Genera el enlace de previsualización de un anuncio (cómo se ve realmente en Feed/Stories/Reels). Ideal para revisar un anuncio en PAUSADO antes de activarlo.',
      inputSchema: {
        ad_id: z.string().describe('ID del anuncio'),
        formatos: z.array(z.string()).default(['MOBILE_FEED_STANDARD', 'INSTAGRAM_STANDARD', 'FACEBOOK_STORY_MOBILE'])
          .describe('Formatos: MOBILE_FEED_STANDARD, DESKTOP_FEED_STANDARD, INSTAGRAM_STANDARD, INSTAGRAM_STORY, FACEBOOK_STORY_MOBILE, INSTAGRAM_REELS, FACEBOOK_REELS_MOBILE'),
      },
    },
    async ({ ad_id, formatos }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        initApi();
        const L = [`👁 Previsualizaciones del anuncio ${ad_id}:\n`];
        for (const formato of formatos) {
          try {
            const cursor = await new Ad(ad_id).getPreviews(['body'], { ad_format: formato });
            const prev = primeroDe(cursor);
            const body: string = (prev as any)?.body ?? '';
            const match = body.match(/src="([^"]+)"/);
            if (match) {
              const url = match[1].replace(/&amp;/g, '&');
              L.push(`- ${formato}: ${url}`);
            } else {
              L.push(`- ${formato}: (sin previsualización disponible)`);
            }
          } catch (err: any) {
            L.push(`- ${formato}: error (${err.message})`);
          }
        }
        return { content: [{ type: 'text', text: L.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al generar previsualización: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'recomendaciones_meta',
    {
      description: 'Trae las recomendaciones de optimización que el propio Meta genera para una campaña o conjunto (ampliar audiencia, ajustar presupuesto, consolidar conjuntos). Son sugerencias nativas, no inventadas.',
      inputSchema: {
        objeto_id: z.string().describe('ID de la campaña o conjunto'),
        objeto_tipo: z.enum(['campana', 'conjunto']).default('campana'),
      },
    },
    async ({ objeto_id, objeto_tipo }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        initApi();
        const Constructor = objeto_tipo === 'conjunto' ? AdSet : Campaign;
        const objeto = await new Constructor(objeto_id).read(['name', 'objective', 'recommendations']);
        const o = objeto as any;
        const recs: any[] = o.recommendations ?? [];
        const cabecera = `🧭 Recomendaciones de Meta para ${objeto_tipo} "${o.name ?? objeto_id}"${o.objective ? ` (${traducirObjetivo(o.objective)})` : ''}:`;
        if (!recs.length) {
          return { content: [{ type: 'text', text: `${cabecera}\n\n✅ Meta no tiene recomendaciones activas — suele indicar una configuración sana.` }] };
        }
        const L = [cabecera, ''];
        for (const r of recs) {
          const titulo = r.title ?? r.code ?? 'Recomendación';
          const importancia = r.importance ? ` [${r.importance}]` : '';
          L.push(`• ${titulo}${importancia}`);
          if (r.message) L.push(`   ${r.message}`);
          if (r.blame_field) L.push(`   Campo sugerido: ${r.blame_field}`);
        }
        return { content: [{ type: 'text', text: L.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al consultar recomendaciones: ${e.message}` }] };
      }
    },
  );
}
