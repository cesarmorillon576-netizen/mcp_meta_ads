import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
    credencialesOk, errorCredenciales, initApi, resolveAccount
} from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdAccount: FBAdAccount } = bizSdk;

export function registrarToolsCreacion(server: McpServer) {

    server.registerTool(
        'crear_campana',
        {
            description: 'Crear una campaña NUEVA en estaudo PAUSADO. Devuelve el ID para crear conjuntos dentro. Si activas CBO, el presupuesto vive aquí; su no, irá en el conjunto',
            inputSchema: {
                account_input: z.string().describe('ID, act_xxx o nombre de la cuenta'),
                nombre: z.string().describe('Nombre de la campaña'),
                objetivo: z.string().default('OUTCOME_ENGAGEMENT').describe('OUTCOME_ENGAGEMENT (mensajes/WhatsApp), OUTCOME_LEADS, OUTCOME_TRAFFIC, OUTCOME_SALES'),
                presupuesto_diario: z.number().optional().describe('Presupuesto diario en la MONEDA de la cuenta (ej 120 = $120). Solo si quieres CBO a nivel campaña')
            }
        },
        async ({ account_input, nombre, objetivo, presupuesto_diario }) => {
            if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] }
            try {
                const account_id = await resolveAccount(account_input);
                initApi();
                const params: Record<string, any> = {
                    name: nombre,
                    objective: objetivo,
                    status: 'PAUSED',
                    special_ad_categories: []
                }

                if (presupuesto_diario != null) {
                    params.daily_budget = Math.round(presupuesto_diario * 100);
                }

                const campana = await new FBAdAccount(account_id).createCampaign([], params);

                const presupuestoTxt = presupuesto_diario != null
                    ? `\n- Presupuesto (CBO): $${presupuesto_diario}/día`
                    : '\n- Presupuesto: se definirá en el conjunto (ABO)';
                return {
                    content: [{
                        type: 'text',
                        text: `✅ Campaña creada en PAUSADO.\n- Nombre: ${nombre}\n- ID: ${campana.id}\n- Objetivo: ${objetivo}${presupuestoTxt}`
                    }]
                };
            } catch (e: any) {
                return { content: [{ type: 'text', text: `Error al crear la campaña: ${e.message}` }] }
            }
        }
    );

    server.registerTool(
        'crear_conjunto',
        {
            description: 'Crea un conjunto de anuncios (ad set) PAUSANDO dentro de una campaña. Aquí va la segmentación y, si la campaña no tiene CBO, el presupuesto',
            inputSchema: {
                account_input: z.string(),
                campana_id: z.string().describe('ID de la campaña contenedora'),
                nombre: z.string(),
                presupuesto_diario: z.number().optional().describe('En moneda de la cuenta. Omitir si la campaña ya tiene CBO'),
                optimizacion: z.string().default('CONVERSATIONS').describe('CONVERSATIONS (mensajes), LINK_CLICKS, LEAD_GENERATION, REACH'),
                paises: z.array(z.string()).default(['MX']),
                edad_min: z.number().int().default(18),
                edad_max: z.number().int().default(65),
                page_id: z.string().optional().describe('ID de la Página de Facebook (obligatorio para campañas de mensajería)'),
                destino_mensaje: z.string().optional().describe("'WHATSAPP' o 'MESSENGER' para click-to-message")
            }
        },
        async ({ account_input, campana_id, nombre, presupuesto_diario, optimizacion, paises, edad_min, edad_max, page_id, destino_mensaje }) => {
            if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] }

            try {
                const accountId = await resolveAccount(account_input);
                initApi();
                const params: Record<string, any> = {
                    name: nombre,
                    campaign_id: campana_id,
                    billing_event: 'IMPRESSIONS',
                    optimization_goal: optimizacion,
                    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
                    status: 'PAUSED',
                    targeting: { geo_locations: { countries: paises }, age_min: edad_min, age_max: edad_max },
                };
                if (presupuesto_diario != null) params.daily_budget = Math.round(presupuesto_diario * 100);
                if (destino_mensaje) params.destination_type = destino_mensaje;
                if (page_id) params.promoted_object = { page_id };

                const conjunto = await new FBAdAccount(accountId).createAdSet([], params);
                return {
                    content: [{
                        type: 'text',
                        text: `✅ Conjunto creado en PAUSADO.\n- Nombre: ${nombre}\n- ID: ${conjunto.id}\n- En campaña: ${campana_id}\n- Geo: ${paises.join(', ')} | Edad: ${edad_min}-${edad_max}`
                    }]
                };
            } catch (e: any) {
                return { content: [{ type: 'text', text: `Error al crear conjunto: ${e.message}` }] };
            }
        }
    );

    server.registerTool(
        'crear_anuncio',
        {
            description: 'Crea un anuncio PAUSADO en un conjunto, a partir de una publicación EXISTENTE de la Página (object_story_id = pageid_postid). Para WhatsApp,agrega call_to_action.',
            inputSchema: {
                account_input: z.string(),
                conjunto_id: z.string().describe('ID del ad set contenedor'),
                nombre: z.string(),
                page_id: z.string().describe('ID de la Página de Facebook'),
                post_id: z.string().describe('ID de la publicación existente a promocionar'),
                cta: z.string().optional().describe("Tipo de botón: 'WHATSAPP_MESSAGE', 'MESSAGE_PAGE', 'LEARN_MORE'"),
            },
        },
        async ({ account_input, conjunto_id, nombre, page_id, post_id, cta }) => {
            if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
            try {
                const accountId = await resolveAccount(account_input);
                initApi();
                const cuenta = new FBAdAccount(accountId);
                const objectStorySpec: Record<string, any> = { page_id, object_story_id: `${page_id}_${post_id}` };
                const creative = await cuenta.createAdCreative([], { name: `${nombre} - creative`, object_story_spec: objectStorySpec });
                const ad = await cuenta.createAd([], {
                    name: nombre,
                    adset_id: conjunto_id,
                    creative: { creative_id: creative.id },
                    status: 'PAUSED',
                });
                return {
                    content: [{
                        type: 'text',
                        text: `✅ Anuncio creado en PAUSADO.\n- Nombre: ${nombre}\n- ID: ${ad.id}\n- En conjunto: ${conjunto_id}\n- Creative: ${creative.id}${cta ? `\n- CTA: ${cta}` : ''}`
                    }]
                };
            } catch (e: any) {
                return { content: [{ type: 'text', text: `Error al crear anuncio: ${e.message}` }] };
            }
        },
    );
}