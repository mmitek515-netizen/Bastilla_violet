/**
 * Serwer MCP (Model Context Protocol) dla konektora ChatGPT.
 * Transporty: Streamable HTTP (POST /mcp, preferowany) oraz legacy SSE (GET /sse + POST /messages).
 * Wyłącznie narzędzia READ-ONLY. Autoryzacja: Authorization: Bearer <MCP_AUTH_TOKEN>.
 * Uruchamianie: `npm run mcp` (osobny proces — nie dotyka server.ts na porcie 3000).
 */
import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  checkBearerAuth,
  createSvlApiClient,
  fetchSvlResource,
  getGithubAdminStatus,
  getSystemStatus,
  listApps,
  searchSvl,
  DEFAULT_SVL_API_BASE,
  MAX_QUERY_LENGTH,
  MAX_RESOURCE_ID_LENGTH,
} from './chatgptMcp.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ENV_FILE = path.join(REPO_ROOT, '.env');

const MCP_PORT = Number(process.env.MCP_PORT ?? 3100);
const SVL_API_BASE = process.env.SVL_API_BASE ?? DEFAULT_SVL_API_BASE;

function resolvePublicBase(): string | undefined {
  const explicit = process.env.SVL_PUBLIC_BASE;
  if (explicit) return explicit;
  const codespace = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (codespace && domain) return `https://${codespace}-3000.${domain}`;
  return undefined;
}

/** Token tylko w .env (git-ignorowany). Jeśli brak — generujemy i dopisujemy. */
function resolveAuthToken(): string {
  const fromEnv = process.env.MCP_AUTH_TOKEN?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  const generated = randomBytes(32).toString('hex');
  if (existsSync(ENV_FILE)) {
    appendFileSync(ENV_FILE, `\nMCP_AUTH_TOKEN=${generated}\n`, 'utf8');
    console.log('[MCP] Wygenerowano nowy MCP_AUTH_TOKEN i zapisano w .env (klucz: MCP_AUTH_TOKEN).');
  } else {
    appendFileSync(ENV_FILE, `MCP_AUTH_TOKEN=${generated}\n`, 'utf8');
    console.log('[MCP] Utworzono .env z MCP_AUTH_TOKEN.');
  }
  return generated;
}

const AUTH_TOKEN = resolveAuthToken();
const api = createSvlApiClient(SVL_API_BASE, undefined, resolvePublicBase());

function toolResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true };
}

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'svl-chatgpt-mcp', version: '1.0.0' });

  server.registerTool(
    'search',
    {
      title: 'Wyszukiwanie w systemie SVL',
      description:
        'Przeszukuje zasoby systemu SVL (aplikacje, statusy, logi infrastruktury). Zwraca listę wyników z polami id/title/url. Użyj fetch, aby pobrać pełną treść.',
      inputSchema: { query: z.string().min(1).max(MAX_QUERY_LENGTH).describe('Zapytanie wyszukiwania') },
    },
    async ({ query }) => {
      try {
        return toolResult(await searchSvl(api, query));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'fetch',
    {
      title: 'Pobranie zasobu SVL',
      description:
        'Pobiera pełną treść zasobu wskazanego przez wynik search (id, np. "status:ai" albo "app:without_nlp"). Zwraca id/title/text/url/metadata.',
      inputSchema: { id: z.string().min(3).max(MAX_RESOURCE_ID_LENGTH).describe('Identyfikator zasobu z wyników search') },
    },
    async ({ id }) => {
      try {
        return toolResult(await fetchSvlResource(api, id));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'svl_system_status',
    {
      title: 'Status systemu SVL',
      description: 'Zwraca połączony status AI (/api/ai/status) i infrastruktury (/api/infrastructure/status) systemu SVL. Tylko odczyt.',
      inputSchema: {},
    },
    async () => {
      try {
        return toolResult(await getSystemStatus(api));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'svl_list_apps',
    {
      title: 'Lista aplikacji SVL',
      description: 'Zwraca listę aplikacji zarejestrowanych w systemie SVL (/api/apps/list). Tylko odczyt.',
      inputSchema: {},
    },
    async () => {
      try {
        return toolResult(await listApps(api));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'svl_github_admin_status',
    {
      title: 'Status administratora GitHub',
      description: 'Zwraca status integracji GitHub admin w SVL (/api/github/admin/status). Tylko odczyt, bez wykonywania akcji.',
      inputSchema: {},
    },
    async () => {
      try {
        return toolResult(await getGithubAdminStatus(api));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// Health-check bez autoryzacji — nie ujawnia żadnych sekretów.
app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'svl-chatgpt-mcp', transports: ['streamable-http:/mcp', 'sse:/sse'] });
});

// Autoryzacja bearer dla wszystkich endpointów MCP.
app.use(['/mcp', '/sse', '/messages'], (req: Request, res: Response, next) => {
  if (checkBearerAuth(req.headers.authorization, AUTH_TOKEN)) return next();
  res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Unauthorized: wymagany nagłówek Authorization: Bearer <token>.' },
    id: null,
  });
});

// --- Streamable HTTP (bezstanowy: nowa instancja per żądanie, bezpieczne przy wielu klientach) ---
app.post('/mcp', async (req: Request, res: Response) => {
  try {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[MCP] Błąd obsługi /mcp:', error instanceof Error ? error.message : error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

app.get('/mcp', (_req: Request, res: Response) => {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. Użyj POST /mcp.' }, id: null });
});
app.delete('/mcp', (_req: Request, res: Response) => {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
});

// --- Legacy SSE (starsze konektory ChatGPT) ---
const sseTransports = new Map<string, SSEServerTransport>();

app.get('/sse', async (_req: Request, res: Response) => {
  try {
    const transport = new SSEServerTransport('/messages', res);
    sseTransports.set(transport.sessionId, transport);
    const server = buildMcpServer();
    res.on('close', () => {
      sseTransports.delete(transport.sessionId);
      void server.close();
    });
    await server.connect(transport);
  } catch (error) {
    console.error('[MCP] Błąd obsługi /sse:', error instanceof Error ? error.message : error);
    if (!res.headersSent) res.status(500).end();
  }
});

app.post('/messages', async (req: Request, res: Response) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
  const transport = sseTransports.get(sessionId);
  if (!transport) {
    res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Nieznana sesja SSE.' }, id: null });
    return;
  }
  await transport.handlePostMessage(req, res, req.body);
});

app.listen(MCP_PORT, '0.0.0.0', () => {
  console.log(`[MCP] svl-chatgpt-mcp nasłuchuje na 0.0.0.0:${MCP_PORT}`);
  console.log(`[MCP] Endpointy: POST /mcp (Streamable HTTP), GET /sse + POST /messages (SSE), GET /healthz`);
  console.log(`[MCP] Źródło danych SVL: ${SVL_API_BASE}`);
  console.log('[MCP] Token autoryzacji: zmienna MCP_AUTH_TOKEN w .env (nie jest logowana).');
  console.log(`[MCP] Instancja uruchomienia: ${randomUUID()}`);
});
