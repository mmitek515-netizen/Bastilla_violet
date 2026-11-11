import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAiStudioGateway } from '../scripts/ai-studio-mcp.mjs';

const TOKEN = 'safe-test-secret-32-chars-mcp-gateway-test-2026';

async function withGateway(fn) {
  const server = createAiStudioGateway({ token: TOKEN, appPort: 1 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = 'http://127.0.0.1:' + server.address().port;
  try { await fn(url); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
function rpc(base, method, params = {}, secret = TOKEN) {
  return fetch(base + '/mcp', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + secret,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
}

test('AI Studio gateway refuses to start without a sufficiently long secret', () => {
  assert.throws(() => createAiStudioGateway({ token: '' }), /SVL_MCP_TOKEN/);
  assert.throws(() => createAiStudioGateway({ token: 'weak' }), /SVL_MCP_TOKEN/);
});

test('AI Studio gateway requires authorization for MCP and health', async () => {
  await withGateway(async url => {
    const unauth = await fetch(url + '/healthz');
    assert.equal(unauth.status, 401);
    const invalid = await rpc(url, 'initialize', {}, 'invalid-secret');
    assert.equal(invalid.status, 401);

    const health = await fetch(url + '/healthz', {
      headers: { Authorization: 'Bearer ' + TOKEN },
    });
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, 'svl-mcp-bridge');
  });
});

test('AI Studio gateway provides read-only MCP and no privileged SVL routes', async () => {
  await withGateway(async url => {
    const init = await rpc(url, 'initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'ai-studio-test', version: '1' },
    });
    assert.equal(init.status, 200);
    assert.equal((await init.json()).result.serverInfo.name, 'svl-mcp-readonly');

    const result = await rpc(url, 'tools/list');
    assert.equal(result.status, 200);
    const tools = (await result.json()).result.tools.map(item => item.name);
    assert.deepEqual(tools, [
      'svl_bridge_status', 'svl_agents', 'svl_ai_status',
      'svl_system_status', 'svl_ollama_status',
    ]);

    const status = await rpc(url, 'tools/call', {
      name: 'svl_bridge_status', arguments: {},
    });
    assert.equal((await status.json()).result.content[0].text.includes('bridge-running'), true);

    const dangerous = await rpc(url, 'tools/call', {
      name: 'execute_shell', arguments: {},
    });
    assert.equal((await dangerous.json()).error.code, -32601);

    const root = await fetch(url + '/api/hyperos/console', {
      method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN },
    });
    assert.equal(root.status, 404);

    const getMcp = await fetch(url + '/mcp', {
      headers: { Authorization: 'Bearer ' + TOKEN },
    });
    assert.equal(getMcp.status, 405);
  });
});
