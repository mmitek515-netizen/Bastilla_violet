import React from 'react';
import { Activity, Cpu, LayoutDashboard, Radio, RefreshCw, Satellite } from 'lucide-react';
import type { ServerHealth } from '../lib/types';
import { FleetView } from './FleetView';

export type SelectedModule = 'dashboard' | 'fleet' | 'system' | 'processes' | 'hypercom';

export const selectedModules: { id: SelectedModule; label: string; icon: typeof Activity }[] = [
  { id: 'dashboard', label: 'Pulpit', icon: LayoutDashboard },
  { id: 'fleet', label: 'Flota', icon: Satellite },
  { id: 'system', label: 'Diagnostyka', icon: Activity },
  { id: 'processes', label: 'Procesy i naprawy', icon: Cpu },
  { id: 'hypercom', label: 'HyperCom', icon: Radio },
];

type Props = {
  module: Exclude<SelectedModule, 'system'>;
  health?: ServerHealth | null;
  onSelect: (module: SelectedModule) => void;
  onRefresh: () => void;
  onRestart: () => void;
  restarting: boolean;
};

export function SelectedModules({ module, health, onSelect, onRefresh, onRestart, restarting }: Props) {
  if (module === 'fleet') return <FleetView />;
  if (module === 'hypercom') {
    return (
      <iframe
        className="hypercom-frame"
        title="HyperCom — lokalny rejestr transmisji"
        src="/api/apps/preview/hyper_com_module/index.html"
      />
    );
  }
  if (module === 'processes') {
    const daemon = health?.debian13;
    return (
      <section className="selected-module">
        <p>Stan procesu nadzorowanego przez backend. Nie są to procesy ani naprawy niezależnych agentów.</p>
        <div className="module-grid">
          <div className="module-tile">
            <strong>Debian Python API</strong>
            <span>{!daemon ? 'Brak odczytu' : daemon.daemonRunning ? 'Odpowiada' : 'Nie odpowiada'}</span>
            <small>PID: {daemon?.daemonPid ?? 'nieznany'} · port: {daemon?.daemonPort ?? '—'}</small>
          </div>
          <div className="module-tile">
            <strong>Samonaprawa</strong>
            <span>Niezweryfikowana</span>
            <small>Brak potwierdzonego niezależnego mechanizmu naprawy i rollbacku.</small>
          </div>
        </div>
        <div className="module-actions">
          <button type="button" className="subtle-button" onClick={onRefresh}>
            <RefreshCw size={15} /> Odśwież stan
          </button>
          <button type="button" className="subtle-button" onClick={onRestart} disabled={restarting || !daemon}>
            {restarting ? 'Restartowanie…' : 'Restartuj nadzorowany backend Debian'}
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className="selected-module">
      <p>Centrum wybranych modułów. Stany poniżej pochodzą z ostatniego odczytu backendu.</p>
      <div className="module-grid">
        <div className="module-tile">
          <strong>Backend</strong>
          <span>{health ? 'Odpowiedział' : 'Brak odczytu'}</span>
          <small>Odczyt: {health ? new Date(health.observedAt).toLocaleString('pl-PL') : '—'}</small>
        </div>
        <div className="module-tile">
          <strong>Ollama → Gemini</strong>
          <span>{!health ? 'Brak odczytu' : health.ollama.model || 'Brak wybranego modelu'}</span>
          <small>{!health ? '—' : health.geminiConfigured ? 'Gemini skonfigurowane' : 'Gemini nieskonfigurowane'}</small>
        </div>
      </div>
      <nav className="module-grid" aria-label="Wybrane moduły">
        {selectedModules.filter((item) => item.id !== 'dashboard').map(({ id, label, icon: Icon }) => (
          <button type="button" className="module-tile module-link" key={id} onClick={() => onSelect(id)}>
            <Icon size={20} /> <strong>{label}</strong><span>Otwórz moduł</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
