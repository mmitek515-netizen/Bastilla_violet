import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const server = await readFile(new URL('../server.ts', import.meta.url), 'utf8');

test('listing apps and syncing versions never recreates removed demo applications', () => {
  assert.doesNotMatch(server, /^\s*initializeDefaultApps\(\);/m);
});
