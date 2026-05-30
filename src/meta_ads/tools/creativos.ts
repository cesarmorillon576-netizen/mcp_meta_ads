import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  credencialesOk,
  errorCredenciales,
  initApi,
  resolveAccount,
  cursorToArray,
  nextCursor,
  formatCreativo,
} from '../helpers.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bizSdk = require('facebook-nodejs-business-sdk');
const { AdAccount: FBAdAccount } = bizSdk;

const CREATIVE_FIELDS = [
  'id', 'name', 'title', 'body', 'call_to_action_type',
  'object_type', 'thumbnail_url', 'instagram_permalink_url',
];

export function registrarHerramientasCreativos(server: McpServer) {
  server.registerTool(
    'obtener_creativos_anuncio',
    {
      description: 'Audita los creativos de una cuenta: texto del anuncio, llamada a la acción (CTA), tipo de medio (foto/video) y enlaces.',
      inputSchema: {
        account_input: z.string().describe('ID o nombre de la cuenta publicitaria'),
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
        const cursor = await new FBAdAccount(accountId).getAdCreatives(CREATIVE_FIELDS, sdkParams);
        const creativos = cursorToArray(cursor);
        if (!creativos?.length)
          return { content: [{ type: 'text', text: `No se encontraron creativos en la cuenta '${account_input}'.` }] };
        const lineas = [`Creativos de anuncios en '${account_input}' (${creativos.length} mostrados):`];
        for (const c of creativos) {
          lineas.push(`\n• Creativo ID: ${c.id}`);
          lineas.push(...formatCreativo(c, '  ', true));
        }
        const nc = nextCursor(cursor);
        if (nc) lineas.push(`\n📄 Siguiente página → pagina_cursor='${nc}'`);
        return { content: [{ type: 'text', text: lineas.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error al leer los creativos: ${e.message}` }] };
      }
    },
  );
}
