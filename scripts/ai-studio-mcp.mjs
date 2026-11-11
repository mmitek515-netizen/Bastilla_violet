/**
 * Dedicated Google AI Studio / Cloud Run entrypoint for Bastilla OS MCP.
 * Exposes only the authenticated, read-only MCP bridge and its health check.
 * Does NOT start server.ts or expose its privileged API routes.
 *
 * Configure SVL_MCP_TOKEN as a server-side secret with >=32 chars.
 * Start using: npm run mcp:ai-studio
 */
import { pathToFileURL } from 'node:url';
import { createMcpServer } from './mcp-bridge.mjs';

export function createAiStudioGateway({ token, appPort = 3000, allowedOrigins = [] }) {
  // createMcpServer rejects absent/short tokens: fail closed.
  return createMcpServer({ token, appPort, allowedOrigins });
}

export function startAiStudioGateway({
  token = process.env.SVL_MCP_TOKEN,
  port = Number(process.env.PORT || 8080),
  appPort = Number(process.env.SVL_APP_PORT || 3000),
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const allowedOrigins = (process.env.SVL_MCP_ALLOWED_ORIGINS || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  const server = createAiStudioGateway({ token, appPort, allowedOrigins });
  server.listen(port, '0.0.0.0', () => {
    console.log('[BASTILLA MCP] Secure, read-only gateway listening on PORT=' + port);
    console.log('[BASTILLA MCP] POST /mcp, GET /healthz; privileged SVL API not exposed.');
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startAiStudioGateway();
}
