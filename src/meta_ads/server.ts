import { setToken } from './helper';
import { getServer } from './builders';
import { ToolRegister } from './tools/anuncio_tool';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface Env {
  META_ACCESS_TOKEN: string;
}



export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    setToken(env.META_ACCESS_TOKEN);

    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    };
    const server = new McpServer({ name: 'MetaAds', version: '2.0.0' });
    ToolRegister(server);

    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'POST') return new Response('Meta Ads MCP running', { status: 200 });

    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
    }

    if (body?.method?.startsWith('notifications/')) {
      return new Response(JSON.stringify({ jsonrpc: '2.0' }), { headers });
    }


    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(new Response(JSON.stringify({ error: 'timeout' }), { status: 504, headers }));
      }, 55000);

      const transport = {
        onmessage: null as any,
        send(msg: any) {
          clearTimeout(timeout);
          resolve(new Response(JSON.stringify(msg), { headers }));
        },
        close() {},
        start() {},
      };

      server.connect(transport as any)
        .then(() => transport.onmessage?.(body))
        .catch((err: any) => {
          clearTimeout(timeout);
          console.log('fallo en la conexion_', err.message);
          resolve(new Response(JSON.stringify({ error: err.message }), { status: 500, headers }));
        });
    });
  },
};