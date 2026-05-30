import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, initApi } from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { Campaign } = bizSdk;

export function registrarHerramientasGestion(server: McpServer) {

  server.registerTool(
    'cambiar_estado_campana',
    {
      description: "Encender o apagar una campaña.",
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
        return { content: [{ type: 'text', text: `Campaña ${campaign_id} ${acc === 'encender' ? 'activada' : 'pausada'} correctamente.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al cambiar estado de la campaña: ${e.message}` }] };
      }
    },
  );

  server.registerTool(
    'modificar_presupuesto_campana',
    {
      description: "Ajusta el presupuesto de una campaña (monto en unidades normales, se convierte a centavos internamente).",
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
        return { content: [{ type: 'text', text: `Presupuesto ${tipo} de la campaña ${campaign_id} actualizado a $${nuevo_presupuesto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `No se pudo actualizar el presupuesto: ${e.message}` }] };
      }
    },
  );
}
