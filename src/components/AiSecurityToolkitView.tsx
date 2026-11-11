import React, { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, ShieldCheck, Terminal } from 'lucide-react';

type Tool = {
  id: string; binary: string; debianPackage: string; category: string;
  upstream: string; installed: boolean;
};
type Check = { id: string; description: string; available: boolean };
type ToolkitStatus = {
  success: boolean; runtimeScope: string; platform: string; uid: number | null;
  protectedExecutionConfigured: boolean; tools: Tool[]; checks: Check[]; observedAt: string;
};
type CheckResult = {
  success: boolean; checkId: string; output: string; stderr: string; error?: string;
  exitCode?: number; timedOut?: boolean; durationMs?: number;
};

/** This panel always queries the real backend. It never fakes an install or scan. */
export const AiSecurityToolkitView: React.FC = () => {
  const [status, setStatus] = useState<ToolkitStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [token, setToken] = useState('');
  const [checkId, setCheckId] = useState('failed-services');
  const [result, setResult] = useState<CheckResult | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai/security/status', { cache: 'no-store' });
      const data: ToolkitStatus = await response.json();
      if (!response.ok || data.success !== true || !Array.isArray(data.tools)) {
        throw new Error('Brak rzeczywistego API narzędzi bezpieczeństwa.');
      }
      setStatus(data);
      setError('');
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof Error ? cause.message : 'Nie można odczytać narzędzi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onSync = () => void refresh();
    window.addEventListener('svl:global-sync', onSync);
    const interval = window.setInterval(onSync, 30000);
    return () => {
      window.removeEventListener('svl:global-sync', onSync);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const run = async () => {
    if (!token.trim() || !checkId) return;
    setRunning(true);
    setResult(null);
    setError('');
    try {
      const response = await fetch('/api/ai/security/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token.trim() },
        body: JSON.stringify({ checkId }),
      });
      const data: CheckResult = await response.json();
      setResult(data);
      if (!response.ok || !data.success) throw new Error(data.error || data.stderr || 'Diagnostyka nie powiodła się.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Błąd wykonania diagnostyki.');
    } finally {
      setRunning(false);
    }
  };

  const installed = status?.tools.filter((tool) => tool.installed).length ?? null;
  return (
    <section className="rounded-lg border border-violet-500/25 bg-slate-900/70 p-4 text-slate-100" aria-label="Narzędzia Linux dla AI">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={18} /> Kali-style · narzędzia Linux dla AI</h3>
          <p className="mt-1 text-xs text-slate-400">Otwarte narzędzia diagnostyczne oraz Maltego Graph (licencjonowany program OSINT). Bez mieszania repozytoriów Kali i Debiana.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}
          className="flex items-center gap-1 rounded border border-slate-700 px-3 py-2 text-xs disabled:opacity-40">
          <RefreshCw size={14} /> Odśwież
        </button>
      </header>

      <div className="mb-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <div className="rounded bg-slate-950 p-3"><p className="text-slate-400">Wykryte programy</p><p className="mt-1 text-lg font-semibold text-cyan-200">{installed === null ? '—' : installed + ' / ' + status?.tools.length}</p></div>
        <div className="rounded bg-slate-950 p-3"><p className="text-slate-400">Środowisko</p><p className="mt-1 font-mono">{status?.runtimeScope ?? 'Brak połączenia'}</p></div>
        <div className="rounded bg-slate-950 p-3"><p className="text-slate-400">Uprawnienia procesu</p><p className="mt-1">{status ? 'UID: ' + (status.uid ?? 'niedostępny') : 'Niezweryfikowane'}</p></div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-4">
        {(status?.tools ?? []).map((tool) => <div key={tool.id} className="min-w-0 rounded border border-slate-700 p-2">
          <div className="flex items-center justify-between gap-1">
            <a href={tool.upstream} target="_blank" rel="noopener noreferrer" className="truncate font-semibold text-cyan-300 underline">{tool.id}</a>
            <span className={tool.installed ? 'text-emerald-300' : 'text-slate-500'}>{tool.installed ? 'Wykryto' : 'Brak'}</span>
          </div>
          <p className="mt-1 truncate text-slate-500">{tool.debianPackage}</p>
        </div>)}
      </div>

      <div className="mt-3 rounded border border-violet-500/25 bg-slate-950/60 p-3 text-xs">
        <h4 className="font-semibold text-violet-200">Maltego Graph · analiza powiązań OSINT</h4>
        <p className="mt-1 text-slate-400">
          {status?.tools.find((tool) => tool.id === 'maltego')?.installed
            ? 'Wykryto plik wykonywalny Maltego w środowisku backendu. Aktywacja konta, pulpit graficzny i działanie transformacji nie są potwierdzone.'
            : 'Nie wykryto Maltego w środowisku backendu. Aplikację trzeba osobno zainstalować na Debianie 13 z działającym pulpitem KDE.'}
        </p>
        <p className="mt-2 text-slate-400">
          Pobierz oryginalny .deb ze strony{' '}
          <a href="https://www.maltego.com/downloads/" target="_blank" rel="noopener noreferrer"
            className="text-cyan-300 underline">Maltego Downloads</a>. Plan Basic jest darmowy, ale wymaga Maltego ID.
          Wykonaj w terminalu Debiana:
        </p>
        <code className="mt-2 block select-text overflow-x-auto rounded bg-black p-2 text-slate-200">
          sudo bash scripts/install-maltego-graph.sh --install /sciezka/do/Maltego.deb
        </code>
        <p className="mt-2 text-slate-500">Weryfikacja: bash scripts/install-maltego-graph.sh --verify. Uruchamiaj „maltego” jako zwykły użytkownik KDE, nie jako root. Program GUI nie jest wykonywany zdalnie przez backend.</p>
      </div>

      <div className="mt-4 rounded border border-slate-700 bg-slate-950/60 p-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold"><Terminal size={16} /> Diagnostyka przez rzeczywisty Linux</h4>
        <p className="mt-1 text-xs text-slate-400">
          Wyłącznie jawne, odczytowe profile i wyłącznie środowisko backendu. Bez wykonywania dowolnych komend AI.
          Do uruchomienia wymagany jest token serwera SVL_SECURITY_TOOL_TOKEN.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select aria-label="Profil diagnostyczny" value={checkId} onChange={(e) => setCheckId(e.target.value)}
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 p-2 text-xs">
            {(status?.checks ?? []).map((check) =>
              <option key={check.id} disabled={!check.available} value={check.id}>{check.description}{check.available ? '' : ' (brak programu)'}</option>
            )}
          </select>
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)}
            placeholder="Token operatora (tylko w pamięci)" aria-label="Token diagnostyki"
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 p-2 text-xs" />
          <button type="button" disabled={!token.trim() || running || !status?.checks.some((check) => check.id === checkId && check.available)}
            onClick={() => void run()} className="flex items-center justify-center gap-2 rounded bg-violet-700 px-4 py-2 text-xs font-semibold disabled:opacity-40">
            <Activity size={14}/>{running ? 'Uruchamiam…' : 'Uruchom diagnostykę'}
          </button>
        </div>
        {status && !status.protectedExecutionConfigured && <p className="mt-2 text-xs text-amber-300">Backend nie ma skonfigurowanego tokenu wykonania. Diagnostyka pozostaje zablokowana.</p>}
        {error && <p role="alert" className="mt-2 break-words text-xs text-rose-300">{error}</p>}
        {result && <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-black p-3 font-mono text-xs text-slate-200">{result.output || result.stderr || 'Brak wyjścia.'}</pre>}
      </div>
      <p className="mt-3 text-xs text-slate-500">Instalacja na rzeczywistym Debianie: sudo bash scripts/install-ai-security-toolkit.sh --install --forensics. Widok AI Studio bez hosta nie instaluje programów.</p>
    </section>
  );
};
