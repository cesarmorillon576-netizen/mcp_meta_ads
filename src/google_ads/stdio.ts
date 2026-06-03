import path from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registrarHerramientasGoogle } from './server.js';

function findEnvPath(): string {
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

async function main(): Promise<void> {
  const server = new McpServer({ name: 'GoogleAds', version: '2.0.0' });
  registrarHerramientasGoogle(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Error fatal: ${err}\n`);
  process.exit(1);
});
