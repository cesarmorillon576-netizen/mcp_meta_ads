import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {cursorToArray, initApi, errorCredenciales, credencialesOk} from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { User } = bizSdk;

export function registrarHerramientasCuentas(server: McpServer) {
  server.registerTool(
    'listar_cuentas_publicitarias',
    { description: 'Listar todas las cuentas de anuncios disponibles con sus nombres e IDs.' },
    async () => {
      if (!credencialesOk()) return { content: [{ type: 'text', text: errorCredenciales() }] };
      try {
        initApi();
        const cursor = await new User('me').getAdAccounts(['id', 'name'], { limit: 200 });
        const cuentas = cursorToArray(cursor);
        if (!cuentas?.length) {
          return { content: [{ type: 'text', text: 'No se encontraron cuentas publicitarias vinculadas a este perfil.' }] };
        }
        const lineas = ['Cuentas Publicitarias Disponibles:\n'];
        for (const c of cuentas) {
          lineas.push(`  • ${c.name ?? 'Sin Nombre'} | ID: ${c.id}`);
        }
        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `No se pudieron listar las cuentas. Detalle: ${e.message}` }] };
      }
    },
  );
}