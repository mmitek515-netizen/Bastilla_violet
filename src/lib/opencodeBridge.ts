/**
 * BastillaOS -> OpenCode transport. OpenCode itself owns ChatGPT OAuth credentials.
 * Never return upstream credentials, tokens or arbitrary HTTP proxy responses to the browser.
 * API endpoints documented at https://opencode.ai/docs/server/
 */
import { Buffer } from 'node:buffer';

export interface OpenCodeState {
  configured: boolean;
  reachable: boolean;
  /** OpenAI provider is present. The API does not reveal whether login used OAuth or an API key. */
  openaiConnected: boolean;
  authMethod: 'unverified';
  defaultOpenAiModel: string | null;
  provider: 'openai';
  version: string | null;
  message: string;
  observedAt: string;
}

export type OpenCodeMessage = { content: string; sessionId: string };

export class OpenCodeBridge {
  private readonly base: string;
  private readonly username: string;
  private readonly password: string;
  readonly enabled: boolean;

  constructor(config: { baseUrl?: string; username?: string; password?: string; allowRemote?: boolean } = {}) {
    this.base = (config.baseUrl || 'http://127.0.0.1:4096').replace(/\/+$/, '');
    this.username = config.username || 'opencode';
    this.password = config.password || '';
    const url = new URL(this.base);
    const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
    if (!loopback && (url.protocol !== 'https:' || config.allowRemote !== true)) {
      throw new Error('Remote OpenCode requires HTTPS and OPENCODE_ALLOW_REMOTE=true. Prefer local loopback or private VPN.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('OPENCODE_BASE_URL must be the origin only, without credentials, path or query.');
    }
    this.enabled = true;
  }

  private async request(route: string, init: RequestInit = {}, timeoutMs = 6000): Promise<any> {
    const endpoint = new URL(route.replace(/^\//, ''), this.base + '/');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (init.body) headers['Content-Type'] = 'application/json';
    if (this.password) headers.Authorization = 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await fetch(endpoint, { ...init, headers, signal: controller.signal, cache: 'no-store' });
      if (!result.ok) throw new Error('OpenCode HTTP ' + result.status);
      if (result.status === 204) return null;
      const type = result.headers.get('content-type') || '';
      if (!type.includes('json')) throw new Error('OpenCode returned non-JSON response');
      return await result.json();
    } finally { clearTimeout(timer); }
  }

  async status(): Promise<OpenCodeState> {
    const current: OpenCodeState = { configured: this.enabled, reachable: false, openaiConnected: false, authMethod: 'unverified', defaultOpenAiModel: null, provider: 'openai', version: null,
      message: 'OpenCode jest niedostępny', observedAt: new Date().toISOString() };
    try {
      const health = await this.request('global/health');
      if (health?.healthy !== true) throw new Error('OpenCode did not confirm health');
      current.reachable = true;
      current.version = typeof health.version === 'string' ? health.version : null;
      try {
        const providers = await this.request('provider');
        current.openaiConnected = Array.isArray(providers?.connected) && providers.connected.includes('openai');
        if (current.openaiConnected) {
          const config = await this.request('config/providers');
          current.defaultOpenAiModel = typeof config?.default?.openai === 'string' ? config.default.openai : null;
        }
        current.message = current.openaiConnected
          ? current.defaultOpenAiModel
            ? 'OpenAI podłączone. Metoda logowania nie jest dostępna przez API; aby korzystać z ChatGPT Plus/Pro, użyj na hoście opencode auth login openai → Sign in with ChatGPT.'
            : 'OpenAI podłączone, ale nie wybrano modelu. W OpenCode wybierz model OpenAI przez /models.'
          : 'OpenCode działa, ale OpenAI nie jest połączone. Na hoście uruchom: opencode auth login openai';
      } catch {
        current.message = 'OpenCode działa, ale nie można zweryfikować logowania OpenAI.';
      }
    } catch (error) {
      current.message = error instanceof Error ? error.message : 'Błąd OpenCode';
    }
    return current;
  }

  async createSession(title: string): Promise<string> {
    const item = await this.request('session', { method: 'POST', body: JSON.stringify({ title: title.slice(0, 120) }) }, 15000);
    if (typeof item?.id !== 'string' || !/^[\w-]{1,160}$/.test(item.id)) throw new Error('OpenCode did not return a session ID');
    return item.id;
  }

  async send(sessionId: string, content: string, modelID: string): Promise<OpenCodeMessage> {
    if (!/^[\w-]{1,160}$/.test(sessionId)) throw new Error('Invalid OpenCode session ID');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(modelID)) throw new Error('OpenAI model must be selected explicitly in OpenCode');
    const response = await this.request('session/' + sessionId + '/message', {
      method: 'POST',
      body: JSON.stringify({ model: {providerID: 'openai', modelID}, parts: [{ type: 'text', text: content }] }),
    }, 180000);
    const parts = Array.isArray(response?.parts) ? response.parts : [];
    const text = parts.filter((p: any) => p && p.type === 'text' && typeof p.text === 'string').map((p: any) => p.text).join('\n').trim();
    if (!text) throw new Error('OpenCode did not return a text response. Inspect session in OpenCode for tool output.');
    return { content: text, sessionId };
  }
}
