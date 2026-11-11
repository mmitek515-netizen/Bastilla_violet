/**
 * Logika narzędzi MCP dla konektora ChatGPT (Deep Research).
 * Wyłącznie operacje READ-ONLY na API aplikacji SVL (http://127.0.0.1:3000).
 * Zależność od sieci jest wstrzykiwana (fetchImpl), aby umożliwić testy bez żywych usług.
 */
import { timingSafeEqual } from 'node:crypto';

export type FetchLike = (url: string, init?: Record<string, unknown>) => Promise<Response>;

export interface SvlApiClient {
  baseUrl: string;
  publicBase: string;
  getJson(path: string): Promise<unknown>;
}

export interface SearchResultItem {
  id: string;
  title: string;
  url: string;
}

export interface FetchedResource {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata: Record<string, unknown>;
}

export const DEFAULT_SVL_API_BASE = 'http://127.0.0.1:3000';
export const MAX_QUERY_LENGTH = 500;
export const MAX_RESOURCE_ID_LENGTH = 160;
export const MAX_TEXT_LENGTH = 48_000;
export const MAX_SEARCH_RESULTS = 20;

const RESOURCE_ID_PATTERN = /^[a-z][a-z0-9-]*:[A-Za-z0-9._-]+$/;

export function truncateText(text: string, max: number = MAX_TEXT_LENGTH): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[skrócono: ${text.length - max} znaków pominięto]`;
}

/** Porównanie tokenu bearer odporne na ataki czasowe. */
export function checkBearerAuth(authorizationHeader: string | undefined, expectedToken: string): boolean {
  if (!expectedToken || expectedToken.length < 16) return false;
  if (typeof authorizationHeader !== 'string') return false;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return false;
  const provided = Buffer.from(match[1].trim(), 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export function createSvlApiClient(
  baseUrl: string = DEFAULT_SVL_API_BASE,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  publicBase?: string,
): SvlApiClient {
  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const trimmedPublic = (publicBase ?? trimmedBase).replace(/\/+$/, '');
  return {
    baseUrl: trimmedBase,
    publicBase: trimmedPublic,
    async getJson(path: string): Promise<unknown> {
      if (!path.startsWith('/')) throw new Error(`Nieprawidłowa ścieżka API: ${path}`);
      const response = await fetchImpl(`${trimmedBase}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`SVL API ${path} → HTTP ${response.status}`);
      }
      return response.json();
    },
  };
}

interface IndexEntry {
  id: string;
  title: string;
  path: string;
  text: string;
}

const STATIC_ENTRIES: IndexEntry[] = [
  {
    id: 'status:ai',
    title: 'Status AI SVL — łańcuch modeli (Ollama, fallback)',
    path: '/api/ai/status',
    text: 'status ai ollama model gemma łańcuch modeli llm provider fallback triada hyperos stan jądra kernel',
  },
  {
    id: 'status:infrastructure',
    title: 'Status infrastruktury SVL — misja, auto-naprawa, logi',
    path: '/api/infrastructure/status',
    text: 'status infrastruktura infrastructure misja auto-repair naprawa logi system zdrowie healing alex astyria',
  },
  {
    id: 'status:github-admin',
    title: 'Status administratora GitHub w SVL',
    path: '/api/github/admin/status',
    text: 'status github admin token repozytorium integracja git',
  },
  {
    id: 'logs:infrastructure',
    title: 'Logi systemowe infrastruktury SVL',
    path: '/api/infrastructure/logs',
    text: 'logi logs systemowe zdarzenia infrastruktura historia dziennik',
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

async function listAppEntries(api: SvlApiClient): Promise<IndexEntry[]> {
  const payload = asRecord(await api.getJson('/api/apps/list'));
  const apps = Array.isArray(payload.apps) ? payload.apps : [];
  return apps
    .map((raw) => asRecord(raw))
    .filter((app) => typeof app.id === 'string' && app.id.length > 0)
    .map((app) => ({
      id: `app:${app.id}`,
      title: `Aplikacja SVL: ${typeof app.name === 'string' ? app.name : String(app.id)}`,
      path: `/api/apps/preview/${app.id}`,
      text: [app.id, app.name, app.description, app.type, app.author]
        .filter((v): v is string => typeof v === 'string')
        .join(' '),
    }));
}

async function buildSearchIndex(api: SvlApiClient): Promise<IndexEntry[]> {
  let appEntries: IndexEntry[] = [];
  try {
    appEntries = await listAppEntries(api);
  } catch {
    // Aplikacja SVL może być chwilowo niedostępna — indeks statusów nadal działa.
  }
  return [...STATIC_ENTRIES, ...appEntries];
}

export function validateQuery(query: unknown): string {
  if (typeof query !== 'string') throw new Error('Parametr "query" musi być tekstem.');
  const trimmed = query.trim();
  if (!trimmed) throw new Error('Parametr "query" nie może być pusty.');
  if (trimmed.length > MAX_QUERY_LENGTH) throw new Error(`Parametr "query" przekracza ${MAX_QUERY_LENGTH} znaków.`);
  return trimmed;
}

export function validateResourceId(id: unknown): string {
  if (typeof id !== 'string') throw new Error('Parametr "id" musi być tekstem.');
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > MAX_RESOURCE_ID_LENGTH || !RESOURCE_ID_PATTERN.test(trimmed)) {
    throw new Error(`Nieprawidłowy identyfikator zasobu: "${trimmed.slice(0, 64)}".`);
  }
  return trimmed;
}

export async function searchSvl(api: SvlApiClient, query: unknown): Promise<{ results: SearchResultItem[] }> {
  const normalized = validateQuery(query).toLowerCase();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const index = await buildSearchIndex(api);
  const scored = index
    .map((entry) => {
      const haystack = `${entry.id} ${entry.title} ${entry.text}`.toLowerCase();
      const score = tokens.reduce((acc, token) => (haystack.includes(token) ? acc + 1 : acc), 0);
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SEARCH_RESULTS);
  return {
    results: scored.map(({ entry }) => ({
      id: entry.id,
      title: entry.title,
      url: `${api.publicBase}${entry.path}`,
    })),
  };
}

export async function fetchSvlResource(api: SvlApiClient, id: unknown): Promise<FetchedResource> {
  const resourceId = validateResourceId(id);
  const [kind, ...rest] = resourceId.split(':');
  const key = rest.join(':');

  if (kind === 'app') {
    const payload = asRecord(await api.getJson('/api/apps/list'));
    const apps = Array.isArray(payload.apps) ? payload.apps.map((a) => asRecord(a)) : [];
    const app = apps.find((a) => a.id === key);
    if (!app) throw new Error(`Nie znaleziono aplikacji o id "${key}".`);
    return {
      id: resourceId,
      title: `Aplikacja SVL: ${typeof app.name === 'string' ? app.name : key}`,
      text: truncateText(JSON.stringify(app, null, 2)),
      url: `${api.publicBase}/api/apps/preview/${key}`,
      metadata: { source: 'svl-apps', type: typeof app.type === 'string' ? app.type : 'unknown' },
    };
  }

  const staticEntry = STATIC_ENTRIES.find((entry) => entry.id === resourceId);
  if (staticEntry) {
    const payload = await api.getJson(staticEntry.path);
    return {
      id: resourceId,
      title: staticEntry.title,
      text: truncateText(JSON.stringify(payload, null, 2)),
      url: `${api.publicBase}${staticEntry.path}`,
      metadata: { source: 'svl-api', path: staticEntry.path },
    };
  }

  throw new Error(`Nieznany zasób: "${resourceId}". Użyj najpierw narzędzia search.`);
}

export async function getSystemStatus(api: SvlApiClient): Promise<Record<string, unknown>> {
  const [ai, infrastructure] = await Promise.all([
    api.getJson('/api/ai/status').catch((error: unknown) => ({ error: String(error) })),
    api.getJson('/api/infrastructure/status').catch((error: unknown) => ({ error: String(error) })),
  ]);
  return { ai, infrastructure };
}

export async function listApps(api: SvlApiClient): Promise<unknown> {
  return api.getJson('/api/apps/list');
}

export async function getGithubAdminStatus(api: SvlApiClient): Promise<unknown> {
  return api.getJson('/api/github/admin/status');
}
