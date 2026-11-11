import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  BookOpen,
  CheckCircle2,
  Clipboard,
  Cpu,
  ExternalLink,
  GitBranch,
  HardDrive,
  ImagePlus,
  Layers3,
  LockKeyhole,
  Menu,
  MessageSquare,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  X,
} from 'lucide-react';
import { api, ApiFailure } from './lib/api';
import type {
  AgentName,
  Bootstrap,
  ChatAttachmentPayload,
  Session,
} from './lib/types';
import {
  BLOCK_DEMOS,
  RichBlock,
  RichContent,
  UI_GROUPS,
  UI_TYPES,
} from './components/RichBlocks';
import { MultiTerminalPanel } from './components/MultiTerminalPanel';
import './index.css';

const AGENTS: AgentName[] = ['Alex', 'Aria', 'Astyria', 'Aurelius'];

const WELCOME_SUGGESTIONS: { label: string; prompt: string }[] = [
  {
    label: 'Uruchom jednorazowy raport SVL Core',
    prompt: 'podłącz moje ai aria',
  },
  {
    label: 'Sprawdź rzeczywisty stan Debian 13, Ollama i Codex CLI',
    prompt: '/status',
  },
  {
    label: 'Pokaż interaktywny blok diagnostyczny svl-ui',
    prompt: 'Pokaż element diagnostic jako interaktywny blok svl-ui.',
  },
  {
    label: 'Otwórz 5 terminali PTY (Bash, Python, Codex CLI, AI, Sudo)',
    prompt: '__OPEN_TERMINALS__',
  },
];

function humanTime(value: string | null | undefined) {
  if (!value) return 'brak';
  const d = new Date(value);
  return Number.isFinite(d.valueOf())
    ? d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'brak';
}

function InitialAvatar({
  name,
  avatar,
  size = 34,
}: {
  name: string;
  avatar?: string;
  size?: number;
}) {
  return avatar ? (
    <img
      className="avatar"
      alt={name}
      src={avatar}
      width={size}
      height={size}
      referrerPolicy="no-referrer"
    />
  ) : (
    <span
      className={'avatar-text avatar-' + name.toLowerCase()}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.39)) }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function StatusDot({ online }: { online: boolean }) {
  return <span className={'presence ' + (online ? 'live' : 'idle')} />;
}

type PanelKind = 'none' | 'terminals' | 'system' | 'agents' | 'library' | 'github' | 'settings';

export function App() {
  const [snapshot, setSnapshot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [recipient, setRecipient] = useState<'Wszyscy' | AgentName>('Wszyscy');
  const [attachments, setAttachments] = useState<ChatAttachmentPayload[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [panel, setPanel] = useState<PanelKind>('none');
  const [drawer, setDrawer] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryType, setLibraryType] = useState<string>(UI_TYPES[0]);
  const [syncState, setSyncState] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [hostSnapshot, setHostSnapshot] = useState<any>(null);
  const [serviceFilter, setServiceFilter] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [avatarEdit, setAvatarEdit] = useState<string>('Operator');
  const [avatarValue, setAvatarValue] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loginToken, setLoginToken] = useState('');
  const [gitOutput, setGitOutput] = useState('');
  const [gitBusy, setGitBusy] = useState(false);
  const [codexAuthLoading, setCodexAuthLoading] = useState(false);

  const bottom = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const lastRevision = useRef(0);
  const lastUpdated = useRef(0);
  const textbox = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (silent = false) => {
    try {
      const payload = await api.bootstrap();
      lastUpdated.current = Date.now();
      lastRevision.current = payload.revision ?? lastRevision.current;
      setSnapshot(payload);
      setSyncState('online');
      setNeedsLogin(false);
      if (!silent) setError('');
      const firstActive = payload.sessions.find((s) => !s.archived)?.id || '';
      setSessionId((current) =>
        current && payload.sessions.some((s) => s.id === current) ? current : firstActive,
      );
    } catch (e) {
      setSyncState('offline');
      if (e instanceof ApiFailure && e.code === 401) setNeedsLogin(true);
      if (!silent) setError(e instanceof Error ? e.message : 'Backend jest niedostępny');
    }
  }, []);

  const refreshHost = useCallback(async () => {
    try {
      const status = await api.linuxStatus();
      setHostSnapshot(status);
    } catch {
      setHostSnapshot(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshHost();
    let source: EventSource | null = null;
    let retryTimer: number | undefined;

    const connect = () => {
      source?.close();
      setSyncState('connecting');
      source = new EventSource('/api/events');
      source.addEventListener('update', () => {
        void refresh(true);
        void refreshHost();
      });
      source.onopen = () => {
        setSyncState('online');
      };
      source.onerror = () => {
        setSyncState('offline');
        source?.close();
        retryTimer = window.setTimeout(connect, 4500);
      };
    };
    connect();

    const onFocus = () => {
      void refresh(true);
      void refreshHost();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(() => {
      if (Date.now() - lastUpdated.current > 22000) void refresh(true);
      void refreshHost();
    }, 25000);

    return () => {
      source?.close();
      if (retryTimer) clearTimeout(retryTimer);
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, refreshHost]);

  const submitLogin = async () => {
    try {
      await api.login(loginToken);
      setLoginToken('');
      setNeedsLogin(false);
      await refresh();
      await refreshHost();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zalogować.');
    }
  };

  const activeSession = snapshot?.sessions.find((s) => s.id === sessionId);
  const messages = useMemo(
    () => (snapshot?.messages || []).filter((m) => m.sessionId === sessionId),
    [snapshot, sessionId],
  );

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, sessionId]);

  const sendPromptText = async (promptValue: string) => {
    const value = promptValue.trim();
    if ((!value && attachments.length === 0) || busy || !sessionId) return;
    setBusy(true);
    setError('');
    const currentAttachments = [...attachments];
    setAttachments([]);
    try {
      await api.sendMessage(sessionId, value, recipient, currentAttachments);
      await refresh(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wysłać wiadomości.');
      await refresh(true);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if ((!value && attachments.length === 0) || busy || !sessionId) return;
    setText('');
    await sendPromptText(value);
  };

  const handleConnectAriaClick = async () => {
    setBusy(true);
    setError('');
    try {
      await api.connectAria();
      await refresh(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wykonać raportu SVL Core.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartCodexDeviceLogin = async () => {
    setCodexAuthLoading(true);
    setError('');
    try {
      await api.startCodexLogin();
      await refresh(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd logowania Codex CLI.');
    } finally {
      setCodexAuthLoading(false);
    }
  };

  const handleGitSync = async (action: 'status' | 'fetch' | 'pull' | 'push') => {
    setGitBusy(true);
    setError('');
    try {
      const res = await api.githubSync(action);
      setGitOutput(res.output || 'Operacja zakończona pomyślnie.');
      await refresh(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd synchronizacji GitHub.');
    } finally {
      setGitBusy(false);
    }
  };

  const startSession = async () => {
    try {
      const s = await api.createSession();
      await refresh(true);
      setSessionId(s.id);
      setDrawer(false);
      setPanel('none');
      setText('');
    } catch (e) {
      setError(String(e));
    }
  };

  const archiveSession = async (s: Session) => {
    try {
      await api.archiveSession(s.id);
      await refresh(true);
    } catch (e) {
      setError(String(e));
    }
  };

  const loadAvatar = async () => {
    try {
      await api.updateAvatar(avatarEdit, avatarValue.trim());
      await refresh(true);
      setError('');
    } catch (e) {
      setError(String(e));
    }
  };

  const onAvatarFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
      file.size > 390000
    ) {
      setError('Awatar musi być obrazem PNG/JPEG/WEBP/GIF do 390 KB.');
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Nie można odczytać pliku.'));
        reader.readAsDataURL(file);
      });
      await api.updateAvatar(avatarEdit, dataUrl);
      setAvatarValue(dataUrl);
      await refresh(true);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać awatara.');
    }
  };

  const onAttachChatFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
      file.size > 1800000
    ) {
      setError('Załącznik czatu musi być obrazem PNG/JPEG/WEBP/GIF do 1.8 MB.');
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Nie można odczytać obrazu.'));
        reader.readAsDataURL(file);
      });
      setAttachments((prev) => [
        ...prev.slice(-3),
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          dataUrl,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się dodać załącznika.');
    }
  };

  // Android / mobile touch gestures
  const onTouchStart = (e: React.TouchEvent) => {
    if ((e.target as Element).closest('input,textarea,button,select')) return;
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const p = touchStart.current;
    touchStart.current = null;
    if (!p || window.innerWidth > 740) return;
    const dx = e.changedTouches[0].clientX - p.x;
    const dy = e.changedTouches[0].clientY - p.y;
    if (Math.abs(dx) > 68 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx > 0 && p.x < 75) setDrawer(true);
      if (dx < 0) {
        if (panel !== 'none') setPanel('none');
        else setDrawer(false);
      }
    }
  };

  const health = snapshot?.health;
  const codexStatus = health?.codexCli;
  const svlCore = health?.svlCore;
  const debian13 = health?.debian13;
  const github = health?.github;
  const activeSessions = (snapshot?.sessions || []).filter((s) => !s.archived);
  const archivedSessions = (snapshot?.sessions || []).filter((s) => s.archived);

  const filteredLibrary = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return Object.entries(UI_GROUPS)
      .map(([category, types]) => ({
        category,
        types: types.filter(
          (t) => !q || t.toLowerCase().includes(q) || category.toLowerCase().includes(q),
        ),
      }))
      .filter((x) => x.types.length > 0);
  }, [librarySearch]);

  const preview = BLOCK_DEMOS[libraryType] || {
    type: libraryType,
    title: libraryType,
    text: 'Element ' + libraryType,
  };

  const panelTitle =
    panel === 'terminals'
      ? 'Terminale PTY & WebSocket (5)'
      : panel === 'system'
      ? 'Debian 13 · Ollama · Codex CLI'
      : panel === 'agents'
      ? 'Agenci AI & SVL Core Kernel'
      : panel === 'library'
      ? 'Biblioteka elementów svl-ui'
      : panel === 'github'
      ? 'Synchronizacja GitHub (main) & Bezpieczeństwo'
      : 'Awatary i ustawienia';

  return (
    <div className="shell" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {needsLogin && (
        <div className="login-backdrop" role="dialog" aria-modal="true">
          <form
            className="login-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void submitLogin();
            }}
          >
            <div className="hero-symbol">
              <LockKeyhole size={28} />
            </div>
            <h2>Logowanie operatora Bastilla OS</h2>
            <p>
              Wprowadź 32+ znakowy sekret <code>SVL_OPERATOR_TOKEN</code> skonfigurowany po stronie
              backendu. Sesja utrzymywana jest w bezpiecznym pliku cookie HttpOnly.
            </p>
            <input
              type="password"
              value={loginToken}
              onChange={(e) => setLoginToken(e.target.value)}
              placeholder="SVL_OPERATOR_TOKEN (min. 32 znaki)"
              autoComplete="current-password"
            />
            <button type="submit" disabled={loginToken.trim().length < 32}>
              Odblokuj sesję operatora
            </button>
          </form>
        </div>
      )}

      {drawer && (
        <button
          className="mobile-shade"
          aria-label="Zamknij menu"
          onClick={() => setDrawer(false)}
        />
      )}

      <aside className={'sidebar ' + (drawer ? 'sidebar-open' : '')}>
        <div className="brand">
          <div className="brand-icon">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>
              BASTILLA <em>OS</em>
            </strong>
            <span>SVL_System · Debian 13 · {svlCore?.System || 'v5.6.0'}</span>
          </div>
          <button
            className="icon-button close-drawer"
            aria-label="Ukryj panel"
            onClick={() => setDrawer(false)}
          >
            <X size={18} />
          </button>
        </div>

        <button className="new-chat" onClick={() => void startSession()}>
          <Plus size={17} /> Nowa rozmowa <span>+</span>
        </button>

        <div className="sidebar-section">
          <span>HISTORIA ROZMÓW</span>
          {archivedSessions.length > 0 && (
            <button onClick={() => setArchiveOpen((v) => !v)}>
              {archiveOpen ? 'Aktywne' : `Archiwum (${archivedSessions.length})`}
            </button>
          )}
        </div>

        <nav className="conversation-list" aria-label="Lista rozmów">
          {(archiveOpen ? archivedSessions : activeSessions).map((s) => (
            <div
              key={s.id}
              className={'session ' + (s.id === sessionId ? 'active' : '')}
            >
              <button
                className="session-main"
                onClick={() => {
                  setSessionId(s.id);
                  setDrawer(false);
                }}
              >
                <MessageSquare size={15} />
                <span>{s.title}</span>
              </button>
              {!s.archived && (
                <button
                  className="session-archive"
                  title="Archiwizuj rozmowę"
                  aria-label={'Archiwizuj ' + s.title}
                  onClick={() => void archiveSession(s)}
                >
                  <Archive size={14} />
                </button>
              )}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            onClick={() => {
              setPanel('terminals');
              setDrawer(false);
            }}
          >
            <Terminal size={16} /> Terminale PTY
            <small>5 powłok</small>
          </button>
          <button
            onClick={() => {
              setPanel('agents');
              setDrawer(false);
            }}
          >
            <Users size={16} /> Agenci AI &amp; Aria
            <small>
              {health?.agents.filter((a) => a.connected).length ?? 0}/4 online
            </small>
          </button>
          <button
            onClick={() => {
              setPanel('system');
              setDrawer(false);
            }}
          >
            <Cpu size={16} /> Debian 13 · Ollama · Codex
            <small>{debian13?.daemonRunning ? 'API OK' : 'Sprawdź'}</small>
          </button>
          <button
            onClick={() => {
              setPanel('github');
              setDrawer(false);
            }}
          >
            <GitBranch size={16} /> GitHub &amp; Operator
            <small>{github?.commitSha || 'main'}</small>
          </button>
          <button
            onClick={() => {
              setPanel('library');
              setDrawer(false);
            }}
          >
            <BookOpen size={16} /> Biblioteka svl-ui
            <small>{UI_TYPES.length} typów</small>
          </button>
          <button
            onClick={() => {
              setPanel('settings');
              setDrawer(false);
            }}
          >
            <Settings size={16} /> Awatary i profil
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="user-dot">
            <InitialAvatar
              name="Operator"
              avatar={snapshot?.avatars?.Operator}
              size={34}
            />
            <div>
              <strong>{svlCore?.Operator || 'Mateusz Mitek'}</strong>
              <span>
                Metric C: {svlCore?.Compact_Metric_C ?? 2.5} ·{' '}
                {svlCore?.ariaConnected ? 'Aria AKTYWNA' : 'Tryb Operatora'}
              </span>
            </div>
          </div>
          <span className="build-tag">v5.6.0</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="top-left">
            <button
              className="icon-button sidebar-toggle"
              aria-label="Otwórz nawigację"
              onClick={() => setDrawer(true)}
            >
              <Menu size={19} />
            </button>
            <div className="page-title">
              <strong>BASTILLA OS · SVL_SYSTEM &amp; DEBIAN 13</strong>
              <span>
                {activeSession?.title || 'Konsola główna'} ·{' '}
                {svlCore?.ariaConnected
                  ? `Aria (PID ${svlCore.ariaPid}) · Metric C=${svlCore.Compact_Metric_C}`
                  : 'Worker Aria wymaga świeżego heartbeat'}
              </span>
            </div>
          </div>

          <div className="top-actions">
            <div className={'sync-badge ' + syncState}>
              <StatusDot online={syncState === 'online'} />
              <span>
                {syncState === 'online'
                  ? `Debian 13 API (${debian13?.daemonPort || 8765})`
                  : 'Łączenie…'}
              </span>
            </div>
            <button
              className="icon-button"
              title="Otwórz 5 terminali PTY (Bash, Python, Codex CLI, AI NLP, Sudo)"
              aria-label="Terminale PTY"
              onClick={() => setPanel(panel === 'terminals' ? 'none' : 'terminals')}
            >
              <Terminal size={18} />
            </button>
            <button
              className="icon-button"
              title="Stan systemu Debian 13, Ollama i Codex CLI"
              aria-label="Diagnostyka systemu"
              onClick={() => setPanel(panel === 'system' ? 'none' : 'system')}
            >
              <Activity size={18} />
            </button>
            <button
              className="icon-button"
              title="Synchronizacja GitHub (main)"
              aria-label="Synchronizacja GitHub"
              onClick={() => setPanel(panel === 'github' ? 'none' : 'github')}
            >
              <GitBranch size={18} />
            </button>
          </div>
        </header>

        {error && (
          <div className="error-strip" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button onClick={() => setError('')} aria-label="Zamknij komunikat błędu">
              <X size={15} />
            </button>
          </div>
        )}

        <div className="chat-scroll">
          <div className="chat-inner">
            {messages.length <= 1 && (
              <div className="welcome">
                <div className="hero-symbol">
                  <Sparkles size={38} />
                </div>
                <div className="eyebrow">SVL_SYSTEM · DEBIAN 13 TRIXIE · QUANTUM WHEEL</div>
                <h1>
                  Bastilla <span>OS</span>
                </h1>
                <p>
                  Zintegrowane środowisko <strong>SVL_System</strong> (<code>5.6.0-QuantumWheel</code>)
                  z backendem <strong>Debian 13 Python API</strong>, pięcioma terminalami PTY/WebSocket
                  (Bash, Python, oficjalny <strong>OpenAI Codex CLI</strong>, AI NLP, Admin Sudo),
                  diagnostyką <strong>Ollama 14B Vision</strong> oraz synchronizacją GitHub{' '}
                  <code>main</code>.
                </p>
                <div className="suggestions">
                  {WELCOME_SUGGESTIONS.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        if (item.prompt === '__OPEN_TERMINALS__') {
                          setPanel('terminals');
                        } else {
                          void sendPromptText(item.prompt);
                        }
                      }}
                    >
                      <Sparkles size={16} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="messages">
              {messages.map((m) => {
                const avatarKey = m.author.startsWith('Operator')
                  ? 'Operator'
                  : AGENTS.includes(m.author as AgentName)
                  ? m.author
                  : 'Aria';
                return (
                  <article key={m.id} className={'message-row role-' + m.role}>
                    <InitialAvatar
                      name={avatarKey}
                      avatar={snapshot?.avatars?.[avatarKey]}
                      size={36}
                    />
                    <div className="message-body">
                      <div className="message-meta">
                        <strong>{m.author}</strong>
                        <span>{humanTime(m.createdAt)}</span>
                        {m.provider && <small>{m.provider}</small>}
                      </div>
                      <RichContent
                        content={m.content}
                        onDraft={(p: string) => {
                          setText(p);
                          textbox.current?.focus();
                        }}
                      />
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="msg-attachments">
                          {m.attachments.map((att) => (
                            <img
                              key={att.id}
                              src={att.dataUrl}
                              alt={att.name}
                              referrerPolicy="no-referrer"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
              <div ref={bottom} />
            </div>
          </div>
        </div>

        <footer className="composer-shell">
          <form className="composer" onSubmit={(e) => void submit(e)}>
            <div className="composer-top">
              <select
                aria-label="Wybierz adresata wiadomości"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value as typeof recipient)}
              >
                <option value="Wszyscy">Wszyscy · Bastilla OS (Ollama / Gemini / SVL Kernel)</option>
                {AGENTS.map((a) => (
                  <option value={a} key={a}>
                    {a} ·{' '}
                    {a === 'Aria' && svlCore?.ariaConnected
                      ? 'SVL Core v5.6.0 AKTYWNA'
                      : 'kolejka agenta'}
                  </option>
                ))}
              </select>
              <span className="footer-real">
                {svlCore?.ariaConnected
                  ? `Aria ONLINE (Compact_Metric_C=${svlCore.Compact_Metric_C})`
                  : codexStatus?.installed
                  ? `${codexStatus.version} · Debian 13 API`
                  : 'SVL Kernel Ready'}
              </span>
            </div>

            {attachments.length > 0 && (
              <div className="attachment-strip">
                {attachments.map((att) => (
                  <span key={att.id} className="attachment-pill">
                    <img src={att.dataUrl} alt={att.name} referrerPolicy="no-referrer" />
                    <span>{att.name}</span>
                    <button
                      type="button"
                      aria-label={`Usuń załącznik ${att.name}`}
                      onClick={() =>
                        setAttachments((prev) => prev.filter((x) => x.id !== att.id))
                      }
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <textarea
              ref={textbox}
              rows={2}
              value={text}
              placeholder="Wpisz wiadomość lub polecenie (np. podłącz moje ai aria)…"
              aria-label="Wiadomość"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />

            <div className="compose-actions">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={(e) => void onAttachChatFile(e)}
                />
                <button
                  type="button"
                  title="Dodaj obraz do analizy Vision"
                  aria-label="Dodaj obraz Vision"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus size={18} />
                </button>
                <button
                  type="button"
                  title="Otwórz 5 terminali PTY (Bash, Python, Codex CLI, AI NLP, Sudo)"
                  aria-label="Otwórz terminale"
                  onClick={() => setPanel('terminals')}
                >
                  <Terminal size={18} />
                </button>
                <button
                  type="button"
                  title="Biblioteka elementów svl-ui"
                  aria-label="Biblioteka elementów"
                  onClick={() => setPanel('library')}
                >
                  <Layers3 size={18} />
                </button>
                <span className="small-caption">
                  Polecenie specjalne: <code>podłącz moje ai aria</code>
                </span>
              </div>
              <button
                className="send-button"
                type="submit"
                aria-label="Wyślij wiadomość"
                disabled={(!text.trim() && attachments.length === 0) || busy || !sessionId}
              >
                {busy ? 'Wysyłanie…' : <Send size={18} />}
              </button>
            </div>
          </form>
          <div className="disclaimer">
            Bastilla OS · SVLSystemKernel v5.6.0-QuantumWheel · Debian 13 Python API · Terminale PTY +
            WebSocket · Oficjalny OpenAI Codex CLI
          </div>
        </footer>
      </main>

      {panel !== 'none' && (
        <>
          <button
            className="panel-shade"
            aria-label="Zamknij tło panelu"
            onClick={() => setPanel('none')}
          />
          <aside
            className={
              'detail-panel ' + (panel === 'terminals' ? 'terminal-drawer' : '')
            }
          >
            <div className="detail-head">
              <div>
                <small>CENTRUM STEROWANIA BASTILLA OS</small>
                <h2>{panelTitle}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Zamknij panel"
                onClick={() => setPanel('none')}
              >
                <X size={19} />
              </button>
            </div>

            <div className="detail-content">
              {panel === 'terminals' && (
                <MultiTerminalPanel onAriaConnected={() => void refresh(true)} />
              )}

              {panel === 'system' && (
                <>
                  <div className="detail-card">
                    <div className="info-title">
                      <Server size={17} /> Backend Debian 13 &amp; Linux Runtime{' '}
                      <StatusDot online={Boolean(debian13?.daemonRunning)} />
                    </div>
                    <div className="metric-grid">
                      <div>
                        <small>Demon Debian 13 API</small>
                        <strong>
                          {debian13?.daemonRunning
                            ? `ONLINE (PID ${debian13.daemonPid})`
                            : 'OFFLINE'}
                        </strong>
                      </div>
                      <div>
                        <small>Port lokalny</small>
                        <strong>127.0.0.1:{debian13?.daemonPort || 8765}</strong>
                      </div>
                      <div>
                        <small>System kontenera</small>
                        <strong>{debian13?.containerOs || 'Debian GNU/Linux'}</strong>
                      </div>
                      <div>
                        <small>Jądro / Arch</small>
                        <strong>
                          {debian13?.kernelRelease} ({debian13?.arch})
                        </strong>
                      </div>
                    </div>
                    <p>
                      UID procesu: <strong>{debian13?.uid ?? 0}</strong> ({debian13?.user || 'root'})
                      · systemd PID 1:{' '}
                      <strong>
                        {debian13?.systemdAvailable
                          ? 'DOSTĘPNY'
                          : 'KONTENER (brak systemd PID 1)'}
                      </strong>
                    </p>
                    <button
                      className="subtle-button"
                      onClick={async () => {
                        await api.restartServices();
                        await refresh();
                        await refreshHost();
                      }}
                    >
                      <RefreshCcw size={15} /> Restartuj demona Debian 13 i odśwież usługi
                    </button>
                  </div>

                  <div className="detail-card">
                    <div className="info-title">
                      <Cpu size={17} /> Oficjalny OpenAI Codex CLI (
                      {codexStatus?.version || '@openai/codex'})
                    </div>
                    <div className="metric-grid">
                      <div>
                        <small>Status binarki</small>
                        <strong>
                          {codexStatus?.installed ? 'ZAINSTALOWANY' : 'BRAK'}
                        </strong>
                      </div>
                      <div>
                        <small>Konto ChatGPT</small>
                        <strong>
                          {codexStatus?.authenticated ? 'ZALOGOWANO' : 'NIEZALOGOWANO'}
                        </strong>
                      </div>
                    </div>
                    <p>
                      Ścieżka: <code>{codexStatus?.binaryPath || '/usr/local/bin/codex'}</code> ·
                      Status: <strong>{codexStatus?.statusText}</strong>
                    </p>
                    <p>
                      Oficjalny Codex CLI obsługuje logowanie kontem ChatGPT przez autoryzację
                      urządzenia (bez wymagania klucza OpenAI API). Sesja zapisywana jest w{' '}
                      <code>{codexStatus?.codexHome}</code>.
                    </p>
                    {codexStatus?.deviceAuth?.verificationUrl && (
                      <div
                        style={{
                          background: '#11121e',
                          border: '1px solid #6b53a8',
                          borderRadius: 10,
                          padding: 12,
                          marginTop: 8,
                        }}
                      >
                        <p style={{ margin: '0 0 6px', color: '#e9dfff' }}>
                          <strong>1. Otwórz link autoryzacji ChatGPT:</strong>{' '}
                          <a
                            href={codexStatus.deviceAuth.verificationUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {codexStatus.deviceAuth.verificationUrl}{' '}
                            <ExternalLink size={12} />
                          </a>
                        </p>
                        <p style={{ margin: 0, color: '#e9dfff' }}>
                          <strong>2. Wpisz kod jednorazowy:</strong>{' '}
                          <code
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: '#b99aff',
                              padding: '2px 6px',
                              background: '#241e38',
                              borderRadius: 6,
                            }}
                          >
                            {codexStatus.deviceAuth.userCode || 'Generowanie…'}
                          </code>
                        </p>
                      </div>
                    )}
                    <button
                      className="subtle-button"
                      disabled={codexAuthLoading}
                      onClick={() => void handleStartCodexDeviceLogin()}
                    >
                      <Clipboard size={15} />{' '}
                      {codexAuthLoading
                        ? 'Uruchamianie codex login --device-auth…'
                        : 'Zaloguj kontem ChatGPT (codex login --device-auth)'}
                    </button>
                  </div>

                  <div className="detail-card">
                    <div className="info-title">
                      <HardDrive size={17} /> Ollama &amp; Model 14B Vision Uncensored
                    </div>
                    <div className="metric-grid">
                      <div>
                        <small>Demon Ollama</small>
                        <strong>
                          {health?.ollama.reachable ? 'ONLINE' : 'NIEDOSTĘPNY'}
                        </strong>
                      </div>
                      <div>
                        <small>Preferowany model</small>
                        <strong>{health?.ollama.preferredModel || 'qwen2.5-vl:14b'}</strong>
                      </div>
                      <div>
                        <small>RAM (Wolne / Całk.)</small>
                        <strong>
                          {health?.ollama.resources.freeRamMB ?? 0} /{' '}
                          {health?.ollama.resources.totalRamMB ?? 0} MB
                        </strong>
                      </div>
                      <div>
                        <small>Wolny dysk / GPU</small>
                        <strong>
                          {health?.ollama.resources.diskFreeGB ?? 0} GB ·{' '}
                          {health?.ollama.resources.gpuDetected ? 'GPU' : 'CPU'}
                        </strong>
                      </div>
                    </div>
                    <p>
                      Weryfikacja zasobów dla modelu 14B Vision:{' '}
                      <strong>
                        {health?.ollama.resources.canRun14BQ4
                          ? 'RAM i dysk wystarczające dla 14B Q4 (brak akceleracji GPU w kontenerze)'
                          : 'Niewystarczające zasoby RAM/dysku'}
                      </strong>
                    </p>
                    {health?.ollama.error && (
                      <p style={{ color: '#e6b8c4' }}>Diagnostyka: {health.ollama.error}</p>
                    )}
                  </div>

                  <div className="detail-card">
                    <div className="info-title">
                      <HardDrive size={17} /> Zewnętrzny Obserwator Hosta Debian 13
                    </div>
                    {hostSnapshot?.connected ? (
                      <>
                        <div className="metric-grid">
                          <div>
                            <small>Nazwa hosta</small>
                            <strong>{hostSnapshot.host?.hostname || '—'}</strong>
                          </div>
                          <div>
                            <small>System</small>
                            <strong>{hostSnapshot.host?.os || 'Linux'}</strong>
                          </div>
                          <div>
                            <small>RAM</small>
                            <strong>{hostSnapshot.host?.memoryPercent ?? '—'}%</strong>
                          </div>
                          <div>
                            <small>Usługi systemd</small>
                            <strong>{hostSnapshot.host?.services?.length ?? 0}</strong>
                          </div>
                        </div>
                        <label>
                          Wyszukaj usługę systemd
                          <input
                            value={serviceFilter}
                            onChange={(e) => setServiceFilter(e.target.value)}
                            placeholder="np. ollama.service"
                          />
                        </label>
                        <div className="host-services">
                          {(hostSnapshot.host?.services || [])
                            .filter((service: { name: string }) =>
                              service.name
                                .toLowerCase()
                                .includes(serviceFilter.toLowerCase()),
                            )
                            .slice(0, 80)
                            .map((service: { name: string; state: string }) => (
                              <div className="host-service" key={service.name}>
                                <span>{service.name}</span>
                                <small>{service.state}</small>
                              </div>
                            ))}
                        </div>
                      </>
                    ) : (
                      <p>
                        Brak zewnętrznej próbki z <code>linux-sync-agent.py</code>. Lokalny kontener
                        Linux oraz demon <code>debian13/system/server.py</code> działają bezpośrednio.
                      </p>
                    )}
                  </div>
                </>
              )}

              {panel === 'agents' && (
                <>
                  <div className="detail-card">
                    <div className="info-title">
                      <Sparkles size={17} /> SVLSystemKernel ({svlCore?.System || '5.6.0-QuantumWheel'})
                    </div>
                    <div className="metric-grid">
                      <div>
                        <small>Operator (Chroniony)</small>
                        <strong>{svlCore?.Operator || 'Mateusz Mitek'}</strong>
                      </div>
                      <div>
                        <small>Compact Metric C</small>
                        <strong>{svlCore?.Compact_Metric_C ?? 2.5}</strong>
                      </div>
                      <div>
                        <small>Wzorzec Kalibracji</small>
                        <strong>{svlCore?.Performance || '+1456% (364)'}</strong>
                      </div>
                      <div>
                        <small>Rezonans / Bufor</small>
                        <strong>
                          {svlCore?.Config_Snapshot?.acoustic_resonance_hz || 880} Hz ·{' '}
                          {svlCore?.Config_Snapshot?.fourier_buffer || '0xFAAA'}
                        </strong>
                      </div>
                    </div>
                    <button
                      className="subtle-button"
                      disabled={busy}
                      onClick={() => void handleConnectAriaClick()}
                    >
                      <Sparkles size={15} /> Uruchom jednorazowy raport SVL Core (svl_core.py)
                    </button>
                  </div>

                  <p className="panel-intro">
                    Cztery oryginalne tożsamości agentów. Status online wymaga świeżego heartbeat
                    uwierzytelnionego workera; <code>svl_core.py</code> wykonuje jednorazowy raport,
                    nie uruchamia agenta.
                  </p>

                  {AGENTS.map((a) => {
                    const agent = health?.agents.find((x) => x.name === a);
                    return (
                      <div className="agent-card" key={a}>
                        <InitialAvatar
                          name={a}
                          avatar={snapshot?.avatars?.[a]}
                          size={40}
                        />
                        <div>
                          <strong>
                            {a} {a === 'Aria' ? '(si_1)' : ''}
                          </strong>
                          <p>
                            {agent?.connected
                              ? `Połączony (${agent.workerId || 'aktywny proces'})`
                              : 'Niepodłączony (brak aktywnego workera)'}
                          </p>
                          <small>
                            {agent?.pid ? `PID: ${agent.pid} · ` : ''}Ostatni sygnał:{' '}
                            {humanTime(agent?.lastSeen)}
                          </small>
                        </div>
                        <StatusDot online={Boolean(agent?.connected)} />
                      </div>
                    );
                  })}
                </>
              )}

              {panel === 'github' && (
                <>
                  <div className="detail-card">
                    <div className="info-title">
                      <GitBranch size={17} /> Synchronizacja GitHub (Gałąź{' '}
                      <code>{github?.branch || 'main'}</code>)
                    </div>
                    <div className="metric-grid">
                      <div>
                        <small>GitHub CLI</small>
                        <strong>{github?.ghVersion || 'Zainstalowany'}</strong>
                      </div>
                      <div>
                        <small>Commit SHA</small>
                        <strong>{github?.commitSha || '—'}</strong>
                      </div>
                      <div>
                        <small>Gałąź główna</small>
                        <strong>{github?.branch || 'main'}</strong>
                      </div>
                      <div>
                        <small>Zmodyfikowane pliki</small>
                        <strong>{github?.modifiedCount ?? 0}</strong>
                      </div>
                    </div>
                    <p>Status autoryzacji: {github?.authMessage}</p>
                    {github?.remotes && github.remotes.length > 0 && (
                      <div className="host-services" style={{ marginBottom: 10 }}>
                        {github.remotes.map((r) => (
                          <div className="host-service" key={r.name}>
                            <span>{r.name}</span>
                            <small>{r.url}</small>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button
                        className="subtle-button"
                        disabled={gitBusy}
                        onClick={() => void handleGitSync('status')}
                      >
                        Sprawdź git status
                      </button>
                      <button
                        className="subtle-button"
                        disabled={gitBusy}
                        onClick={() => void handleGitSync('fetch')}
                      >
                        Pobierz (git fetch main)
                      </button>
                      <button
                        className="subtle-button"
                        disabled={gitBusy}
                        onClick={() => void handleGitSync('pull')}
                      >
                        Aktualizuj (git pull --ff-only)
                      </button>
                      <button
                        className="subtle-button"
                        disabled={gitBusy}
                        onClick={() => void handleGitSync('push')}
                      >
                        Publikuj (git push main)
                      </button>
                    </div>
                    {gitOutput && (
                      <pre className="rich-pre" style={{ marginTop: 10 }}>
                        {gitOutput}
                      </pre>
                    )}
                  </div>

                  <div className="detail-card">
                    <div className="info-title">
                      <ShieldCheck size={17} /> Logowanie Operatora (SVL_OPERATOR_TOKEN)
                    </div>
                    <div className="metric-grid">
                      <div>
                        <small>Sekret backendu</small>
                        <strong>
                          {health?.operatorAuth.tokenConfigured
                            ? `AKTYWNY (${health.operatorAuth.tokenLength} zn.)`
                            : 'BRAK'}
                        </strong>
                      </div>
                      <div>
                        <small>Sesja operatora</small>
                        <strong>{health?.operatorAuth.sessionSource}</strong>
                      </div>
                    </div>
                    <p>
                      Sekret <code>SVL_OPERATOR_TOKEN</code> przechowywany jest wyłącznie po stronie
                      serwera w <code>data/.operator_token</code> (uprawnienia <code>0600</code>) i
                      nigdy nie trafia do kodu frontendu.
                    </p>
                  </div>
                </>
              )}

              {panel === 'library' && (
                <>
                  <p className="panel-intro">
                    {UI_TYPES.length} interaktywnych elementów w {Object.keys(UI_GROUPS).length}{' '}
                    kategoriach.
                  </p>
                  <div className="library-search">
                    <Search size={16} />
                    <input
                      placeholder="Wyszukaj typ elementu…"
                      aria-label="Wyszukaj typ elementu"
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                    />
                  </div>
                  {filteredLibrary.map((g) => (
                    <div className="lib-group" key={g.category}>
                      <h3>
                        {g.category} <small>{g.types.length}</small>
                      </h3>
                      <div className="lib-chips">
                        {g.types.map((t) => (
                          <button
                            key={t}
                            className={libraryType === t ? 'selected' : ''}
                            onClick={() => setLibraryType(t)}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="preview-area">
                    <h3>Podgląd · {libraryType}</h3>
                    <RichBlock block={preview} />
                    <button
                      className="subtle-button"
                      onClick={() => {
                        setText('Pokaż element ' + libraryType + ' jako interaktywny blok svl-ui.');
                        setPanel('none');
                      }}
                    >
                      Użyj w czacie
                    </button>
                  </div>
                </>
              )}

              {panel === 'settings' && (
                <>
                  <p className="panel-intro">
                    Ustaw awatary własne i czterech agentów (Alex, Aria, Astyria, Aurelius).
                  </p>
                  <div className="detail-card">
                    <label>
                      Profil
                      <select
                        value={avatarEdit}
                        onChange={(e) => {
                          setAvatarEdit(e.target.value);
                          setAvatarValue(snapshot?.avatars?.[e.target.value] || '');
                        }}
                      >
                        {['Operator', ...AGENTS].map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Wgraj własny obraz (do 390 KB)
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(e) => void onAvatarFile(e)}
                      />
                    </label>
                    <label>
                      URL HTTPS awatara
                      <input
                        value={avatarValue}
                        placeholder="https://…"
                        onChange={(e) => setAvatarValue(e.target.value)}
                      />
                    </label>
                    <button
                      className="subtle-button"
                      onClick={() => void loadAvatar()}
                    >
                      <CheckCircle2 size={15} /> Zapisz i synchronizuj awatar
                    </button>
                  </div>
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

export default App;
