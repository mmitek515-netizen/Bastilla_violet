import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeGitHubAdminAction,
  listGitHubAdminActions,
  GITHUB_ADMIN_ACTION_NAMES,
} from '../src/kernel/githubAdmin.ts';

function fakeRequest(routes) {
  const calls = [];
  const request = async (method, apiPath, body) => {
    calls.push({ method, apiPath, body });
    const key = `${method} ${apiPath}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Nieoczekiwane zapytanie testowe: ${key}`);
    return typeof handler === 'function' ? handler(body) : handler;
  };
  return { request, calls };
}

const CTX = { owner: 'mmitek515-netizen', repo: 'SVL_System' };

test('katalog akcji zawiera pełny zestaw administracyjny z opisami', () => {
  const actions = listGitHubAdminActions();
  assert.equal(actions.length, GITHUB_ADMIN_ACTION_NAMES.length);
  for (const name of ['whoami', 'update-repo', 'delete-repo', 'create-branch', 'protect-branch', 'create-issue', 'merge-pr', 'dispatch-workflow', 'create-release', 'add-collaborator', 'create-webhook']) {
    const entry = actions.find((a) => a.action === name);
    assert.ok(entry, `brak akcji ${name}`);
    assert.ok(entry.description.length > 0);
  }
  assert.ok(actions.find((a) => a.action === 'delete-repo').destructive);
});

test('create-issue buduje poprawne zapytanie POST i raportuje wynik', async () => {
  const { request, calls } = fakeRequest({
    'POST /repos/mmitek515-netizen/SVL_System/issues': {
      status: 201,
      ok: true,
      data: { number: 12, title: 'Bug', html_url: 'https://github.com/x/y/issues/12' },
    },
  });
  const result = await executeGitHubAdminAction('create-issue', { title: 'Bug', labels: ['bug', 7] }, { ...CTX, request });
  assert.match(result.message, /#12/);
  assert.deepEqual(calls[0].body, { title: 'Bug', labels: ['bug'] });
});

test('create-branch pobiera sha gałęzi bazowej i tworzy ref', async () => {
  const { request, calls } = fakeRequest({
    'GET /repos/mmitek515-netizen/SVL_System': { status: 200, ok: true, data: { default_branch: 'main' } },
    'GET /repos/mmitek515-netizen/SVL_System/git/ref/heads/main': {
      status: 200, ok: true, data: { object: { sha: 'abc1234def' } },
    },
    'POST /repos/mmitek515-netizen/SVL_System/git/refs': { status: 201, ok: true, data: { ref: 'refs/heads/feature-x' } },
  });
  const result = await executeGitHubAdminAction('create-branch', { branch: 'feature-x' }, { ...CTX, request });
  assert.match(result.message, /feature-x/);
  assert.deepEqual(calls[2].body, { ref: 'refs/heads/feature-x', sha: 'abc1234def' });
});

test('merge-pr waliduje metodę scalania', async () => {
  const { request } = fakeRequest({
    'PUT /repos/mmitek515-netizen/SVL_System/pulls/5/merge': { status: 200, ok: true, data: { sha: 'ffee11223344' } },
  });
  const result = await executeGitHubAdminAction('merge-pr', { number: 5, merge_method: 'squash' }, { ...CTX, request });
  assert.match(result.message, /#5/);
  await assert.rejects(
    executeGitHubAdminAction('merge-pr', { number: 5, merge_method: 'fast-forward' }, { ...CTX, request }),
    /merge_method/,
  );
});

test('delete-repo wymaga jawnego potwierdzenia owner/repo', async () => {
  const { request, calls } = fakeRequest({
    'DELETE /repos/mmitek515-netizen/SVL_System': { status: 204, ok: true, data: null },
  });
  await assert.rejects(
    executeGitHubAdminAction('delete-repo', {}, { ...CTX, request }),
    /confirm/,
  );
  assert.equal(calls.length, 0);
  const result = await executeGitHubAdminAction('delete-repo', { confirm: 'mmitek515-netizen/SVL_System' }, { ...CTX, request });
  assert.match(result.message, /usunięte/);
});

test('błędy GitHub API są zgłaszane z kodem HTTP i komunikatem', async () => {
  const { request } = fakeRequest({
    'GET /repos/mmitek515-netizen/SVL_System': { status: 404, ok: false, data: { message: 'Not Found' } },
  });
  await assert.rejects(
    executeGitHubAdminAction('get-repo', {}, { ...CTX, request }),
    /HTTP 404.*Not Found/,
  );
});

test('odrzuca nieznane akcje i nieprawidłowy kontekst repo', async () => {
  const { request } = fakeRequest({});
  await assert.rejects(
    executeGitHubAdminAction('format-disk', {}, { ...CTX, request }),
    /Nieznana akcja GitHub/,
  );
  await assert.rejects(
    executeGitHubAdminAction('get-repo', { owner: '../evil' }, { ...CTX, request }),
    /Nieprawidłowy owner lub repo/,
  );
});

test('update-repo wymaga co najmniej jednego pola i filtruje typy', async () => {
  const { request, calls } = fakeRequest({
    'PATCH /repos/mmitek515-netizen/SVL_System': { status: 200, ok: true, data: { full_name: 'mmitek515-netizen/SVL_System' } },
  });
  await assert.rejects(
    executeGitHubAdminAction('update-repo', {}, { ...CTX, request }),
    /co najmniej jednego pola/,
  );
  await executeGitHubAdminAction('update-repo', { description: 'Nowy opis', has_wiki: 'false' }, { ...CTX, request });
  assert.deepEqual(calls[0].body, { description: 'Nowy opis', has_wiki: false });
});

test('readCodespacesSharedGitHubToken parsuje token z pliku shared/.env (z cudzysłowami i bez)', async () => {
  const { readCodespacesSharedGitHubToken, ensureGitHubTokenFromCodespaces } = await import('../src/kernel/githubAdmin.ts');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'svl-cs-env-'));
  try {
    const plain = join(dir, 'plain.env');
    writeFileSync(plain, 'CODESPACE_NAME=abc\nGITHUB_TOKEN=ghu_testtoken123\nGITHUB_USER=x\n');
    assert.equal(readCodespacesSharedGitHubToken(plain), 'ghu_testtoken123');
    const quoted = join(dir, 'quoted.env');
    writeFileSync(quoted, 'GITHUB_TOKEN="ghu_quoted456"\n');
    assert.equal(readCodespacesSharedGitHubToken(quoted), 'ghu_quoted456');
    const empty = join(dir, 'empty.env');
    writeFileSync(empty, 'GITHUB_TOKEN=\nINNE=1\n');
    assert.equal(readCodespacesSharedGitHubToken(empty), undefined);
    assert.equal(readCodespacesSharedGitHubToken(join(dir, 'nie-istnieje.env')), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ensureGitHubTokenFromCodespaces nie nadpisuje istniejącego tokenu i ładuje brakujący', async () => {
  const { ensureGitHubTokenFromCodespaces } = await import('../src/kernel/githubAdmin.ts');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'svl-cs-env-'));
  const envFile = join(dir, 'shared.env');
  writeFileSync(envFile, 'GITHUB_TOKEN=ghu_fromfile789\n');
  const savedGithub = process.env.GITHUB_TOKEN;
  const savedGh = process.env.GH_TOKEN;
  try {
    process.env.GITHUB_TOKEN = 'ghu_istniejacy';
    delete process.env.GH_TOKEN;
    assert.equal(ensureGitHubTokenFromCodespaces(envFile), false);
    assert.equal(process.env.GITHUB_TOKEN, 'ghu_istniejacy');

    delete process.env.GITHUB_TOKEN;
    assert.equal(ensureGitHubTokenFromCodespaces(envFile), true);
    assert.equal(process.env.GITHUB_TOKEN, 'ghu_fromfile789');

    delete process.env.GITHUB_TOKEN;
    assert.equal(ensureGitHubTokenFromCodespaces(join(dir, 'brak.env')), false);
    assert.equal(process.env.GITHUB_TOKEN, undefined);
  } finally {
    if (savedGithub === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = savedGithub;
    if (savedGh === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = savedGh;
    rmSync(dir, { recursive: true, force: true });
  }
});
