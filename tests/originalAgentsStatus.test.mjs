import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchOriginalAgentsStatus,
  ORIGINAL_AGENT_NAMES,
  ORIGINAL_AGENT_SOURCE_REPOSITORY,
  ORIGINAL_AGENT_TARGET_REPOSITORY,
} from '../src/kernel/originalAgentsStatus.mjs';

const TOKEN = 'x'.repeat(40);
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function sourceResponses({ workerState = 'idle', workerVerified = false, heartbeatAt = null } = {}) {
  const capabilities = {
    sourceRepository: ORIGINAL_AGENT_SOURCE_REPOSITORY,
    protocolVersion: 1,
    agents: [...ORIGINAL_AGENT_NAMES],
    capabilities: ['debian13_review_task_v1', 'debian13_agent_message_v1'],
    workerExecutionVerified: false,
    mode: 'model_review_only',
  };
  const workers = {
    sourceRepository: ORIGINAL_AGENT_SOURCE_REPOSITORY,
    targetRepository: ORIGINAL_AGENT_TARGET_REPOSITORY,
    protocolVersion: 1,
    mode: 'model_review_only',
    agents: ORIGINAL_AGENT_NAMES.map((name) => ({
      name, state: workerState, workerVerified, heartbeatAt,
    })),
  };
  return [
    [/\/api\/agent-tasks\/capabilities$/, () => json(capabilities)],
    [/\/api\/agent-tasks\/workers$/, () => json(workers)],
  ];
}

function fetchRouter(routes) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      const route = routes.find(([pattern]) => pattern.test(String(url)));
      if (!route) throw new Error('unexpected_source_request');
      return route[1]();
    },
  };
}

test('missing configuration reports all canonical agents not_connected without making a request', async () => {
  let called = false;
  const result = await fetchOriginalAgentsStatus({
    baseUrl: '',
    token: '',
    fetchImpl: async () => { called = true; },
  });
  assert.equal(result.connection, 'not_connected');
  assert.equal(result.reason, 'credentials_not_configured');
  assert.deepEqual(result.agents.map((agent) => agent.name), ORIGINAL_AGENT_NAMES);
  assert.ok(result.agents.every((agent) => agent.state === 'not_connected'));
  assert.equal(called, false);
});

test('requires HTTPS and bounded server-side bearer credentials', async () => {
  const fetchImpl = async () => { throw new Error('must not fetch'); };
  assert.equal((await fetchOriginalAgentsStatus({
    baseUrl: 'http://worker.example', token: TOKEN, fetchImpl,
  })).reason, 'invalid_source_url');
  assert.equal((await fetchOriginalAgentsStatus({
    baseUrl: 'https://worker.example', token: 'short', fetchImpl,
  })).reason, 'invalid_source_credentials');
});

test('authenticates to canonical read-only endpoints but blocks SVL project execution', async () => {
  const { calls, fetchImpl } = fetchRouter(sourceResponses());
  const result = await fetchOriginalAgentsStatus({
    baseUrl: 'https://worker.example/',
    token: TOKEN,
    fetchImpl,
  });
  assert.equal(result.connection, 'connected');
  assert.equal(result.targetRepository, ORIGINAL_AGENT_TARGET_REPOSITORY);
  assert.equal(result.reason, 'source_worker_cannot_execute_code_in_this_repository');
  assert.deepEqual(result.agents.map((agent) => agent.state), Array(4).fill('blocked'));
  assert.equal(calls.length, 2);
  for (const { url, init } of calls) {
    assert.match(url, /^https:\/\/worker\.example\/api\/agent-tasks\//);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, ['Bear', 'er', TOKEN].join(' '));
    assert.equal(init.cache, 'no-store');
  }
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test('only exposes a real, fresh heartbeat as source state; a running source worker is not an SVL worker', async () => {
  const now = Date.now();
  const { fetchImpl } = fetchRouter(sourceResponses({
    workerState: 'running',
    workerVerified: true,
    heartbeatAt: new Date(now).toISOString(),
  }));
  const result = await fetchOriginalAgentsStatus({
    baseUrl: 'https://worker.example',
    token: TOKEN,
    fetchImpl,
    now,
  });
  assert.ok(result.agents.every((agent) => agent.sourceState === 'running' && agent.state === 'blocked'));
});

test('reports source outages and rejected authorization as not_connected without leaking responses', async () => {
  const routes = sourceResponses();
  routes[0][1] = () => json({ error: `secret ${TOKEN}` }, 401);
  const { fetchImpl } = fetchRouter(routes);
  const result = await fetchOriginalAgentsStatus({
    baseUrl: 'https://worker.example',
    token: TOKEN,
    fetchImpl,
  });
  assert.equal(result.connection, 'not_connected');
  assert.equal(result.reason, 'source_auth_failed');
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test('rejects a mismatched source identity or worker contract', async () => {
  const routes = sourceResponses();
  routes[0][1] = () => json({
    sourceRepository: 'untrusted/repository',
    protocolVersion: 1,
    agents: [...ORIGINAL_AGENT_NAMES],
    capabilities: [],
    workerExecutionVerified: false,
    mode: 'model_review_only',
  });
  const { fetchImpl } = fetchRouter(routes);
  const result = await fetchOriginalAgentsStatus({
    baseUrl: 'https://worker.example',
    token: TOKEN,
    fetchImpl,
  });
  assert.equal(result.connection, 'blocked');
  assert.equal(result.reason, 'source_contract_mismatch');
  assert.ok(result.agents.every((agent) => agent.state === 'blocked'));
});

test('times out a source that does not respond', async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })), { once: true });
  });
  const result = await fetchOriginalAgentsStatus({
    baseUrl: 'https://worker.example',
    token: TOKEN,
    fetchImpl,
    timeoutMs: 1,
  });
  assert.equal(result.connection, 'not_connected');
  assert.equal(result.reason, 'source_timeout');
});

test('rejects oversized source responses without returning their content', async () => {
  const routes = sourceResponses();
  routes[0][1] = () => new Response('x'.repeat(33 * 1024), {
    headers: { 'Content-Type': 'application/json' },
  });
  const { fetchImpl } = fetchRouter(routes);
  const result = await fetchOriginalAgentsStatus({
    baseUrl: 'https://worker.example',
    token: TOKEN,
    fetchImpl,
  });
  assert.equal(result.connection, 'not_connected');
  assert.equal(result.reason, 'source_unavailable');
  assert.equal(JSON.stringify(result).includes('x'.repeat(100)), false);
});
