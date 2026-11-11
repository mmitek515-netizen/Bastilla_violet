import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { createHyperComRouter } from '../src/lib/hyperComRoutes.ts';

test('HyperCom HTTP route persists local messages and rejects invalid requests', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-com-http-'));
  const app = express();
  app.use(express.json());
  app.use('/api/hyper-com', createHyperComRouter(directory));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}/api/hyper-com/transmissions`;
  const post = (body) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const initial = await fetch(url);
  assert.equal(initial.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await initial.json()).transmissions, []);
  const inbound = await post({ action: 'receive', sender: 'TEST', content: 'Lokalna wiadomość testowa' });
  assert.equal(inbound.status, 200);
  const message = (await inbound.json()).transmission;
  assert.equal(message.status, 'received');
  const reply = await post({ action: 'reply', replyTo: message.id, content: 'Odpowiedź' });
  assert.equal(reply.status, 200);
  assert.equal((await reply.json()).transmission.status, 'queued');
  const broadcast = await post({ action: 'broadcast', content: 'Tylko lokalnie' });
  assert.equal((await broadcast.json()).transmission.status, 'queued');
  assert.equal((await post({ action: 'reply', replyTo: 9999, content: 'Brak' })).status, 400);
  assert.equal((await post({ action: 'broadcast', content: 'x'.repeat(4001) })).status, 400);
  const messages = (await (await fetch(url)).json()).transmissions;
  assert.deepEqual(messages.map((item) => item.status), ['replied', 'queued', 'queued']);
});
