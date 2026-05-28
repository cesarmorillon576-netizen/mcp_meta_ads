import path from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// interfaces

// Estructura de una accion dentro del array de meta
interface MetaAction{
  action_type: string;
  value: string;
}

// estructura del objeto insight
interface MetaInsight{
  campaign_name?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  spend?: string;
  cpm?: string;
  cpc?: string;
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
  purchase_roas?: Array<{value: string}>;
}

interface JerarquiaConversion{
  keywords: string[];
  label: string;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { FacebookAdsApi, AdAccount: FBAdAccount, Campaign, AdSet, Ad, User } = bizSdk;

// Find .env: next to the running script (production/windows_build) or project root (dev)
function findEnvPath(): string {
  if ((process as any).pkg !== undefined) {
    return path.join(path.dirname(process.execPath), '.env');
  }
  const candidates = [
    path.dirname(path.resolve(process.argv[1] ?? '')),
    __dirname,
    path.resolve(__dirname, '..', '..'),
    process.cwd(),
  ];
  for (const dir of candidates) {
    try {
      const p = path.join(dir, '.env');
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return path.join(candidates[0] ?? process.cwd(), '.env');
}
dotenv.config({ path: findEnvPath() });

const server = new McpServer({ name: 'MetaAds', version: '2.0.0' });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken(): string {
  return process.env.META_ACCESS_TOKEN ?? '';
}

function credencialesOk(): boolean {
  return getToken().length > 0;
}

function errorCredenciales(): string {
  return '❌ Error: No se encontraron las credenciales de Meta Ads en el archivo de configuración (.env).';
}

function initApi(): void {
  FacebookAdsApi.init(getToken());
}

function cursorToArray(cursor: any): any[] {
  const arr: any[] = [];
  cursor.forEach((item: any) => arr.push(item));
  return arr;
}

function nextCursor(cursor: any): string | null {
  const paging = cursor?.paging;
  // paging.next is a URL string only when there's a real next page (after load it becomes undefined on last page)
  if (!paging?.next || typeof paging.next !== 'string') return null;
  return paging.cursors?.after ?? null;
}

function traducirEstado(status: string): string {
  const estados: Record<string, string> = {
    ACTIVE: '🟢 Activa',
    PAUSED: '⏸ Pausada',
    PENDING_REVIEW: '⏳ En revisión por Meta',
    DISAPPROVED: '❌ Rechazada',
    WITH_ISSUES: '⚠ Con problemas técnicos',
    ERROR: '❌ Error de configuración',
    CAMPAIGN_PAUSED: '⏸ Pausada (campaña madre apagada)',
    ADSET_PAUSED: '⏸ Pausada (conjunto apagado)',
    PENDING_BILLING_INFO: '💳 Sin información de facturación',
    IN_PROCESS: '⏳ Procesando',
    ARCHIVED: '🗄 Archivada',
    DELETED: '🗑 Eliminada',
  };
  return estados[status] ?? `Estatus: ${status}`;
}

async function resolveAccount(accountInput: string): Promise<string> {
  const input = accountInput.trim();
  if (/^\d+$/.test(input)) return `act_${input}`;
  if (input.toLowerCase().startsWith('act_')) return input;
  try {
    initApi();
    const cursor = await new User('me').getAdAccounts(['id', 'name'], { limit: 200 });
    const accounts = cursorToArray(cursor);
    const match = accounts.find((a: any) =>
      (a.name ?? '').toLowerCase().includes(input.toLowerCase()),
    );
    if (match) return match.id;
  } catch {}
  return `act_${input}`;
}

function presupuestoStr(daily?: string, lifetime?: string): string {
  if (daily) return `$${(parseInt(daily) / 100).toFixed(2)}/día`;
  if (lifetime) return `$${(parseInt(lifetime) / 100).toFixed(2)} total`;
  return 'no definido';
}

// ─── UTILIDADES DE CONTEXTO ───────────────────────────────────────────────────

server.registerTool(
  'listar_cuentas_publicitarias',
  { description: 'Listar todas las cuentas de anuncios disponibles con sus nombres e IDs.' },
  async () => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      initApi();
      const cursor = await new User('me').getAdAccounts(['id', 'name'], { limit: 200 });
      const cuentas = cursorToArray(cursor);
      if (!cuentas?.length)
        return { content: [{ type: 'text', text: 'No se encontraron cuentas publicitarias vinculadas a este perfil.' }] };
      const lineas = ['Cuentas Publicitarias Disponibles:\n'];
      for (const c of cuentas)
        lineas.push(`  • ${c.name ?? 'Sin Nombre'} | ID: ${c.id}`);
      return { content: [{ type: 'text', text: lineas.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `No se pudieron listar las cuentas. Detalle: ${e.message}` }] };
    }
  },
);

// ─── CONSULTA DE CAMPAÑAS ─────────────────────────────────────────────────────

server.registerTool(
  'obtener_campanas',
  {
    description: 'Obtener campañas de una cuenta publicitaria con estado y presupuesto. Parámetros: account_input (ID o nombre), limite (default 20), pagina_cursor (cursor de página anterior).',
    inputSchema: {
      account_input: z.string().describe('ID numérico, act_XXX o nombre de la cuenta publicitaria'),
      limite: z.number().int().default(20).describe('Campañas por página'),
      pagina_cursor: z.string().default('').describe('Cursor devuelto en respuesta anterior para ver siguiente página'),
    },
  },
  async ({ account_input, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const accountId = await resolveAccount(account_input);
      initApi();
      const sdkParams: Record<string, any> = { limit: limite };
      if (pagina_cursor) sdkParams.after = pagina_cursor;
      const cursor = await new FBAdAccount(accountId).getCampaigns(
        ['id', 'name', 'status', 'effective_status', 'daily_budget', 'lifetime_budget', 'start_time', 'stop_time', 'objective'],
        sdkParams,
      );
      const campanas = cursorToArray(cursor);
      if (!campanas?.length)
        return { content: [{ type: 'text', text: `No se encontraron campañas para la cuenta '${account_input}'.` }] };
      const resultados = [`Campañas en '${account_input}' (${campanas.length} mostradas):\n`];
      for (const c of campanas) {
        const presupuesto = presupuestoStr(c.daily_budget, c.lifetime_budget);
        const estado = traducirEstado(c.effective_status ?? c.status ?? '');
        resultados.push(
          `- ${c.name} (ID: ${c.id})\n` +
          `  Estado: ${estado} | Objetivo: ${c.objective ?? 'N/A'}\n` +
          `  Presupuesto: ${presupuesto}\n` +
          `  Inicio: ${c.start_time ?? 'N/A'} | Fin: ${c.stop_time ?? 'sin fecha fin'}`,
        );
      }
      const nc = nextCursor(cursor);
      if (nc) resultados.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: resultados.join('\n\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar la API de Meta: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'obtener_campanas_activas',
  {
    description: 'Obtener campañas ACTIVE de una cuenta publicitaria. Parámetros: account_input, limite (default 20), pagina_cursor.',
    inputSchema: {
      account_input: z.string().describe('ID numérico, act_XXX o nombre de la cuenta'),
      limite: z.number().int().default(20),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const accountId = await resolveAccount(account_input);
      initApi();
      const sdkParams: Record<string, any> = {
        effective_status: JSON.stringify(['ACTIVE']),
        limit: limite,
      };
      if (pagina_cursor) sdkParams.after = pagina_cursor;
      const cursor = await new FBAdAccount(accountId).getCampaigns(
        ['id', 'name', 'status', 'daily_budget', 'objective'],
        sdkParams,
      );
      const campanas = cursorToArray(cursor);
      if (!campanas?.length)
        return { content: [{ type: 'text', text: `No hay campañas activas en la cuenta '${account_input}'.` }] };
      const resultados = [`Campañas activas (${campanas.length} mostradas):\n`];
      for (const c of campanas) {
        const pStr = c.daily_budget
          ? `$${(parseInt(c.daily_budget) / 100).toFixed(2)}/día`
          : 'presupuesto variable';
        resultados.push(`- ${c.name} (ID: ${c.id}) | Objetivo: ${c.objective ?? 'N/A'} | Inversión: ${pStr}`);
      }
      const nc = nextCursor(cursor);
      if (nc) resultados.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: resultados.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar campañas activas: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'obtener_todas_campanas_activas',
  {
    description: 'Obtener campañas activas de todas las cuentas accesibles. Parámetro: limite_por_cuenta (default 10).',
    inputSchema: {
      limite_por_cuenta: z.number().int().default(10).describe('Máximo de campañas a mostrar por cuenta'),
    },
  },
  async ({ limite_por_cuenta }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      initApi();
      const cuentasCursor = await new User('me').getAdAccounts(['id', 'name'], { limit: 200 });
      const cuentas = cursorToArray(cuentasCursor);
      if (!cuentas?.length)
        return { content: [{ type: 'text', text: 'No se encontraron cuentas publicitarias asociadas al token.' }] };
      const resultados: string[] = [];
      let total = 0;
      for (const cuenta of cuentas) {
        try {
          const campCursor = await new FBAdAccount(cuenta.id).getCampaigns(
            ['id', 'name', 'daily_budget', 'objective'],
            { effective_status: JSON.stringify(['ACTIVE']), limit: limite_por_cuenta },
          );
          const campanas = cursorToArray(campCursor);
          if (campanas?.length) {
            const hayMas = nextCursor(campCursor) ? ' (y más...)' : '';
            resultados.push(`\nCuenta: ${cuenta.name ?? cuenta.id} (${cuenta.id}) — ${campanas.length} activa(s)${hayMas}:`);
            for (const c of campanas) {
              const presupuesto = c.daily_budget
                ? `$${(parseInt(c.daily_budget) / 100).toFixed(0)}/día`
                : 'no definido';
              resultados.push(`  - ${c.name} | Objetivo: ${c.objective ?? 'N/A'} | Presupuesto: ${presupuesto}`);
            }
            total += campanas.length;
          }
        } catch {}
      }
      if (!resultados.length)
        return { content: [{ type: 'text', text: 'No hay campañas activas en ninguna de las cuentas accesibles.' }] };
      return {
        content: [{
          type: 'text',
          text: `Total campañas activas (mostrando hasta ${limite_por_cuenta} por cuenta): ${total}` + resultados.join(''),
        }],
      };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar campañas activas: ${e.message}` }] };
    }
  },
);

// ─── CONJUNTOS DE ANUNCIOS ────────────────────────────────────────────────────

server.registerTool(
  'obtener_conjuntos',
  {
    description: 'Obtener conjuntos de anuncios (Ad Sets) de una cuenta o campaña específica. Parámetros: account_input, campaign_id (opcional), limite (default 20), pagina_cursor.',
    inputSchema: {
      account_input: z.string().describe('ID o nombre de la cuenta publicitaria'),
      campaign_id: z.string().default('').describe('ID de campaña para filtrar (opcional)'),
      limite: z.number().int().default(20),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, campaign_id, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const fields = ['id', 'name', 'status', 'effective_status', 'daily_budget', 'lifetime_budget', 'campaign_id', 'optimization_goal', 'destination_type', 'billing_event'];
      const sdkParams: Record<string, any> = { limit: limite };
      if (pagina_cursor) sdkParams.after = pagina_cursor;
      initApi();
      let cursor: any;
      let origen: string;
      if (campaign_id.trim()) {
        cursor = await new Campaign(campaign_id.trim()).getAdSets(fields, sdkParams);
        origen = `campaña '${campaign_id}'`;
      } else {
        const accountId = await resolveAccount(account_input);
        cursor = await new FBAdAccount(accountId).getAdSets(fields, sdkParams);
        origen = `cuenta '${account_input}'`;
      }
      const conjuntos = cursorToArray(cursor);
      if (!conjuntos?.length)
        return { content: [{ type: 'text', text: `No se encontraron conjuntos de anuncios en ${origen}.` }] };
      const resultados = [`Conjuntos de anuncios en ${origen} (${conjuntos.length} mostrados):\n`];
      for (const cs of conjuntos) {
        const raw = presupuestoStr(cs.daily_budget, cs.lifetime_budget);
        const presupuesto = raw === 'no definido' ? 'heredado de campaña' : raw;
        const estado = traducirEstado(cs.effective_status ?? '');
        const optGoal = cs.optimization_goal ?? 'N/A';
        const destType = cs.destination_type ?? 'N/A';
        resultados.push(
          `- ${cs.name} (ID: ${cs.id})\n` +
          `  Estado: ${estado} | Presupuesto: ${presupuesto}\n` +
          `  Optimización: ${optGoal} → ${destType}\n` +
          `  Campaña ID: ${cs.campaign_id ?? 'N/A'}`,
        );
      }
      const nc = nextCursor(cursor);
      if (nc) resultados.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: resultados.join('\n\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar los conjuntos de anuncios: ${e.message}` }] };
    }
  },
);

// ─── ANUNCIOS ─────────────────────────────────────────────────────────────────

server.registerTool(
  'obtener_anuncios',
  {
    description: 'Obtener anuncios (Ads) de una cuenta, campaña o conjunto específico. Parámetros: account_input, adset_id (opcional), campaign_id (opcional), limite (default 20), pagina_cursor.',
    inputSchema: {
      account_input: z.string().describe('ID o nombre de la cuenta'),
      adset_id: z.string().default('').describe('ID de conjunto de anuncios para filtrar (opcional)'),
      campaign_id: z.string().default('').describe('ID de campaña para filtrar (opcional)'),
      limite: z.number().int().default(20),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, adset_id, campaign_id, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const fields = ['id', 'name', 'status', 'effective_status', 'adset_id', 'campaign_id'];
      const sdkParams: Record<string, any> = { limit: limite };
      if (pagina_cursor) sdkParams.after = pagina_cursor;
      initApi();
      let cursor: any;
      let origen: string;
      if (adset_id.trim()) {
        cursor = await new AdSet(adset_id.trim()).getAds(fields, sdkParams);
        origen = `conjunto '${adset_id}'`;
      } else if (campaign_id.trim()) {
        cursor = await new Campaign(campaign_id.trim()).getAds(fields, sdkParams);
        origen = `campaña '${campaign_id}'`;
      } else {
        const accountId = await resolveAccount(account_input);
        cursor = await new FBAdAccount(accountId).getAds(fields, sdkParams);
        origen = `cuenta '${account_input}'`;
      }
      const anuncios = cursorToArray(cursor);
      if (!anuncios?.length)
        return { content: [{ type: 'text', text: `No se encontraron anuncios en ${origen}.` }] };
      const resultados = [`Anuncios en ${origen} (${anuncios.length} mostrados):\n`];
      for (const a of anuncios) {
        const estado = traducirEstado(a.effective_status ?? a.status ?? '');
        resultados.push(
          `- ${a.name ?? 'Sin nombre'} (ID: ${a.id})\n` +
          `  Estado: ${estado}\n` +
          `  Conjunto ID: ${a.adset_id ?? 'N/A'} | Campaña ID: ${a.campaign_id ?? 'N/A'}`,
        );
      }
      const nc = nextCursor(cursor);
      if (nc) resultados.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: resultados.join('\n\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar los anuncios: ${e.message}` }] };
    }
  },
);

// ─── SEGMENTACIÓN ─────────────────────────────────────────────────────────────

server.registerTool(
  'obtener_segmentacion_conjunto',
  {
    description: 'Obtiene la segmentación completa (Targeting) de un Ad Set: geografía, demografía, intereses, comportamientos, exclusiones y públicos personalizados.',
    inputSchema: {
      adset_id: z.string().describe('ID del conjunto de anuncios (Ad Set)'),
    },
  },
  async ({ adset_id }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      initApi();
      const conjunto = new AdSet(adset_id);
      await conjunto.read(['name', 'campaign_id', 'status', 'effective_status', 'targeting']);
      const targeting = conjunto.targeting;
      if (!targeting)
        return { content: [{ type: 'text', text: `El conjunto '${conjunto.name}' (ID: ${adset_id}) no tiene datos de segmentación definidos.` }] };

      const lineas = [
        `🎯 Segmentación Detallada del Conjunto: ${conjunto.name} (ID: ${adset_id})`,
        `   Estado: ${traducirEstado(conjunto.effective_status ?? '')}\n`,
        '📊 CONFIGURACIÓN DE AUDIENCIA:',
        '─────────────────────────────────────────────',
      ];

      lineas.push(`• 👥 Edades: ${targeting.age_min ?? 'Cualquiera'} a ${targeting.age_max ?? 'Cualquiera'} años`);
      const genders: number[] | undefined = targeting.genders;
      let generoStr = 'Todos';
      if (JSON.stringify(genders) === '[1]') generoStr = 'Hombres';
      else if (JSON.stringify(genders) === '[2]') generoStr = 'Mujeres';
      lineas.push(`• ⚥ Género: ${generoStr}`);

      const locales = targeting.locales ?? [];
      if (locales.length) {
        const idiomas = locales.map((l: any) =>
          typeof l === 'object' ? String(l.name ?? l.id ?? l) : String(l),
        );
        lineas.push(`• 🗣 Idiomas: ${idiomas.join(', ')}`);
      } else {
        lineas.push('• 🗣 Idiomas: Todos los idiomas');
      }

      const geo = targeting.geo_locations ?? {};
      lineas.push('\n📍 UBICACIONES GEOGRÁFICAS:');
      const tiposGeo: Record<string, string> = {
        countries: 'Países',
        regions: 'Regiones/Estados',
        cities: 'Ciudades',
        zips: 'Códigos Postales',
        custom_locations: 'Radios personalizados (Pines)',
      };
      let hayGeo = false;
      for (const [clave, etiqueta] of Object.entries(tiposGeo)) {
        const items = geo[clave] ?? [];
        if (items.length) {
          hayGeo = true;
          lineas.push(`  ▪ ${etiqueta}:`);
          for (const item of items) {
            if (typeof item === 'object') {
              if ('latitude' in item) {
                const nombre = `Lat ${(item.latitude as number).toFixed(4)}, Lon ${(item.longitude as number).toFixed(4)}`;
                const radio = item.radius ? ` (+${item.radius} ${item.distance_unit})` : '';
                lineas.push(`    - ${nombre}${radio}`);
              } else {
                const nombre = item.name ?? item.key ?? 'Desconocido';
                const radio = item.radius ? ` (+${item.radius} ${item.distance_unit})` : '';
                lineas.push(`    - ${nombre}${radio}`);
              }
            } else {
              lineas.push(`    - ${item}`);
            }
          }
        }
      }
      if (!hayGeo) lineas.push('  ▪ Abierta (Sin restricciones geográficas específicas)');

      const customAud = targeting.custom_audiences ?? [];
      if (customAud.length) {
        lineas.push('\n👥 PÚBLICOS PERSONALIZADOS / SIMILARES INCLUIDOS:');
        for (const aud of customAud) lineas.push(`  ▪ ${aud.name ?? 'ID: ' + aud.id}`);
      }
      const excludedCustomAud = targeting.excluded_custom_audiences ?? [];
      if (excludedCustomAud.length) {
        lineas.push('\n🚫 PÚBLICOS PERSONALIZADOS EXCLUIDOS:');
        for (const aud of excludedCustomAud) lineas.push(`  ▪ ${aud.name ?? 'ID: ' + aud.id}`);
      }

      const flexible = targeting.flexible_spec ?? [];
      if (flexible.length) {
        lineas.push('\n🎯 INCLUSIONES DE SEGMENTACIÓN DETALLADA:');
        flexible.forEach((bloque: any, idx: number) => {
          lineas.push(`  ▪ Bloque de Coincidencia #${idx + 1} (Cumplir al menos uno):`);
          for (const clave of ['interests', 'behaviors', 'demographics']) {
            const items = bloque[clave] ?? [];
            if (items.length) {
              const tipo = clave === 'interests' ? 'Intereses' : clave === 'behaviors' ? 'Comportamientos' : 'Datos Demográficos';
              lineas.push(`    🔹 ${tipo}:`);
              for (const item of items) lineas.push(`      - ${item.name} (ID: ${item.id})`);
            }
          }
        });
      }
      const exclusions = targeting.exclusions ?? {};
      if (Object.keys(exclusions).length) {
        lineas.push('\n❌ EXCLUSIONES DE SEGMENTACIÓN DETALLADA:');
        for (const clave of ['interests', 'behaviors', 'demographics']) {
          const items = exclusions[clave] ?? [];
          if (items.length) {
            const tipo = clave === 'interests' ? 'Intereses' : clave === 'behaviors' ? 'Comportamientos' : 'Datos Demográficos';
            lineas.push(`    🔹 Excluyendo ${tipo}:`);
            for (const item of items) lineas.push(`      - ${item.name} (ID: ${item.id})`);
          }
        }
      }

      lineas.push('\n📱 UBICACIONES DE ANUNCIOS (PLACEMENTS):');
      if (!targeting.publisher_platforms) {
        lineas.push('  ▪ Ubicaciones Advantage+ (Automáticas - Recomendado por Meta)');
      } else {
        lineas.push(`  ▪ Dispositivos: ${(targeting.device_platforms ?? []).join(', ')}`);
        lineas.push(`  ▪ Plataformas: ${(targeting.publisher_platforms ?? []).join(', ')}`);
        const posiciones = [
          ...(targeting.facebook_positions ?? []),
          ...(targeting.instagram_positions ?? []),
          ...(targeting.messenger_positions ?? []),
          ...(targeting.audience_network_positions ?? []),
        ];
        if (posiciones.length) lineas.push(`  ▪ Posiciones específicas: ${posiciones.join(', ')}`);
      }

      return { content: [{ type: 'text', text: lineas.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al extraer la segmentación del Ad Set ${adset_id}: ${e.message}` }] };
    }
  },
);

// ─── GESTIÓN DE ESTADOS ───────────────────────────────────────────────────────

server.registerTool(
  'cambiar_estado_campana',
  {
    description: "Encender o apagar una campaña. Parámetros: campaign_id, accion ('encender' o 'apagar').",
    inputSchema: {
      campaign_id: z.string().describe('ID de la campaña'),
      accion: z.string().describe("'encender' o 'apagar'"),
    },
  },
  async ({ campaign_id, accion }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const acc = accion.trim().toLowerCase();
    if (acc !== 'encender' && acc !== 'apagar')
      return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'encender' o 'apagar'" }] };
    try {
      initApi();
      const camp = new Campaign(campaign_id);
      await camp.update([], { status: acc === 'encender' ? 'ACTIVE' : 'PAUSED' });
      const emoji = acc === 'encender' ? '🚀' : '⏸';
      return { content: [{ type: 'text', text: `${emoji} Campaña ${campaign_id} ${acc === 'encender' ? 'activada' : 'pausada'} correctamente.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al cambiar estado de la campaña: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'cambiar_estado_conjunto',
  {
    description: "Encender o apagar un conjunto de anuncios (Ad Set). Parámetros: adset_id, accion ('encender' o 'apagar').",
    inputSchema: {
      adset_id: z.string().describe('ID del conjunto de anuncios'),
      accion: z.string().describe("'encender' o 'apagar'"),
    },
  },
  async ({ adset_id, accion }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const acc = accion.trim().toLowerCase();
    if (acc !== 'encender' && acc !== 'apagar')
      return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'encender' o 'apagar'" }] };
    try {
      initApi();
      const adset = new AdSet(adset_id);
      await adset.update([], { status: acc === 'encender' ? 'ACTIVE' : 'PAUSED' });
      return { content: [{ type: 'text', text: `Conjunto ${adset_id} ${acc === 'encender' ? 'activado' : 'pausado'} correctamente.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al cambiar estado del conjunto: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'cambiar_estado_anuncio',
  {
    description: "Encender o apagar un anuncio individual. Parámetros: ad_id, accion ('encender' o 'apagar').",
    inputSchema: {
      ad_id: z.string().describe('ID del anuncio'),
      accion: z.string().describe("'encender' o 'apagar'"),
    },
  },
  async ({ ad_id, accion }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const acc = accion.trim().toLowerCase();
    if (acc !== 'encender' && acc !== 'apagar')
      return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'encender' o 'apagar'" }] };
    try {
      initApi();
      const ad = new Ad(ad_id);
      await ad.update([], { status: acc === 'encender' ? 'ACTIVE' : 'PAUSED' });
      return { content: [{ type: 'text', text: `Anuncio ${ad_id} ${acc === 'encender' ? 'activado' : 'pausado'} correctamente.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al cambiar estado del anuncio: ${e.message}` }] };
    }
  },
);

// ─── PRESUPUESTOS ─────────────────────────────────────────────────────────────

server.registerTool(
  'modificar_presupuesto_campana',
  {
    description: "Ajusta el presupuesto de una campaña. Parámetros: campaign_id, nuevo_presupuesto (monto en moneda local, ej: 1500.00), tipo_presupuesto ('diario' o 'total').",
    inputSchema: {
      campaign_id: z.string(),
      nuevo_presupuesto: z.number().describe('Monto en moneda local, ej: 1500.00'),
      tipo_presupuesto: z.string().describe("'diario' o 'total'"),
    },
  },
  async ({ campaign_id, nuevo_presupuesto, tipo_presupuesto }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const tipo = tipo_presupuesto.trim().toLowerCase();
    if (tipo !== 'diario' && tipo !== 'total')
      return { content: [{ type: 'text', text: "Error: 'tipo_presupuesto' debe ser 'diario' o 'total'." }] };
    const campo = tipo === 'diario' ? 'daily_budget' : 'lifetime_budget';
    const centavos = Math.round(nuevo_presupuesto * 100);
    try {
      initApi();
      const camp = new Campaign(campaign_id);
      await camp.update([], { [campo]: centavos });
      return { content: [{ type: 'text', text: `💰 Presupuesto ${tipo} de la campaña ${campaign_id} actualizado a $${nuevo_presupuesto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `No se pudo actualizar el presupuesto: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'modificar_presupuesto_conjunto',
  {
    description: "Ajusta el presupuesto de un Ad Set (útil en cuentas con ABO). Parámetros: adset_id, nuevo_presupuesto, tipo_presupuesto ('diario' o 'total').",
    inputSchema: {
      adset_id: z.string(),
      nuevo_presupuesto: z.number().describe('Monto en moneda local, ej: 500.00'),
      tipo_presupuesto: z.string().describe("'diario' o 'total'"),
    },
  },
  async ({ adset_id, nuevo_presupuesto, tipo_presupuesto }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const tipo = tipo_presupuesto.trim().toLowerCase();
    if (tipo !== 'diario' && tipo !== 'total')
      return { content: [{ type: 'text', text: "Error: 'tipo_presupuesto' debe ser 'diario' o 'total'." }] };
    const campo = tipo === 'diario' ? 'daily_budget' : 'lifetime_budget';
    const centavos = Math.round(nuevo_presupuesto * 100);
    try {
      initApi();
      const adset = new AdSet(adset_id);
      await adset.update([], { [campo]: centavos });
      return { content: [{ type: 'text', text: `💰 Presupuesto ${tipo} del conjunto ${adset_id} actualizado a $${nuevo_presupuesto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `No se pudo actualizar el presupuesto del conjunto: ${e.message}` }] };
    }
  },
);

// ─── REPORTES DE RENDIMIENTO ──────────────────────────────────────────────────

function formatInsightRow(i: MetaInsight, indent = ''): string {
  const actions = i.actions ?? [];
  const costActions = i.cost_per_action_type ?? [];

  // Jerarquia principal
  const jerarquiaConversiones: JerarquiaConversion[] = [
    {keywords: ['purchase'], label: 'compras'},
    {keywords: ['lead', 'lead_grouped', 'schedule', 'submit_application'], label: 'Leads/Citas'},
    {keywords: ['messaging_first_reply', 'conversation_started'], label: 'Mensajes Iniciados'},
    {keywords: ['add_to_cart', 'initiate_checkout'], label: 'Intenciones'},
    {keywords: ['landing_page_view'], label: 'Visitas web'},
    {keywords: ['link_click'], label: 'Clics'}
  ];

  let labelConv = 'Conversiones';
  let valorConv = '0';
  let targetType = 'purchase';

  for(const n of jerarquiaConversiones){
    const accionEncontrada = actions.find((a: MetaAction) =>
      n.keywords.some((kw) => a.action_type.includes(kw))
    );

    if(accionEncontrada){
      labelConv = n.label;
      valorConv = accionEncontrada.value;
      targetType = accionEncontrada.action_type;
      break;
    }
  }

  const cpaMatch = costActions.find((a: MetaAction) => a.action_type === targetType);
  const cpa: string = cpaMatch ? `$${parseFloat(cpaMatch.value).toFixed(2)}` : 'N/A';

  // deglose del chat
  const metricasMensajes: MetaAction[] = actions.filter((a: MetaAction) =>
    a.action_type.includes('messaging')
  );

  let desgloseMensajeria: string = '';
  if(metricasMensajes.length > 0){
    desgloseMensajeria = `\n${indent}  --- Desglose de Chat ---`;
    for(const m of metricasMensajes){
      const nombreLimpio = m.action_type.replace('onsite_conversion.', '');
      desgloseMensajeria += `\n${indent}  * ${nombreLimpio}: ${m.value}`;
    }
  }

  const spend: string = i.spend ? parseFloat(i.spend).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '0.00';
  const cpm: string = i.cpm ? parseFloat(i.cpm).toFixed(2) : '0.00';
  const cpc: string = i.cpc ? parseFloat(i.cpc).toFixed(2) : '0.00';
  const ctr: string = i.ctr ? parseFloat(i.ctr).toFixed(2) : '0.00';

  const roas: string = i.purchase_roas?.[0]?.value ?? 'N/A';

  return (
    `${indent}Campaña: ${i.campaign_name ?? 'N/A'}\n` +
    `${indent}  Impresiones : ${parseInt(i.impressions ?? '0', 10).toLocaleString('es-MX')}\n` +
    `${indent}  Clics       : ${parseInt(i.clicks ?? '0', 10).toLocaleString('es-MX')}\n` +
    `${indent}  CTR         : ${ctr}%\n` +
    `${indent}  Gasto       : $${spend}\n` +
    `${indent}  CPM         : $${cpm}\n` +
    `${indent}  CPC         : $${cpc}\n` +
    `${indent}  ${labelConv}: ${valorConv}\n` +
    `${indent}  CPA (${labelConv}): ${cpa}\n` +
    `${indent}  ROAS        : ${roas}` +
    desgloseMensajeria + `\n`
  );
}

server.registerTool(
  'reporte_rendimiento',
  {
    description: 'Obtener métricas clave (KPIs) por campaña para un rango de fechas. Métricas: impresiones, clics, CTR, gasto, CPM, CPC, conversiones, conversaciones, CPA, ROAS.',
    inputSchema: {
      account_input: z.string().describe('ID o nombre de la cuenta publicitaria'),
      fecha_inicio: z.string().optional().describe('Opcional. Formato YYYY-MM-DD. Por defecto: hace 30 días'),
      fecha_fin: z.string().optional().describe('Opcional. Formato YYYY-MM-DD. Por defecto: hoy'),
      limite: z.number().int().default(25).describe('Campañas por página'),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, fecha_inicio, fecha_fin, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const hoy = new Date();
      const dias = new Date();
      dias.setDate(hoy.getDate() - 30);

      const fFin = fecha_fin ?? hoy.toISOString().split('T')[0];
      const fInicio = fecha_inicio ?? dias.toISOString().split('T')[0];

      const accountId = await resolveAccount(account_input);
      initApi();
      const sdkParams: Record<string, any> = {
        time_range: JSON.stringify({ since: fInicio, until: fFin }),
        level: 'campaign',
        limit: limite,
      };
      if (pagina_cursor) sdkParams.after = pagina_cursor; 
      const cursor = await new FBAdAccount(accountId).getInsights(
        ['campaign_name', 'impressions', 'clicks', 'ctr', 'spend', 'cpm', 'cpc', 'actions', 'cost_per_action_type', 'purchase_roas'],
        sdkParams,
      );

      const insights = cursorToArray(cursor);

      if (!insights?.length)
        return { content: [{ type: 'text', text: `No hay datos de rendimiento para el período ${fecha_inicio} → ${fecha_fin}` }] };
      const lineas = [`Reporte de rendimiento: ${fecha_inicio} → ${fecha_fin} (${insights.length} campañas)\n`];
      for (const i of insights) lineas.push(formatInsightRow(i));
      const nc = nextCursor(cursor);
      if (nc) lineas.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: lineas.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al obtener reporte de rendimiento: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'reporte_rendimiento_todas',
  {
    description: 'Obtener métricas clave (KPIs) de todas las cuentas accesibles para un rango de fechas.',
    inputSchema: {
      fecha_inicio: z.string().optional().describe('Formato YYYY-MM-DD'),
      fecha_fin: z.string().optional().describe('Formato YYYY-MM-DD'),
      limite_por_cuenta: z.number().int().default(20),
    },
  },
  async ({ fecha_inicio, fecha_fin, limite_por_cuenta }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      initApi();
      const cuentasCursor = await new User('me').getAdAccounts(['id', 'name'], { limit: 200 });
      const cuentas = cursorToArray(cuentasCursor);
      if (!cuentas?.length)
        return { content: [{ type: 'text', text: 'No se encontraron cuentas publicitarias asociadas al token.' }] };
      const lineas = [`Reporte de rendimiento: ${fecha_inicio} → ${fecha_fin}\n`];
      for (const cuenta of cuentas) {
        lineas.push(`\n== Cuenta: ${cuenta.name ?? cuenta.id} (${cuenta.id}) ==`);
        try {
          const insightCursor = await new FBAdAccount(cuenta.id).getInsights(
            ['campaign_name', 'impressions', 'clicks', 'ctr', 'spend', 'cpm', 'cpc', 'actions', 'cost_per_action_type', 'purchase_roas'],
            {
              time_range: JSON.stringify({ since: fecha_inicio, until: fecha_fin }),
              level: 'campaign',
              limit: limite_por_cuenta,
            },
          );
          const insights = cursorToArray(insightCursor);
          if (!insights?.length) { lineas.push('  Sin datos para este período.'); continue; }
          for (const i of insights) lineas.push(formatInsightRow(i, '  '));
          if (nextCursor(insightCursor)) lineas.push('  📄 Hay más campañas en esta cuenta (usa reporte_rendimiento con pagina_cursor)');
        } catch { lineas.push('  Error al consultar esta cuenta.'); }
      }
      return { content: [{ type: 'text', text: lineas.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al obtener reporte de rendimiento: ${e.message}` }] };
    }
  },
);

server.registerTool(
  'reporte_rendimiento_desglosado',
  {
    description: "Desglosa resultados por segmento. Parámetros: account_input, fecha_inicio, fecha_fin, desglose ('age', 'gender' o 'publisher_platform'), limite (default 30), pagina_cursor.",
    inputSchema: {
      account_input: z.string(),
      fecha_inicio: z.string().describe('Formato YYYY-MM-DD'),
      fecha_fin: z.string().describe('Formato YYYY-MM-DD'),
      desglose: z.string().describe("'age', 'gender' o 'publisher_platform'"),
      limite: z.number().int().default(30),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, fecha_inicio, fecha_fin, desglose, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    const des = desglose.trim().toLowerCase();
    const titulos: Record<string, string> = { age: 'Edades', gender: 'Géneros', publisher_platform: 'Plataformas (FB/IG)' };
    const titulo = titulos[des] ?? des.toUpperCase();
    try {
      const accountId = await resolveAccount(account_input);
      initApi();
      const sdkParams: Record<string, any> = {
        time_range: JSON.stringify({ since: fecha_inicio, until: fecha_fin }),
        level: 'campaign',
        breakdowns: des,
        limit: limite,
      };
      if (pagina_cursor) sdkParams.after = pagina_cursor;
      const cursor = await new FBAdAccount(accountId).getInsights(
        ['campaign_name', 'impressions', 'clicks', 'ctr', 'spend'],
        sdkParams,
      );
      const insights = cursorToArray(cursor);
      if (!insights?.length)
        return { content: [{ type: 'text', text: `No hay datos para desglosar en el período ${fecha_inicio} → ${fecha_fin}.` }] };
      const traducciones: Record<string, string> = {
        instagram: 'Instagram',
        facebook: 'Facebook',
        messenger: 'Messenger',
        audience_network: 'Sitios web aliados',
      };
      const lineas = [`Análisis de Rendimiento por ${titulo} (${fecha_inicio} → ${fecha_fin}) — ${insights.length} filas\n`];
      for (const i of insights) {
        const segmento = traducciones[i[des] ?? ''] ?? i[des] ?? 'Desconocido';
        lineas.push(
          `  ${i.campaign_name} — ${segmento}\n` +
          `    Gasto: $${parseFloat(i.spend ?? '0').toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Clics: ${i.clicks ?? 0} | CTR: ${parseFloat(i.ctr ?? '0').toFixed(2)}%\n`,
        );
      }
      const nc = nextCursor(cursor);
      if (nc) lineas.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: lineas.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `No se pudo construir el reporte desglosado: ${e.message}` }] };
    }
  },
);

// ─── CREATIVOS ────────────────────────────────────────────────────────────────

server.registerTool(
  'obtener_creativos_anuncio',
  {
    description: 'Audita los textos y contenidos de los creativos de la cuenta. Parámetros: account_input, limite (default 15), pagina_cursor.',
    inputSchema: {
      account_input: z.string(),
      limite: z.number().int().default(15),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const accountId = await resolveAccount(account_input);
      initApi();
      const sdkParams: Record<string, any> = { limit: limite };
      if (pagina_cursor) sdkParams.after = pagina_cursor;
      const cursor = await new FBAdAccount(accountId).getAdCreatives(
        ['id', 'name', 'title', 'body'],
        sdkParams,
      );
      const creativos = cursorToArray(cursor);
      if (!creativos?.length)
        return { content: [{ type: 'text', text: 'No se encontraron creativos registrados en esta cuenta.' }] };
      const lineas = [`Creativos de anuncios (${creativos.length} mostrados):\n`];
      for (const c of creativos) {
        lineas.push(
          `  Anuncio: ${c.name ?? 'Sin nombre'} (ID: ${c.id})\n` +
          `    Título: ${c.title ?? 'Sin título'}\n` +
          `    Texto:  ${c.body ?? 'Sin texto'}\n`,
        );
      }
      const nc = nextCursor(cursor);
      if (nc) lineas.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: lineas.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al leer los creativos: ${e.message}` }] };
    }
  },
);

// ─── MONITOREO ────────────────────────────────────────────────────────────────

server.registerTool(
  'detectar_fugas_dinero',
  {
    description: 'Analiza la cuenta en busca de campañas que gastan sin resultados: sin conversiones, CTR bajo, CPA elevado, sin entregas.',
    inputSchema: {
      account_input: z.string(),
      fecha_inicio: z.string().describe('Formato YYYY-MM-DD'),
      fecha_fin: z.string().describe('Formato YYYY-MM-DD'),
      limite: z.number().int().default(30),
      pagina_cursor: z.string().default(''),
    },
  },
  async ({ account_input, fecha_inicio, fecha_fin, limite, pagina_cursor }) => {
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
        ['campaign_name', 'campaign_id', 'impressions', 'clicks', 'ctr', 'spend', 'actions', 'cost_per_action_type'],
        sdkParams,
      );
      const insights = cursorToArray(cursor);
      const alertas: string[] = [];
      for (const i of insights) {
        const gasto = parseFloat(i.spend ?? '0');
        const impresiones = parseInt(i.impressions ?? '0');
        const ctr = parseFloat(i.ctr ?? '0');
        const conversiones = parseInt(
          (i.actions ?? []).find((a: any) => a.action_type === 'purchase')?.value ?? '0',
        );
        const cpaVal = parseFloat(
          (i.cost_per_action_type ?? []).find((a: any) => a.action_type === 'purchase')?.value ?? '0',
        ) || null;
        const problemas: string[] = [];
        if (gasto > 0 && conversiones === 0)
          problemas.push(`Gasto $${gasto.toFixed(2)} sin ninguna conversión`);
        if (impresiones > 1000 && ctr < 0.5)
          problemas.push(`CTR muy bajo (${ctr.toFixed(2)}%) con ${impresiones} impresiones`);
        if (cpaVal && cpaVal > 100)
          problemas.push(`CPA elevado: $${cpaVal.toFixed(2)} por conversión`);
        if (impresiones === 0 && gasto === 0)
          problemas.push('Sin entregas ni gasto — posible error de configuración o audiencia');
        if (problemas.length)
          alertas.push(`⚠ Campaña: ${i.campaign_name}\n` + problemas.map((p) => `  - ${p}`).join('\n'));
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

// ─── Inicio ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Error fatal: ${err}\n`);
  process.exit(1);
});
