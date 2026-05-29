import path from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getServer } from './builders';
import './tools/anuncio_tool';
import './tools/camapaña_tool';
//import './tools/cuenta_tool';
import './tools/context_tool';
// Find .env: next to the running script (production/windows_build) or project root (dev)
function findEnvPath(): string {
  if ((process as any).pkg !== undefined) {
    return path.join(path.dirname(process.execPath), '.env');
  }
  const candidates = [
    path.dirname(path.resolve(process.argv[1] ?? '')),
    __dirname,
    path.resolve(__dirname, '..', '..'),
    process.cwd(),
  ];
  for (const dir of candidates) {
    try {
      const p = path.join(dir, '.env');
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return path.join(candidates[0] ?? process.cwd(), '.env');
}
dotenv.config({ path: findEnvPath() });

const API_BASE = 'https://graph.facebook.com/v25.0';

//const server = new McpServer({ name: 'MetaAds', version: '2.0.0' });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken(): string {
  return process.env.META_ACCESS_TOKEN ?? '';
}

function credencialesOk(): boolean {
  return getToken().length > 0;
}

function errorCredenciales(): string {
  return ' Error: No se encontraron las credenciales de Meta Ads en el archivo de configuración (.env).';
}


// ─── Inicio ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await getServer().connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Error fatal: ${err}\n`);
  process.exit(1);
});


/* */