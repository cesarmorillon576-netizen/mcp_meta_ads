import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
    credencialesOk, errorCredenciales, initApi, resolveAccount, cursorToArray
} from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdAccount: FBAdAccount, AdSet } = bizSdk;

async function leerTargeting(adsetId: string): Promise<Record<string, any>> {
    const adset = new AdSet(adsetId);
    await adset.read(['targeting']);
    return (adset as any).targeting ?? {};
}

export function registrarToolsSegmentacionAcciones(server: McpServer) {
    server.registerTool(
        'modificar_geografia_conjunto',
        {
            description: 'Modifica la geografia (geo_locations) de un ad set conservando el resto de la segmentacion. Permite paises, regiones o radio al rededor de coordenadas.',
            inputSchema: {
                adset_id: z.string().describe('ID del conjunto de anuncios'),
                paises: z.array(z.string()).default([]).describe("Codigos ISO de país, ej: ['MX', 'US']"),
                radio_km: z.number().optional().describe('Radio en kilometros alrededor de lat/lng (pin en mapa)'),
                latitud: z.number().optional().describe('Latitud para el radio'),
                longitud: z.number().optional().describe('Longitud para el radio'),
            }
        },
        async ({ adset_id, paises, radio_km, latitud, longitud }) => {
            if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] }
            try {
                initApi();
                const targeting = await leerTargeting(adset_id);

                const geo: Record<string, any> = {};
                if (paises.length) geo.countries = paises;
                if (radio_km && latitud != null && longitud != null) {
                    geo.custom_locations = [{
                        latitude: latitud,
                        longitude: longitud,
                        radius: radio_km,
                        distance_unit: 'kilometer'
                    }];
                }

                if (!Object.keys(geo).length) {
                    return {
                        content: [{ type: 'text', text: 'No se proporcionaron criterios de geografía para modificar.' }]
                    };
                }

                targeting.geo_locations = geo;

                const adset = new AdSet(adset_id);
                await adset.update([], { targeting });

                return { content: [{ type: 'text', text: `🌎 Geografía del conjunto ${adset_id} actualizada.` }] };
            } catch (e: any) {
                return { content: [{ type: 'text', text: `Error al actualizar la geografía: ${e.message}` }] };
            }

        }
    );

    server.registerTool(
        'buscar_intereses',
        {
            description: 'Busca intereses/comportamientos en el catálogo de Meta por palabra clave. Devuelve los IDs que luego se usan en modificar_segmentacion_conjunto.',
            inputSchema: {
                account_input: z.string().describe('ID o nombre de la cuenta publicitaria'),
                consulta: z.string().describe('Palabras a buscar, ej: "odontologia", "diabetes"'),
                limite: z.number().int().default(15)
            }
        },
        async ({ account_input, consulta, limite }) => {
            if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] }
            try {
                initApi();
                const accountId = await resolveAccount(account_input);
                const cursor = await new FBAdAccount(accountId).getTargetingSearch(
                    ['id', 'name', 'audience_size_lower_bound', 'audience_size_upper_bound', 'path', 'type'],
                    { q: consulta, type: 'adinterest', limit: limite }
                );

                const items = cursorToArray(cursor);
                if (!items?.length) return { content: [{ type: 'text', text: `Sin resultados para "${consulta}".` }] }

                const lineas = [`🔎 Intereses para "${consulta}":\n`];

                for (const i of items) {
                    const tam = i.audience_size_lower_bound ? `${i.audience_size_lower_bound.toLocaleString()}–${i.audience_size_upper_bound?.toLocaleString()}` : (i.audience_size?.toLocaleString() ?? 'N/A');
                    lineas.push(`- ${i.name}  (ID: ${i.id})  ~${tam} personas  [${i.path?.join(' > ') ?? i.type}]`);
                }

                return { content: [{ type: 'text', text: lineas.join('\n') }] };

            } catch (e: any) {
                return { content: [{ type: 'text', text: `Error al buscar intereses: ${e.message}` }] };
            }
        }
    );

    server.registerTool(
        'listar_audiencias',
        {
            description: 'Lista de audiencias personalizadas y lookalikes de una cuenta. Devuelve los IDs para usan en modificar_audiencias_conjunto',
            inputSchema: {
                account_input: z.string().describe('ID od nombre de la cuenta publicitaria'),
                limite: z.number().int().default(50)
            }
        },
        async ({ account_input, limite }) => {
            if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] }
            try {
                initApi();
                const accountIde = await resolveAccount(account_input);
                const cursor = await new FBAdAccount(accountIde).getCustomAudiences(
                    ['id', 'name', 'approximate_count_lower_bound', 'subtype', 'delivery_status'],
                    { limit: limite }
                );

                const auds = cursorToArray(cursor);
                if (!auds.length) return { content: [{ type: 'text', text: `No se encontraron audiencias para la cuenta ${account_input}` }] };

                const lineas = [`👥 Audiencias de '${account_input}':\n`];

                for (const a of auds) {
                    const tam = a.approximate_count_lower_bound != null
                        ? `~${a.approximate_count_lower_bound.toLocaleString()}` : 'tamaño N/A';
                    lineas.push(`- ${a.name}  (ID: ${a.id})  [${a.subtype}]  ${tam}`);
                }

                return { content: [{ type: 'text', text: lineas.join('\n') }] };
            } catch (e: any) {
                return { content: [{ type: 'text', text: `Error al listar audiencias: ${e.message}` }] };
            }
        }
    );

    server.registerTool(
        'modificar_segmentacion_conjunto',
        {
            description: 'Modifica edad, género, intereses/comportameitno y exclusiones de un Ad Set, conservando geografía y audiencias ya configuradas',
            inputSchema: {
                adset_id: z.string().describe('ID del Ad Set a modificar'),
                edad_min: z.number().int().min(13).max(65).optional(),
                edad_max: z.number().int().min(13).max(65).optional(),
                genero: z.string().optional().describe("'todos', 'hombres' o 'mujeres'"),
                intereses_id: z.array(z.string()).default([]).describe('IDS de interesés (de buscar_intereses)'),
                excluir_intereses_ids: z.array(z.string()).default([]).optional().describe('IDs de interés a excluir')
            }
        },
        async ({ adset_id, edad_min, edad_max, genero, intereses_id, excluir_intereses_ids }) => {
            if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] }
            try {
                initApi();
                const targeting = await leerTargeting(adset_id);

                if (edad_min != null) targeting.age_min = edad_min;
                if (edad_max != null) targeting.age_max = edad_max;
                if(genero){
                    const g = genero.trim().toLowerCase();
                    if(g === 'hombres'){
                        targeting.genders = [1];
                    }else if(g === 'mujeres'){
                        targeting.genders = [2];
                    }else{
                        delete targeting.genders;
                    }
                }

                if (intereses_id.length) {
                    targeting.flexible_spec = [{ interests: intereses_id.map((id) => ({ id })) }];
                }

                if (excluir_intereses_ids?.length) {
                    targeting.exclusions = { interests: excluir_intereses_ids.map((id) => ({ id })) };
                }

                const adset = new AdSet(adset_id);
                await adset.update([], { targeting });

                const resumen = [`🎯 Segmentación del conjunto ${adset_id} actualizada.`];
                if (edad_min != null || edad_max != null)
                    resumen.push(`- Edad: ${targeting.age_min ?? 13}–${targeting.age_max ?? 65}`);
                if (genero) resumen.push(`- Género: ${genero}`);
                if (intereses_id.length) resumen.push(`- Intereses incluidos: ${intereses_id.length}`);
                if (excluir_intereses_ids?.length) resumen.push(`- Intereses excluidos: ${excluir_intereses_ids.length}`);

                return { content: [{ type: 'text', text: resumen.join('\n') }] };
            } catch (e: any) {
                return { content: [{ type: 'text', text: `Error al modificar segmentación: ${e.message}` }] };
            }
        }
    );

}

