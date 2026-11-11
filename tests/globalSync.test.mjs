import test from 'node:test';
import assert from 'node:assert/strict';
import { isKernelSnapshot, canApplyPolledState } from '../src/kernel/globalSync.ts';

test('global sync only accepts complete kernel snapshots', () => {
  const good = { store: { config: { sys_version: '9.1' }, chat_history: [], update_history: [] } };
  assert.equal(isKernelSnapshot(good), true);
  assert.equal(isKernelSnapshot(null), false);
  assert.equal(isKernelSnapshot({}), false);
  assert.equal(isKernelSnapshot({ store: { config: {}, chat_history: [] } }), false);
  assert.equal(isKernelSnapshot({ store: { config: {}, update_history: [] } }), false);
  assert.equal(isKernelSnapshot({ store: { config: [], chat_history: [], update_history: [] } }), false);
  assert.equal(isKernelSnapshot({ store: { config: {}, chat_history: [], update_history: 'bad' } }), false);
});

test('stale polls cannot overwrite a newer mutation or an active chat write', () => {
  assert.equal(canApplyPolledState(5, 5, false), true);
  assert.equal(canApplyPolledState(5, 6, false), false);
  assert.equal(canApplyPolledState(5, 5, true), false);
  assert.equal(canApplyPolledState(5, 6, true), false);
});
