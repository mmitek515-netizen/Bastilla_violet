import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SharedSystemMemory, memoryContext, safeMemoryText } from '../src/kernel/systemMemory.ts';

test('memory persists across independent instances and supports global/agent scoping', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'svl-memory-'));
  const file = path.join(dir, 'data', 'ai-memory.json');
  try {
    const memory = new SharedSystemMemory(file, '');
    const first = await memory.add({ text: 'Protokół misji: włącz Ollama Vision', scope: 'global', kind: 'decision' });
    await memory.add({ text: 'Prywatne zadanie Aria: zbadaj logi', scope: 'agent:Aria', kind: 'task' });
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    const restarted = new SharedSystemMemory(file, '');
    assert.equal(await restarted.count(), 2);
    const globally = await restarted.search('protokół misji Ollama');
    assert.equal(globally.length, 1);
    assert.equal(globally[0].id, first.id);
    const privateResults = await restarted.search('zbadaj logi');
    assert.equal(privateResults.length, 0);
    assert.equal((await restarted.search('zbadaj logi', ['global', 'agent:Aria'])).length, 1);
    assert.equal((await restarted.list(10, ['global'])).length, 1);
    assert.equal(await restarted.remove(first.id), true);
    assert.equal(await restarted.remove(first.id), false);
    assert.equal(await restarted.count(), 1);
    const stored = await fs.readFile(file, 'utf8');
    assert.ok(!stored.includes(first.id));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('concurrent saves are serialized, secrets are redacted and untrusted memory is labeled', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'svl-memory-'));
  try {
    const memory = new SharedSystemMemory(path.join(dir, 'memory.json'), '');
    await Promise.all(Array.from({ length: 12 }, (_, i) => memory.add({ text: 'Fakt nr ' + i })));
    assert.equal(await memory.count(), 12);
    assert.ok(safeMemoryText('Bearer secret-example-value-12345678').includes('[REDACTED]'));
    const label = memoryContext(await memory.search('fakt'));
    assert.match(label, /niezaufane zapisy kontekstowe/);
    await assert.rejects(memory.add({ text: ' ' }), /Pamięć wymaga/);
    await assert.rejects(memory.add({ text: 'x', scope: 'unknown' }), /Nieprawidłowy zakres/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('semantic memory ranks actual Ollama vectors when embedding model is configured', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'svl-memory-'));
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push(String(url));
    const { input } = JSON.parse(init.body);
    const embedding = /gwiaz|nieb|kosmos|orbita/i.test(input) ? [0, 1, 0] : [1, 0, 0];
    return new Response(JSON.stringify({ embeddings: [embedding] }), { status: 200 });
  };
  try {
    const memory = new SharedSystemMemory(path.join(dir, 'memory.json'), 'nomic-embed-text', 'http://127.0.0.1:11434', fakeFetch);
    await memory.add({ text: 'Kwiaty rosną w ogrodzie' });
    await memory.add({ text: 'Kosmos jest ogromny' });
    const matches = await memory.search('orbita planety', ['global'], 2);
    assert.equal(matches[0].text, 'Kosmos jest ogromny');
    assert.ok(calls.every((call) => call.endsWith('/api/embed')));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
