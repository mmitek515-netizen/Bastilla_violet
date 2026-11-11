import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createMcpServer } from '../scripts/mcp-bridge.mjs';

const TOKEN = 'test-only-token-value-which-is-over-32-characters';
async function withServer(fn, appPort = 1) {
  const server = createMcpServer({ token: TOKEN, appPort });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try { await fn(base); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
function call(url, method, params, headers = {}) {
  return fetch(url + '/mcp', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

test('configuration requires secret of sufficient length', () => {
  assert.throws(() => createMcpServer({ token: '' }), /SVL_MCP_TOKEN/);
  assert.throws(() => createMcpServer({ token: 'too-short' }), /SVL_MCP_TOKEN/);
});

test('authorization, origin, MCP initialization and tools work', async () => {
  await withServer(async base => {
    const missing = await fetch(base + '/healthz');
    assert.equal(missing.status, 401);
    const good = await fetch(base + '/healthz', {
      headers: { Authorization: 'Bearer ' + TOKEN },
    });
    assert.equal(good.status, 200);
    assert.equal((await good.json()).ok, true);

    const badOrigin = await call(base, 'ping', {}, { Origin: 'https://evil.example' });
    assert.equal(badOrigin.status, 403);

    const initialized = await call(base, 'initialize', {
      protocolVersion: '2025-11-25', capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    assert.equal(initialized.status, 200);
    assert.equal((await initialized.json()).result.protocolVersion, '2025-11-25');

    const listed = await call(base, 'tools/list', {});
    const tools = (await listed.json()).result.tools.map(x => x.name);
    assert.deepEqual(tools, ['svl_bridge_status', 'svl_agents', 'svl_ai_status', 'svl_system_status', 'svl_ollama_status']);
    assert.ok(!tools.includes('exec'));

    const role = await call(base, 'tools/call', { name: 'svl_agents', arguments: {} });
    assert.match((await role.json()).result.content[0].text, /Astyria/);

    const blocked = await call(base, 'tools/call', { name: 'execute_shell', arguments: {} });
    assert.equal((await blocked.json()).error.code, -32601);

    const offline = await call(base, 'tools/call', { name: 'svl_ai_status', arguments: {} });
    assert.equal((await offline.json()).result.isError, true);

    const notGet = await fetch(base + '/mcp', { headers: { Authorization: 'Bearer ' + TOKEN } });
    assert.equal(notGet.status, 405);
  });
});

test('system status never claims an unreachable SVL app is online', async () => {
  await withServer(async base => {
    const r = await call(base, 'tools/call', { name: 'svl_system_status', arguments: {} });
    const status = JSON.parse((await r.json()).result.content[0].text);
    assert.equal(status.svlReachable, false);
    assert.equal(status.aiStatusReachable, false);
    assert.equal(status.infrastructureStatusReachable, false);
  });
});

test('SVL and Ollama tools report actual local responses, not configured roles as workers', async () => {
  const mock = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const routes = {
      '/api/ai/status': { provider: 'Ollama (lokalnie)', model: 'test-model:1b', enabled: true },
      '/api/infrastructure/status': { repairStatus: 'PAUSED', missionStatus: 'STANDBY', uptimeSeconds: 25 },
      '/api/version': { version: '0.7.0' },
      '/api/tags': { models: [{ name: 'test-model:1b' }] },
      '/api/ps': { models: [] },
    };
    if (!routes[req.url]) { res.writeHead(404); return res.end('{}'); }
    res.end(JSON.stringify(routes[req.url]));
  });
  mock.listen(0, '127.0.0.1');
  await once(mock, 'listening');
  const port = mock.address().port;
  const previous = process.env.OLLAMA_BASE_URL;
  process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:' + port;
  try {
    await withServer(async base => {
      const r = await call(base, 'tools/call', { name: 'svl_system_status', arguments: {} });
      const status = JSON.parse((await r.json()).result.content[0].text);
      assert.equal(status.svlReachable, true);
      assert.equal(status.configuredModel, 'test-model:1b');
      assert.equal(status.repairStatus, 'PAUSED');

      const o = await call(base, 'tools/call', { name: 'svl_ollama_status', arguments: {} });
      const ollama = JSON.parse((await o.json()).result.content[0].text);
      assert.equal(ollama.reachable, true);
      assert.deepEqual(ollama.installedModels, ['test-model:1b']);
      assert.deepEqual(ollama.loadedModels, []);

      const a = await call(base, 'tools/call', { name: 'svl_agents', arguments: {} });
      const agents = JSON.parse((await a.json()).result.content[0].text);
      assert.equal(agents.liveWorkersVerified, false);
      assert.equal(agents.agents.length, 4);
      assert.ok(agents.agents.every(agent => agent.workerStatus === 'unverified'));
    }, port);
  } finally {
    if (previous === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = previous;
    await new Promise(resolve => mock.close(resolve));
  }
});
