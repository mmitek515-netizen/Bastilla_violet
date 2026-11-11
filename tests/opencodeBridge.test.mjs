import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { OpenCodeBridge } from '../src/lib/opencodeBridge.ts';

async function withMockServer(run) {
  const queries = [];
  const server = createServer(async (req, res) => {
    const path = req.url;
    queries.push({ path, auth: req.headers.authorization || '' });
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Basic ' + Buffer.from('opencode:example-password').toString('base64')) {
      res.statusCode = 401; res.end('{}'); return;
    }
    if (path === '/global/health') res.end(JSON.stringify({ healthy: true, version: 'test-v2' }));
    else if (path === '/provider') res.end(JSON.stringify({ connected: ['openai'] }));
    else if (path === '/config/providers') res.end(JSON.stringify({ default: {openai: 'gpt-6-codex'} }));
    else if (path === '/session' && req.method === 'POST') res.end(JSON.stringify({ id: 'session_abc' }));
    else if (path === '/session/session_abc/message' && req.method === 'POST') {
      let payload = ''; for await (const chunk of req) payload += chunk;
      assert.equal(JSON.parse(payload).parts[0].text, 'Cześć');
      assert.deepEqual(JSON.parse(payload).model, {providerID:'openai', modelID:'gpt-6-codex'});
      res.end(JSON.stringify({ parts: [{ type: 'text', text: 'Odpowiedź z OpenCode' }] }));
    } else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`, queries); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('ChatGPT login status, session routing, and upstream password never returned to browser', async () => {
  await withMockServer(async (baseUrl, queries) => {
    const bridge = new OpenCodeBridge({ baseUrl, password: 'example-password' });
    const state = await bridge.status();
    assert.equal(state.reachable, true);
    assert.equal(state.openaiConnected, true);
    assert.equal(state.authMethod, 'unverified');
    assert.equal(state.defaultOpenAiModel, 'gpt-6-codex');
    assert.equal(JSON.stringify(state).includes('example-password'), false);
    const sessionId = await bridge.createSession('Bastilla');
    assert.equal(sessionId, 'session_abc');
    const response = await bridge.send(sessionId, 'Cześć', state.defaultOpenAiModel);
    assert.equal(response.content, 'Odpowiedź z OpenCode');
    assert.equal(queries.length, 5);
  });
});

test('OpenCode bridge refuses plain HTTP remote host', () => {
  assert.throws(() => new OpenCodeBridge({ baseUrl: 'http://example.org:4096' }), /HTTPS/);
  assert.throws(() => new OpenCodeBridge({ baseUrl: 'https://example.org' }), /HTTPS/);
  assert.throws(() => new OpenCodeBridge({ baseUrl: 'http://127.0.0.1:4096/secrets' }), /origin only/);
});

test('no connected OpenAI account is reported as unavailable', async () => {
  await withMockServer(async baseUrl => {
    const bridge = new OpenCodeBridge({ baseUrl, password: 'wrong-password' });
    const status = await bridge.status();
    assert.equal(status.reachable, false);
    assert.equal(status.openaiConnected, false);
  });
});
