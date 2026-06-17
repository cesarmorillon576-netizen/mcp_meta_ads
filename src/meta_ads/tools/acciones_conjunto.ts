import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, errorMeta, initApi } from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdSet } = bizSdk;

async function leerTargeting(adsetId: string): Promise<Record<string, any>> {
  const adset = new AdSet(adsetId);
  await adset.read(['targeting']);
  return (adset as any).targeting ?? {};
}

function aMinutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

export function registrarHerramientasAccionesConjunto(server: McpServer) {

  server.registerTool(
    'modificar_puja_conjunto',
    {
      description: 'Cambia la estrategia de puja de un conjunto. Permite dejar a Meta pujar libre, poner un tope de puja (bid cap), un costo objetivo por resultado (cost cap) o un ROAS mínimo. Nota: si la campaña usa CBO, la puja se controla a nivel campaña y esto puede fallar.',
      inputSchema: {
        adset_id: z.string().describe('ID del conjunto'),
        estrategia: z.string().describe("'sin_tope' (libre), 'tope_puja' (bid cap), 'costo_objetivo' (cost cap) o 'roas_minimo'"),
        valor: z.number().optional().describe("Para 'tope_puja'/'costo_objetivo': monto en moneda de la cuenta (ej 80 = $80). Para 'roas_minimo': múltiplo (ej 1.5 = ROAS 1.5x). No aplica a 'sin_tope'."),
      },
    },
    async ({ adset_id, estrategia, valor }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const est = estrategia.trim().toLowerCase();
      const params: Record<string, any> = {};
      try {
        if (est === 'sin_tope') {
          params.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
        } else if (est === 'tope_puja' || est === 'costo_objetivo') {
          if (valor == null || valor <= 0) return { content: [{ type: 'text', text: "Error: esta estrategia requiere 'valor' mayor a 0." }] };
          params.bid_strategy = est === 'tope_puja' ? 'LOWEST_COST_WITH_BID_CAP' : 'COST_CAP';
          params.bid_amount = Math.round(valor * 100);
        } else if (est === 'roas_minimo') {
          if (valor == null || valor <= 0) return { content: [{ type: 'text', text: "Error: 'roas_minimo' requiere 'valor' mayor a 0 (ej 1.5)." }] };
          params.bid_strategy = 'LOWEST_COST_WITH_MIN_ROAS';
          params.bid_constraints = { roas_average_floor: Math.round(valor * 10000) };
        } else {
          return { content: [{ type: 'text', text: "Error: 'estrategia' debe ser 'sin_tope', 'tope_puja', 'costo_objetivo' o 'roas_minimo'." }] };
        }
        initApi();
        await new AdSet(adset_id).update([], params);
        const detalle = est === 'sin_tope' ? 'puja automática (sin tope)'
          : est === 'roas_minimo' ? `ROAS mínimo ${valor}x`
          : `${est === 'tope_puja' ? 'tope de puja' : 'costo objetivo'} de $${valor}`;
        return { content: [{ type: 'text', text: `💰 Puja del conjunto ${adset_id} actualizada → ${detalle}.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al modificar la puja', e) }] };
      }
    },
  );

  server.registerTool(
    'programar_horario_conjunto',
    {
      description: 'Configura la programación horaria (dayparting) de un conjunto: en qué días y horas puede gastar. Apaga las horas-fuga automáticamente. REQUISITO de Meta: el conjunto debe tener presupuesto TOTAL (lifetime), no diario.',
      inputSchema: {
        adset_id: z.string().describe('ID del conjunto'),
        ventanas: z.array(z.object({
          dias: z.array(z.number().int().min(0).max(6)).describe('Días: 0=domingo, 1=lunes, ... 6=sábado'),
          inicio: z.string().describe('Hora de inicio "HH:MM" (24h), ej "09:00"'),
          fin: z.string().describe('Hora de fin "HH:MM" (24h), ej "21:00"'),
        })).describe('Franjas en las que el conjunto puede gastar. Fuera de ellas se apaga.'),
      },
    },
    async ({ adset_id, ventanas }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      if (!ventanas.length) return { content: [{ type: 'text', text: 'Error: debes indicar al menos una franja en "ventanas".' }] };
      const schedule: any[] = [];
      for (const v of ventanas) {
        const ini = aMinutos(v.inicio);
        const fin = aMinutos(v.fin);
        if (ini == null || fin == null) return { content: [{ type: 'text', text: `Error: hora inválida en una franja ("${v.inicio}"–"${v.fin}"). Usa formato "HH:MM".` }] };
        if (fin <= ini) return { content: [{ type: 'text', text: `Error: la hora de fin debe ser mayor que la de inicio ("${v.inicio}"–"${v.fin}").` }] };
        if (!v.dias.length) return { content: [{ type: 'text', text: 'Error: cada franja necesita al menos un día.' }] };
        schedule.push({ days: v.dias, start_minute: ini, end_minute: fin });
      }
      try {
        initApi();
        await new AdSet(adset_id).update([], { adset_schedule: schedule, pacing_type: ['day_parting'] });
        return { content: [{ type: 'text', text: `⏰ Programación horaria del conjunto ${adset_id} configurada con ${schedule.length} franja(s). Fuera de ese horario no gastará.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al programar el horario', e) }] };
      }
    },
  );

  server.registerTool(
    'modificar_placements_conjunto',
    {
      description: 'Define las ubicaciones (placements) de un conjunto: automáticas (Meta decide) o manuales (eliges plataformas y posiciones como Feed, Stories, Reels). Conserva el resto de la segmentación.',
      inputSchema: {
        adset_id: z.string().describe('ID del conjunto'),
        automatico: z.boolean().default(false).describe('Si true, vuelve a ubicaciones automáticas y se ignora el resto.'),
        plataformas: z.array(z.string()).default([]).describe("Manual: 'facebook', 'instagram', 'messenger', 'audience_network'"),
        posiciones_facebook: z.array(z.string()).default([]).describe("Ej: 'feed', 'video_feeds', 'story', 'facebook_reels', 'marketplace'"),
        posiciones_instagram: z.array(z.string()).default([]).describe("Ej: 'stream', 'story', 'reels', 'explore'"),
      },
    },
    async ({ adset_id, automatico, plataformas, posiciones_facebook, posiciones_instagram }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        initApi();
        const targeting = await leerTargeting(adset_id);
        for (const k of ['publisher_platforms', 'facebook_positions', 'instagram_positions', 'messenger_positions', 'audience_network_positions']) {
          delete targeting[k];
        }
        if (automatico) {
          await new AdSet(adset_id).update([], { targeting });
          return { content: [{ type: 'text', text: `📍 Ubicaciones del conjunto ${adset_id} puestas en AUTOMÁTICAS.` }] };
        }
        if (!plataformas.length) return { content: [{ type: 'text', text: "Error: en modo manual indica al menos una plataforma, o usa automatico=true." }] };
        targeting.publisher_platforms = plataformas.map((p) => p.trim().toLowerCase());
        if (posiciones_facebook.length) targeting.facebook_positions = posiciones_facebook;
        if (posiciones_instagram.length) targeting.instagram_positions = posiciones_instagram;
        await new AdSet(adset_id).update([], { targeting });
        return { content: [{ type: 'text', text: `📍 Ubicaciones manuales del conjunto ${adset_id} actualizadas.\n- Plataformas: ${plataformas.join(', ')}${posiciones_facebook.length ? `\n- Facebook: ${posiciones_facebook.join(', ')}` : ''}${posiciones_instagram.length ? `\n- Instagram: ${posiciones_instagram.join(', ')}` : ''}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al modificar placements', e) }] };
      }
    },
  );

  server.registerTool(
    'modificar_audiencias_conjunto',
    {
      description: 'Adjunta o quita audiencias personalizadas y lookalikes de un conjunto (usa los IDs de listar_audiencias). Conserva el resto de la segmentación (geo, edad, intereses).',
      inputSchema: {
        adset_id: z.string().describe('ID del conjunto'),
        incluir_ids: z.array(z.string()).default([]).describe('IDs de audiencias a INCLUIR (custom + lookalike)'),
        excluir_ids: z.array(z.string()).default([]).describe('IDs de audiencias a EXCLUIR'),
        modo: z.string().default('reemplazar').describe("'reemplazar' (deja solo las indicadas) o 'agregar' (suma a las ya configuradas)"),
      },
    },
    async ({ adset_id, incluir_ids, excluir_ids, modo }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      if (!incluir_ids.length && !excluir_ids.length)
        return { content: [{ type: 'text', text: 'Error: indica al menos una audiencia en incluir_ids o excluir_ids.' }] };
      const agregar = modo.trim().toLowerCase() === 'agregar';
      try {
        initApi();
        const targeting = await leerTargeting(adset_id);
        const fusionar = (existentes: any[], nuevos: string[]) => {
          const base = agregar && Array.isArray(existentes) ? existentes.map((a) => a.id) : [];
          const ids = Array.from(new Set([...base, ...nuevos]));
          return ids.map((id) => ({ id }));
        };
        if (incluir_ids.length || agregar) targeting.custom_audiences = fusionar(targeting.custom_audiences, incluir_ids);
        if (excluir_ids.length || agregar) targeting.excluded_custom_audiences = fusionar(targeting.excluded_custom_audiences, excluir_ids);
        await new AdSet(adset_id).update([], { targeting });
        return { content: [{ type: 'text', text: `👥 Audiencias del conjunto ${adset_id} actualizadas (${modo}).\n- Incluidas: ${incluir_ids.length || 'sin cambio'}\n- Excluidas: ${excluir_ids.length || 'sin cambio'}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al modificar audiencias del conjunto', e) }] };
      }
    },
  );
}
