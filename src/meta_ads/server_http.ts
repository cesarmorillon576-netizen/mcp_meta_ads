import * as dotenv from 'dotenv';
import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { registrarTodasLasHerramientas } from './index.js';
import { findEnvPath } from './helpers.js';

// En local carga el .env; en Railway/servidor las variables vienen inyectadas
// por la plataforma y dotenv simplemente no encuentra archivo (no pasa nada).
dotenv.config({ path: findEnvPath() });

// Fabrica un McpServer nuevo con TODAS las tools ya registradas.
// Se crea uno por sesion para que cada cliente tenga el suyo.
function crearServidor(): McpServer {
  const server = new McpServer({ name: 'mcp-meta-ads', version: '1.0.0' });
  registrarTodasLasHerramientas(server);
  return server;
}

// ─── Seguridad: secreto compartido ─────────────────────────────────────────
// Contraseña de la puerta del servidor. DISTINTA del META_ACCESS_TOKEN:
//   META_ACCESS_TOKEN -> el server habla con Meta
//   MCP_AUTH_TOKEN    -> los clientes (Claude) hablan con el server
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN ?? '';

// Comparacion en tiempo constante (evita ataques de timing).
function tokenValido(recibido: string): boolean {
  if (!AUTH_TOKEN || !recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(AUTH_TOKEN);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Middleware: exige el secreto via header 'Authorization: Bearer <token>'
// o via query '?token=<token>' (segun lo que permita el cliente).
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  // Fail-closed: sin secreto configurado, no se atiende a nadie.
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

// Sesiones vivas: sessionId -> transporte. Como el proceso persiste (a diferencia
// de Cloudflare Workers), la sesion se mantiene en memoria sin Durable Objects.
const transports: Record<string, StreamableHTTPServerTransport> = {};

// Peticion principal del cliente MCP (Claude) hacia el servidor.
app.post('/mcp', requireAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Sesion ya existente: reutilizamos su transporte.
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // Nueva sesion: solo se permite arrancar con un 'initialize'.
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
  } else {
    // Ni sesion valida ni initialize -> peticion invalida.
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: no se proporciono un session ID valido' },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// GET = canal SSE (mensajes servidor->cliente). DELETE = cierre de sesion.
async function handleSessionRequest(req: express.Request, res: express.Response): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Session ID invalido o ausente');
    return;
  }
  await transports[sessionId].handleRequest(req, res);
}

app.get('/mcp', requireAuth, handleSessionRequest);
app.delete('/mcp', requireAuth, handleSessionRequest);

// Healthcheck simple para la plataforma (Railway/Render).
app.get('/', (_req, res) => {
  res.status(200).send('MCP Meta Ads activo');
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  process.stderr.write(`MCP Meta Ads (HTTP) escuchando en :${PORT}  ->  POST /mcp\n`);
});
