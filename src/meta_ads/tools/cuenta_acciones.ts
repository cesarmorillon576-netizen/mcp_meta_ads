import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { credencialesOk, errorCredenciales, errorMeta, initApi, resolveAccount } from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdAccount: FBAdAccount } = bizSdk;

export function registrarHerramientasCuentaAcciones(server: McpServer) {

  server.registerTool(
    'modificar_tope_gasto_cuenta',
    {
      description: 'Fija o quita el tope de gasto total (spend cap) de la cuenta publicitaria. Es un límite de seguridad acumulado: al alcanzarlo Meta deja de entregar todo. Ojo: cuenta el gasto histórico de la cuenta, no solo el de hoy.',
      inputSchema: {
        account_input: z.string().describe('ID o nombre de la cuenta publicitaria'),
        monto: z.number().optional().describe('Tope en moneda de la cuenta (ej 50000 = $50,000). Omitir si quitar=true.'),
        quitar: z.boolean().default(false).describe('Si true, elimina el tope (gasto ilimitado).'),
      },
    },
    async ({ account_input, monto, quitar }) => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      if (!quitar && (monto == null || monto <= 0))
        return { content: [{ type: 'text', text: "Error: indica 'monto' mayor a 0, o usa quitar=true." }] };
      try {
        initApi();
        const accountId = await resolveAccount(account_input);
        const centavos = quitar ? 0 : Math.round((monto as number) * 100);
        await new FBAdAccount(accountId).update([], { spend_cap: centavos });
        return { content: [{ type: 'text', text: quitar
          ? `🟢 Tope de gasto de la cuenta ${accountId} eliminado (sin límite).`
          : `🛑 Tope de gasto de la cuenta ${accountId} fijado en $${(monto as number).toLocaleString('es-MX', { minimumFractionDigits: 2 })}.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: errorMeta('Error al modificar el tope de gasto', e) }] };
      }
    },
  );
}
