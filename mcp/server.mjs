import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './tools.mjs';

// Independent of Codex's working directory; secrets stay in an ignored local file.
const envPath = fileURLToPath(new URL('./.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
try {
  const server = createServer({ baseUrl: process.env.HOSHIMI_SITE_URL ?? 'http://127.0.0.1:5174', token: process.env.CODEX_API_TOKEN });
  await server.connect(new StdioServerTransport());
} catch {
  console.error('Hoshimi MCP failed to start. Set HOSHIMI_SITE_URL and CODEX_API_TOKEN in mcp/.env or the process environment. Install dependencies with npm install --prefix mcp.');
  process.exitCode = 1;
}
