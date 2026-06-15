import { config } from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registrarTodasLasHerramientas } from './index.js';
import { findEnvPath } from './helpers.js';

config({ path: findEnvPath() });


const server = new McpServer({
    name: "mcp-meta-ads",
    version: "1.0.0"
});

registrarTodasLasHerramientas(server);

async function main(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}



main().catch((err) => {
    process.stderr.write(`Error fatal: ${err}\n`);
    process.exit(1);
});