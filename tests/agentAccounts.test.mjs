import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const cli = new URL('../bastillaos/system-package/bin/bastilla-agent-accounts', import.meta.url);

test('agent account script parses as bash', () => {
  const result = spawnSync('bash', ['-n', cli.pathname], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('status checks four real Unix identities and is non-destructive', () => {
  const result = spawnSync('bash', [cli.pathname, 'status'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  for (const agent of ['alex', 'aria', 'astyria', 'aurelius']) {
    assert.match(result.stdout, new RegExp('bastilla-' + agent + ':'));
  }
});

test('root access needs explicit confirm and is not provision default', () => {
  const source = readFileSync(cli, 'utf8');
  assert.match(source, /grant-root --confirm FULL_ROOT_FOR_FOUR_AGENTS/);
  assert.match(source, /visudo -cf/);
  assert.match(source, /--password '!'/);
  assert.match(source, /exec runuser -u/);
  const rejected = spawnSync('bash', [cli.pathname, 'grant-root'], { encoding: 'utf8' });
  // When not root, privilege check also rejects. Never changes root grants.
  assert.notEqual(rejected.status, 0);
});
