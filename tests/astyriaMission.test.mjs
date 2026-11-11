import assert from 'node:assert/strict';
import test from 'node:test';
import { runAstyriaMission } from '../src/lib/astyriaMission.ts';

test('log scanning fails without sending any request to the old mission endpoint', async () => {
  let requests = 0;
  await assert.rejects(runAstyriaMission('deep_scan', async () => {
    requests += 1;
    throw new Error('unexpected request');
  }), /wyłącznie odczytowego endpointu/);
  assert.equal(requests, 0);
});

test('mission replies cannot supply a replacement configuration', async () => {
  const result = await runAstyriaMission('vm_firewall_audit', async () => new Response(
    JSON.stringify({ reply: 'Raport', state: { store: { config: { reset: true } } } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
  assert.deepEqual(result, { reply: 'Raport', actionTitle: '' });
});
