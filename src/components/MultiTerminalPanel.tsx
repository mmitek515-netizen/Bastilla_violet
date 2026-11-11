import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Code2,
  Cpu,
  Play,
  RefreshCw,
  ShieldAlert,
  Terminal as TerminalIcon,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import type { TerminalExecResponse, TerminalKind } from '../lib/types';

interface MultiTerminalPanelProps {
  onAriaConnected?: () => void;
}

const TERMINAL_DEFINITIONS: {
  id: TerminalKind;
  label: string;
  subtitle: string;
  quickCommands: string[];
}[] = [
  {
    id: 'bash',
    label: 'Linux Bash',
    subtitle: 'Rzeczywista powłoka /bin/bash z PTY + WebSocket i obsługą procesów',
    quickCommands: [
      'uname -a && cat /etc/os-release | head -n 4',
      'free -m && df -h /',
      'ps -ef',
      'ls -la',
    ],
  },
  {
    id: 'python',
    label: 'Python · SVL Core',
    subtitle: 'Natywny interpreter Python 3 z załadowanym SVLSystemKernel v5.6.0-QuantumWheel',
    quickCommands: [
      'print(kernel.generate_system_status_report())',
      'print("Compact Metric C:", TopologicalInfinityEngine(float("-inf"), float("inf")).calculate_metric_c())',
      'import sys, os; print(sys.version, "PID:", os.getpid())',
    ],
  },
  {
    id: 'codex',
    label: 'OpenAI Codex CLI',
    subtitle: 'Oficjalny @openai/codex CLI — logowanie kontem ChatGPT bez klucza API',
    quickCommands: [
      'codex --version',
      'codex login status',
      'codex login --device-auth',
      'codex --help',
    ],
  },
  {
    id: 'ai-nlp',
    label: 'Terminal AI (NLP)',
    subtitle: 'Polecenia języka naturalnego połączone z jądrem SVL, Ollamą i Gemini',
    quickCommands: [
      'podłącz moje ai aria',
      '/status',
      'Pokaż raport zasobów Linux, Ollama 14B Vision i Codex CLI',
    ],
  },
  {
    id: 'admin-sudo',
    label: 'Admin Sudo',
    subtitle: 'Terminal administracyjny z kontrolowanym sudo i dziennikiem audytu',
    quickCommands: [
      'id && whoami && uname -sr',
      'cat data/admin_audit.log 2>/dev/null || echo "Brak wcześniejszych wpisów audytu"',
      'ls -la debian13/system',
    ],
  },
];

export const MultiTerminalPanel: React.FC<MultiTerminalPanelProps> = ({ onAriaConnected }) => {
  const [activeTerminal, setActiveTerminal] = useState<TerminalKind>('bash');
  const [commandInput, setCommandInput] = useState('');
  const [running, setRunning] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [ptyPid, setPtyPid] = useState<number | null>(null);
  const [logsByTerminal, setLogsByTerminal] = useState<Record<TerminalKind, string[]>>({
    bash: ['[System] Gotowy terminal Linux Bash (/bin/bash). Wpisz polecenie lub użyj skrótu poniżej.'],
    python: [
      '[System] Interpreter Python 3 + SVLSystemKernel v5.6.0-QuantumWheel gotowy.',
      'Dostępne klasy: VisualScope, SVLProtectedVariable, TopologicalInfinityEngine, SVLSystemKernel, kernel.',
    ],
    codex: [
      '[System] Oficjalny OpenAI Codex CLI (@openai/codex) gotowy.',
      'Użyj "codex login --device-auth", aby zalogować się kontem ChatGPT bez klucza API.',
    ],
    'ai-nlp': [
      '[System] Terminal AI z poleceniami języka naturalnego.',
      'Wpisz "podłącz moje ai aria", aby wykonać jednorazowy raport SVL Core; nie uruchamia on workera Aria.',
    ],
    'admin-sudo': [
      '[System] Terminal administracyjny z kontrolowanym sudo i zapisem do data/admin_audit.log.',
    ],
  });

  const wsRef = useRef<WebSocket | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);

  const appendLog = useCallback((term: TerminalKind, text: string) => {
    setLogsByTerminal((prev) => ({
      ...prev,
      [term]: [...prev[term].slice(-120), text],
    }));
  }, []);

  // Connect live WebSocket PTY session
  useEffect(() => {
    if (activeTerminal === 'ai-nlp') {
      setWsConnected(true);
      setPtyPid(null);
      return;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsMode = activeTerminal === 'admin-sudo' ? 'admin' : activeTerminal;
    const wsUrl = `${proto}//${window.location.host}/ws/terminal?mode=${encodeURIComponent(wsMode)}`;
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.type === 'connected') {
            setPtyPid(typeof msg.pid === 'number' ? msg.pid : null);
          } else if (msg.type === 'output' && typeof msg.data === 'string') {
            const cleaned = msg.data.replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '').trimEnd();
            if (cleaned) {
              appendLog(activeTerminal, cleaned);
            }
          }
        } catch {
          // ignore non-json frame
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
      };
      socket.onerror = () => {
        setWsConnected(false);
      };
    } catch {
      setWsConnected(false);
    }

    return () => {
      try {
        socket?.close();
      } catch {}
      wsRef.current = null;
    };
  }, [activeTerminal, appendLog]);

  useEffect(() => {
    if (screenRef.current) {
      screenRef.current.scrollTop = screenRef.current.scrollHeight;
    }
  }, [logsByTerminal, activeTerminal]);

  const executeCommand = async (rawCmd?: string) => {
    const cmd = (rawCmd ?? commandInput).trim();
    if (!cmd || running) return;
    if (!rawCmd) setCommandInput('');
    setRunning(true);

    const promptPrefix =
      activeTerminal === 'python'
        ? '>>>'
        : activeTerminal === 'admin-sudo'
        ? 'root@bastilla-os:#'
        : activeTerminal === 'codex'
        ? 'codex>'
        : activeTerminal === 'ai-nlp'
        ? 'ai-nlp>'
        : 'operator@debian13:$';

    appendLog(activeTerminal, `\n${promptPrefix} ${cmd}`);

    try {
      const res: TerminalExecResponse = await api.execTerminal(activeTerminal, cmd);
      const outParts: string[] = [];
      if (res.stdout && res.stdout.trim()) outParts.push(res.stdout.trimEnd());
      if (res.stderr && res.stderr.trim()) outParts.push(`[stderr] ${res.stderr.trimEnd()}`);
      outParts.push(
        `[exit=${res.exitCode} · ${res.durationMs}ms · cwd=${res.cwd}${res.provider ? ' · ' + res.provider : ''}]`,
      );
      appendLog(activeTerminal, outParts.join('\n'));
      if (cmd.toLowerCase().includes('aria') && onAriaConnected) {
        onAriaConnected();
      }
    } catch (err: any) {
      appendLog(
        activeTerminal,
        `[Błąd wykonania]: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setRunning(false);
    }
  };

  const activeDef =
    TERMINAL_DEFINITIONS.find((d) => d.id === activeTerminal) || TERMINAL_DEFINITIONS[0];
  const currentLogs = logsByTerminal[activeTerminal] || [];

  return (
    <div>
      <div className="terminal-tabs" role="tablist" aria-label="Wybór terminala">
        {TERMINAL_DEFINITIONS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTerminal === t.id}
            className={`terminal-tab ${activeTerminal === t.id ? 'active' : ''}`}
            onClick={() => setActiveTerminal(t.id)}
          >
            {t.id === 'bash' && <TerminalIcon size={14} />}
            {t.id === 'python' && <Code2 size={14} />}
            {t.id === 'codex' && <Cpu size={14} />}
            {t.id === 'ai-nlp' && <Bot size={14} />}
            {t.id === 'admin-sudo' && <ShieldAlert size={14} />}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="detail-card" style={{ marginBottom: 10, padding: '10px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <strong style={{ fontSize: 12, color: '#ece6ff' }}>{activeDef.label}</strong>
            <p style={{ margin: '3px 0 0', fontSize: 11 }}>{activeDef.subtitle}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: wsConnected ? '#66d59f' : '#cbbde8' }}>
              {wsConnected
                ? `PTY WebSocket · ${ptyPid ? 'PID ' + ptyPid : 'AKTYWNY'}`
                : 'HTTP Exec Bridge'}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Wyczyść terminal"
              title="Wyczyść terminal"
              onClick={() =>
                setLogsByTerminal((prev) => ({
                  ...prev,
                  [activeTerminal]: [`[Wyczyszczono bufor terminala ${activeDef.label}]`],
                }))
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="quick-cmd-chips">
          {activeDef.quickCommands.map((q) => (
            <button key={q} type="button" onClick={() => void executeCommand(q)} disabled={running}>
              {q}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={screenRef}
        className="pty-screen"
        data-testid="terminal-output-screen"
        aria-live="polite"
      >
        {currentLogs.join('\n')}
      </div>

      <form
        className="pty-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          void executeCommand();
        }}
      >
        <input
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          placeholder={`Wpisz polecenie (${activeDef.label})…`}
          aria-label={`Polecenie dla ${activeDef.label}`}
          disabled={running}
        />
        <button type="submit" disabled={running || !commandInput.trim()}>
          {running ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={13} className="spin" /> Wykonywanie…
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Play size={13} /> Wykonaj
            </span>
          )}
        </button>
      </form>
    </div>
  );
};
