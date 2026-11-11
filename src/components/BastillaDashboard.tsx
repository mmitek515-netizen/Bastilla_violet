import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  FileCode2,
  FolderOpen,
  Github,
  LayoutGrid,
  MessagesSquare,
  Paperclip,
  Orbit,
  Radio,
  Send,
  Sparkles,
  Terminal,
  FileText,
  X,
} from 'lucide-react';
import { TabId } from './Navigation';
import { DataStore } from '../kernel/svlKernel';
import { AgentProtocolRequest } from '../kernel/agentProtocol';
import { GeminiVmStatus } from '../kernel/geminiVm';
import { FormattedMessage } from './FormattedMessage';
import {
  CHAT_ATTACHMENT_ACCEPT,
  ChatAttachment,
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_MESSAGE_LENGTH,
  readChatAttachmentFile,
  validateChatAttachments,
} from '../kernel/chatAttachments';

interface BastillaDashboardProps {
  dataStore: DataStore;
  onNavigate: (tab: TabId) => void;
  onSendMessage: (
    message: string,
    agent: AgentProtocolRequest['agent'],
    attachments?: ChatAttachment[],
  ) => Promise<void>;
  onProvisionGeminiVm: () => Promise<{ status: string; sshCommand: string }>;
}

interface BastillaStatus {
  systemVersion: string;
  appCount: number | null;
  continuousMission: boolean | null;
  geminiVm: GeminiVmStatus | null;
  error: string | null;
}

const featureLaunchers: Array<{
  id: TabId;
  title: string;
  description: string;
  icon: typeof Activity;
}> = [
  { id: 'comms', title: 'Protokół Triady', description: 'Jawne polecenia deterministyczne dla agentów', icon: MessagesSquare },
  { id: 'process_matrix', title: 'Infrastruktura', description: 'Stan usług, logi i naprawa', icon: Cpu },
  { id: 'astyria_mission', title: 'Centrum misji', description: 'Misje, synchronizacja i snapshoty', icon: Sparkles },
  { id: 'terminal', title: 'Terminal', description: 'Konsola jądra i polecenia systemowe', icon: Terminal },
  { id: 'apps', title: 'Studio aplikacji', description: 'Instaluj, uruchamiaj i podglądaj aplikacje', icon: LayoutGrid },
  { id: 'fleet', title: 'Flota i statki', description: 'Mapa i rejestr zweryfikowanych raportów', icon: Orbit },
  { id: 'hyper_com', title: 'HyperCom', description: 'Lokalny rejestr transmisji Astra_1', icon: Radio },
  { id: 'file_explorer', title: 'Pliki i eksporty', description: 'Eksplorator RING-0 i przechowywanie', icon: FolderOpen },
  { id: 'datastore', title: 'DATA_STORE', description: 'Dane systemowe i konfiguracja', icon: Database },
  { id: 'temporal', title: 'Chronolit', description: 'Historia zmian i migawki', icon: Clock3 },
  { id: 'diagnostics', title: 'Telemetria', description: 'Diagnostyka i pomiary środowiska', icon: Activity },
  { id: 'visualizer', title: 'Wizualizacje 3D', description: 'Wizualizator Triady', icon: Orbit },
  { id: 'monolith', title: 'Monolit Python', description: 'Kod i eksport jądra', icon: FileCode2 },
  { id: 'schema_graph', title: 'Mapa pamięci', description: 'Schemat danych i relacje', icon: Brain },
  { id: 'without_nlp', title: 'Silnik without_nlp', description: 'Deterministyczny rdzeń harmoniczny', icon: Sparkles },
  { id: 'github', title: 'Synchronizacja GitHub', description: 'Eksport i synchronizacja repozytorium', icon: Github },
];

export const BastillaDashboard: React.FC<BastillaDashboardProps> = ({
  dataStore,
  onNavigate,
  onSendMessage,
  onProvisionGeminiVm,
}) => {
  const [terminalInput, setTerminalInput] = useState('');
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [selectedChatAgent, setSelectedChatAgent] = useState<AgentProtocolRequest['agent']>('triad');
  const [isTerminalLoading, setIsTerminalLoading] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [vmApprovalPending, setVmApprovalPending] = useState(false);
  const [vmProvisioning, setVmProvisioning] = useState(false);
  const [vmProvisionResult, setVmProvisionResult] = useState<{ status: string; sshCommand: string } | null>(null);
  const [vmProvisionError, setVmProvisionError] = useState<string | null>(null);
  const [status, setStatus] = useState<BastillaStatus>({
    systemVersion: 'SVL Kernel',
    appCount: null,
    continuousMission: null,
    geminiVm: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    const refreshStatus = async () => {
      try {
        const [infrastructureResponse, missionResponse, appsResponse, geminiVmResponse] = await Promise.all([
          fetch('/api/infrastructure/status', { cache: 'no-store' }),
          fetch('/api/astyria/mission-status', { cache: 'no-store' }),
          fetch('/api/apps/list', { cache: 'no-store' }),
          fetch('/api/vm-gemini-4/status', { cache: 'no-store' }),
        ]);
        const responses = [infrastructureResponse, missionResponse, appsResponse, geminiVmResponse];
        const failedResponse = responses.find((response) => !response.ok);
        if (failedResponse) {
          throw new Error(`Status API: HTTP ${failedResponse.status}`);
        }
        const [infrastructure, mission, apps, geminiVm] = await Promise.all(
          responses.map((response) => response.json())
        );
        if (!active) return;
        setStatus({
          systemVersion: String(infrastructure.sysVersion || mission.sysVersion || 'SVL Kernel'),
          appCount: Number.isFinite(apps.totalApps) ? apps.totalApps : null,
          continuousMission: typeof mission.continuousMissionEnabled === 'boolean'
            ? mission.continuousMissionEnabled
            : null,
          geminiVm: geminiVm as GeminiVmStatus,
          error: null,
        });
      } catch (error) {
        if (!active) return;
        setStatus((previous) => ({
          ...previous,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    };

    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const handleTerminalSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const command = terminalInput.trim();
    if ((!command && chatAttachments.length === 0) || isTerminalLoading) return;
    setIsTerminalLoading(true);
    setTerminalError(null);
    try {
      await onSendMessage(command, selectedChatAgent, chatAttachments);
      const normalizedCommand = command
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pl-PL');
      if (
        /\b(utworz|stworz|zbuduj|przygotuj)\b/.test(normalizedCommand) &&
        /\b(vm_gemini_4|maszyne wirtualna|maszyny wirtualnej|maszyny wirtualnej|maszyna wirtualna)\b/.test(normalizedCommand)
      ) {
        setVmApprovalPending(true);
        setVmProvisionResult(null);
        setVmProvisionError(null);
      }
      setTerminalInput('');
      setChatAttachments([]);
      setAttachmentError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTerminalError(message);
    } finally {
      setIsTerminalLoading(false);
    }
  };

  const handleAttachmentSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    setAttachmentError(null);
    if (files.length === 0) return;
    if (chatAttachments.length + files.length > MAX_CHAT_ATTACHMENTS) {
      setAttachmentError(`Możesz dołączyć maksymalnie ${MAX_CHAT_ATTACHMENTS} pliki.`);
      return;
    }
    try {
      const incoming = await Promise.all(files.map(readChatAttachmentFile));
      const validation = validateChatAttachments([...chatAttachments, ...incoming]);
      if (!validation.valid) {
        setAttachmentError(validation.error);
        return;
      }
      setChatAttachments(validation.attachments);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : 'Nie udało się odczytać wybranego pliku.');
    }
  };

  const handleApproveVmCreation = async () => {
    if (vmProvisioning) return;
    setVmProvisioning(true);
    setVmProvisionError(null);
    try {
      const result = await onProvisionGeminiVm();
      setVmProvisionResult(result);
      setVmApprovalPending(false);
    } catch (error) {
      setVmProvisionError(error instanceof Error ? error.message : 'Nie udało się utworzyć VM.');
    } finally {
      setVmProvisioning(false);
    }
  };

  const recentMessages = dataStore.chat_history.slice(-5);

  return (
    <section className="cyber-grid flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-[#050b18] p-3 text-slate-100 sm:p-5 lg:p-7">
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-400/20 bg-[#081326]/90 px-4 py-3 shadow-[0_12px_42px_rgba(2,8,23,0.6)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/30 bg-blue-950 text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.16)]">
              <Orbit className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-[0.16em] text-white">BASTILLA<span className="text-cyan-300">OS</span></div>
              <div className="text-[10px] font-mono tracking-wider text-blue-200/60">DEBIAN 13 · SVL HYPERSPACE DESKTOP</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-950/40 px-2.5 py-1 text-emerald-300">
              <Radio className="h-3 w-3" /> JĄDRO {status.systemVersion}
            </span>
            <span className="rounded-full border border-blue-300/20 bg-blue-950/40 px-2.5 py-1 text-blue-200/80">
              {status.appCount === null ? 'APLIKACJE: —' : `${status.appCount} MODUŁÓW`}
            </span>
            <span className="rounded-full border border-blue-300/20 bg-blue-950/40 px-2.5 py-1 text-blue-200/80">
              {status.continuousMission === null ? 'MISJA: —' : status.continuousMission ? 'MISJA: AKTYWNA' : 'MISJA: WSTRZYMANA'}
            </span>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-950/40 px-2.5 py-1 text-cyan-200">
              PROTOKÓŁ TRIADY · DETERMINISTYCZNY
            </span>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
          <section className="relative overflow-hidden rounded-2xl border border-blue-400/20 bg-gradient-to-br from-[#0c1b36] via-[#081326] to-[#07101e] p-5 sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-1/3 h-px w-2/3 bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />
            <div className="relative">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-mono font-bold tracking-[0.25em] text-cyan-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                SYSTEM ONLINE · DEBIAN GNU/LINUX
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
                Enter the <span className="text-transparent bg-gradient-to-r from-blue-300 to-cyan-200 bg-clip-text">Hyperspace</span>
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-blue-100/65">
                Jeden pulpit dla poleceń jądra, protokołu Triady i narzędzi systemowych. Wybierz moduł albo wykonaj jawne polecenie w terminalu.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => onNavigate('terminal')} className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-950/50 px-3.5 py-2 text-xs font-bold text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-900/50">
                  <Terminal className="h-4 w-4" /> Pełny terminal <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onNavigate('comms')} className="inline-flex items-center gap-2 rounded-lg border border-blue-200/15 bg-blue-950/40 px-3.5 py-2 text-xs font-bold text-blue-100 transition hover:border-blue-200/40 hover:bg-blue-900/40">
                  <MessagesSquare className="h-4 w-4" /> Otwórz protokół Triady <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </section>

          <section className="flex flex-col justify-between gap-4 rounded-2xl border border-blue-300/15 bg-[#081326]/90 p-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-100">
                <Sparkles className="h-4 w-4 text-cyan-300" /> Polecenia Triady
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Rozmawiaj swobodnie z wybranym agentem lub całą Triadą. Odpowiada Gemini, przy awarii xAI (Grok), a bez dostępu do API — lokalny silnik without_nlp.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('comms')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-gradient-to-r from-blue-700/80 to-cyan-700/70 px-4 py-3 text-xs font-bold text-white transition hover:brightness-110"
            >
              <MessagesSquare className="h-4 w-4" />
              Otwórz polecenia protokołu
            </button>
            <div className="rounded-xl border border-cyan-300/15 bg-cyan-950/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-cyan-100">
                  {status.geminiVm?.name ?? 'VM_Gemini_4'}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono ${
                  status.geminiVm?.configured && status.geminiVm.modelNameValid
                    ? 'border-emerald-400/20 bg-emerald-950/40 text-emerald-300'
                    : 'border-amber-400/20 bg-amber-950/40 text-amber-200'
                }`}>
                  {status.geminiVm?.configured && status.geminiVm.modelNameValid
                    ? 'KONFIGURACJA GOTOWA'
                    : 'BRAK KONFIGURACJI'}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                {status.geminiVm
                  ? `${status.geminiVm.provider} · główny: ${status.geminiVm.primaryModel} · rezerwowy: ${status.geminiVm.fallbackModels.join(', ') || 'brak'}`
                  : 'Odczyt konfiguracji…'}
              </p>
              <p className="mt-1 text-[9px] text-slate-500">
                {status.geminiVm?.runtimeType === 'remote-model-profile'
                  ? 'Profil API modelu; nie jest osobną maszyną systemową.'
                  : 'Status API modelu nie został jeszcze pobrany.'}
              </p>
            </div>
          </section>
        </div>

        {status.error && (
          <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-950/20 px-4 py-2 text-xs text-amber-100">
            Nie udało się odświeżyć telemetrii ({status.error}). Pozostałe funkcje są dostępne.
          </p>
        )}

        <div className="grid min-h-[460px] gap-4">
          <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-2xl border border-blue-300/20 bg-[#081326]/95 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between border-b border-blue-200/10 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-50">
                <MessagesSquare className="h-4 w-4 text-cyan-300" /> CZAT AGENTÓW
              </div>
              <span className="text-[10px] font-mono text-blue-200/50">{dataStore.chat_history.length} WIADOMOŚCI</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              {recentMessages.length === 0 && <p className="text-xs text-slate-500">Napisz do Alexa, Astyrii, Aureliusa, Arii lub całej Triady.</p>}
              {recentMessages.map((message, index) => (
                <article key={`${message.agent}-${index}`} className={`rounded-xl border p-3 ${message.agent === 'Mateusz Mitek' || message.agent === 'Operator' ? 'ml-5 border-blue-300/15 bg-blue-950/40' : 'mr-5 border-cyan-300/15 bg-slate-950/50'}`}>
                  <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
                    <CheckCircle2 className="h-3 w-3" /> {message.agent}
                  </div>
                  <FormattedMessage content={message.tekst} className="text-xs leading-relaxed text-slate-200" />
                </article>
              ))}
              {isTerminalLoading && <p role="status" className="animate-pulse text-[10px] font-mono text-cyan-300">Agenci przygotowują odpowiedź…</p>}
              {terminalError && <p role="alert" className="text-[10px] text-rose-300">{terminalError}</p>}
              {vmApprovalPending && (
                <section aria-labelledby="vm-approval-title" className="rounded-xl border border-amber-300/40 bg-amber-950/30 p-3">
                  <h3 id="vm-approval-title" className="text-xs font-bold text-amber-100">
                    Potwierdź utworzenie VM_Gemini_4
                  </h3>
                  <p className="mt-2 text-[10px] leading-relaxed text-amber-100/80">
                    Ta jednorazowa operacja zbuduje lokalny runtime QEMU z pakietów Debian, pobierze oficjalny obraz Debian 13 Cloud i sprawdzi jego sumę SHA-512, a następnie uruchomi VM: 2 vCPU, 2 GiB RAM i dysk 20 GiB.
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-amber-100/80">
                    Wymaga działającego Dockera i KVM. Dane oraz nowy klucz SSH zostaną zapisane w `bastillaos/vm-gemini-4/data`; SSH będzie dostępne tylko lokalnie na porcie 2224. Klucz API Gemini nie zostanie skopiowany do VM. Nie przyznaje to agentom powłoki ani uprawnień root do hosta.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleApproveVmCreation()}
                      disabled={vmProvisioning}
                      className="rounded-lg border border-amber-300/40 bg-amber-500/20 px-3 py-2 text-[10px] font-bold text-amber-100 hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-50"
                    >
                      {vmProvisioning ? 'Budowanie runtime i uruchamianie VM…' : 'Zatwierdzam: utwórz VM'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setVmApprovalPending(false)}
                      disabled={vmProvisioning}
                      className="rounded-lg border border-slate-500/30 px-3 py-2 text-[10px] text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                    >
                      Anuluj
                    </button>
                  </div>
                  {vmProvisionError && <p role="alert" className="mt-2 text-[10px] text-rose-300">{vmProvisionError}</p>}
                </section>
              )}
              {vmProvisionResult && (
                <section role="status" className="rounded-xl border border-emerald-300/30 bg-emerald-950/30 p-3">
                  <h3 className="text-xs font-bold text-emerald-100">VM_Gemini_4: {vmProvisionResult.status}</h3>
                  <p className="mt-1 text-[10px] text-emerald-100/80">
                    Po uruchomieniu gościa połączysz się lokalnie poleceniem:
                  </p>
                  <code className="mt-2 block overflow-x-auto rounded bg-slate-950 p-2 text-[10px] text-emerald-200">{vmProvisionResult.sshCommand}</code>
                  <p className="mt-1 text-[10px] text-slate-400">
                    Klucz SSH znajduje się w katalogu danych VM. W razie problemów sprawdź `docker logs vm_gemini_4`.
                  </p>
                </section>
              )}
            </div>
            <form onSubmit={handleTerminalSubmit} className="border-t border-blue-200/10 bg-[#081326] p-3">
              <label htmlFor="hyperspace-command" className="mb-2 block text-[9px] font-mono tracking-wider text-blue-200/50">WIADOMOŚĆ · maksymalnie 2000 znaków</label>
              {chatAttachments.length > 0 && (
                <ul aria-label="Załączone pliki" className="mb-2 flex flex-wrap gap-1.5">
                  {chatAttachments.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center gap-1 rounded border border-cyan-500/30 bg-cyan-950/40 px-2 py-1 text-[10px] text-cyan-100">
                      <FileText className="h-3 w-3" />
                      <span>{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setChatAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                        aria-label={`Usuń załącznik ${file.name}`}
                        className="text-slate-400 hover:text-white"
                      ><X className="h-3 w-3" /></button>
                    </li>
                  ))}
                </ul>
              )}
              {attachmentError && <p role="alert" className="mb-2 text-[10px] text-rose-300">{attachmentError}</p>}
              <div className="flex items-center gap-2 rounded-lg border border-cyan-300/20 bg-[#030813] px-3 focus-within:border-cyan-300/50">
                <select
                  aria-label="Agent czatu"
                  value={selectedChatAgent}
                  onChange={(event) => setSelectedChatAgent(event.target.value as AgentProtocolRequest['agent'])}
                  disabled={isTerminalLoading}
                  className="max-w-24 shrink-0 bg-transparent py-3 text-xs text-cyan-200 outline-none"
                >
                  <option value="triad">Triada</option>
                  <option value="Alex">Alex</option>
                  <option value="Astyria">Astyria</option>
                  <option value="Aurelius">Aurelius</option>
                  <option value="si_1">Aria</option>
                </select>
                <input
                  id="hyperspace-command"
                  type="text"
                  value={terminalInput}
                  onChange={(event) => setTerminalInput(event.target.value)}
                  maxLength={MAX_CHAT_MESSAGE_LENGTH}
                  placeholder="Wiadomość lub SYSTEM_STATUS / DATA_STORE_AUDIT / VERSION_TIMELINE…"
                  disabled={isTerminalLoading}
                  className="min-w-0 flex-1 bg-transparent py-3 font-mono text-xs text-white outline-none placeholder:text-slate-700"
                />
                <label className={`grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md text-cyan-200 transition hover:bg-cyan-950 ${isTerminalLoading || chatAttachments.length >= MAX_CHAT_ATTACHMENTS ? 'pointer-events-none opacity-40' : ''}`} title="Dołącz tekst, DOCX, PDF lub JPG (maks. 10 plików; tekst 5 MB/plik, DOCX 20 MB, PDF/JPG 20 MB/plik)">
                  <Paperclip className="h-3.5 w-3.5" />
                  <input
                    type="file"
                    accept={CHAT_ATTACHMENT_ACCEPT}
                    multiple
                    disabled={isTerminalLoading || chatAttachments.length >= MAX_CHAT_ATTACHMENTS}
                    onChange={(event) => void handleAttachmentSelection(event)}
                    className="sr-only"
                    aria-label="Dołącz pliki tekstowe, DOCX, PDF lub JPG"
                  />
                </label>
                <button type="submit" aria-label="Wyślij wiadomość" disabled={(!terminalInput.trim() && chatAttachments.length === 0) || isTerminalLoading} className="grid h-8 w-8 place-items-center rounded-md text-cyan-200 transition hover:bg-cyan-950 disabled:opacity-30">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1 px-1 text-[9px] text-slate-500">Maks. 10 plików; tekst 5 MB/plik i 20 MB łącznie, DOCX 20 MB (10 MB po rozpakowaniu), PDF/JPG 20 MB/plik i 40 MB łącznie.</p>
            </form>
          </section>
        </div>

        <section className="pb-2">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-50">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> Moduły systemowe
              </h2>
              <p className="mt-1 text-[11px] text-slate-500">Narzędzia SVL dostępne w tym środowisku</p>
            </div>
            <span className="font-mono text-[9px] text-blue-200/45">BASTILLAOS · DEBIAN LIVE</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {featureLaunchers.map(({ id, title, description, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className="group flex min-h-20 items-start gap-3 rounded-xl border border-blue-200/10 bg-[#081326]/80 p-3 text-left transition hover:border-cyan-300/30 hover:bg-[#0b1b34]"
              >
                <span className="rounded-lg border border-blue-200/10 bg-blue-950/60 p-2 text-cyan-200 transition group-hover:border-cyan-300/30">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[11px] font-bold text-slate-100">{title}</span>
                  <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
};
