import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, errorMeta, initApi, resolveAccount, cursorToArray } from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdAccount: FBAdAccount, AdRule } = bizSdk;

const ENTIDAD: Record<string, string> = { campana: 'CAMPAIGN', campaign: 'CAMPAIGN', conjunto: 'ADSET', adset: 'ADSET', anuncio: 'AD', ad: 'AD' };

export function registrarHerramientasReglas(server: McpServer) {

  server.registerTool(
    'crear_regla_automatica',
    {
      description: "Crea una regla automatizada NATIVA de Meta: Meta la evalúa sola en su horario y ejecuta la acción (pausar o notificar) sin depender del orquestador. Ej: 'pausar conjuntos cuyo costo por resultado en 3 días supere $200'. IMPORTANTE: para métricas de dinero (spent, cost_per_result, cpc, cpm) el 'valor' va en CENTAVOS (20000 = $200).",
      inputSchema: {
        account_input: z.string().describe('ID o nombre de la cuenta publicitaria'),
        nombre: z.string().describe('Nombre de la regla'),
        ambito: z.string().describe("Sobre qué actúa: 'campana', 'conjunto' o 'anuncio'"),
        metrica: z.string().describe("Campo de Meta a evaluar. Comunes: 'spent', 'cost_per_result', 'cpc', 'cpm', 'frequency', 'cpm', 'clicks', 'impressions', 'results'"),
        operador: z.string().default('GREATER_THAN').describe("'GREATER_THAN' o 'LESS_THAN'"),
        valor: z.number().describe('Umbral. Métricas de dinero en CENTAVOS (20000 = $200).'),
        ventana: z.string().default('LAST_3_DAYS').describe("Ventana de datos: 'TODAY', 'YESTERDAY', 'LAST_3_DAYS', 'LAST_7_DAYS', 'LAST_14_DAYS', 'LAST_30_DAYS', 'LIFETIME'"),
        accion: z.string().default('pausar').describe("'pausar' (apaga el objeto) o 'notificar' (solo avisa)"),
        frecuencia: z.string().default('DAILY').describe("Cada cuánto evalúa Meta: 'DAILY' o 'SEMI_HOURLY' (cada 30 min)"),
      },
    },
    async ({ account_input, nombre, ambito, metrica, operador, valor, ventana, accion, frecuencia }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const entidad = ENTIDAD[ambito.trim().toLowerCase()];
      if (!entidad) return { content: [{ type: 'text', text: "Error: 'ambito' debe ser 'campana', 'conjunto' o 'anuncio'." }] };
      const op = operador.trim().toUpperCase();
      if (op !== 'GREATER_THAN' && op !== 'LESS_THAN')
        return { content: [{ type: 'text', text: "Error: 'operador' debe ser 'GREATER_THAN' o 'LESS_THAN'." }] };
      const acc = accion.trim().toLowerCase();
      if (acc !== 'pausar' && acc !== 'notificar')
        return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'pausar' o 'notificar'." }] };
      try {
        initApi();
        const accountId = await resolveAccount(account_input);
        const evaluation_spec = {
          evaluation_type: 'SCHEDULE',
          filters: [
            { field: 'entity_type', value: entidad, operator: 'EQUAL' },
            { field: 'time_preset', value: ventana.trim().toUpperCase(), operator: 'EQUAL' },
            { field: metrica.trim(), value: valor, operator: op },
          ],
        };
        const execution_spec = { execution_type: acc === 'pausar' ? 'PAUSE' : 'NOTIFICATION' };
        const schedule_spec = { schedule_type: frecuencia.trim().toUpperCase() };
        const regla = await new FBAdAccount(accountId).createAdRulesLibrary([], { name: nombre, evaluation_spec, execution_spec, schedule_spec });
        return { content: [{ type: 'text', text: `🤖 Regla "${nombre}" creada (ID: ${(regla as any).id}).\n- Si ${entidad} tiene ${metrica} ${op === 'GREATER_THAN' ? '>' : '<'} ${valor} en ${ventana}\n- Acción: ${acc === 'pausar' ? 'PAUSAR' : 'NOTIFICAR'} | Evalúa: ${frecuencia}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al crear la regla automática', e) }] };
      }
    },
  );

  server.registerTool(
    'listar_reglas',
    {
      description: 'Lista las reglas automatizadas nativas de Meta configuradas en una cuenta, con su estado.',
      inputSchema: {
        account_input: z.string().describe('ID o nombre de la cuenta publicitaria'),
      },
    },
    async ({ account_input }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        initApi();
        const accountId = await resolveAccount(account_input);
        const cursor = await new FBAdAccount(accountId).getAdRulesLibrary(['id', 'name', 'status'], { limit: 100 });
        const reglas = cursorToArray(cursor);
        if (!reglas.length) return { content: [{ type: 'text', text: `No hay reglas automatizadas en la cuenta ${accountId}.` }] };
        const lineas = reglas.map((r: any) => `- ${r.name} (ID: ${r.id}) — ${r.status}`);
        return { content: [{ type: 'text', text: `🤖 Reglas automatizadas (${reglas.length}):\n${lineas.join('\n')}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al listar reglas', e) }] };
      }
    },
  );

  server.registerTool(
    'cambiar_estado_regla',
    {
      description: 'Activa, desactiva o elimina una regla automatizada de Meta por su ID.',
      inputSchema: {
        regla_id: z.string().describe('ID de la regla (de listar_reglas)'),
        accion: z.string().describe("'activar', 'desactivar' o 'eliminar'"),
      },
    },
    async ({ regla_id, accion }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      const acc = accion.trim().toLowerCase();
      try {
        initApi();
        if (acc === 'eliminar') {
          await new AdRule(regla_id).delete([]);
          return { content: [{ type: 'text', text: `🗑️ Regla ${regla_id} eliminada.` }] };
        }
        if (acc === 'activar' || acc === 'desactivar') {
          await new AdRule(regla_id).update([], { status: acc === 'activar' ? 'ENABLED' : 'DISABLED' });
          return { content: [{ type: 'text', text: `🤖 Regla ${regla_id} ${acc === 'activar' ? 'activada' : 'desactivada'}.` }] };
        }
        return { content: [{ type: 'text', text: "Error: 'accion' debe ser 'activar', 'desactivar' o 'eliminar'." }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al cambiar el estado de la regla', e) }] };
      }
    },
  );
}
