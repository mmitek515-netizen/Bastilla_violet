import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { INITIAL_DATA_STORE, normalizeDataStore } from '../src/kernel/svlKernel.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kernelPath = path.join(repoRoot, 'svl_kernel.py');

function runKernel(storePath, ...args) {
  const result = spawnSync(process.env.PYTHON || 'python3', [kernelPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, SVL_KERNEL_STORE_PATH: storePath },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('factory defaults disable root automation and keep runtime history empty', () => {
  assert.equal(INITIAL_DATA_STORE.config.root_privileges, false);
  assert.deepEqual(INITIAL_DATA_STORE.config.root_agents, []);
  assert.equal(INITIAL_DATA_STORE.config.continuous_mission, 'INACTIVE');
  assert.equal(INITIAL_DATA_STORE.config.astyria_continuous_repair, false);
  assert.equal(INITIAL_DATA_STORE.config.log_auto_repair.enabled, false);
  assert.equal('vm_ten_system' in INITIAL_DATA_STORE.config, false);
  assert.deepEqual(INITIAL_DATA_STORE.update_history, []);
  assert.deepEqual(INITIAL_DATA_STORE.chat_history, []);

  const reset = normalizeDataStore({
    config: { mode: 'Local-Deterministic-Production' },
    update_history: [],
    chat_history: [],
  });
  assert.deepEqual(reset.update_history, []);
  assert.deepEqual(reset.chat_history, []);
});

test('reading state preserves the exact configuration and does not rewrite the file', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'svl-kernel-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const storePath = path.join(directory, 'store.json');
  const original = {
    config: {
      mode: 'Local-Ollama-Production',
      ai_provider: 'Ollama',
      ai_model: 'qwen3:4b',
      keep: 'yes',
    },
    update_history: [{ wersja: '1.0', opis: 'preserve update' }],
    chat_history: [{ agent: 'Alex', tekst: 'preserve transcript' }],
  };
  writeFileSync(storePath, JSON.stringify(original));

  const before = readFileSync(storePath, 'utf8');
  const output = JSON.parse(runKernel(storePath, '--action', 'state'));
  const persisted = JSON.parse(readFileSync(storePath, 'utf8'));

  assert.equal(readFileSync(storePath, 'utf8'), before);
  assert.deepEqual(output.store.config, original.config);
  assert.deepEqual(persisted.config, original.config);
  assert.deepEqual(normalizeDataStore(original).config, { ...INITIAL_DATA_STORE.config, ...original.config });
  assert.deepEqual(persisted.update_history, original.update_history);
  assert.deepEqual(persisted.chat_history, original.chat_history);
});

test('save and config actions preserve model configuration', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'svl-kernel-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const storePath = path.join(directory, 'store.json');

  const incomingStore = {
    config: {
      mode: 'Google-Gemini-Production',
      dialogue_engine: 'Gemini',
      live_ai_engine: 'remote model',
    },
    update_history: [],
    chat_history: [],
  };
  runKernel(storePath, '--action', 'save_store', '--store_json', JSON.stringify(incomingStore));
  let persisted = JSON.parse(readFileSync(storePath, 'utf8'));
  assert.deepEqual(persisted, incomingStore);

  runKernel(
    storePath,
    '--action',
    'config',
    '--config_json',
    JSON.stringify({ mode: 'Local-Ollama-Production', ai_provider: 'Ollama' }),
  );
  persisted = JSON.parse(readFileSync(storePath, 'utf8'));
  assert.deepEqual(persisted.config, {
    ...incomingStore.config,
    mode: 'Local-Ollama-Production',
    ai_provider: 'Ollama',
  });
});
