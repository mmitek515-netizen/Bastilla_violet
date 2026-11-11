import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkBearerAuth,
  createSvlApiClient,
  fetchSvlResource,
  getSystemStatus,
  searchSvl,
  truncateText,
  validateQuery,
  validateResourceId,
  MAX_TEXT_LENGTH,
} from '../src/mcp/chatgptMcp.ts';

const TOKEN = 'a'.repeat(32);
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function router(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET' });
    for (const [pattern, respond] of routes) if (pattern.test(String(url))) return respond();
    throw new Error(`unexpected ${url}`);
  };
  return { impl, calls };
}

const appsPayload = {
  apps: [
    {
      id: 'without_nlp',
      name: 'Without NLP — silnik harmoniczny',
      type: 'html5-web',
      author: 'Astyria',
      description: 'Deterministyczna synteza harmoniczna Eulera i Fouriera.',
    },
    { id: 'demo_app', name: 'Demo', type: 'html5-web', description: 'Aplikacja demonstracyjna.' },
  ],
};

const defaultRoutes = () => [
  [/\/api\/apps\/list$/, () => json(200, appsPayload)],
  [/\/api\/ai\/status$/, () => json(200, { provider: 'Ollama (lokalnie)', model: 'gemma3:1b', enabled: true })],
  [/\/api\/infrastructure\/status$/, () => json(200, { repairStatus: 'ACTIVE', totalLogsCount: 3 })],
  [/\/api\/github\/admin\/status$/, () => json(200, { hasToken: false })],
];

test('checkBearerAuth: poprawny token przechodzi, błędne warianty odrzucane', () => {
  assert.equal(checkBearerAuth(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(checkBearerAuth(`bearer ${TOKEN}`, TOKEN), true, 'schemat bez rozróżniania wielkości liter');
  assert.equal(checkBearerAuth(undefined, TOKEN), false, 'brak nagłówka');
  assert.equal(checkBearerAuth('Bearer zly-token-zly-token-zly-token!', TOKEN), false, 'zły token');
  assert.equal(checkBearerAuth(TOKEN, TOKEN), false, 'brak prefiksu Bearer');
  assert.equal(checkBearerAuth(`Bearer ${TOKEN}`, ''), false, 'pusty oczekiwany token nigdy nie autoryzuje');
  assert.equal(checkBearerAuth('Bearer krotki', 'krotki'), false, 'zbyt krótki token serwera jest odrzucany');
});

test('walidacja wejść: query i id odrzucają złe dane', () => {
  assert.equal(validateQuery('  status ai  '), 'status ai');
  assert.throws(() => validateQuery(''), /pusty/);
  assert.throws(() => validateQuery(42), /tekstem/);
  assert.throws(() => validateQuery('x'.repeat(501)), /przekracza/);
  assert.equal(validateResourceId('app:without_nlp'), 'app:without_nlp');
  assert.throws(() => validateResourceId('../etc/passwd'), /Nieprawidłowy identyfikator/);
  assert.throws(() => validateResourceId('app:'), /Nieprawidłowy identyfikator/);
  assert.throws(() => validateResourceId(null), /tekstem/);
});

test('truncateText ogranicza rozmiar odpowiedzi', () => {
  assert.equal(truncateText('krótki tekst'), 'krótki tekst');
  const long = 'x'.repeat(MAX_TEXT_LENGTH + 500);
  const cut = truncateText(long);
  assert.ok(cut.length < long.length);
  assert.match(cut, /skrócono: 500 znaków/);
});

test('search zwraca wyniki id/title/url z realnych danych aplikacji', async () => {
  const { impl } = router(defaultRoutes());
  const api = createSvlApiClient('http://127.0.0.1:3000', impl, 'https://public.example');
  const out = await searchSvl(api, 'harmoniczny fourier');
  assert.ok(out.results.length >= 1);
  const hit = out.results.find((r) => r.id === 'app:without_nlp');
  assert.ok(hit, 'aplikacja without_nlp znaleziona po opisie');
  assert.equal(hit.title, 'Aplikacja SVL: Without NLP — silnik harmoniczny');
  assert.equal(hit.url, 'https://public.example/api/apps/preview/without_nlp');
  for (const r of out.results) {
    assert.equal(typeof r.id, 'string');
    assert.equal(typeof r.title, 'string');
    assert.match(r.url, /^https:\/\/public\.example\//);
  }
});

test('search znajduje statusy nawet gdy lista aplikacji nie odpowiada', async () => {
  const { impl } = router([[/\/api\/apps\/list$/, () => json(500, { error: 'down' })]]);
  const api = createSvlApiClient('http://127.0.0.1:3000', impl);
  const out = await searchSvl(api, 'infrastruktura logi');
  const ids = out.results.map((r) => r.id);
  assert.ok(ids.includes('status:infrastructure'));
  assert.ok(ids.includes('logs:infrastructure'));
});

test('fetch zwraca pełną treść aplikacji i statusu', async () => {
  const { impl } = router(defaultRoutes());
  const api = createSvlApiClient('http://127.0.0.1:3000', impl, 'https://public.example');
  const appDoc = await fetchSvlResource(api, 'app:without_nlp');
  assert.equal(appDoc.id, 'app:without_nlp');
  assert.match(appDoc.text, /Eulera i Fouriera/);
  assert.equal(appDoc.url, 'https://public.example/api/apps/preview/without_nlp');
  assert.equal(appDoc.metadata.source, 'svl-apps');

  const statusDoc = await fetchSvlResource(api, 'status:ai');
  assert.match(statusDoc.text, /gemma3:1b/);
  assert.equal(statusDoc.metadata.path, '/api/ai/status');

  await assert.rejects(() => fetchSvlResource(api, 'app:nie_ma_takiej'), /Nie znaleziono aplikacji/);
  await assert.rejects(() => fetchSvlResource(api, 'tajne:cos'), /Nieznany zasób/);
});

test('svl_system_status łączy status AI i infrastruktury oraz nie wybucha przy awarii', async () => {
  const { impl } = router(defaultRoutes());
  const api = createSvlApiClient('http://127.0.0.1:3000', impl);
  const status = await getSystemStatus(api);
  assert.equal(status.ai.model, 'gemma3:1b');
  assert.equal(status.infrastructure.repairStatus, 'ACTIVE');

  const broken = createSvlApiClient('http://127.0.0.1:3000', async () => {
    throw new TypeError('fetch failed');
  });
  const degraded = await getSystemStatus(broken);
  assert.match(String(degraded.ai.error), /fetch failed/);
  assert.match(String(degraded.infrastructure.error), /fetch failed/);
});
