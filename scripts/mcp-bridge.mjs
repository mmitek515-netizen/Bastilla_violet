// Isolated, read-only Streamable HTTP MCP bridge: no command execution.
import { createServer } from 'node:http';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import 'dotenv/config';

const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26'];
const TOOLS = [
  { name: 'svl_bridge_status', description: 'Read bridge status, without executing commands.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } },
  { name: 'svl_agents', description: 'List configured chat roles, not live worker status.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } },
  { name: 'svl_ai_status', description: 'Read configured AI providers and model from local SVL; this is not an Ollama connectivity check.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } },
  { name: 'svl_system_status', description: 'Read the actual availability of the SVL app and a safe infrastructure status subset.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } },
  { name: 'svl_ollama_status', description: 'Probe local Ollama directly; list installed and loaded models, not just configured ones.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } },
];
const sha = value => createHash('sha256').update(value).digest();
const result = (id, data) => ({ jsonrpc: '2.0', id, result: data });
const error = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const output = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
const short = value => typeof value === 'string' ? value.slice(0, 200) : null;
const safeBool = value => typeof value === 'boolean' ? value : null;
async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(6500) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}
function resolveToken() {
  const configured = process.env.SVL_MCP_TOKEN?.trim();
  if (configured) return configured;
  const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  const existing = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  const generated = randomBytes(32).toString('hex');
  appendFileSync(envFile, (existing && !existing.endsWith('\n') ? '\n' : '') +
    'SVL_MCP_TOKEN=' + generated + '\n', { mode: 0o600 });
  chmodSync(envFile, 0o600);
  process.env.SVL_MCP_TOKEN = generated;
  console.log('MCP token created in local .env (never commit or paste it into chat).');
  return generated;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new Error('too-large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createMcpServer({ token, appPort = 3000, allowedOrigins = [] }) {
  if (typeof token !== 'string' || token.length < 32)
    throw new Error('Set SVL_MCP_TOKEN to a random secret of at least 32 characters.');
  if (!Number.isInteger(Number(appPort)) || +appPort < 1 || +appPort > 65535)
    throw new Error('Invalid SVL_APP_PORT.');
  return createServer(async (req, res) => {
    if (req.url !== '/mcp' && req.url !== '/healthz')
      return send(res, 404, { error: 'Not found' });
    if (req.headers.origin && !allowedOrigins.includes(req.headers.origin))
      return send(res, 403, { error: 'Forbidden origin' });
    const auth = req.headers.authorization || '';
    const provided = typeof auth === 'string' && auth.startsWith('Bearer ')
      ? auth.slice(7).trim() : '';
    if (!timingSafeEqual(sha(provided), sha(token)))
      return send(res, 401, { error: 'Unauthorized' }, { 'WWW-Authenticate': 'Bearer realm="SVL MCP"' });
    if (req.url === '/healthz') return req.method === 'GET'
      ? send(res, 200, { ok: true, service: 'svl-mcp-bridge' })
      : send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
    if (req.method !== 'POST')
      return send(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json'))
      return send(res, 415, { error: 'Expected application/json' });
    const protocol = req.headers['mcp-protocol-version'];
    if (protocol && !SUPPORTED.includes(protocol))
      return send(res, 400, error(null, -32600, 'Unsupported MCP protocol version'));
    let msg;
    try { msg = await readBody(req); }
    catch (e) { return send(res, e.message === 'too-large' ? 413 : 400,
      error(null, -32700, 'Invalid JSON or oversized payload')); }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) ||
      msg.jsonrpc !== '2.0' || typeof msg.method !== 'string')
      return send(res, 400, error(msg?.id ?? null, -32600, 'Invalid request'));
    if (!Object.hasOwn(msg, 'id')) {
      res.writeHead(202, { 'Cache-Control': 'no-store' }); return res.end();
    }
    const id = msg.id;
    if (msg.method === 'initialize') return send(res, 200, result(id, {
      protocolVersion: SUPPORTED.includes(msg.params?.protocolVersion)
        ? msg.params.protocolVersion : SUPPORTED[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'svl-mcp-readonly', version: '1.0.0' },
      instructions: 'Status-only MCP. No filesystem writes, shell, root or GitHub actions.',
    }));
    if (msg.method === 'ping') return send(res, 200, result(id, {}));
    if (msg.method === 'tools/list') return send(res, 200, result(id, { tools: TOOLS }));
    if (msg.method !== 'tools/call') return send(res, 200, error(id, -32601, 'Method not found'));
    const name = msg.params?.name, args = msg.params?.arguments ?? {};
    if (!TOOLS.some(t => t.name === name)) return send(res, 200, error(id, -32601, 'Unknown or forbidden tool'));
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length)
      return send(res, 200, error(id, -32602, 'Tool does not accept arguments'));
    if (name === 'svl_bridge_status') return send(res, 200, result(id, output({
      status: 'bridge-running', mode: 'read-only', dangerousActionsExposed: false,
    })));
    if (name === 'svl_agents') return send(res, 200, result(id, output({
      agents: ['Alex', 'Astyria', 'Aria', 'Aurelius'].map(name => ({
        name, configured: true, workerStatus: 'unverified',
      })),
      source: 'SVL chat-role configuration', liveWorkersVerified: false,
    })));
    const svlBase = 'http://127.0.0.1:' + Number(appPort);
    if (name === 'svl_ollama_status') {
      const base = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
      let url;
      try {
        url = new URL(base);
        if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
            (url.pathname !== '/' && url.pathname !== ''))
          throw new Error('Only loopback HTTP Ollama endpoints are allowed');
      } catch {
        return send(res, 200, result(id, { ...output({
          reachable: false, error: 'Invalid/non-local OLLAMA_BASE_URL',
        }), isError: true }));
      }
      try {
        const version = await getJson(base + '/api/version');
        const [tags, loaded] = await Promise.all([
          getJson(base + '/api/tags').catch(() => ({})),
          getJson(base + '/api/ps').catch(() => ({})),
        ]);
        const names = entries => (Array.isArray(entries) ? entries : [])
          .slice(0, 40).map(item => short(item?.name || item?.model)).filter(Boolean);
        return send(res, 200, result(id, output({
          reachable: true, version: short(version?.version),
          configuredModel: short(process.env.OLLAMA_MODEL || 'dolphin-llama3:8b'),
          installedModels: names(tags.models), loadedModels: names(loaded.models),
        })));
      } catch {
        return send(res, 200, result(id, output({
          reachable: false, configuredModel: short(process.env.OLLAMA_MODEL || 'dolphin-llama3:8b'),
          installedModels: null, loadedModels: null,
          error: 'Ollama did not respond on the configured loopback address',
        })));
      }
    }
    if (name === 'svl_system_status') {
      const [ai, infra] = await Promise.allSettled([
        getJson(svlBase + '/api/ai/status'),
        getJson(svlBase + '/api/infrastructure/status'),
      ]);
      const a = ai.status === 'fulfilled' ? ai.value : {};
      const i = infra.status === 'fulfilled' ? infra.value : {};
      return send(res, 200, result(id, output({
        svlReachable: ai.status === 'fulfilled' || infra.status === 'fulfilled',
        aiStatusReachable: ai.status === 'fulfilled',
        infrastructureStatusReachable: infra.status === 'fulfilled',
        provider: short(a.provider), configuredModel: short(a.model),
        sysVersion: short(i.sysVersion || a.sysVersion),
        repairStatus: short(i.repairStatus), missionStatus: short(i.missionStatus),
        autoRepairEnabled: safeBool(i.autoRepairEnabled),
        continuousMissionEnabled: safeBool(i.continuousMissionEnabled),
        uptimeSeconds: Number.isFinite(i.uptimeSeconds) ? i.uptimeSeconds : null,
      })));
    }
    try {
      const body = await getJson(svlBase + '/api/ai/status');
      return send(res, 200, result(id, output({
        provider: short(body.provider), model: short(body.model),
        enabled: safeBool(body.enabled),
        connection: short(body.connection), sysVersion: short(body.sysVersion),
        modelRuntimeVerified: false,
      })));
    } catch {
      return send(res, 200, result(id, { ...output({
        error: 'SVL application unavailable on configured local port',
      }), isError: true }));
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.SVL_MCP_PORT || 3100);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid SVL_MCP_PORT');
  const origins = [
    'http://localhost:' + port, 'http://127.0.0.1:' + port,
    ...(process.env.SVL_MCP_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  ];
  const server = createMcpServer({
    token: resolveToken(),
    appPort: Number(process.env.SVL_APP_PORT || 3000),
    allowedOrigins: origins,
  });
  server.listen(port, '127.0.0.1', () => {
    console.log('SVL MCP bridge listening on 127.0.0.1:' + port + '/mcp (read only)');
  });
}
