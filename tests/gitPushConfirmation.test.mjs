import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmGitPush } from '../src/kernel/gitPushConfirmation.ts';

test('HTTP success alone never proves GitHub synchronization', () => {
  const result = confirmGitPush(true, 200, { success: true, branch: 'main', sha: 'abc1234' });
  assert.equal(result.ok, false);
  assert.match(result.message, /pushed:true/);
});

test('a refused push must not be shown as successful', () => {
  assert.equal(confirmGitPush(true, 200, { success: true, pushed: false, branch: 'main' }).ok, false);
});

test('only a confirmed push to main is successful', () => {
  const result = confirmGitPush(true, 200, {
    success: true,
    pushed: true,
    branch: 'main',
    sha: 'abcdef1234567890',
  });
  assert.equal(result.ok, true);
  assert.match(result.message, /origin\/main/);
  assert.match(result.message, /abcdef1234567890/);
});

test('a push to another branch is never reported as main synchronization', () => {
  const result = confirmGitPush(true, 200, {
    success: true,
    pushed: true,
    branch: 'feature/old',
    sha: 'abcdef1234567890',
  });
  assert.equal(result.ok, false);
});

test('transport and backend errors remain visible', () => {
  assert.equal(confirmGitPush(false, 503, null).ok, false);
  const response = confirmGitPush(false, 500, { error: 'Git remote unavailable' });
  assert.equal(response.ok, false);
  assert.match(response.message, /Git remote unavailable/);
});
