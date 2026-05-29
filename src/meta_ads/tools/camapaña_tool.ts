import { getApiClient, getServer } from "../builders";
import { getToken } from "../helper";
import {API_BASE} from "../builders";
import { credencialesOk } from "../helper";
import {errorCredenciales} from "../helper";
import { z } from 'zod';
import { resolveAccount,metaGet,metaPost,nextCursor,presupuestoStr,traducirEstado } from "./anuncio_tool";

getServer().registerTool(
    'obtener_informacion_general_campana',
    {
        description:'obtiene informacion como id,nombre,effective_status, */utilizar esta tool cuando se quiera iniciar con la investigacion inicial de una camapaña, el estado actual',
        inputSchema:{
            campaign_id:z.string()
        }
    },
    async ({campaign_id})=>{
        const params: Record<string,string> = {
            fields:'id,name,effective_status'
        }
        const data = await  getApiClient().fetchData(`${campaign_id}`,params)
        const json = await data.json();
        return {content:[{type:'text',text:JSON.stringify(json)}]}
    }
)


getServer().registerTool(
  'obtener_campanas',
  {
    description: 'Obtener campañas de una cuenta publicitaria con estado y presupuesto. Parámetros: account_input (ID o nombre), limite (default 20), pagina_cursor (cursor de página anterior).',
    inputSchema: {
      account_input: z.string().describe('ID numérico, act_XXX o nombre de la cuenta publicitaria'),
      limite: z.number().int().default(100).describe('Campañas por página'),
      pagina_cursor: z.string().default('').describe('Cursor devuelto en respuesta anterior para ver siguiente página'),
    },
  },
  async ({ account_input, limite, pagina_cursor }) => {
    if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
    try {
      const accountId = await resolveAccount(account_input);
      const params: Record<string, unknown> = {
        fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,objective',
        limit: limite,
      };
      if (pagina_cursor) params['after'] = pagina_cursor;
      const data = await metaGet(`/${accountId}/campaigns`, params);
      const campanas = data.data as any[];
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
      const nc = nextCursor(data);
      if (nc) resultados.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: resultados.join('\n\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar la API de Meta: ${e.message}` }] };
    }
  },
);

getServer().registerTool(
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
      const params: Record<string, unknown> = {
        fields: 'id,name,status,daily_budget,objective',
        effective_status: JSON.stringify(['ACTIVE']),
        limit: limite,
      };
      if (pagina_cursor) params['after'] = pagina_cursor;
      const data = await metaGet(`/${accountId}/campaigns`, params);
      const campanas = data.data as any[];
      if (!campanas?.length)
        return { content: [{ type: 'text', text: `No hay campañas activas en la cuenta '${account_input}'.` }] };
      const resultados = [`Campañas activas (${campanas.length} mostradas):\n`];
      for (const c of campanas) {
        const pStr = c.daily_budget
          ? `$${(parseInt(c.daily_budget) / 100).toFixed(2)}/día`
          : 'presupuesto variable';
        resultados.push(`- ${c.name} (ID: ${c.id}) | Objetivo: ${c.objective ?? 'N/A'} | Inversión: ${pStr}`);
      }
      const nc = nextCursor(data);
      if (nc) resultados.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
      return { content: [{ type: 'text', text: resultados.join('\n') }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error al consultar campañas activas: ${e.message}` }] };
    }
  },
);

getServer().registerTool(
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
      const cuentasData = await metaGet('/me/adaccounts', { fields: 'id,name' });
      const cuentas = cuentasData.data as Array<{ id: string; name?: string }>;
      if (!cuentas?.length)
        return { content: [{ type: 'text', text: 'No se encontraron cuentas publicitarias asociadas al token.' }] };
      const resultados: string[] = [];
      let total = 0;
      for (const cuenta of cuentas) {
        try {
          const data = await metaGet(`/${cuenta.id}/campaigns`, {
            fields: 'id,name,daily_budget,objective',
            effective_status: JSON.stringify(['ACTIVE']),
            limit: limite_por_cuenta,
          });
          const campanas = data.data as any[];
          if (campanas?.length) {
            const hayMas = nextCursor(data) ? ' (y más...)' : '';
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