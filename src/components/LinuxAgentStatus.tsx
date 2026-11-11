import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';

type Agent = { name: string; login: string; uid: number | null; provisioned: boolean; sudoRuleConfigured: boolean };
type Tool = { name: string; present: boolean };
type Status = { success: boolean; platform: string; agents: Agent[]; tools: Tool[] };

export const LinuxAgentStatus: React.FC = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/agents/linux-accounts', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('success' in result)
        || result.success !== true || !('agents' in result) || !Array.isArray(result.agents)
        || !('tools' in result) || !Array.isArray(result.tools)) {
        throw new Error('Nieprawidłowa odpowiedź serwera');
      }
      setStatus(result as Status);
      setError('');
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof Error ? cause.message : 'Niezweryfikowano');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return <section className="rounded-xl border border-violet-400/20 bg-slate-900/60 p-3 text-xs">
    <div className="mb-2 flex items-center gap-2">
      <Users size={17} className="text-violet-300" />
      <h3 className="flex-1 font-semibold text-violet-100">Konta Linux i narzędzia agentów</h3>
      <button type="button" onClick={() => void refresh()} disabled={busy}
        aria-label="Odśwież konta Linux" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 disabled:opacity-50">
        <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
      </button>
    </div>
    <p className="mb-3 text-slate-400">Dane z prawdziwego hosta. Konto, reguła sudo i program na dysku nie oznaczają uruchomionego agenta.</p>
    {error && <p role="alert" className="mb-2 text-amber-300">Brak weryfikacji kont: {error}</p>}
    {status && <>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {status.agents.map(agent => <div key={agent.login} className="rounded-lg border border-slate-700 bg-slate-950/50 p-2.5">
          <strong>{agent.name}</strong>
          <p className="mt-1 font-mono text-[11px] text-slate-400">{agent.login}</p>
          <p className={agent.provisioned ? 'text-emerald-300' : 'text-amber-300'}>
            {agent.provisioned ? 'Konto: UID ' + agent.uid : 'Konto nieutworzone'}
          </p>
          <p className="text-slate-400">{agent.sudoRuleConfigured ? 'Wpis sudo skonfigurowany' : 'Brak dedykowanego wpisu sudo'}</p>
        </div>)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-slate-400">Programy wykryte na hoście ({status.platform}):</span>
        {status.tools.filter(tool => tool.present).map(tool => <span key={tool.name}
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[10px]">{tool.name}</span>)}
        {!status.tools.some(tool => tool.present) && <span className="text-slate-500">Brak potwierdzonych narzędzi</span>}
      </div>
    </>}
  </section>;
};
