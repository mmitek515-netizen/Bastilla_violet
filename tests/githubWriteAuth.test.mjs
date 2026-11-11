import test from 'node:test';
import assert from 'node:assert/strict';
import { isGitHubWritePath, validGitHubWriteToken, requireGitHubWriteToken } from '../src/lib/githubWriteAuth.ts';

const TOKEN = 'sample-only-operator-secret-with-40-chars-123456';
test('all GitHub write API roots are identified; normal chat is not', () => {
  for (const path of ['/api/github/export', '/api/github/pull', '/api/github/admin/execute', '/api/triad/github/sync', '/api/triad/git/commit', '/api/triad/commit', '/API/GITHUB/ADMIN/EXECUTE']) {
    assert.equal(isGitHubWritePath(path), true, path);
  }
  assert.equal(isGitHubWritePath('/api/triad/message'), false);
  assert.equal(isGitHubWritePath('/api/github-malicious'), false);
  assert.equal(validGitHubWriteToken(TOKEN, `Bearer ${TOKEN}extra`), false);
});
test('write token requires explicit strong secret and constant-time equality', () => {
  assert.equal(validGitHubWriteToken(undefined, `Bearer ${TOKEN}`), false);
  assert.equal(validGitHubWriteToken('short', 'Bearer short'), false);
  assert.equal(validGitHubWriteToken(TOKEN, undefined), false);
  assert.equal(validGitHubWriteToken(TOKEN, 'Basic ' + TOKEN), false);
  assert.equal(validGitHubWriteToken(TOKEN, 'Bearer ' + TOKEN + 'suffix'), false);
  assert.equal(validGitHubWriteToken(TOKEN, `Bearer ${TOKEN}`), true);
});
test('mutation requests fail closed, while monitoring remains read-only', () => {
  const before = process.env.SVL_GITHUB_WRITE_TOKEN;
  try {
    delete process.env.SVL_GITHUB_WRITE_TOKEN;
    let nextCount = 0;
    let httpStatus = 200;
    let error;
    const res = {
      status(code) { httpStatus = code; return this; },
      set() { return this; },
      json(value) { error = value; return this; },
    };
    const req = (method, path, authorization) => ({ method, path, get: () => authorization });
    const next = () => { nextCount++; };
    requireGitHubWriteToken(req('POST', '/api/github/admin/execute'), res, next);
    assert.equal(httpStatus, 403);
    assert.equal(nextCount, 0);
    assert.equal(error.success, false);
    requireGitHubWriteToken(req('GET', '/api/github/status'), res, next);
    assert.equal(nextCount, 1);
    requireGitHubWriteToken(req('POST', '/api/triad/message'), res, next);
    assert.equal(nextCount, 2);
    process.env.SVL_GITHUB_WRITE_TOKEN = TOKEN;
    requireGitHubWriteToken(req('POST', '/api/triad/github/sync', `Bearer ${TOKEN}`), res, next);
    assert.equal(nextCount, 3);
  } finally {
    if (before === undefined) delete process.env.SVL_GITHUB_WRITE_TOKEN;
    else process.env.SVL_GITHUB_WRITE_TOKEN = before;
  }
});

test('GitHub sync status stays readable but mutations require the separate token', () => {
  const before = process.env.SVL_GITHUB_WRITE_TOKEN;
  try {
    delete process.env.SVL_GITHUB_WRITE_TOKEN;
    let nextCount = 0;
    let httpStatus = 200;
    const res = {
      status(code) { httpStatus = code; return this; },
      set() { return this; },
      json() { return this; },
    };
    const next = () => { nextCount++; };
    const request = (action) => ({ method: 'POST', path: '/api/github/sync', body: { action }, get: () => undefined });

    requireGitHubWriteToken(request('status'), res, next);
    assert.equal(nextCount, 1);
    requireGitHubWriteToken(request('push'), res, next);
    assert.equal(httpStatus, 403);
    assert.equal(nextCount, 1);
  } finally {
    if (before === undefined) delete process.env.SVL_GITHUB_WRITE_TOKEN;
    else process.env.SVL_GITHUB_WRITE_TOKEN = before;
  }
});
