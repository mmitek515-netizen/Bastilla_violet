export type AgentName = 'Alex' | 'Aria' | 'Astyria' | 'Aurelius';

export type TerminalKind = 'bash' | 'python' | 'codex' | 'ai-nlp' | 'admin-sudo';

export interface ChatAttachmentPayload {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
}

export type Session = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
};

export type Message = {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'agent' | 'system';
  author: string;
  content: string;
  createdAt: string;
  status: 'saved' | 'queued' | 'running' | 'delivered' | 'failed';
  provider?: string;
  error?: string;
  attachments?: ChatAttachmentPayload[];
};

export type AgentState = {
  name: AgentName;
  id: string;
  connected: boolean;
  lastSeen: string | null;
  workerId: string | null;
  pid?: number | null;
  kernelVersion?: string | null;
  roleNote?: string;
};

export type ModelState = {
  reachable: boolean;
  baseUrl: string;
  model: string | null;
  preferredModel: string;
  fallbackVisionModel: string;
  models: string[];
  visionCapable: boolean;
  error?: string;
  resources: {
    totalRamMB: number;
    freeRamMB: number;
    diskFreeGB: number;
    gpuDetected: boolean;
    gpuName: string;
    canRun14BQ4: boolean;
  };
  logs: string[];
};

export type CodexCliState = {
  installed: boolean;
  binaryPath: string | null;
  version: string | null;
  authenticated: boolean;
  authMethod: 'chatgpt_oauth' | 'api_key' | 'not_logged_in';
  statusText: string;
  codexHome: string;
  deviceAuth?: {
    active: boolean;
    verificationUrl: string | null;
    userCode: string | null;
    startedAt: string | null;
    rawOutput: string;
  };
  observedAt: string;
};

export type SvlCoreReport = {
  Timestamp: string;
  System: string;
  Operator: string;
  Performance: string;
  Compact_Metric_C: number;
  Config_Snapshot: {
    mode: string;
    fourier_buffer: string;
    acoustic_resonance_hz: number;
    milieu_therapy_active: boolean;
    ip_rotation_gateway: string;
  };
  Actual_SI_Updates_Count: number;
  ariaConnected: boolean;
  ariaPid: number | null;
  ariaConnectedAt: string | null;
};

export type Debian13RuntimeState = {
  daemonRunning: boolean;
  daemonPid: number | null;
  daemonPort: number;
  daemonReachable: boolean;
  containerOs: string;
  kernelRelease: string;
  arch: string;
  uid: number;
  user: string;
  systemdAvailable: boolean;
  hostObserverConnected: boolean;
  hostSnapshot: any | null;
  persistenceDir: string;
};

export type GitHubSyncState = {
  gitInstalled: boolean;
  ghInstalled: boolean;
  ghVersion: string | null;
  branch: string;
  commitSha: string;
  remotes: { name: string; url: string }[];
  workingTreeClean: boolean;
  modifiedCount: number;
  ghAuthenticated: boolean;
  authMessage: string;
};

export type OperatorAuthState = {
  tokenConfigured: boolean;
  tokenLength: number;
  authenticated: boolean;
  sessionSource: 'cookie' | 'local_loopback' | 'unauthenticated';
  httpsDetected: boolean;
};

export type ServerHealth = {
  backend: 'online';
  observedAt: string;
  ollama: ModelState;
  codexCli: CodexCliState;
  debian13: Debian13RuntimeState;
  svlCore: SvlCoreReport;
  github: GitHubSyncState;
  operatorAuth: OperatorAuthState;
  geminiConfigured: boolean;
  agents: AgentState[];
  limitations: string[];
};

export type AppState = {
  sessions: Session[];
  messages: Message[];
  avatars: Record<string, string>;
  revision: number;
  updatedAt: string;
};

export type Bootstrap = AppState & { health: ServerHealth };

export type WidgetBlock = {
  type: string;
  title?: string;
  text?: string;
  label?: string;
  value?: number | string | boolean;
  min?: number;
  max?: number;
  options?: any[];
  items?: any[];
  columns?: string[];
  rows?: any[][];
  url?: string;
  prompt?: string;
  status?: string;
  data?: any[];
};

export type TerminalExecResponse = {
  terminal: TerminalKind;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
  executedAt: string;
  durationMs: number;
  provider?: string;
};
