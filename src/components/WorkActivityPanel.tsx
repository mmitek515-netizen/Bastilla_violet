import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, PauseCircle, PlayCircle, RefreshCw } from 'lucide-react';

type Event = {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'healed';
  source: string;
  message: string;
  healingDetails?: string;
};
type Status = { continuousMissionEnabled: boolean; autoRepairEnabled: boolean; missionStatus?: string };
type Filter = 'all' | 'errors' | 'healed';

export const WorkActivityPanel: React.FC<{ chatBusy?: boolean; onClose?: () => void }> = ({ chatBusy, onClose }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState('');
  const [originalAgents, setOriginalAgents] = useState<{
    connection: string; agents: Array<{ name: string; state: string; sourceState?: string }>
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const [logsResponse, statusResponse, agentsResponse] = await Promise.all([
        fetch('/api/infrastructure/logs?filter=' + filter, { cache: 'no-store', signal }),
        fetch('/api/infrastructure/status', { cache: 'no-store', signal }),
        fetch('/api/original-agents/status', { cache: 'no-store', signal }),
      ]);
      if (!logsResponse.ok || !statusResponse.ok) {
        throw new Error('Błąd odpowiedzi backendu: HTTP ' + (!logsResponse.ok ? logsResponse.status : statusResponse.status));
      }
      const logs: unknown = await logsResponse.json();
      const runtime: unknown = await statusResponse.json();
      if (!logs || typeof logs !== 'object' || !('logs' in logs) || !Array.isArray(logs.logs)
        || !runtime || typeof runtime !== 'object' || !('continuousMissionEnabled' in runtime)
        || typeof runtime.continuousMissionEnabled !== 'boolean') {
        throw new Error('Backend nie zwrócił poprawnej telemetrii');
      }
      if (signal?.aborted) return;
      const entries = (logs.logs as unknown[]).filter((entry): entry is Event =>
        entry !== null && typeof entry === 'object' &&
        typeof (entry as Event).id === 'string' && typeof (entry as Event).message === 'string' &&
        ['info', 'warn', 'error', 'healed'].includes((entry as Event).level));
      if (agentsResponse.ok) {
        try {
          const original = await agentsResponse.json();
          if (original && ['connected', 'not_connected', 'blocked'].includes(original.connection) && Array.isArray(original.agents)) {
            setOriginalAgents(original);
          } else setOriginalAgents(null);
        } catch { setOriginalAgents(null); }
      } else setOriginalAgents(null);
      setEvents(entries.slice(0, 60));
      setStatus(runtime as Status);
      setError('');
      setLastSync(new Date().toLocaleTimeString('pl-PL'));
    } catch (cause) {
      if (signal?.aborted) return;
      setStatus(null);
      setError(cause instanceof Error ? cause.message : 'Brak połączenia z serwerem');
    }
  }, [filter]);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    const interval = window.setInterval(() => void reload(controller.signal), 4000);
    const focus = () => void reload(controller.signal);
    window.addEventListener('focus', focus);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener('focus', focus); };
  }, [reload]);

  const toggle = async () => {
    if (!status || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/mission/toggle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status.continuousMissionEnabled }),
      });
      if (!response.ok) throw new Error('Backend nie potwierdził zmiany trybu autonomicznego');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Błąd zmiany trybu');
    } finally { setBusy(false); }
  };

  return <aside aria-label="Work — rzeczywista aktywność agentów" className="flex min-h-0 w-full flex-col bg-[#0a1120] text-slate-100 lg:w-[335px]">
    <div className="shrink-0 border-b border-violet-400/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Activity size={16} className="text-violet-300"/><h2 className="font-semibold text-sm">Aktywność Work</h2></div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => void reload()} aria-label="Odśwież aktywność" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><RefreshCw size={15}/></button>
          {onClose && <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 lg:hidden">Czat</button>}
        </div>
      </div>
      <div className="mt-2 rounded-lg border border-slate-700 bg-[#0f1a2e] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-slate-200">Praca w tle</span>
          <span className={status?.continuousMissionEnabled ? 'text-emerald-300 text-[10px]' : 'text-slate-400 text-[10px]'}>
            {!status ? 'NIEZWERYFIKOWANO' : status.continuousMissionEnabled ? 'WŁĄCZONA' : 'WSTRZYMANA'}
          </span>
        </div>
        <div className="mt-2 rounded-lg border border-slate-700/70 bg-[#0f1a2e] p-2">
        <div className="flex items-center justify-between text-[11px] text-slate-300">
          <span>Oryginalni agenci</span>
          <strong className={originalAgents?.connection === 'connected' ? 'text-emerald-300' : 'text-amber-300'}>
            {originalAgents?.connection || 'NIEZWERYFIKOWANI'}
          </strong>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1 text-[10px] text-slate-400">
          {['Aria', 'Alex', 'Astyria', 'Aurelius'].map(name => {
            const worker = originalAgents?.agents.find(agent => agent.name === name);
            return <span key={name}>{name}: {worker?.sourceState === 'running' ? 'źródło aktywne' : worker?.state || 'brak danych'}</span>;
          })}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">Profil czatu nie jest dowodem uruchomienia workera.</p>
      </div>
      <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">{chatBusy ? 'Odpowiedź czatu w toku' : 'Stan z serwera, bez symulacji'}</span>
          <button type="button" onClick={() => void toggle()} disabled={!status || busy} className="flex min-h-9 items-center gap-1 rounded-lg border border-violet-400/30 bg-violet-500/15 px-2.5 text-[11px] text-violet-100 disabled:opacity-40">
            {status?.continuousMissionEnabled ? <PauseCircle size={14}/> : <PlayCircle size={14}/>}
            {status?.continuousMissionEnabled ? 'Wstrzymaj' : 'Uruchom'}
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-slate-500">Ostatni odczyt: {lastSync || '—'}</span>
        <select aria-label="Filtr aktywności" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="rounded-md border border-slate-700 bg-[#080f1d] p-1.5 text-[11px] text-slate-200">
          <option value="all">Wszystko</option><option value="errors">Błędy</option><option value="healed">Wykonane</option>
        </select>
      </div>
      {error && <p role="alert" className="mt-2 rounded-md border border-rose-800/50 bg-rose-950/30 p-2 text-[11px] text-rose-300">{error}</p>}
    </div>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      {events.length === 0 && <p className="rounded-lg border border-slate-800 p-3 text-xs text-slate-500">Brak zapisanych zdarzeń dla wybranego filtra.</p>}
      {events.map((event) => {
        const open = expanded === event.id;
        return <button key={event.id} type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : event.id)} className="w-full rounded-lg border border-slate-700/60 bg-[#111b2d] p-3 text-left hover:border-violet-400/30">
          <div className="flex items-center gap-2">
            {event.level === 'error' || event.level === 'warn' ? <AlertTriangle size={14} className="shrink-0 text-amber-300"/> : event.level === 'healed' ? <CheckCircle2 size={14} className="shrink-0 text-emerald-300"/> : <Clock3 size={14} className="shrink-0 text-violet-300"/>}
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-200">{event.source}</span>
            <span className="text-[10px] text-slate-500">{event.timestamp}</span>
          </div>
          <div className={`mt-2 break-words text-xs leading-relaxed ${open ? 'whitespace-pre-wrap text-slate-200' : 'line-clamp-2 text-slate-400'}`}>{event.message}</div>
          {open && event.healingDetails && <p className="mt-2 break-words whitespace-pre-wrap border-t border-slate-700 pt-2 text-xs text-emerald-200">{event.healingDetails}</p>}
        </button>;
      })}
    </div>
    <p className="shrink-0 border-t border-slate-800 p-2.5 text-[10px] text-slate-500">Rejestr logów serwera; nie jest symulacją postępu pracy AI.</p>
  </aside>;
};
