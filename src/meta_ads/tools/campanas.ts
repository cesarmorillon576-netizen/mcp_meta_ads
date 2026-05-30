import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  credencialesOk,
  errorCredenciales,
  initApi,
  resolveAccount,
  cursorToArray,
  nextCursor,
  presupuestoStr,
  traducirEstado,
  procesarIssues
} from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdAccount: FBAdAccount, User } = bizSdk;

export function registrarHerramientasCampanas(server: McpServer) {
  server.registerTool(
    'obtener_campanas',
    {
      description: 'Obtener campañas de una cuenta publicitaria con estado y presupuesto.',
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
          ['id', 'name', 'status', 'effective_status', 'daily_budget', 'lifetime_budget', 'start_time', 'stop_time', 'objective', 'bid_strategy', 'issues_info'],
          sdkParams,
        );
        const campanas = cursorToArray(cursor);
        if (!campanas?.length)
          return { content: [{ type: 'text', text: `No se encontraron campañas para la cuenta '${account_input}'.` }] };
        const resultados = [`Campañas en '${account_input}' (${campanas.length} mostradas):\n`];
        
        for (const c of campanas) {
          const presupuesto = presupuestoStr(c.daily_budget, c.lifetime_budget);
          const estado = traducirEstado(c.effective_status ?? c.status ?? '');
          const bidStrategy = c.bid_strategy ?? 'no especificada (a nivel conjunto)';
          const infoErrores = (c.effective_status === 'WITH_ISSUES' || c.effective_status === 'DISAPPROVED') 
          ? procesarIssues(c.issues_info) : ''; 
          resultados.push(
            `- ${c.name} (ID: ${c.id})\n` +
            `  Estado: ${estado}${infoErrores}\n` +
            `  Presupuesto: ${presupuesto} | Puja: ${bidStrategy}\n` +
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
      description: 'Obtener campañas ACTIVE de una cuenta publicitaria.',
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
          ['id', 'name', 'status', 'daily_budget', 'lifetime_budget', 'objective'],
          sdkParams,
        );
        const campanas = cursorToArray(cursor);
        if (!campanas?.length)
          return { content: [{ type: 'text', text: `No hay campañas activas en la cuenta '${account_input}'.` }] };
        const resultados = [`Campañas activas (${campanas.length} mostradas):\n`];
        for (const c of campanas) {
          const pStr = presupuestoStr(c.daily_budget, c.lifetime_budget);
          resultados.push(`- ${c.name} (ID: ${c.id}) | Objetivo: ${c.objective ?? 'N/A'} | Inversión: ${pStr === 'no definido' ? 'a nivel conjunto' : pStr}`);
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
      description: 'Obtener campañas activas de todas las cuentas accesibles.',
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
              ['id', 'name', 'daily_budget', 'lifetime_budget', 'objective'],
              { effective_status: JSON.stringify(['ACTIVE']), limit: limite_por_cuenta },
            );
            const campanas = cursorToArray(campCursor);
            if (campanas?.length) {
              const hayMas = nextCursor(campCursor) ? ' (y más...)' : '';
              resultados.push(`\nCuenta: ${cuenta.name ?? cuenta.id} (${cuenta.id}) — ${campanas.length} activa(s)${hayMas}:`);
              for (const c of campanas) {
                const presupuesto = presupuestoStr(c.daily_budget, c.lifetime_budget);
                resultados.push(`  - ${c.name} | Objetivo: ${c.objective ?? 'N/A'} | Presupuesto: ${presupuesto === 'no definido' ? 'a nivel conjunto' : presupuesto}`);
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
}
