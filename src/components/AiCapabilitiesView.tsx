import React, { useCallback, useEffect, useState } from 'react';
import { Brain, ImagePlus, ScanEye, RefreshCw, Trash2 } from 'lucide-react';
import { LinuxAgentStatus } from './LinuxAgentStatus';
import { AiSecurityToolkitView } from './AiSecurityToolkitView';
import { AiDesktopView } from './AiDesktopView';

type Scope = 'global' | 'agent:Aria' | 'agent:Alex' | 'agent:Astyria' | 'agent:Aurelius';
type MemoryRecord = { id: string; text: string; kind: string; scope: Scope; source: string; createdAt: string };
type RuntimeStatus = {
  vision: { provider: string; model: string; reachable: boolean; modelInstalled: boolean; visionSupported: boolean; error?: string };
  rendering: { provider: string; model: string; configured: boolean; verified: boolean };
  memory: { persistent: boolean; entries: number; embeddingConfigured: boolean };
};
const scopeOptions: Scope[] = ['global', 'agent:Aria', 'agent:Alex', 'agent:Astyria', 'agent:Aurelius'];

export const AiCapabilitiesView: React.FC = () => {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [visionPrompt, setVisionPrompt] = useState('Co naprawdę widać na obrazie?');
  const [visionResult, setVisionResult] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageResult, setImageResult] = useState('');
  const [memoryText, setMemoryText] = useState('');
  const [memoryScope, setMemoryScope] = useState<Scope>('global');
  const [memoryQuery, setMemoryQuery] = useState('');
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const request = useCallback(async (route: string, init?: RequestInit) => {
    const response = await fetch('/api/ai/runtime' + route, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'x-svl-ai-token': token } : {}),
        ...init?.headers,
      },
    });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.error || 'Błąd API HTTP ' + response.status);
    return body;
  }, [token]);

  const refresh = useCallback(async () => {
    setError('');
    setBusy('status');
    try {
      const [s, m] = await Promise.all([request('/status'), request('/memory?scope=all')]);
      setStatus(s);
      setRecords(m.records);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie można odczytać stanu AI.');
      setStatus(null);
    } finally {
      setBusy('');
    }
  }, [request]);

  useEffect(() => {
    void refresh();
    const onSync = () => void refresh();
    window.addEventListener('svl:global-sync', onSync);
    return () => window.removeEventListener('svl:global-sync', onSync);
  }, [refresh]);

  const analyze = async () => {
    if (!file) { setError('Wybierz prawdziwy plik JPG, PNG albo WEBP.'); return; }
    setError(''); setNotice(''); setVisionResult(''); setBusy('vision');
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Plik przekracza limit 8 MB.');
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Nie można odczytać pliku.'));
        reader.readAsDataURL(file);
      });
      const result = await request('/vision/analyze', {
        method: 'POST', body: JSON.stringify({ image, prompt: visionPrompt }),
      });
      setVisionResult(result.analysis + '\n\nŹródło: ' + result.provider + ' / ' + result.model);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Analiza obrazu nie powiodła się.');
    } finally { setBusy(''); }
  };

  const generate = async () => {
    setError(''); setNotice(''); setImageResult(''); setBusy('image');
    try {
      const result = await request('/images/generate', {
        method: 'POST', body: JSON.stringify({ prompt: imagePrompt, size: '1024x1024' }),
      });
      setImageResult('data:' + result.mimeType + ';base64,' + result.image);
      setNotice('Obraz wygenerowany przez ' + result.provider + ' / ' + result.model);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Renderowanie nie powiodło się.');
    } finally { setBusy(''); }
  };

  const remember = async () => {
    setError(''); setNotice(''); setBusy('memory');
    try {
      await request('/memory', { method: 'POST', body: JSON.stringify({ text: memoryText, scope: memoryScope, kind: 'fact' }) });
      setMemoryText('');
      const result = await request('/memory?scope=all');
      setRecords(result.records);
      setNotice('Wpis rzeczywiście zapisany na dysku serwera.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Błąd zapisu pamięci.');
    } finally { setBusy(''); }
  };

  const search = async () => {
    setError(''); setBusy('search');
    try {
      const route = memoryQuery.trim()
        ? '/memory/search?scope=all&q=' + encodeURIComponent(memoryQuery.trim())
        : '/memory?scope=all';
      const result = await request(route);
      setRecords(result.records);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Błąd odczytu pamięci.');
    } finally { setBusy(''); }
  };

  const forget = async (id: string) => {
    setError(''); setBusy('delete');
    try {
      await request('/memory/' + encodeURIComponent(id), { method: 'DELETE' });
      setRecords((previous) => previous.filter((record) => record.id !== id));
      setNotice('Usunięto wybrany wpis z pamięci serwera.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie można usunąć wpisu.');
    } finally { setBusy(''); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-slate-950 p-4 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">SVL Real Vision · Render · Wspólna pamięć AI</h2>
          <p className="text-xs text-slate-400">Rzeczywiste wyniki z Ollamy, OpenAI i magazynu Linux. Bez trybu demonstracyjnego.</p>
        </div>
        <button onClick={() => void refresh()} disabled={!!busy} className="flex items-center gap-2 rounded bg-slate-700 px-3 py-2 text-xs hover:bg-slate-600">
          <RefreshCw size={15} /> Sprawdź stan
        </button>
      </header>
      <LinuxAgentStatus />
      <label className="flex max-w-lg flex-col gap-1 text-xs">
        Token dostępu do AI (tylko dla zdalnego serwera; nie jest zapisywany w przeglądarce)
        <input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)}
          placeholder="SVL_AI_ACCESS_TOKEN" className="rounded border border-slate-700 bg-slate-900 p-2" />
      </label>
      {error && <div role="alert" className="rounded border border-red-800 bg-red-950/50 p-3 text-sm text-red-200">{error}</div>}
      {notice && <div role="status" className="rounded border border-cyan-800 bg-cyan-950/40 p-3 text-xs text-cyan-200">{notice}</div>}
      {status && (
        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded border border-slate-700 p-3">
            <strong>Ollama Vision</strong><p>{status.vision.model}</p>
            <p>{status.vision.reachable && status.vision.modelInstalled && status.vision.visionSupported ? 'Zainstalowany model z potwierdzoną obsługą obrazów' : 'Brak potwierdzonego modelu Vision — sprawdź Ollama'}</p>
          </div>
          <div className="rounded border border-slate-700 p-3">
            <strong>Generowanie</strong><p>{status.rendering.model}</p>
            <p>{status.rendering.configured ? 'Klucz skonfigurowany; działanie sprawdź generowaniem' : 'Brak klucza OPENAI_API_KEY'}</p>
          </div>
          <div className="rounded border border-slate-700 p-3">
            <strong>Pamięć hosta</strong><p>{status.memory.entries} zapisanych wpisów</p>
            <p>{status.memory.embeddingConfigured ? 'Embeddings skonfigurowane (weryfikacja przy użyciu)' : 'Wyszukiwanie tekstowe; embeddings wyłączone'}</p>
          </div>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900/60 p-4">
          <h3 className="flex items-center gap-2 font-bold"><ScanEye size={18} /> Real Vision — analiza zdjęcia</h3>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} className="text-xs" />
          <textarea aria-label="Pytanie do modelu Vision" value={visionPrompt} onChange={(event) => setVisionPrompt(event.target.value)}
            rows={3} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" />
          <button onClick={() => void analyze()} disabled={!!busy || !file}
            className="rounded bg-cyan-800 px-3 py-2 text-sm disabled:opacity-50">Analizuj przez Ollamę</button>
          {visionResult && <pre className="whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs">{visionResult}</pre>}
        </section>
        <section className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900/60 p-4">
          <h3 className="flex items-center gap-2 font-bold"><ImagePlus size={18} /> Render — GPT Image</h3>
          <p className="text-xs text-slate-400">DALL·E 3 został wycofany. Tutaj działa aktualny OpenAI Images API z kluczem serwera.</p>
          <textarea aria-label="Prompt generowania grafiki" value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)}
            placeholder="Opisz obraz do wygenerowania..." rows={3} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" />
          <button onClick={() => void generate()} disabled={!!busy || !imagePrompt.trim()}
            className="rounded bg-cyan-800 px-3 py-2 text-sm disabled:opacity-50">Wygeneruj prawdziwy obraz</button>
          {imageResult && <div className="flex flex-col gap-2">
            <img src={imageResult} alt="Obraz wygenerowany przez rzeczywisty model OpenAI" className="max-h-[430px] w-full rounded object-contain" />
            <a href={imageResult} download="svl-ai-render.png" className="text-xs text-cyan-300 underline">Zapisz PNG</a>
          </div>}
        </section>
      </div>
      <section className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900/60 p-4">
        <h3 className="flex items-center gap-2 font-bold"><Brain size={18} /> Trwała pamięć wspólna agentów</h3>
        <p className="text-xs text-slate-400">Globalne wspomnienia widzą wszyscy agenci. Wspomnienia indywidualne są używane wyłącznie przez wskazanego agenta. Zapisy znajdują się na hoście, a nie w Git.</p>
        <div className="flex flex-wrap gap-2">
          <select value={memoryScope} onChange={(event) => setMemoryScope(event.target.value as Scope)}
            className="rounded border border-slate-700 bg-slate-950 p-2 text-xs" aria-label="Zakres pamięci">
            {scopeOptions.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
          </select>
          <button onClick={() => void remember()} disabled={!!busy || !memoryText.trim()}
            className="rounded bg-cyan-800 px-3 py-2 text-xs disabled:opacity-50">Zapisz do pamięci Linux</button>
        </div>
        <textarea value={memoryText} onChange={(event) => setMemoryText(event.target.value)}
          placeholder="Ważne informacje, ustalenia, zadania..." rows={3} maxLength={6000}
          className="rounded border border-slate-700 bg-slate-950 p-2 text-sm" />
        <div className="flex gap-2">
          <input value={memoryQuery} onChange={(event) => setMemoryQuery(event.target.value)}
            placeholder="Wyszukaj w pamięci..." className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 p-2 text-sm" />
          <button onClick={() => void search()} disabled={!!busy} className="rounded bg-slate-700 px-4 text-xs">Szukaj</button>
        </div>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {records.length === 0 && <p className="text-xs text-slate-500">Brak pasujących zapisów.</p>}
          {records.map((record) => <div key={record.id} className="flex gap-2 rounded border border-slate-700 p-2 text-xs">
            <div className="min-w-0 flex-1"><p className="text-cyan-300">{record.scope} · {record.kind} · {new Date(record.createdAt).toLocaleString('pl-PL')}</p>
              <p className="whitespace-pre-wrap break-words">{record.text}</p></div>
            <button title="Usuń ten wpis z serwera" aria-label="Usuń zapis pamięci" disabled={!!busy} onClick={() => void forget(record.id)}
              className="self-start rounded p-1 text-red-300 hover:bg-red-900/40"><Trash2 size={16} /></button>
          </div>)}
        </div>
      </section>
      <AiDesktopView />
      <AiSecurityToolkitView />
    </div>
  );
};
