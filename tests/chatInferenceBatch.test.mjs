import test from 'node:test';
import assert from 'node:assert/strict';
import { runChatInferenceBatch } from '../src/kernel/chatInferenceBatch.ts';

test('local Ollama requests are serial so a model is not overloaded', async () => {
  let active = 0;
  let maxActive = 0;
  const done = [];
  const jobs = ['Alex', 'Aria', 'Astyria', 'Aurelius'].map((agent) => async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    done.push(agent);
    return { agent };
  });
  const result = await runChatInferenceBatch(jobs, { sequential: true });
  assert.equal(maxActive, 1);
  assert.deepEqual(done, ['Alex', 'Aria', 'Astyria', 'Aurelius']);
  assert.equal(result.length, 4);
});

test('local Ollama stops retrying all agents after a failed request', async () => {
  const visited = [];
  const result = await runChatInferenceBatch(
    [0, 1, 2, 3].map((i) => async () => {
      visited.push(i);
      return { error: i === 0 ? 'Ollama offline' : undefined };
    }),
    { sequential: true, shouldStop: (value) => Boolean(value.error) },
  );
  assert.deepEqual(visited, [0]);
  assert.equal(result.length, 1);
});

test('cloud provider jobs can stay concurrent', async () => {
  let active = 0;
  let maxActive = 0;
  const jobs = [0, 1].map((n) => async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return n;
  });
  const results = await runChatInferenceBatch(jobs, { sequential: false });
  assert.deepEqual(results, [0, 1]);
  assert.equal(maxActive, 2);
});
