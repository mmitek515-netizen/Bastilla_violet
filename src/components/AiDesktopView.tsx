import React, { useCallback, useEffect, useState } from 'react';
import { Monitor, RefreshCw, ExternalLink } from 'lucide-react';

type DesktopStatus = {
  success: boolean; source: string; scope: string; observedAt: string;
  display: string; displaySocket: boolean; vncTcp: boolean; webTcp: boolean;
  vncPort: number; webPort: number; readyForOperator: boolean;
  agentControlVerified: boolean; viewerUrl: string | null; message: string;
  tools: Array<{ id: string; installed: boolean }>;
};

export const AiDesktopView: React.FC = () => {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai/desktop/status', { cache: 'no-store' });
      const result: DesktopStatus = await response.json();
      if (!response.ok || result.success !== true) throw new Error('Brak rzeczywistego API pulpitu');
      setStatus(result);
      setError('');
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    const sync = () => void refresh();
    window.addEventListener('svl:global-sync', sync);
    return () => { window.clearInterval(interval); window.removeEventListener('svl:global-sync', sync); };
  }, [refresh]);

  return <section className="rounded-lg border border-cyan-500/30 bg-[#0b1629] p-4 text-slate-100">
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-cyan-200"><Monitor className="h-4 w-4"/> AI Desktop Nexus — rzeczywisty pulpit Linux</h3>
      <button onClick={() => void refresh()} disabled={loading} type="button"
        className="rounded border border-cyan-600/40 px-3 py-1.5 text-xs text-cyan-200 disabled:opacity-50"><RefreshCw className="mr-1 inline h-3.5 w-3.5"/>Odśwież</button>
    </div>
    <p className="mt-2 text-xs text-slate-400">Xvfb :99 + XFCE4 + x11vnc + noVNC. Stan odczytywany z backendu, bez fikcyjnych okien, root i działań agentów.</p>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      {[['Xvfb :99', status?.displaySocket], ['VNC (localhost)', status?.vncTcp],
        ['noVNC (localhost)', status?.webTcp], ['Sterowanie AI potwierdzone', status?.agentControlVerified]]
        .map(([label, ok]) => <div key={String(label)} className="rounded bg-slate-950 px-3 py-2">
          <p className="text-slate-400">{label}</p><p className={ok ? 'mt-1 text-emerald-300' : 'mt-1 text-amber-300'}>{status ? (ok ? 'TAK' : 'NIE') : '—'}</p>
        </div>)}
    </div>
    <p className="mt-2 text-xs text-slate-400">{status?.message ?? 'Brak odczytu.'}</p>
    <div className="mt-2 flex flex-wrap gap-2">
      {(status?.tools ?? []).map(t => <span key={t.id} className={'rounded border px-2 py-1 text-[10px] ' + (t.installed ? 'border-emerald-700/40 text-emerald-300' : 'border-slate-700 text-slate-500')}>{t.id} {t.installed ? '✓' : '—'}</span>)}
    </div>
    {status?.viewerUrl && status.readyForOperator
      ? <a href={status.viewerUrl} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded border border-cyan-500/50 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
          <ExternalLink size={14}/> Otwórz prywatny pulpit noVNC
        </a>
      : <p className="mt-3 text-xs text-amber-200">Podgląd pozostaje zablokowany do czasu potwierdzenia lokalnych usług i konfiguracji SVL_DESKTOP_VIEWER_URL (HTTPS).</p>}
    {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
    <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-[11px] text-slate-400">{'sudo bash scripts/install-ai-desktop.sh --install\nx11vnc -storepasswd ~/.vnc/passwd\nbash scripts/start-ai-desktop.sh'}</pre>
    <p className="mt-2 text-[11px] text-slate-500">Sesja jest dostępna lokalnie; nie wystawiaj VNC na publiczny port. Dostęp z telefonu wymaga prywatnego tunelu i hasła.</p>
  </section>;
};
