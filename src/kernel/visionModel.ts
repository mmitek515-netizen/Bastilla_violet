/**
 * Pick an installed Ollama model capable of processing images. The model does NOT
 * need "vision", "vl", or any other keyword in its name. Prefer installed 14B
 * uncensored tags; verify actual image capability via Ollama /api/show.
 */
export interface VisionModelSelection {
  requested: string;
  model: string | null;
  reachable: boolean;
  modelInstalled: boolean;
  visionSupported: boolean;
  inspected: number;
  error?: string;
}

type ModelTag = { name?: string; model?: string; size?: number };
export interface VisionResolverOptions {
  baseUrl: string;
  requested?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}
const defaultTimeout = 7500;
function nameOf(tag: ModelTag): string {
  return String(tag.name || tag.model || '').trim();
}
function priority(tag: ModelTag): number {
  const name = nameOf(tag).toLowerCase();
  const fourteen = /(^|[^0-9])14b([^0-9]|$)|(^|[^0-9])14[-_ ]?b([^0-9]|$)/i.test(name);
  const uncensored = /uncensored|abliterat|unfiltered|dolphin/i.test(name);
  return (fourteen ? 100 : 0) + (uncensored ? 30 : 0);
}

export async function resolveVisionModel({
  baseUrl, requested = 'auto', fetchImpl = fetch, signal,
}: VisionResolverOptions): Promise<VisionModelSelection> {
  const preferred = requested.trim() || 'auto';
  const base = baseUrl.trim().replace(/\/+$/, '');
  const initial: VisionModelSelection = {
    requested: preferred, model: null, reachable: false,
    modelInstalled: false, visionSupported: false, inspected: 0,
  };
  let response: Response;
  try {
    response = await fetchImpl(base + '/api/tags', { signal: signal || AbortSignal.timeout(defaultTimeout) });
  } catch (error) {
    return { ...initial, error: 'Ollama nie odpowiada: ' + String(error instanceof Error ? error.message : error).slice(0,180) };
  }
  if (!response.ok) return { ...initial, error: 'Nie można pobrać modeli: HTTP ' + response.status };
  let models: ModelTag[];
  try {
    const data: any = await response.json();
    models = Array.isArray(data?.models) ? data.models : [];
  } catch {
    return { ...initial, reachable: true, error: 'Nieprawidłowa lista modeli Ollama.' };
  }
  const installed = models.filter(tag => nameOf(tag));
  const automatic = preferred.toLowerCase() === 'auto';
  const candidates = automatic
    ? [...installed].sort((a, b) => priority(b) - priority(a) || Number(b.size || 0) - Number(a.size || 0))
    : installed.filter(tag => nameOf(tag) === preferred);
  if (!candidates.length) {
    return {
      ...initial, reachable: true,
      error: automatic
        ? 'Brak pobranych modeli w Ollama. Nie instaluję nic automatycznie.'
        : 'Model "' + preferred + '" nie jest pobrany na tym hoście. Sprawdź ollama list.',
    };
  }
  let inspected = 0;
  let failureReason = '';
  // Bound discovery. Scanning labels is never sufficient to claim support for images.
  for (const candidate of candidates.slice(0, 30)) {
    const name = nameOf(candidate);
    inspected++;
    try {
      const show = await fetchImpl(base + '/api/show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name }),
        signal: signal || AbortSignal.timeout(defaultTimeout),
      });
      if (!show.ok) { failureReason = 'HTTP ' + show.status + ' (/api/show, ' + name + ')'; continue; }
      const body: any = await show.json();
      const capabilities = Array.isArray(body?.capabilities) ? body.capabilities : [];
      if (capabilities.includes('vision')) {
        return { ...initial, reachable: true, model: name, modelInstalled: true,
          visionSupported: true, inspected };
      }
      failureReason = 'Model ' + name + ' nie zgłasza capabilities: vision.';
    } catch (error) {
      failureReason = 'Nie można potwierdzić vision dla ' + name + ': ' +
        String(error instanceof Error ? error.message : error).slice(0,100);
    }
  }
  return { ...initial, reachable: true,
    modelInstalled: !automatic && candidates.length > 0, inspected,
    error: failureReason || 'Brak modelu z potwierdzoną obsługą obrazów. Sprawdź ollama show <tag>.',
  };
}
