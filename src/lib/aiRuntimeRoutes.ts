/** Actual multimodal services: Ollama Vision, OpenAI image API, persisted shared memory. */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SharedSystemMemory, isMemoryScope, type MemoryScope } from '../kernel/systemMemory';
import { resolveVisionModel } from '../kernel/visionModel';

const imageSizes = ['1024x1024', '1536x1024', '1024x1536'];
const imageMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];

function allowLocalOrToken(req: Request): boolean {
  const expected = (process.env.SVL_AI_ACCESS_TOKEN || '').trim();
  if (expected) {
    const got = (req.header('x-svl-ai-token') || req.header('authorization')?.replace(/^Bearer /i, '') || '').trim();
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    return a.length === b.length && a.length !== 0 && timingSafeEqual(a, b);
  }
  // Refuse anonymous access in production. A reverse proxy can connect over loopback
  // even when the end-user is remote: TCP remoteAddress alone must NEVER authorize them.
  if (process.env.NODE_ENV === 'production') return false;
  const host = (req.get('host') || '').toLowerCase();
  const hostIsLocal = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
  const directConnection = !req.header('forwarded') && !req.header('x-forwarded-for')
    && !req.header('x-real-ip');
  return hostIsLocal && directConnection
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');
}
function handleError(res: Response, error: unknown, provider: string) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error('[AI ' + provider + ']', reason.slice(0, 300));
  return res.status(502).json({ success: false, provider, error: 'Usługa nie odpowiedziała: ' + reason.slice(0, 240) });
}
function parseImage(body: any): { mimeType: string; bytes: Buffer } {
  const raw = body?.image;
  if (typeof raw !== 'string') throw new Error('Prześlij obraz base64 w polu image.');
  const dataUri = /^data:(image\/(?:png|jpeg|webp));base64,(.*)$/s.exec(raw);
  const mimeType = dataUri ? dataUri[1] : body?.mimeType;
  const encoded = dataUri ? dataUri[2] : raw;
  if (!imageMimeTypes.includes(mimeType)) throw new Error('Obsługiwane obrazy: JPG, PNG lub WEBP.');
  if (!encoded || encoded.length > 11_200_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('Nieprawidłowy obraz base64 lub przekroczony limit 8 MB.');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) throw new Error('Maksymalny rozmiar obrazu wynosi 8 MB.');
  const isJpeg = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!(mimeType === 'image/jpeg' && isJpeg || mimeType === 'image/png' && isPng || mimeType === 'image/webp' && isWebp)) {
    throw new Error('Rozszerzenie i rzeczywista zawartość obrazu nie są zgodne.');
  }
  return { mimeType, bytes };
}
function scopesFor(value: unknown): MemoryScope[] {
  if (value === 'all') return ['global', 'agent:Aria', 'agent:Alex', 'agent:Astyria', 'agent:Aurelius'];
  if (value === undefined || value === null || value === '') return ['global'];
  if (!isMemoryScope(value)) throw new Error('Nieprawidłowy zakres pamięci.');
  return [value];
}

/** Shared avatar registry on the host, outside the Git checkout. */
const AVATAR_IDS = new Set(['Operator', 'Alex', 'Astyria', 'Aurelius', 'si_1']);
const AVATAR_FILE = path.join(os.homedir(), '.bastillaos', 'avatars.json');
function readAvatarRegistry(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(AVATAR_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([id, value]) => AVATAR_IDS.has(id) && typeof value === 'string'
          && value.length <= 4_000_000 &&
          (/^https:\/\//.test(value) || /^data:image\/(?:png|jpeg|webp);base64,/.test(value)))
    ) as Record<string, string>;
  } catch { return {}; }
}
function writeAvatarRegistry(avatars: Record<string, string>) {
  const dir = path.dirname(AVATAR_FILE);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = AVATAR_FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(avatars), { mode: 0o600 });
  fs.renameSync(temp, AVATAR_FILE);
}
function validAvatarValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.startsWith('data:')) {
    const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || value.length > 4_000_000) return false;
    return Buffer.from(match[1], 'base64').length <= 3_000_000;
  }
  if (value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

export function createAiRuntimeRouter(memory: SharedSystemMemory): Router {
  // Instantiate after server.ts loads .env and .env.local.
  const visionModel = (process.env.OLLAMA_VISION_MODEL || 'auto').trim();
  const imageModel = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.6-sunburst').trim();
  const ollamaUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
  const router = Router();
  router.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!allowLocalOrToken(req)) {
      return res.status(403).json({ success: false, error: 'Dostęp lokalny lub poprawny SVL_AI_ACCESS_TOKEN jest wymagany.' });
    }
    next();
  });

  router.get('/avatars', (_req, res) =>
    res.json({ success: true, avatars: readAvatarRegistry() }));

  router.post('/avatars', (req, res) => {
    const { agent, image } = req.body ?? {};
    if (typeof agent !== 'string' || !AVATAR_IDS.has(agent) || !validAvatarValue(image)) {
      return res.status(400).json({ success: false, error: 'Wybierz znany profil i poprawny URL HTTPS lub obraz PNG/JPG/WEBP do 3 MB.' });
    }
    try {
      const avatars = readAvatarRegistry();
      avatars[agent] = image;
      writeAvatarRegistry(avatars);
      return res.json({ success: true, agent, saved: true });
    } catch (error) { return handleError(res, error, 'avatars'); }
  });

  router.delete('/avatars/:agent', (req, res) => {
    const agent = String(req.params.agent);
    if (!AVATAR_IDS.has(agent)) return res.status(400).json({ success: false, error: 'Nieznany profil.' });
    try {
      const avatars = readAvatarRegistry();
      delete avatars[agent];
      writeAvatarRegistry(avatars);
      return res.json({ success: true, agent, deleted: true });
    } catch (error) { return handleError(res, error, 'avatars'); }
  });

  router.get('/status', async (_req, res) => {
    try {
      const ollama = await resolveVisionModel({ baseUrl: ollamaUrl, requested: visionModel });
      const entries = await memory.count();
      res.json({
        success: true,
        vision: { provider: 'ollama', ...ollama, model: ollama.model || (visionModel === 'auto' ? 'Nie wykryto' : visionModel) },
        rendering: { provider: 'openai', model: imageModel, configured: Boolean(process.env.OPENAI_API_KEY?.trim()), verified: false },
        memory: { persistent: true, file: memory.filePath, entries, embeddingConfigured: memory.semanticEnabled },
      });
    } catch (error) {
      handleError(res, error, 'status');
    }
  });

  router.post('/vision/analyze', async (req, res) => {
    let parsed;
    try {
      parsed = parseImage(req.body);
    } catch (error) {
      return res.status(400).json({ success: false, error: (error as Error).message });
    }
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (prompt.length > 2000) return res.status(400).json({ success: false, error: 'Pytanie może mieć do 2000 znaków.' });
    try {
      const selection = await resolveVisionModel({ baseUrl: ollamaUrl, requested: visionModel });
      if (!selection.model || !selection.visionSupported) {
        return res.status(503).json({
          success: false, provider: 'ollama',
          error: selection.error || 'Nie znaleziono zainstalowanego modelu Vision.',
        });
      }
      const resolvedVisionModel = selection.model;
      const response = await fetch(ollamaUrl + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: resolvedVisionModel,
          stream: false,
          keep_alive: process.env.OLLAMA_KEEP_ALIVE || '24h',
          messages: [
            { role: 'system', content: 'Analyze the supplied image only. Describe what is actually visible, never invent observations. Answer in Polish.' },
            { role: 'user', content: prompt || 'Describe in detail what is in this image.', images: [parsed.bytes.toString('base64')] },
          ],
        }),
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok) {
        const failure = await response.text();
        return res.status(502).json({ success: false, provider: 'ollama', error: 'Ollama HTTP ' + response.status + ': ' + failure.slice(0, 300) });
      }
      const result: any = await response.json();
      if (typeof result?.message?.content !== 'string' || !result.message.content.trim()) throw new Error('Model nie zwrócił analizy obrazu.');
      return res.json({ success: true, provider: 'ollama', model: result.model || resolvedVisionModel, analysis: result.message.content.trim() });
    } catch (error) {
      return handleError(res, error, 'vision');
    }
  });

  router.post('/images/generate', async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const size = req.body?.size || '1024x1024';
    if (!prompt || prompt.length > 5000) return res.status(400).json({ success: false, error: 'Prompt musi zawierać od 1 do 5000 znaków.' });
    if (!imageSizes.includes(size)) return res.status(400).json({ success: false, error: 'Nieobsługiwany rozmiar obrazu.' });
    const apiKey = (process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) return res.status(503).json({ success: false, provider: 'openai', error: 'Brak OPENAI_API_KEY na serwerze.' });
    if (!/^gpt-image-[a-z0-9.-]+$/.test(imageModel)) {
      return res.status(503).json({ success: false, error: 'Wycofany albo nieobsługiwany model. Ustaw OPENAI_IMAGE_MODEL na obsługiwany GPT Image.' });
    }
    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model: imageModel, prompt, n: 1, size, output_format: 'png' }),
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok) {
        const body: any = await response.json().catch(() => null);
        return res.status(502).json({ success: false, provider: 'openai', error: 'OpenAI HTTP ' + response.status + ': ' + String(body?.error?.message || 'Generowanie odrzucone').slice(0, 250) });
      }
      const result: any = await response.json();
      const data = result?.data?.[0]?.b64_json;
      if (typeof data !== 'string' || !data) throw new Error('Brak obrazu w odpowiedzi API.');
      return res.json({ success: true, provider: 'openai', model: imageModel, mimeType: 'image/png', image: data });
    } catch (error) {
      return handleError(res, error, 'render');
    }
  });

  router.get('/memory', async (req, res) => {
    try {
      return res.json({ success: true, records: await memory.list(100, scopesFor(req.query.scope)) });
    } catch (error) {
      return res.status(400).json({ success: false, error: (error as Error).message });
    }
  });

  router.get('/memory/search', async (req, res) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      if (!query.trim()) return res.status(400).json({ success: false, error: 'Wpisz zapytanie.' });
      const records = await memory.search(query, scopesFor(req.query.scope), 20);
      return res.json({ success: true, records });
    } catch (error) {
      return res.status(400).json({ success: false, error: (error as Error).message });
    }
  });

  router.post('/memory', async (req, res) => {
    if (!req.body || typeof req.body.text !== 'string') return res.status(400).json({ success: false, error: 'Wymagany tekst pamięci.' });
    try {
      const record = await memory.add({ text: req.body.text, kind: req.body.kind, scope: req.body.scope, source: 'operator' });
      return res.status(201).json({ success: true, record });
    } catch (error) {
      return res.status(400).json({ success: false, error: (error as Error).message });
    }
  });

  router.delete('/memory/:id', async (req, res) => {
    try {
      const deleted = await memory.remove(String(req.params.id));
      return res.status(deleted ? 200 : 404).json({ success: deleted, deleted });
    } catch (error) {
      return handleError(res, error, 'memory');
    }
  });
  return router;
}
