/**
 * GITHUB ADMIN ENGINE — pełna administracyjna integracja GitHub API dla AI (Triada).
 *
 * Moduł udostępnia nazwany katalog operacji administracyjnych wykonywanych
 * przez REST API GitHuba (api.github.com) z tokenem PAT. Każda akcja ma
 * walidację parametrów i opis, dzięki czemu agenci AI mogą bezpiecznie
 * wydawać polecenia `/propose github <akcja>` z parametrami JSON.
 *
 * Token: GITHUB_TOKEN / GH_TOKEN z env albo pole `token` w .github_credentials.json.
 * Operacje destrukcyjne (delete-repo) wymagają jawnego potwierdzenia w parametrach.
 */

import fs from 'node:fs';
import path from 'node:path';

const GITHUB_API = 'https://api.github.com';
const CRED_PATH = path.resolve('.github_credentials.json');
const SAFE_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,99})$/;
const SAFE_REF = /^[^\s~^:?*\\[\]]{1,200}$/;

export interface GitHubAdminContext {
  owner: string;
  repo: string;
  request: (method: string, apiPath: string, body?: unknown) => Promise<GitHubApiResponse>;
}

export interface GitHubApiResponse {
  status: number;
  ok: boolean;
  data: any;
}

export interface GitHubAdminResult {
  message: string;
  data?: unknown;
}

interface GitHubAdminActionDef {
  description: string;
  destructive?: boolean;
  run: (ctx: GitHubAdminContext, params: Record<string, unknown>) => Promise<GitHubAdminResult>;
}

function str(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function requireStr(params: Record<string, unknown>, key: string): string {
  const value = str(params, key);
  if (!value) throw new Error(`Akcja wymaga parametru "${key}" (tekst).`);
  return value;
}

function num(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

function requireNum(params: Record<string, unknown>, key: string): number {
  const value = num(params, key);
  if (value === undefined) throw new Error(`Akcja wymaga parametru "${key}" (liczba).`);
  return value;
}

function bool(params: Record<string, unknown>, key: string): boolean | undefined {
  const value = params[key];
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function assertOk(response: GitHubApiResponse, operation: string): any {
  if (response.ok) return response.data;
  const apiMessage = response.data && typeof response.data === 'object' && typeof response.data.message === 'string'
    ? response.data.message
    : JSON.stringify(response.data ?? '');
  throw new Error(`${operation} nie powiodło się (HTTP ${response.status}): ${apiMessage}`);
}

function repoPath(ctx: GitHubAdminContext): string {
  return `/repos/${encodeURIComponent(ctx.owner)}/${encodeURIComponent(ctx.repo)}`;
}

export const GITHUB_ADMIN_ACTIONS: Record<string, GitHubAdminActionDef> = {
  'whoami': {
    description: 'Dane uwierzytelnionego użytkownika tokenu (GET /user).',
    run: async (ctx) => {
      const data = assertOk(await ctx.request('GET', '/user'), 'Pobranie profilu');
      return { message: `Token uwierzytelnia użytkownika ${data.login} (id ${data.id}).`, data };
    },
  },
  'rate-limit': {
    description: 'Aktualne limity zapytań GitHub API.',
    run: async (ctx) => {
      const data = assertOk(await ctx.request('GET', '/rate_limit'), 'Pobranie limitów');
      const core = data?.resources?.core;
      return { message: `Limit core: ${core?.remaining}/${core?.limit} (reset ${core?.reset}).`, data };
    },
  },
  'get-repo': {
    description: 'Szczegóły repozytorium (ustawienia, widoczność, domyślna gałąź).',
    run: async (ctx) => {
      const data = assertOk(await ctx.request('GET', repoPath(ctx)), 'Pobranie repozytorium');
      return { message: `Repozytorium ${data.full_name}: domyślna gałąź ${data.default_branch}, widoczność ${data.visibility}.`, data };
    },
  },
  'update-repo': {
    description: 'Zmiana ustawień repozytorium (description, homepage, private, has_issues, has_wiki, default_branch, allow_squash_merge…).',
    run: async (ctx, params) => {
      const body: Record<string, unknown> = {};
      for (const key of ['description', 'homepage', 'default_branch']) {
        const value = str(params, key);
        if (value !== undefined) body[key] = value;
      }
      for (const key of ['private', 'has_issues', 'has_projects', 'has_wiki', 'allow_squash_merge', 'allow_merge_commit', 'allow_rebase_merge', 'delete_branch_on_merge', 'archived']) {
        const value = bool(params, key);
        if (value !== undefined) body[key] = value;
      }
      if (Object.keys(body).length === 0) throw new Error('update-repo wymaga co najmniej jednego pola ustawień do zmiany.');
      const data = assertOk(await ctx.request('PATCH', repoPath(ctx), body), 'Aktualizacja repozytorium');
      return { message: `Zaktualizowano ustawienia ${data.full_name}: ${Object.keys(body).join(', ')}.`, data };
    },
  },
  'create-repo': {
    description: 'Utworzenie nowego repozytorium na koncie tokenu (name, opcjonalnie description, private, auto_init).',
    run: async (ctx, params) => {
      const name = requireStr(params, 'name');
      if (!SAFE_NAME.test(name)) throw new Error('Nieprawidłowa nazwa repozytorium.');
      const body: Record<string, unknown> = { name };
      const description = str(params, 'description');
      if (description) body.description = description;
      const isPrivate = bool(params, 'private');
      if (isPrivate !== undefined) body.private = isPrivate;
      const autoInit = bool(params, 'auto_init');
      if (autoInit !== undefined) body.auto_init = autoInit;
      const data = assertOk(await ctx.request('POST', '/user/repos', body), 'Utworzenie repozytorium');
      return { message: `Utworzono repozytorium ${data.full_name} (${data.html_url}).`, data };
    },
  },
  'delete-repo': {
    description: 'NIEODWRACALNE usunięcie repozytorium. Wymaga parametru confirm równego "owner/repo".',
    destructive: true,
    run: async (ctx, params) => {
      const expected = `${ctx.owner}/${ctx.repo}`;
      if (str(params, 'confirm') !== expected) {
        throw new Error(`delete-repo wymaga potwierdzenia: {"confirm":"${expected}"}.`);
      }
      assertOk(await ctx.request('DELETE', repoPath(ctx)), 'Usunięcie repozytorium');
      return { message: `Repozytorium ${expected} zostało trwale usunięte.` };
    },
  },
  'list-branches': {
    description: 'Lista gałęzi repozytorium.',
    run: async (ctx) => {
      const data = assertOk(await ctx.request('GET', `${repoPath(ctx)}/branches?per_page=100`), 'Lista gałęzi');
      const names = Array.isArray(data) ? data.map((b: any) => b.name) : [];
      return { message: `Gałęzie (${names.length}): ${names.join(', ')}`, data };
    },
  },
  'create-branch': {
    description: 'Utworzenie gałęzi (branch) z gałęzi bazowej (from, domyślnie domyślna gałąź repo).',
    run: async (ctx, params) => {
      const branch = requireStr(params, 'branch');
      if (!SAFE_REF.test(branch)) throw new Error('Nieprawidłowa nazwa gałęzi.');
      let from = str(params, 'from');
      if (!from) {
        const repoData = assertOk(await ctx.request('GET', repoPath(ctx)), 'Pobranie repozytorium');
        from = String(repoData.default_branch);
      }
      const baseRef = assertOk(
        await ctx.request('GET', `${repoPath(ctx)}/git/ref/heads/${encodeURIComponent(from)}`),
        `Pobranie gałęzi bazowej ${from}`,
      );
      const data = assertOk(
        await ctx.request('POST', `${repoPath(ctx)}/git/refs`, { ref: `refs/heads/${branch}`, sha: baseRef.object.sha }),
        'Utworzenie gałęzi',
      );
      return { message: `Utworzono gałąź ${branch} z ${from} (sha ${baseRef.object.sha.slice(0, 7)}).`, data };
    },
  },
  'delete-branch': {
    description: 'Usunięcie gałęzi (branch).',
    destructive: true,
    run: async (ctx, params) => {
      const branch = requireStr(params, 'branch');
      assertOk(await ctx.request('DELETE', `${repoPath(ctx)}/git/refs/heads/${encodeURIComponent(branch)}`), 'Usunięcie gałęzi');
      return { message: `Usunięto gałąź ${branch}.` };
    },
  },
  'protect-branch': {
    description: 'Włączenie ochrony gałęzi (wymagane PR review; opcjonalnie required_checks jako lista nazw).',
    run: async (ctx, params) => {
      const branch = requireStr(params, 'branch');
      const checks = Array.isArray(params.required_checks)
        ? params.required_checks.filter((c): c is string => typeof c === 'string')
        : [];
      const body = {
        required_status_checks: checks.length ? { strict: true, contexts: checks } : null,
        enforce_admins: bool(params, 'enforce_admins') ?? false,
        required_pull_request_reviews: { required_approving_review_count: num(params, 'required_reviews') ?? 1 },
        restrictions: null,
      };
      const data = assertOk(
        await ctx.request('PUT', `${repoPath(ctx)}/branches/${encodeURIComponent(branch)}/protection`, body),
        'Ochrona gałęzi',
      );
      return { message: `Włączono ochronę gałęzi ${branch}.`, data };
    },
  },
  'unprotect-branch': {
    description: 'Wyłączenie ochrony gałęzi.',
    destructive: true,
    run: async (ctx, params) => {
      const branch = requireStr(params, 'branch');
      assertOk(await ctx.request('DELETE', `${repoPath(ctx)}/branches/${encodeURIComponent(branch)}/protection`), 'Zdjęcie ochrony gałęzi');
      return { message: `Wyłączono ochronę gałęzi ${branch}.` };
    },
  },
  'list-issues': {
    description: 'Lista issues (state: open/closed/all, domyślnie open).',
    run: async (ctx, params) => {
      const state = str(params, 'state') ?? 'open';
      if (!['open', 'closed', 'all'].includes(state)) throw new Error('state musi być open, closed lub all.');
      const data = assertOk(await ctx.request('GET', `${repoPath(ctx)}/issues?state=${state}&per_page=50`), 'Lista issues');
      const issues = Array.isArray(data) ? data.filter((i: any) => !i.pull_request) : [];
      return {
        message: `Issues (${state}): ${issues.length}. ${issues.slice(0, 10).map((i: any) => `#${i.number} ${i.title}`).join(' | ')}`,
        data: issues,
      };
    },
  },
  'create-issue': {
    description: 'Utworzenie issue (title, opcjonalnie body, labels jako lista, assignees jako lista).',
    run: async (ctx, params) => {
      const body: Record<string, unknown> = { title: requireStr(params, 'title') };
      const text = str(params, 'body');
      if (text) body.body = text;
      if (Array.isArray(params.labels)) body.labels = params.labels.filter((l) => typeof l === 'string');
      if (Array.isArray(params.assignees)) body.assignees = params.assignees.filter((a) => typeof a === 'string');
      const data = assertOk(await ctx.request('POST', `${repoPath(ctx)}/issues`, body), 'Utworzenie issue');
      return { message: `Utworzono issue #${data.number}: ${data.title} (${data.html_url}).`, data };
    },
  },
  'update-issue': {
    description: 'Aktualizacja issue (number; opcjonalnie title, body, state: open/closed, labels).',
    run: async (ctx, params) => {
      const number = requireNum(params, 'number');
      const body: Record<string, unknown> = {};
      const title = str(params, 'title');
      if (title) body.title = title;
      const text = str(params, 'body');
      if (text) body.body = text;
      const state = str(params, 'state');
      if (state) {
        if (!['open', 'closed'].includes(state)) throw new Error('state musi być open lub closed.');
        body.state = state;
      }
      if (Array.isArray(params.labels)) body.labels = params.labels.filter((l) => typeof l === 'string');
      if (Object.keys(body).length === 0) throw new Error('update-issue wymaga co najmniej jednego pola do zmiany.');
      const data = assertOk(await ctx.request('PATCH', `${repoPath(ctx)}/issues/${number}`, body), 'Aktualizacja issue');
      return { message: `Zaktualizowano issue #${data.number} (${Object.keys(body).join(', ')}).`, data };
    },
  },
  'comment-issue': {
    description: 'Komentarz do issue lub pull requesta (number, body).',
    run: async (ctx, params) => {
      const number = requireNum(params, 'number');
      const data = assertOk(
        await ctx.request('POST', `${repoPath(ctx)}/issues/${number}/comments`, { body: requireStr(params, 'body') }),
        'Dodanie komentarza',
      );
      return { message: `Dodano komentarz do #${number} (${data.html_url}).`, data };
    },
  },
  'list-prs': {
    description: 'Lista pull requestów (state: open/closed/all, domyślnie open).',
    run: async (ctx, params) => {
      const state = str(params, 'state') ?? 'open';
      if (!['open', 'closed', 'all'].includes(state)) throw new Error('state musi być open, closed lub all.');
      const data = assertOk(await ctx.request('GET', `${repoPath(ctx)}/pulls?state=${state}&per_page=50`), 'Lista PR');
      const list = Array.isArray(data) ? data : [];
      return {
        message: `Pull requesty (${state}): ${list.length}. ${list.slice(0, 10).map((p: any) => `#${p.number} ${p.title}`).join(' | ')}`,
        data: list,
      };
    },
  },
  'create-pr': {
    description: 'Utworzenie pull requesta (title, head, base; opcjonalnie body, draft).',
    run: async (ctx, params) => {
      const body: Record<string, unknown> = {
        title: requireStr(params, 'title'),
        head: requireStr(params, 'head'),
        base: requireStr(params, 'base'),
      };
      const text = str(params, 'body');
      if (text) body.body = text;
      const draft = bool(params, 'draft');
      if (draft !== undefined) body.draft = draft;
      const data = assertOk(await ctx.request('POST', `${repoPath(ctx)}/pulls`, body), 'Utworzenie PR');
      return { message: `Utworzono PR #${data.number}: ${data.title} (${data.html_url}).`, data };
    },
  },
  'merge-pr': {
    description: 'Scalenie pull requesta (number; opcjonalnie merge_method: merge/squash/rebase).',
    run: async (ctx, params) => {
      const number = requireNum(params, 'number');
      const method = str(params, 'merge_method') ?? 'merge';
      if (!['merge', 'squash', 'rebase'].includes(method)) throw new Error('merge_method musi być merge, squash lub rebase.');
      const data = assertOk(
        await ctx.request('PUT', `${repoPath(ctx)}/pulls/${number}/merge`, { merge_method: method }),
        'Scalenie PR',
      );
      return { message: `Scalono PR #${number} metodą ${method} (sha ${String(data.sha || '').slice(0, 7)}).`, data };
    },
  },
  'close-pr': {
    description: 'Zamknięcie pull requesta bez scalania (number).',
    run: async (ctx, params) => {
      const number = requireNum(params, 'number');
      const data = assertOk(await ctx.request('PATCH', `${repoPath(ctx)}/pulls/${number}`, { state: 'closed' }), 'Zamknięcie PR');
      return { message: `Zamknięto PR #${data.number} bez scalania.`, data };
    },
  },
  'list-workflows': {
    description: 'Lista workflow GitHub Actions.',
    run: async (ctx) => {
      const data = assertOk(await ctx.request('GET', `${repoPath(ctx)}/actions/workflows?per_page=100`), 'Lista workflow');
      const flows = Array.isArray(data?.workflows) ? data.workflows : [];
      return {
        message: `Workflow (${flows.length}): ${flows.map((w: any) => `${w.name} [${w.path}, ${w.state}]`).join(' | ')}`,
        data: flows,
      };
    },
  },
  'dispatch-workflow': {
    description: 'Ręczne uruchomienie workflow (workflow jako nazwa pliku np. ci.yml lub id; opcjonalnie ref, inputs).',
    run: async (ctx, params) => {
      const workflow = requireStr(params, 'workflow');
      let ref = str(params, 'ref');
      if (!ref) {
        const repoData = assertOk(await ctx.request('GET', repoPath(ctx)), 'Pobranie repozytorium');
        ref = String(repoData.default_branch);
      }
      const body: Record<string, unknown> = { ref };
      if (params.inputs && typeof params.inputs === 'object') body.inputs = params.inputs;
      assertOk(
        await ctx.request('POST', `${repoPath(ctx)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, body),
        'Uruchomienie workflow',
      );
      return { message: `Uruchomiono workflow ${workflow} na ref ${ref}.` };
    },
  },
  'list-workflow-runs': {
    description: 'Ostatnie uruchomienia workflow (opcjonalnie workflow — plik lub id).',
    run: async (ctx, params) => {
      const workflow = str(params, 'workflow');
      const apiPath = workflow
        ? `${repoPath(ctx)}/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=20`
        : `${repoPath(ctx)}/actions/runs?per_page=20`;
      const data = assertOk(await ctx.request('GET', apiPath), 'Lista uruchomień workflow');
      const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
      return {
        message: `Uruchomienia (${runs.length}): ${runs.slice(0, 10).map((r: any) => `#${r.run_number} ${r.name} [${r.status}/${r.conclusion ?? '—'}]`).join(' | ')}`,
        data: runs,
      };
    },
  },
  'cancel-workflow-run': {
    description: 'Anulowanie uruchomienia workflow (run_id).',
    run: async (ctx, params) => {
      const runId = requireNum(params, 'run_id');
      assertOk(await ctx.request('POST', `${repoPath(ctx)}/actions/runs/${runId}/cancel`), 'Anulowanie uruchomienia');
      return { message: `Anulowano uruchomienie workflow ${runId}.` };
    },
  },
  'rerun-workflow-run': {
    description: 'Ponowne uruchomienie workflow (run_id).',
    run: async (ctx, params) => {
      const runId = requireNum(params, 'run_id');
      assertOk(await ctx.request('POST', `${repoPath(ctx)}/actions/runs/${runId}/rerun`), 'Ponowienie uruchomienia');
      return { message: `Ponowiono uruchomienie workflow ${runId}.` };
    },
  },
  'list-releases': {
    description: 'Lista wydań (releases).',
    run: async (ctx) => {
      const data = assertOk(await ctx.request('GET', `${repoPath(ctx)}/releases?per_page=30`), 'Lista wydań');
      const releases = Array.isArray(data) ? data : [];
      return {
        message: `Wydania (${releases.length}): ${releases.slice(0, 10).map((r: any) => r.tag_name).join(', ')}`,
        data: releases,
      };
    },
  },
  'create-release': {
    description: 'Utworzenie wydania (tag_name; opcjonalnie name, body, draft, prerelease, target).',
    run: async (ctx, params) => {
      const tag = requireStr(params, 'tag_name');
      if (!SAFE_REF.test(tag)) throw new Error('Nieprawidłowa nazwa tagu.');
      const body: Record<string, unknown> = { tag_name: tag };
      const name = str(params, 'name');
      if (name) body.name = name;
      const text = str(params, 'body');
      if (text) body.body = text;
      const target = str(params, 'target');
      if (target) body.target_commitish = target;
      const draft = bool(params, 'draft');
      if (draft !== undefined) body.draft = draft;
      const prerelease = bool(params, 'prerelease');
      if (prerelease !== undefined) body.prerelease = prerelease;
      const data = assertOk(await ctx.request('POST', `${repoPath(ctx)}/releases`, body), 'Utworzenie wydania');
      return { message: `Utworzono wydanie ${data.tag_name} (${data.html_url}).`, data };
    },
  },
  'list-collaborators': {
    description: 'Lista współpracowników repozytorium.',
    run: async (ctx) => {
      const data = assertOk(await ctx.request('GET', `${repoPath(ctx)}/collaborators?per_page=100`), 'Lista współpracowników');
      const users = Array.isArray(data) ? data : [];
      return {
        message: `Współpracownicy (${users.length}): ${users.map((u: any) => `${u.login} [${u.role_name ?? ''}]`).join(', ')}`,
        data: users,
      };
    },
  },
  'add-collaborator': {
    description: 'Dodanie współpracownika (username; opcjonalnie permission: pull/triage/push/maintain/admin).',
    run: async (ctx, params) => {
      const username = requireStr(params, 'username');
      if (!SAFE_NAME.test(username)) throw new Error('Nieprawidłowa nazwa użytkownika.');
      const permission = str(params, 'permission') ?? 'push';
      if (!['pull', 'triage', 'push', 'maintain', 'admin'].includes(permission)) {
        throw new Error('permission musi być jednym z: pull, triage, push, maintain, admin.');
      }
      assertOk(
        await ctx.request('PUT', `${repoPath(ctx)}/collaborators/${encodeURIComponent(username)}`, { permission }),
        'Dodanie współpracownika',
      );
      return { message: `Zaproszono/dodano ${username} z uprawnieniem ${permission}.` };
    },
  },
  'remove-collaborator': {
    description: 'Usunięcie współpracownika (username).',
    destructive: true,
    run: async (ctx, params) => {
      const username = requireStr(params, 'username');
      assertOk(await ctx.request('DELETE', `${repoPath(ctx)}/collaborators/${encodeURIComponent(username)}`), 'Usunięcie współpracownika');
      return { message: `Usunięto współpracownika ${username}.` };
    },
  },
  'list-webhooks': {
    description: 'Lista webhooków repozytorium.',
    run: async (ctx) => {
      const data = assertOk(await ctx.request('GET', `${repoPath(ctx)}/hooks?per_page=50`), 'Lista webhooków');
      const hooks = Array.isArray(data) ? data : [];
      return {
        message: `Webhooki (${hooks.length}): ${hooks.map((h: any) => `${h.id} → ${h.config?.url ?? '?'} [${(h.events || []).join(',')}]`).join(' | ')}`,
        data: hooks,
      };
    },
  },
  'create-webhook': {
    description: 'Utworzenie webhooka (url; opcjonalnie events jako lista, secret).',
    run: async (ctx, params) => {
      const url = requireStr(params, 'url');
      if (!/^https:\/\//i.test(url)) throw new Error('Webhook wymaga adresu https://.');
      const events = Array.isArray(params.events)
        ? params.events.filter((e): e is string => typeof e === 'string')
        : ['push'];
      const config: Record<string, unknown> = { url, content_type: 'json' };
      const secret = str(params, 'secret');
      if (secret) config.secret = secret;
      const data = assertOk(
        await ctx.request('POST', `${repoPath(ctx)}/hooks`, { name: 'web', active: true, events, config }),
        'Utworzenie webhooka',
      );
      return { message: `Utworzono webhook ${data.id} → ${url} (zdarzenia: ${events.join(', ')}).`, data };
    },
  },
  'delete-webhook': {
    description: 'Usunięcie webhooka (hook_id).',
    destructive: true,
    run: async (ctx, params) => {
      const hookId = requireNum(params, 'hook_id');
      assertOk(await ctx.request('DELETE', `${repoPath(ctx)}/hooks/${hookId}`), 'Usunięcie webhooka');
      return { message: `Usunięto webhook ${hookId}.` };
    },
  },
};

export const GITHUB_ADMIN_ACTION_NAMES = Object.keys(GITHUB_ADMIN_ACTIONS);
export const SAFE_GITHUB_ACTION_NAME = /^[a-z][a-z0-9-]{1,40}$/;

export function listGitHubAdminActions(): Array<{ action: string; description: string; destructive: boolean }> {
  return Object.entries(GITHUB_ADMIN_ACTIONS).map(([action, def]) => ({
    action,
    description: def.description,
    destructive: Boolean(def.destructive),
  }));
}

interface StoredCredentials {
  username?: string;
  repoName?: string;
  token?: string;
}

function loadStoredCredentials(): StoredCredentials {
  try {
    if (fs.existsSync(CRED_PATH)) {
      return JSON.parse(fs.readFileSync(CRED_PATH, 'utf-8')) as StoredCredentials;
    }
  } catch {}
  return {};
}

export function resolveGitHubAdminAuth(): { token?: string; owner?: string; repo?: string } {
  const stored = loadStoredCredentials();
  return {
    token: process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || stored.token?.trim() || undefined,
    owner: stored.username?.trim() || undefined,
    repo: stored.repoName?.trim() || undefined,
  };
}

const CODESPACES_SHARED_ENV = '/workspaces/.codespaces/shared/.env';

/**
 * Odczytuje GITHUB_TOKEN ze współdzielonego środowiska GitHub Codespaces.
 * Codespaces zapisuje repo-skopowany token w pliku shared/.env; procesy
 * uruchamiane poza terminalem VS Code nie mają go w env, przez co git push
 * (credential helper) i GitHub admin API zgłaszają brak uwierzytelnienia.
 */
export function readCodespacesSharedGitHubToken(filePath: string = CODESPACES_SHARED_ENV): string | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^GITHUB_TOKEN=("?)(.*)\1$/m);
    const token = match?.[2]?.trim();
    return token && token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Uzupełnia process.env.GITHUB_TOKEN tokenem Codespaces, jeśli żaden token
 * nie jest skonfigurowany. Dzięki temu procesy potomne (git push przez
 * credential helper) i GitHub admin API działają bez ręcznego eksportu.
 * Zwraca true, gdy token został załadowany z pliku Codespaces.
 */
export function ensureGitHubTokenFromCodespaces(filePath?: string): boolean {
  if (process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim()) return false;
  const token = readCodespacesSharedGitHubToken(filePath);
  if (!token) return false;
  process.env.GITHUB_TOKEN = token;
  return true;
}

export function createGitHubApiRequest(token: string): GitHubAdminContext['request'] {
  return async (method, apiPath, body) => {
    const response = await fetch(`${GITHUB_API}${apiPath}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'SVL-System-GitHub-Admin',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data: unknown = null;
    const text = await response.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    return { status: response.status, ok: response.ok, data };
  };
}

export async function executeGitHubAdminAction(
  actionName: string,
  params: Record<string, unknown>,
  overrides?: { owner?: string; repo?: string; request?: GitHubAdminContext['request'] },
): Promise<GitHubAdminResult> {
  const def = GITHUB_ADMIN_ACTIONS[actionName];
  if (!def) {
    throw new Error(`Nieznana akcja GitHub: ${actionName}. Dostępne: ${GITHUB_ADMIN_ACTION_NAMES.join(', ')}.`);
  }
  const auth = resolveGitHubAdminAuth();
  const owner = str(params, 'owner') ?? overrides?.owner ?? auth.owner;
  const repo = str(params, 'repo') ?? overrides?.repo ?? auth.repo;
  let request = overrides?.request;
  if (!request) {
    if (!auth.token) {
      throw new Error('Brak tokenu GitHub. Ustaw GITHUB_TOKEN/GH_TOKEN albo zapisz token PAT w panelu GitHub (plik .github_credentials.json).');
    }
    request = createGitHubApiRequest(auth.token);
  }
  if (!owner || !repo) {
    throw new Error('Brak kontekstu repozytorium. Podaj parametry owner i repo albo zapisz je w panelu GitHub.');
  }
  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(repo)) {
    throw new Error('Nieprawidłowy owner lub repo.');
  }
  return def.run({ owner, repo, request }, params);
}

export async function getGitHubAdminStatus(): Promise<{
  hasToken: boolean;
  owner?: string;
  repo?: string;
  authenticatedAs?: string;
  scopes?: string;
  error?: string;
}> {
  const auth = resolveGitHubAdminAuth();
  if (!auth.token) {
    return { hasToken: false, owner: auth.owner, repo: auth.repo, error: 'Brak tokenu GitHub (GITHUB_TOKEN/GH_TOKEN lub .github_credentials.json).' };
  }
  try {
    const response = await fetch(`${GITHUB_API}/user`, {
      headers: {
        'Authorization': `Bearer ${auth.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'SVL-System-GitHub-Admin',
      },
    });
    const data: any = await response.json().catch(() => null);
    if (!response.ok) {
      return { hasToken: true, owner: auth.owner, repo: auth.repo, error: `Token odrzucony (HTTP ${response.status}): ${data?.message ?? ''}` };
    }
    return {
      hasToken: true,
      owner: auth.owner,
      repo: auth.repo,
      authenticatedAs: data?.login,
      scopes: response.headers.get('x-oauth-scopes') ?? undefined,
    };
  } catch (err: any) {
    return { hasToken: true, owner: auth.owner, repo: auth.repo, error: `Błąd połączenia z GitHub API: ${err?.message ?? err}` };
  }
}
