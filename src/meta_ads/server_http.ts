import * as dotenv from 'dotenv';
import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { registrarTodasLasHerramientas } from './index.js';
import { registrarHerramientasGoogle } from '../google_ads/server.js';
import { findEnvPath } from './helpers.js';

dotenv.config({ path: findEnvPath() });

function crearServidorMeta(): McpServer {
  const server = new McpServer({ name: 'mcp-meta-ads', version: '1.0.0' });
  registrarTodasLasHerramientas(server);
  return server;
}
// TODO: Esto es temporal pq no hay token de gugul
const MENSAJE_WIP = '🚧 El conector de Google Ads está en desarrollo (WIP). Todavía no está disponible; vuelve pronto.';

function crearServidorGoogle(): McpServer {
  const server = new McpServer({ name: 'mcp-google-ads', version: '1.0.0' });
  const registrar = (server.registerTool as any).bind(server);
  (server as any).registerTool = (nombre: string, config: any, _handler: any) =>
    registrar(nombre, config, async () => ({
      content: [{ type: 'text', text: MENSAJE_WIP }],
    }));
  registrarHerramientasGoogle(server);
  return server;
}

const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN ?? '';

function tokenValido(recibido: string): boolean {
  if (!AUTH_TOKEN || !recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(AUTH_TOKEN);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!AUTH_TOKEN) {
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32002, message: 'Servidor mal configurado: falta MCP_AUTH_TOKEN' },
      id: null,
    });
    return;
  }
  const header = req.headers['authorization'];
  const desdeHeader = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
  const desdeQuery = typeof req.query.token === 'string' ? req.query.token : '';
  if (tokenValido(desdeHeader) || tokenValido(desdeQuery)) {
    next();
    return;
  }
  res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'No autorizado' },
    id: null,
  });
}

const app = express();
app.use(express.json());

function montarMcp(ruta: string, crearServidor: () => McpServer): void {
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.post(ruta, requireAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) delete transports[transport.sessionId];
      };

      const server = crearServidor();
      await server.connect(transport);
    } else if (sessionId) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Sesion no encontrada o expirada' },
        id: req.body?.id ?? null,
      });
      return;
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: no se proporciono un session ID valido' },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  const handleSessionRequest = async (req: express.Request, res: express.Response): Promise<void> => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(404).send('Sesion no encontrada o expirada');
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  };

  app.get(ruta, requireAuth, handleSessionRequest);
  app.delete(ruta, requireAuth, handleSessionRequest);
}

montarMcp('/mcp', crearServidorMeta);
montarMcp('/gads/mcp', crearServidorGoogle);

app.get('/', (_req, res) => {
  res.status(200).send('MCP activo  ->  POST /mcp (Meta) | POST /gads/mcp (Google)');
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  process.stderr.write(`MCP (HTTP) escuchando en :${PORT}  ->  POST /mcp (Meta)  |  POST /gads/mcp (Google)\n`);
});
