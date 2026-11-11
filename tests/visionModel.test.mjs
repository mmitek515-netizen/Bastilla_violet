import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVisionModel } from '../src/kernel/visionModel.ts';

function mockedOllama(models, capabilities = {}) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const uri = String(url);
    const model = init.body ? JSON.parse(init.body).model : '';
    requests.push({ uri, model });
    if (uri.endsWith('/api/tags')) {
      return new Response(JSON.stringify({ models: models.map(name => ({ name, size: name.includes('32b') ? 500 : 200 })) }), { status: 200 });
    }
    if (uri.endsWith('/api/show')) {
      return new Response(JSON.stringify({ capabilities: capabilities[model] || [] }), { status: 200 });
    }
    throw new Error('Unexpected URL ' + uri);
  };
  return { fetchImpl, requests };
}

test('auto chooses installed image-capable 14B uncensored without vision in its name', async () => {
  const preferred = 'my-uncensored:14b';
  const alt = 'llama3.2-vision:11b';
  const { fetchImpl, requests } = mockedOllama(
    ['some-text:32b', alt, preferred],
    { [alt]: ['vision'], [preferred]: ['completion', 'vision'] },
  );
  const result = await resolveVisionModel({ baseUrl: 'http://127.0.0.1:11434/', requested: 'auto', fetchImpl });
  assert.equal(result.model, preferred);
  assert.equal(result.reachable, true);
  assert.equal(result.visionSupported, true);
  assert.equal(result.modelInstalled, true);
  assert.ok(requests.some(({ uri }) => uri.endsWith('/api/show')));
  assert.ok(!preferred.toLowerCase().includes('vision'), 'model name must not imply image capability');
});

test('auto refuses text-only model even when filename contains 14b uncensored', async () => {
  const preferred = 'my-uncensored:14b';
  const actualVision = 'vision:11b';
  const { fetchImpl } = mockedOllama(
    [preferred, actualVision],
    { [preferred]: ['completion'], [actualVision]: ['vision'] },
  );
  const result = await resolveVisionModel({ baseUrl: 'http://127.0.0.1:11434', requested: 'auto', fetchImpl });
  assert.equal(result.model, actualVision);
  assert.equal(result.visionSupported, true);
});

test('explicit model tag must exist and report vision support', async () => {
  const { fetchImpl } = mockedOllama(['vision:14b'], { 'vision:14b': ['completion'] });
  const missing = await resolveVisionModel({ baseUrl: 'http://local:11434', requested: 'made-up:14b', fetchImpl });
  assert.equal(missing.model, null);
  assert.equal(missing.modelInstalled, false);
  const textOnly = await resolveVisionModel({ baseUrl: 'http://local:11434', requested: 'vision:14b', fetchImpl });
  assert.equal(textOnly.model, null);
  assert.equal(textOnly.modelInstalled, true);
  assert.equal(textOnly.visionSupported, false);
});

test('unreachable Ollama is not reported as installed or online', async () => {
  const result = await resolveVisionModel({
    baseUrl: 'http://127.0.0.1:11434', requested: 'auto',
    fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
  });
  assert.equal(result.reachable, false);
  assert.equal(result.model, null);
  assert.equal(result.modelInstalled, false);
  assert.match(result.error || '', /ECONNREFUSED/);
});
