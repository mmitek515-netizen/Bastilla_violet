import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

async function freePort() {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('selected modules are mounted on the real server with isolated data and authorization', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bastilla-selected-modules-'));
  let slowOllama = false;
  let notifySlowRequest;
  const slowRequestStarted = new Promise((resolve) => { notifySlowRequest = resolve; });
  const ollama = http.createServer((req, res) => {
    const respond = () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(req.url === '/api/tags' ? { models: [] } : {}));
    };
    if (slowOllama && req.url === '/api/tags') {
      notifySlowRequest();
      setTimeout(respond, 1200);
    } else {
      respond();
    }
  });
  ollama.listen(0, '127.0.0.1');
  await once(ollama, 'listening');
  const port = await freePort();
  const daemonPort = await freePort();
  const operatorToken = `operator-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const fleetToken = `fleet-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: directory,
      PORT: String(port),
      DEBIAN13_API_PORT: String(daemonPort),
      SVL_OPERATOR_TOKEN: operatorToken,
      FLEET_ADMIN_TOKEN: fleetToken,
      FLEET_INGEST_TOKEN: '',
      FLEET_STORE_PATH: '',
      HYPER_COM_DB_PATH: '',
      GEMINI_API_KEY: '',
      OLLAMA_BASE_URL: `http://127.0.0.1:${ollama.address().port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout.on('data', (data) => { logs += data.toString(); });
  server.stderr.on('data', (data) => { logs += data.toString(); });
  let daemonPid;
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await Promise.race([once(server, 'exit'), delay(3000)]);
    }
    if (daemonPid) {
      try { process.kill(daemonPid, 'SIGTERM'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    await new Promise((resolve) => ollama.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) { ready = true; break; }
    } catch {}
    if (server.exitCode !== null) break;
    await delay(150);
  }
  assert.ok(ready, `Server failed to start: ${logs}`);

  assert.equal((await fetch(`${base}/api/hyper-com/transmissions`)).status, 401);
  assert.equal((await fetch(`${base}/api/fleet`)).status, 401);
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: operatorToken }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const bootstrap = await fetch(`${base}/api/bootstrap`, { headers: { Cookie: cookie } });
  assert.equal(bootstrap.status, 200);
  const snapshot = await bootstrap.json();
  daemonPid = snapshot.health.debian13.daemonPid;
  assert.equal(snapshot.health.backend, 'online');
  assert.equal(snapshot.health.ollama.model, null);
  assert.equal(snapshot.health.geminiConfigured, false);
  const streamController = new AbortController();
  t.after(() => streamController.abort());
  const events = await fetch(`${base}/api/events`, {
    headers: { Cookie: cookie }, signal: streamController.signal,
  });
  assert.equal(events.status, 200);
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  let eventBuffer = '';
  async function nextEvent(type) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const end = eventBuffer.indexOf('\n\n');
      if (end !== -1) {
        const event = eventBuffer.slice(0, end);
        eventBuffer = eventBuffer.slice(end + 2);
        if (event.startsWith(`event: ${type}\n`)) {
          return JSON.parse(event.split('\n').find((line) => line.startsWith('data: ')).slice(6));
        }
        continue;
      }
      const part = await Promise.race([
        reader.read(),
        delay(Math.max(0, deadline - Date.now())).then(() => { throw new Error(`Timed out waiting for ${type}`); }),
      ]);
      assert.equal(part.done, false);
      eventBuffer += decoder.decode(part.value, { stream: true });
    }
    throw new Error(`Timed out waiting for ${type}`);
  }
  await nextEvent('ready');
  slowOllama = true;
  const pendingHealth = fetch(`${base}/api/health`, { headers: { Cookie: cookie } });
  await slowRequestStarted;
  const started = Date.now();
  const sent = await fetch(`${base}/api/messages`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: snapshot.sessions[0].id, content: 'Natychmiastowa synchronizacja', target: 'Alex' }),
  });
  assert.equal(sent.status, 202);
  const sentData = await sent.json();
  const update = await nextEvent('update');
  assert.equal(update.reason, 'messages');
  const stateResponse = await fetch(`${base}/api/state`, { headers: { Cookie: cookie } });
  assert.equal(stateResponse.status, 200);
  const currentState = await stateResponse.json();
  assert.ok(currentState.messages.some((message) => message.id === sentData.user.id));
  assert.equal(currentState.revision, update.revision);
  assert.ok(Date.now() - started < 900, 'State update must not wait for slow health checks');
  const normalStarted = Date.now();
  const normal = await fetch(`${base}/api/messages`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: snapshot.sessions[0].id, content: 'Rozmowa testowa', target: 'Wszyscy' }),
  });
  assert.equal(normal.status, 202);
  const normalData = await normal.json();
  assert.equal(normalData.response.status, 'queued');
  assert.ok(Date.now() - normalStarted < 900, 'Sending a message must not wait for the model');
  assert.equal((await nextEvent('update')).reason, 'messages');
  const queuedState = await (await fetch(`${base}/api/state`, { headers: { Cookie: cookie } })).json();
  assert.ok(queuedState.messages.some((message) => message.id === normalData.user.id));
  assert.ok(queuedState.messages.some((message) => message.id === normalData.response.id));
  assert.equal((await pendingHealth).status, 200);
  slowOllama = false;
  const finalUpdate = await nextEvent('update');
  assert.equal(finalUpdate.reason, 'messages');
  const finalState = await (await fetch(`${base}/api/state`, { headers: { Cookie: cookie } })).json();
  assert.equal(finalState.messages.find((message) => message.id === normalData.response.id)?.status, 'delivered');
  const connect = await fetch(`${base}/api/messages`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: snapshot.sessions[0].id, content: 'podłącz moje ai aria', target: 'Wszyscy' }),
  });
  assert.equal(connect.status, 202);
  const connectData = await connect.json();
  assert.equal(connectData.response, null);
  await nextEvent('update');
  let connected = false;
  for (let i = 0; i < 40; i++) {
    const state = await (await fetch(`${base}/api/state`, { headers: { Cookie: cookie } })).json();
    if (state.messages.some((message) => message.author === 'Aria' && message.status === 'delivered')) {
      connected = true;
      break;
    }
    await delay(50);
  }
  assert.ok(connected, 'Aria connection must publish its result');
  slowOllama = true;
  const ariaStarted = Date.now();
  const ariaReply = await fetch(`${base}/api/messages`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: snapshot.sessions[0].id, content: 'Wiadomość do Aria', target: 'Aria' }),
  });
  assert.equal(ariaReply.status, 202);
  const ariaData = await ariaReply.json();
  assert.equal(ariaData.response.status, 'queued');
  assert.ok(Date.now() - ariaStarted < 900, 'Aria requests must not wait for inference');
  for (let i = 0; i < 80; i++) {
    const state = await (await fetch(`${base}/api/state`, { headers: { Cookie: cookie } })).json();
    if (state.messages.find((message) => message.id === ariaData.response.id)?.status === 'delivered') break;
    if (i === 79) assert.fail('Aria response did not complete');
    await delay(50);
  }
  slowOllama = false;
  streamController.abort();
  assert.ok(daemonPid, 'Debian daemon has a supervised PID');
  const restart = await fetch(`${base}/api/services/restart`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(restart.status, 200);
  const restarted = await restart.json();
  assert.ok(restarted.debian13Pid);
  assert.notEqual(restarted.debian13Pid, daemonPid);
  daemonPid = restarted.debian13Pid;
  let daemonReady = false;
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${daemonPort}/healthz`)).ok) { daemonReady = true; break; }
    } catch {}
    await delay(150);
  }
  assert.ok(daemonReady, `Restarted daemon did not become ready: ${logs}`);

  const fleet = await fetch(`${base}/api/fleet`, { headers: { Authorization: `Bearer ${fleetToken}` } });
  assert.equal(fleet.status, 200);
  assert.deepEqual((await fleet.json()).vessels, []);
  const create = await fetch(`${base}/api/fleet/ships`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${fleetToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test project', kind: 'ship' }),
  });
  assert.equal(create.status, 201);
  const after = await (await fetch(`${base}/api/fleet`, { headers: { Authorization: `Bearer ${fleetToken}` } })).json();
  assert.equal(after.vessels[0].position, null);
  assert.equal(after.vessels[0].connection, 'unverified');

  const preview = await fetch(`${base}/api/apps/preview/hyper_com_module/index.html`, { headers: { Cookie: cookie } });
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /BEZ ŁĄCZNOŚCI ZEWNĘTRZNEJ/);
  const transmit = await fetch(`${base}/api/hyper-com/transmissions`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'broadcast', content: 'Test lokalnej kolejki' }),
  });
  assert.equal(transmit.status, 200);
  assert.equal((await transmit.json()).transmission.status, 'queued');
  const queue = await (await fetch(`${base}/api/hyper-com/transmissions`, { headers: { Cookie: cookie } })).json();
  assert.equal(queue.transmissions.length, 1);
});
