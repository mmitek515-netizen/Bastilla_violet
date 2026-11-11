import React, { useState } from 'react';
import {
  Activity, Brain, ChevronDown, ChevronRight, Cpu, Database, FileCode2,
  FolderOpen, GitBranch, Github, HardDrive, Home, LayoutGrid, Menu,
  MessageSquare, Radio, Satellite, ShieldCheck, Sigma, Terminal, Clock, Layers
} from 'lucide-react';

export type TabId =
  | 'home' | 'comms' | 'ai_tools' | 'approvals' | 'process_matrix'
  | 'astyria_mission' | 'schema_graph' | 'temporal' | 'terminal'
  | 'monolith' | 'datastore' | 'diagnostics' | 'visualizer'
  | 'file_explorer' | 'apps' | 'hyper_com' | 'fleet' | 'without_nlp' | 'github';

export const TAB_IDS: readonly TabId[] = [
  'home', 'comms', 'ai_tools', 'approvals', 'process_matrix', 'astyria_mission',
  'schema_graph', 'temporal', 'terminal', 'monolith', 'datastore',
  'diagnostics', 'visualizer', 'file_explorer', 'apps', 'hyper_com',
  'fleet', 'without_nlp', 'github',
];

/** Keep deep links to every legacy module; use chat as the compact home screen. */
export function initialTabFromLocation(): TabId {
  try {
    const view = new URLSearchParams(window.location.search).get('view');
    return view && (TAB_IDS as readonly string[]).includes(view) ? view as TabId : 'comms';
  } catch { return 'comms'; }
}

interface NavigationProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  messageCount: number;
  versionCount: number;
}

type Entry = { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> };

const QUICK: Entry[] = [
  { id: 'comms', label: 'Czat', icon: MessageSquare },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'ai_tools', label: 'AI', icon: Brain },
];

const SECTIONS: { id: string; label: string; icon: React.ComponentType<{ className?: string }>; items: Entry[] }[] = [
  { id: 'system', label: 'System i jądro', icon: Cpu, items: [
    { id: 'home', label: 'Pulpit BastillaOS', icon: Home },
    { id: 'diagnostics', label: 'Diagnostyka', icon: Activity },
    { id: 'datastore', label: 'DATA_STORE', icon: Database },
    { id: 'monolith', label: 'Monolit Python', icon: FileCode2 },
    { id: 'without_nlp', label: 'Rdzeń matematyczny', icon: Sigma },
  ] },
  { id: 'agents', label: 'Agenci i pamięć', icon: Layers, items: [
    { id: 'process_matrix', label: 'Procesy i naprawy', icon: Cpu },
    { id: 'astyria_mission', label: 'Misje Astyrii', icon: GitBranch },
    { id: 'schema_graph', label: 'Mapa pamięci', icon: Brain },
    { id: 'temporal', label: 'Migawki i oś czasu', icon: Clock },
    { id: 'visualizer', label: 'Wizualizator agentów', icon: Sigma },
    { id: 'approvals', label: 'Decyzje i akceptacje', icon: ShieldCheck },
  ] },
  { id: 'workspace', label: 'Pliki i projekty', icon: FolderOpen, items: [
    { id: 'file_explorer', label: 'Eksplorator plików', icon: HardDrive },
    { id: 'apps', label: 'Studio aplikacji', icon: LayoutGrid },
    { id: 'github', label: 'GitHub i synchronizacja', icon: Github },
  ] },
  { id: 'fleet', label: 'Flota i łączność', icon: Satellite, items: [
    { id: 'fleet', label: 'Flota', icon: Satellite },
    { id: 'hyper_com', label: 'HyperCom', icon: Radio },
  ] },
];

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onSelectTab, messageCount }) => {
  const [showMore, setShowMore] = useState(false);
  // Mobile gesture on the bottom navigation only; never intercept chat scrolling.
  const touchStartX = React.useRef<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const isExtraActive = !QUICK.some(item => item.id === activeTab);
  const navigate = (tab: TabId) => {
    onSelectTab(tab);
    setShowMore(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', tab);
      window.history.replaceState(null, '', url);
    } catch { /* Navigation still works in restricted browser contexts. */ }
  };

  return (
    <nav aria-label="Nawigacja Bastilla OS" onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { if (touchStartX.current === null) return; const dx = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current; touchStartX.current = null; if (Math.abs(dx) < 75 || showMore) return; const idx = QUICK.findIndex(item => item.id === activeTab); if (dx < 0 && idx >= 0 && idx < QUICK.length - 1) navigate(QUICK[idx + 1].id); if (dx > 0 && idx > 0) navigate(QUICK[idx - 1].id); }} className="relative z-30 order-last flex h-[60px] w-full shrink-0 border-t border-violet-400/15 bg-[#080e1b] lg:order-first lg:h-auto lg:w-[205px] lg:flex-col lg:border-r lg:border-t-0">
      <div className="flex min-w-0 flex-1 items-center justify-around gap-1 px-1.5 lg:flex-col lg:items-stretch lg:justify-start lg:px-2 lg:py-3">
        {QUICK.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" title={label} aria-current={activeTab === id ? 'page' : undefined}
            onClick={() => navigate(id)}
            className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1.5 text-[10px] font-medium transition-colors lg:min-h-10 lg:w-full lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-xs ${activeTab === id ? 'border border-violet-400/30 bg-violet-500/15 text-violet-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}>
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
            {id === 'comms' && messageCount > 0 && <span className="hidden rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-300 xl:inline">{messageCount}</span>}
          </button>
        ))}
        <button type="button" aria-expanded={showMore} aria-controls="svl-more-menu" title="Pozostałe moduły"
          onClick={() => setShowMore(value => !value)}
          className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1.5 text-[10px] font-medium transition-colors lg:min-h-10 lg:w-full lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-xs ${showMore || isExtraActive ? 'border border-violet-400/30 bg-violet-500/15 text-violet-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}>
          <Menu className="h-4 w-4 shrink-0" />
          <span>Więcej</span>
          <ChevronDown className="hidden h-3.5 w-3.5 lg:ml-auto lg:block" />
        </button>
      </div>
      {showMore && (
        <div id="svl-more-menu" className="absolute bottom-full left-2 right-2 z-50 mb-2 max-h-[68dvh] overflow-y-auto rounded-xl border border-violet-400/25 bg-[#10192b] p-2 shadow-2xl shadow-black/70 lg:bottom-auto lg:left-full lg:right-auto lg:top-2 lg:mb-0 lg:ml-2 lg:w-[300px]" role="region" aria-label="Wszystkie kategorie modułów">
          <div className="mb-2 flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-violet-200">Wszystkie moduły</span>
            <button type="button" onClick={() => setShowMore(false)} className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white">Zamknij</button>
          </div>
          {SECTIONS.map(section => {
            const SIcon = section.icon;
            const open = expanded === section.id || (expanded === null && section.items.some(item => item.id === activeTab));
            return <section key={section.id} className="mb-1">
              <button type="button" aria-expanded={open}
                onClick={() => setExpanded(open ? '' : section.id)}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-slate-200 hover:bg-violet-500/10">
                <SIcon className="h-4 w-4 text-violet-300" />
                <span className="flex-1">{section.label}</span>
                {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {open && <div className="ml-3 border-l border-violet-400/20 pl-2">
                {section.items.map(item => {
                  const I = item.icon;
                  return <button key={item.id} type="button" onClick={() => navigate(item.id)}
                    aria-current={activeTab === item.id ? 'page' : undefined}
                    className={`my-0.5 flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[11px] ${activeTab === item.id ? 'bg-violet-500/20 text-violet-100' : 'text-slate-300 hover:bg-slate-800'}`}>
                    <I className="h-3.5 w-3.5 shrink-0" />
                    {item.label}
                  </button>;
                })}
              </div>}
            </section>;
          })}
        </div>
      )}
      <div className="hidden border-t border-violet-400/10 px-4 py-3 text-[10px] text-slate-600 lg:block">SVL_System · Bastilla OS</div>
    </nav>
  );
};
