import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sanitizarTexto } from './helpers.js';
import { registrarHerramientasCuentas } from './tools/cuentas.js';
import { registrarHerramientasCampanas } from './tools/campanas.js';
import { registrarHerramientasAnuncios } from './tools/anuncios.js';
import { registrarHerramientasConjuntos } from './tools/conjuntos.js';
import { registrarHerramientasGestion } from './tools/gestion.js';
import { registrarHerramientasReportesGenerales } from './tools/reportes_generales.js';
import { registrarHerramientasReportes } from './tools/reportes.js';
import { registrarHerramientasReporteCompleto } from './tools/reporte_completo.js';
import { registrarHerramientasCreativos } from './tools/creativos.js';

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

export function registrarTodasLasHerramientas(server: McpServer) {
  const s = conSanitizacion(server);
  registrarHerramientasCuentas(s);
  registrarHerramientasCampanas(s);
  registrarHerramientasAnuncios(s);
  registrarHerramientasConjuntos(s);
  registrarHerramientasGestion(s);
  registrarHerramientasReportesGenerales(s);
  registrarHerramientasReportes(s);
  registrarHerramientasReporteCompleto(s);
  registrarHerramientasCreativos(s);
}