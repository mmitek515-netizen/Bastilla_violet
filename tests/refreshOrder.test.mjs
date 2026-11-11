import assert from 'node:assert/strict';
import test from 'node:test';
import { createRefreshOrder } from '../src/lib/refreshOrder.ts';

test('older refresh responses cannot replace newer responses or a saved message', () => {
  const order = createRefreshOrder();
  const older = order.begin();
  const newer = order.begin();
  assert.equal(order.isCurrent(older), false);
  assert.equal(order.isCurrent(newer), true);

  const beforeMessage = order.begin();
  order.invalidate();
  assert.equal(order.isCurrent(beforeMessage), false);
  assert.equal(order.isCurrent(order.begin()), true);
});
