import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('apps/ai_desktop_nexus/index.html', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('apps/ai_desktop_nexus/app.json', root), 'utf8'));
const server = await readFile(new URL('server.ts', root), 'utf8');

test('legacy desktop never fabricates online agents, desktop stream, or terminal', () => {
  assert.match(html, /fetch\('\/api\/ai\/desktop\/status'/);
  assert.doesNotMatch(html, /99\.984%|root@VM_Desktop_Nexus|noVNC WebRTC Stream \(60 FPS|>AKTYWNE</);
  assert.equal(manifest.status, 'ready');
  assert.equal(manifest.port, undefined);
});
test('legacy Git routes are retired and write authentication is mounted', () => {
  assert.match(server, /app\.use\(requireGitHubWriteToken\)/);
  assert.match(server, /app\.post\('\/api\/github\/export', \(_req, res\) => res\.status\(410\)/);
  assert.match(server, /app\.post\('\/api\/github\/pull', \(_req, res\) => res\.status\(410\)/);
  assert.doesNotMatch(server, /\['push', '-u', 'origin', 'main', '--force'\]/);
  assert.doesNotMatch(server, /https:\/\/\$\{username\}:\$\{token\}@github\.com/);
});
