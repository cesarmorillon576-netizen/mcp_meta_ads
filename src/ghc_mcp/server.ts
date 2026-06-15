import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sanitizarTexto } from '../meta_ads/helpers.js';
import { registrarHerramientasContactos } from './tools/contactos.js';
import { registrarHerramientasConversaciones } from './tools/conversaciones.js';
import { registrarHerramientasOportunidades } from './tools/oportunidades.js';
import { registrarHerramientasCalendario } from './tools/calendario.js';

function conSanitizacion(server: McpServer): McpServer {
  const registrarOriginal = (server.registerTool as any).bind(server);
  (server as any).registerTool = (nombre: string, config: any, handler: any) =>
    registrarOriginal(nombre, config, async (...args: any[]) => {
      const res = await handler(...args);
      if (res && Array.isArray(res.content)) {
        for (const item of res.content) {
          if (item?.type === 'text' && typeof item.text === 'string') {
            item.text = sanitizarTexto(item.text);
          }
        }
      }
      return res;
    });
  return server;
}

export function registrarHerramientasGHL(servidor: McpServer): void {
  const server = conSanitizacion(servidor);
  registrarHerramientasContactos(server);
  registrarHerramientasConversaciones(server);
  registrarHerramientasOportunidades(server);
  registrarHerramientasCalendario(server);
}
