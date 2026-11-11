import { GoogleGenAI } from '@google/genai';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { WebSocketServer, WebSocket } from 'ws';
import {
  CodexCliManager,
  isCodexDeviceAuthCommand,
  parseCodexCliCommand,
  stripAnsiCodes,
} from './src/lib/codexCliBridge';
import { resolveVisionModel } from './src/kernel/visionModel';
import { requireGitHubWriteToken } from './src/lib/githubWriteAuth';
import { createFleetRouter } from './src/lib/fleetRoutes';
import { createHyperComRouter } from './src/lib/hyperComRoutes';
import {
  calculateTopologicalMetricC,
  isAriaConnectCommand,
  runPythonSvlCoreReport,
} from './src/lib/svlAriaBridge';
import { hasAllowedWebSocketOrigin, hasValidOperatorSession, isLoopbackAddress, isLoopbackHost, isOperatorAccessAllowed } from './src/lib/operatorAccess.mjs';
import { requireGitHubWriteToken } from './src/lib/githubWriteAuth';
import { resolveVisionModel } from './src/kernel/visionModel';
import type {
  AgentName,
  AgentState,
  Bootstrap,
  ChatAttachmentPayload,
  Debian13RuntimeState,
  GitHubSyncState,
  Message,
  ModelState,
  OperatorAuthState,
  ServerHealth,
  Session,
  SvlCoreReport,
  TerminalExecResponse,
  TerminalKind,
} from './src/lib/types';

dotenv.config();

const execFileAsync = promisify(execFile);
const AGENTS: AgentName[] = ['Alex', 'Aria', 'Astyria', 'Aurelius'];

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const DB_FILE = path.join(DATA_DIR, 'bastilla-state.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'operator-sessions.json');
const OPERATOR_TOKEN_FILE = path.join(DATA_DIR, '.operator_token');
const ADMIN_AUDIT_LOG = path.join(DATA_DIR, 'admin_audit.log');
const DEBIAN13_STATE_DIR = path.join(DATA_DIR, 'debian13_state');
const WORKSPACE_DIR = path.join(DATA_DIR, 'workspace');

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
fs.mkdirSync(DEBIAN13_STATE_DIR, { recursive: true, mode: 0o700 });
fs.mkdirSync(WORKSPACE_DIR, { recursive: true, mode: 0o755 });

// Ensure >= 32-char SVL_OPERATOR_TOKEN exists on backend only
let operatorSecret = (process.env.SVL_OPERATOR_TOKEN || '').trim();
if (operatorSecret.length < 32) {
  if (fs.existsSync(OPERATOR_TOKEN_FILE)) {
    operatorSecret = fs.readFileSync(OPERATOR_TOKEN_FILE, 'utf-8').trim();
  }
  if (operatorSecret.length < 32) {
    operatorSecret = randomBytes(36).toString('base64url');
    fs.writeFileSync(OPERATOR_TOKEN_FILE, operatorSecret + '\n', { mode: 0o600 });
  }
}

// Persistent operator sessions across restarts
const operatorSessions = new Map<string, number>();
try {
  if (fs.existsSync(SESSIONS_FILE)) {
    const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    const now = Date.now();
    for (const [k, exp] of Object.entries(raw || {})) {
      if (typeof exp === 'number' && exp > now) {
        operatorSessions.set(k, exp);
      }
    }
  }
} catch {
  // ignore corrupted session file
}

function saveOperatorSessions() {
  try {
    const obj: Record<string, number> = {};
    const now = Date.now();
    for (const [k, exp] of operatorSessions.entries()) {
      if (exp > now) obj[k] = exp;
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), { mode: 0o600 });
  } catch {
    // ignore
  }
}

const codexManager = new CodexCliManager(DATA_DIR);

// Spawn & supervise real Debian 13 Python backend daemon on 127.0.0.1:8765
const DEBIAN13_PORT = Number(process.env.DEBIAN13_API_PORT || 8765);
let debian13Process: ChildProcess | null = null;

function startDebian13PythonDaemon(): number | null {
  const scriptPath = path.resolve('debian13/system/server.py');
  if (!fs.existsSync(scriptPath)) return null;
  if (debian13Process && debian13Process.exitCode === null && !debian13Process.killed) {
    return debian13Process.pid ?? null;
  }
  try {
    debian13Process = spawn('python3', ['-u', scriptPath], {
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(DEBIAN13_PORT),
        DEBIAN13_API_PORT: String(DEBIAN13_PORT),
        DEBIAN13_API_TOKEN: operatorSecret,
        DEBIAN13_STATE_DIR,
        WORKSPACE_DIR,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    debian13Process.on('error', (err) => {
      console.error('[Debian 13 Python Daemon Error]:', err.message);
    });
    return debian13Process.pid ?? null;
  } catch (err) {
    console.error('[Debian 13 Spawn Error]:', err);
    return null;
  }
}

startDebian13PythonDaemon();

type Job = {
  id: string;
  sessionId: string;
  messageId: string;
  to: AgentName;
  content: string;
  status: 'queued' | 'running' | 'done';
  leaseUntil: number;
  attempts: number;
  workerId?: string;
};

type Database = {
  revision: number;
  updatedAt: string;
  sessions: Session[];
  messages: Message[];
  avatars: Record<string, string>;
  jobs: Job[];
  svlCoreState?: {
    ariaConnected: boolean;
    ariaPid: number | null;
    ariaConnectedAt: string | null;
    lastReport: SvlCoreReport | null;
  };
};

function defaultDb(): Database {
  const now = new Date().toISOString();
  const initialSessionId = randomUUID();
  return {
    revision: 1,
    updatedAt: now,
    sessions: [
      {
        id: initialSessionId,
        title: 'Konsola główna Bastilla OS',
        createdAt: now,
        updatedAt: now,
        archived: false,
      },
    ],
    messages: [
      {
        id: randomUUID(),
        sessionId: initialSessionId,
        role: 'system',
        author: 'SVL Kernel · Debian 13',
        content:
          'System Bastilla OS / SVL_System załadowany. Wpisz `podłącz moje ai aria`, aby uruchomić SVL Core v5.6.0-QuantumWheel (TopologicalInfinityEngine) i podłączyć agenta Aria, lub otwórz Terminale PTY (Bash, Python, OpenAI Codex CLI, AI NLP, Admin Sudo).',
        createdAt: now,
        status: 'delivered',
        provider: 'SVLSystemKernel · v5.6.0-QuantumWheel',
      },
    ],
    avatars: {},
    jobs: [],
    svlCoreState: {
      ariaConnected: false,
      ariaPid: null,
      ariaConnectedAt: null,
      lastReport: null,
    },
  };
}

function loadDb(): Database {
  try {
    if (!fs.existsSync(DB_FILE)) return defaultDb();
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    if (!Array.isArray(parsed.sessions) || !Array.isArray(parsed.messages)) return defaultDb();
    return {
      revision: Number(parsed.revision) || 1,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      sessions: parsed.sessions,
      messages: parsed.messages,
      avatars: parsed.avatars && typeof parsed.avatars === 'object' ? parsed.avatars : {},
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      svlCoreState: parsed.svlCoreState || {
        ariaConnected: false,
        ariaPid: null,
        ariaConnectedAt: null,
        lastReport: null,
      },
    };
  } catch {
    return defaultDb();
  }
}

const db = loadDb();
if (!db.sessions.some((s) => !s.archived)) {
  const fresh = defaultDb();
  db.sessions.push(...fresh.sessions);
  db.messages.push(...fresh.messages);
}

const heartbeats = new Map<AgentName, { workerId: string; lastSeen: string; pid?: number }>();
// A one-shot report does not prove that an Aria worker is running.
if (db.svlCoreState) {
  db.svlCoreState.ariaConnected = false;
  db.svlCoreState.ariaPid = null;
  db.svlCoreState.ariaConnectedAt = null;
}

function persist() {
  db.revision += 1;
  db.updatedAt = new Date().toISOString();
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '6mb' }));
app.use(requireGitHubWriteToken);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.post('/api/github/export', (_req, res) => res.status(410).json({ success: false, error: 'Ta trasa została wycofana.' }));
app.post('/api/github/pull', (_req, res) => res.status(410).json({ success: false, error: 'Ta trasa została wycofana.' }));
app.use(requireGitHubWriteToken);
app.use('/api/fleet', createFleetRouter({
  file: process.env.FLEET_STORE_PATH || path.join(DATA_DIR, 'fleet-registry.json'),
}));

const sseClients = new Set<express.Response>();
function publish(reason: string) {
  const payload = `event: update\ndata: ${JSON.stringify({
    reason,
    revision: db.revision,
    updatedAt: db.updatedAt,
  })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function sendError(res: express.Response, message: string, code = 400, extra: Record<string, unknown> = {}) {
  return res.status(code).json({ error: message, ...extra });
}

function secureEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.byteLength === bufB.byteLength && timingSafeEqual(bufA, bufB);
}

function isHttpsRequest(req: express.Request): boolean {
  return (
    req.secure ||
    String(req.header('x-forwarded-proto') || '').toLowerCase() === 'https' ||
    process.env.SVL_HTTPS === 'true'
  );
}

function getOperatorAuthState(req: express.Request): OperatorAuthState {
  const cookieHeader = String(req.header('cookie') || '');
  const validSession = hasValidOperatorSession(cookieHeader, operatorSessions);
  const explicitTokenRequired = Boolean((process.env.SVL_OPERATOR_TOKEN || '').trim().length >= 32);
  if (validSession || (!explicitTokenRequired && !req.header('x-forwarded-for') && isLoopbackAddress(req.socket.remoteAddress) && isLoopbackHost(req.header('host')))) {
    return { tokenConfigured: operatorSecret.length >= 32, tokenLength: operatorSecret.length, authenticated: true, sessionSource: validSession ? 'cookie' : 'local_loopback', httpsDetected: isHttpsRequest(req) };
  }
  return {
    tokenConfigured: operatorSecret.length >= 32,
    tokenLength: operatorSecret.length,
    authenticated: false,
    sessionSource: 'unauthenticated',
    httpsDetected: isHttpsRequest(req),
  };
}

// --- OLLAMA & HARDWARE RESOURCE DIAGNOSTICS ---
const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const preferredOllamaModel = process.env.OLLAMA_MODEL || 'qwen2.5-vl:14b';
const fallbackVisionModel = 'llama3.2-vision:11b';
const ollamaLogs: string[] = [
  `[${new Date().toISOString()}] Skonfigurowano endpoint Ollama: ${ollamaBaseUrl}`,
  `[${new Date().toISOString()}] Preferowany tag modelu: ${preferredOllamaModel} (fallback Vision: ${fallbackVisionModel}); obsługa obrazów wymaga potwierdzenia przez /api/show`,
];

async function getHardwareResources() {
  const totalRamMB = Math.round(os.totalmem() / 1048576);
  const freeRamMB = Math.round(os.freemem() / 1048576);
  let diskFreeGB = 0;
  try {
    const { stdout } = await execFileAsync('df', ['-B1', '/'], { timeout: 2000 });
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      const cols = lines[1].trim().split(/\s+/);
      const availBytes = Number(cols[3] || 0);
      diskFreeGB = Math.round((availBytes / (1024 ** 3)) * 10) / 10;
    }
  } catch {
    diskFreeGB = 0;
  }

  let gpuDetected = false;
  let gpuName = 'Brak dedykowanego GPU (kontener CPU x86_64)';
  try {
    const { stdout } = await execFileAsync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
      timeout: 1500,
    });
    if (stdout.trim()) {
      gpuDetected = true;
      gpuName = stdout.trim().split('\n')[0];
    }
  } catch {
    gpuDetected = false;
  }

  return {
    totalRamMB,
    freeRamMB,
    diskFreeGB,
    gpuDetected,
    gpuName,
    canRun14BQ4: totalRamMB >= 10240 && diskFreeGB >= 10,
  };
}

async function checkOllamaStatus(): Promise<ModelState> {
  const resources = await getHardwareResources();
  const signal = AbortSignal.timeout(2000);
  try {
<<<<<<< HEAD
    let selection = await resolveVisionModel({
=======
    const r = await fetch(`${ollamaBaseUrl}/api/tags`, { signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = (await r.json()) as { models?: { name?: string }[] };
    const models = (data.models || []).map((m) => m.name || '').filter(Boolean);
    const selected =
      models.find((m) => m.includes('14b') || m.includes('vision') || m.includes('vl')) ||
      models[0] ||
      null;
    const vision = selected
      ? await resolveVisionModel({
          baseUrl: ollamaBaseUrl,
          requested: selected,
          signal: controller.signal,
        })
      : null;
    const visionCapable = vision?.visionSupported === true;
    return {
      reachable: true,
>>>>>>> 82393e2 (Dziala)
      baseUrl: ollamaBaseUrl,
      requested: preferredOllamaModel,
      signal,
    });
    if (!selection.model && preferredOllamaModel.toLowerCase() !== 'auto') {
      selection = await resolveVisionModel({ baseUrl: ollamaBaseUrl, requested: 'auto', signal });
    }
    return {
      reachable: selection.reachable,
      baseUrl: ollamaBaseUrl,
      model: selection.model,
      preferredModel: preferredOllamaModel,
      fallbackVisionModel,
      models: selection.models,
      visionCapable: selection.visionSupported,
      ...(selection.error ? { error: selection.error } : {}),
      resources,
      logs: ollamaLogs.slice(-12),
    };
  } catch (error) {
    return {
      reachable: false,
      baseUrl: ollamaBaseUrl,
      model: null,
      preferredModel: preferredOllamaModel,
      fallbackVisionModel,
      models: [],
      visionCapable: false,
      error: error instanceof Error ? error.message : 'Brak połączenia z demonem Ollama na porcie 11434',
      resources,
      logs: ollamaLogs.slice(-12),
    };
  }
}

// --- DEBIAN 13 RUNTIME & HOST OBSERVER STATUS ---
type HostSnapshot = {
  hostname: string;
  os: string;
  kernel?: string;
  scope: string;
  uid?: number;
  observedAt: string;
  memoryPercent: number;
  diskPercent?: number;
  processCount?: number;
  services: { name: string; state: string }[];
  ollama?: { reachable: boolean; models: string[] };
};
let hostData: HostSnapshot | null = null;
let hostReceivedAt = 0;

function readOsRelease(): string {
  try {
    const content = fs.readFileSync('/etc/os-release', 'utf-8');
    const pretty = content
      .split('\n')
      .find((l) => l.startsWith('PRETTY_NAME='))
      ?.split('=')[1]
      ?.replace(/"/g, '');
    return pretty || 'Debian GNU/Linux';
  } catch {
    return `${os.type()} ${os.release()}`;
  }
}

async function getDebian13RuntimeState(): Promise<Debian13RuntimeState> {
  const pid = startDebian13PythonDaemon();
  let daemonReachable = false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1200);
    const res = await fetch(`http://127.0.0.1:${DEBIAN13_PORT}/healthz`, { signal: ctrl.signal });
    clearTimeout(t);
    daemonReachable = res.ok;
  } catch {
    daemonReachable = false;
  }

  const hostConnected = hostData !== null && Date.now() - hostReceivedAt < 45000;
  return {
    daemonRunning: Boolean(pid && daemonReachable),
    daemonPid: pid,
    daemonPort: DEBIAN13_PORT,
    daemonReachable,
    containerOs: readOsRelease(),
    kernelRelease: os.release(),
    arch: os.arch(),
    uid: typeof process.getuid === 'function' ? process.getuid() : 0,
    user: os.userInfo().username || 'root',
    systemdAvailable: fs.existsSync('/run/systemd/system'),
    hostObserverConnected: hostConnected,
    hostSnapshot: hostConnected ? hostData : null,
    persistenceDir: DATA_DIR,
  };
}

// --- GITHUB CLI & MAIN SYNC STATUS ---
async function getGitHubSyncState(): Promise<GitHubSyncState> {
  let ghVersion: string | null = null;
  let ghInstalled = false;
  try {
    const { stdout } = await execFileAsync('gh', ['--version'], { timeout: 3000 });
    ghVersion = stdout.trim().split('\n')[0] || null;
    ghInstalled = Boolean(ghVersion);
  } catch {
    ghInstalled = false;
  }

  let branch = 'main';
  let commitSha = 'unknown';
  let remotes: { name: string; url: string }[] = [];
  let workingTreeClean = true;
  let modifiedCount = 0;

  try {
    const { stdout: bOut } = await execFileAsync('git', ['branch', '--show-current'], { timeout: 3000 });
    branch = bOut.trim() || 'main';
  } catch {}

  try {
    const { stdout: shaOut } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { timeout: 3000 });
    commitSha = shaOut.trim() || 'unknown';
  } catch {}

  try {
    const { stdout: remOut } = await execFileAsync('git', ['remote', '-v'], { timeout: 3000 });
    const seen = new Set<string>();
    for (const line of remOut.trim().split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && !seen.has(parts[0])) {
        seen.add(parts[0]);
        remotes.push({ name: parts[0], url: parts[1] });
      }
    }
  } catch {}

  try {
    const { stdout: stOut } = await execFileAsync('git', ['status', '--porcelain'], { timeout: 3000 });
    const lines = stOut
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    modifiedCount = lines.length;
    workingTreeClean = modifiedCount === 0;
  } catch {}

  let ghAuthenticated = Boolean((process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim());
  let authMessage = ghAuthenticated
    ? 'Token GitHub (GITHUB_TOKEN / GH_TOKEN) skonfigurowany w środowisku.'
    : 'Brak aktywnej sesji zapisu GitHub CLI (odczyt repozytoriów publicznych działa; zapis na gałąź main wymaga gh auth login lub GITHUB_TOKEN).';

  if (ghInstalled && !ghAuthenticated) {
    try {
      const { stdout } = await execFileAsync('gh', ['auth', 'status'], { timeout: 3000 });
      ghAuthenticated = true;
      authMessage = stripAnsiCodes(stdout).trim().split('\n')[0] || 'Zalogowano w GitHub CLI';
    } catch (err: any) {
      const msg = stripAnsiCodes(`${err?.stderr || ''}\n${err?.stdout || ''}`).trim();
      if (msg) authMessage = msg.split('\n')[0];
    }
  }

  return {
    gitInstalled: true,
    ghInstalled,
    ghVersion,
    branch,
    commitSha,
    remotes,
    workingTreeClean,
    modifiedCount,
    ghAuthenticated,
    authMessage,
  };
}

// --- SVL CORE STATUS ---
function getCurrentSvlCoreReport(): SvlCoreReport {
  if (db.svlCoreState?.lastReport) {
    return {
      ...db.svlCoreState.lastReport,
      ariaConnected: Boolean(db.svlCoreState.ariaConnected),
      ariaPid: db.svlCoreState.ariaPid,
      ariaConnectedAt: db.svlCoreState.ariaConnectedAt,
    };
  }
  const metricC = Number(calculateTopologicalMetricC(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY).toFixed(6));
  return {
    Timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    System: '5.6.0-QuantumWheel',
    Operator: 'Mateusz Mitek',
    Performance: '+1456% (Wzorzec Kalibracji: 364)',
    Compact_Metric_C: metricC,
    Config_Snapshot: {
      mode: 'Reflective-Non-Greedy',
      fourier_buffer: '0xFAAA',
      acoustic_resonance_hz: 880,
      milieu_therapy_active: true,
      ip_rotation_gateway: 'ENABLED_EXTERNAL_ONLY',
    },
    Actual_SI_Updates_Count: 3,
    ariaConnected: false,
    ariaPid: null,
    ariaConnectedAt: null,
  };
}

function getAgentStates(): AgentState[] {
  const now = Date.now();
  return AGENTS.map((name) => {
    const beat = heartbeats.get(name);
    const heartbeatAge = beat ? now - new Date(beat.lastSeen).valueOf() : Number.POSITIVE_INFINITY;
    const connected = heartbeatAge >= -5000 && heartbeatAge < 90000;
    return {
      name,
      id: name === 'Aria' ? 'si_1' : name,
      connected,
      lastSeen: beat?.lastSeen || null,
      workerId: beat?.workerId || null,
      pid: beat?.pid ?? null,
      kernelVersion: null,
      roleNote: 'Status online wymaga świeżego heartbeat workera',
    };
  });
}

async function buildServerHealth(req: express.Request): Promise<ServerHealth> {
  const [ollama, codexCli, debian13, github] = await Promise.all([
    checkOllamaStatus(),
    codexManager.getStatus(),
    getDebian13RuntimeState(),
    getGitHubSyncState(),
  ]);
  const svlCore = getCurrentSvlCoreReport();
  const operatorAuth = getOperatorAuthState(req);
  const geminiConfigured = Boolean((process.env.GEMINI_API_KEY || '').trim());

  return {
    backend: 'online',
    observedAt: new Date().toISOString(),
    ollama,
    codexCli,
    debian13,
    svlCore,
    github,
    operatorAuth,
    geminiConfigured,
    agents: getAgentStates(),
    limitations: [
      'Środowisko wykonawcze AI Studio działa w kontenerze Linux (4.19.0-gvisor) bez demona systemd (PID 1) i fizycznego GPU.',
      'Terminale Bash, Python, Codex CLI, AI NLP oraz Admin Sudo wykonują rzeczywiste procesy w kontenerze przez PTY i WebSocket.',
      'Agenci Alex, Aria, Astyria i Aurelius nie są symulowani — Aria podłącza się jawnie poleceniem „podłącz moje ai aria” z kodem SVLSystemKernel v5.6.0-QuantumWheel.',
    ],
  };
}

// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/login', (req, res) => {
  const given = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!operatorSecret || operatorSecret.length < 32) {
    return sendError(res, 'SVL_OPERATOR_TOKEN na backendzie musi mieć co najmniej 32 znaki.', 503);
  }
  if (!given || !secureEqual(given, operatorSecret)) {
    return sendError(res, 'Nieprawidłowy token operatora SVL_OPERATOR_TOKEN.', 401);
  }
  const ticket = randomUUID() + randomUUID();
  const maxAgeMs = 12 * 60 * 60 * 1000;
  operatorSessions.set(ticket, Date.now() + maxAgeMs);
  saveOperatorSessions();

  const https = isHttpsRequest(req);
  res.cookie('svl_session', ticket, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    path: '/',
    maxAge: maxAgeMs,
  });
  res.json({ ok: true, sessionSource: 'cookie' });
});

app.post('/api/auth/logout', (req, res) => {
  const cookieHeader = String(req.header('cookie') || '');
  const cookieEntry = cookieHeader
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('svl_session='));
  const sessionTicket = cookieEntry ? cookieEntry.slice('svl_session='.length) : '';
  if (sessionTicket) {
    operatorSessions.delete(sessionTicket);
    saveOperatorSessions();
  }
  res.clearCookie('svl_session', { path: '/' });
  res.json({ ok: true });
});

// Middleware protecting state when SVL_OPERATOR_TOKEN is explicitly enforced in env
app.use('/api', (req, res, next) => {
  if (
    req.path === '/auth/login' ||
    req.path === '/auth/logout' ||
    req.path === '/linux/ingest' ||
    req.path.startsWith('/worker/')
  ) {
    return next();
  }
  const auth = getOperatorAuthState(req);
  if (!auth.authenticated) {
    return sendError(res, 'Wymagane logowanie operatora (SVL_OPERATOR_TOKEN).', 401, {
      loginRequired: true,
    });
  }
  next();
});
app.use('/api/hyper-com', createHyperComRouter(DATA_DIR));

// --- CORE HEALTH, BOOTSTRAP & SSE ---
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', async (req, res) => {
  res.json(await buildServerHealth(req));
});

app.get('/api/state', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    sessions: db.sessions,
    messages: db.messages,
    avatars: db.avatars,
    revision: db.revision,
    updatedAt: db.updatedAt,
  });
});

app.get('/api/bootstrap', async (req, res) => {
  const health = await buildServerHealth(req);
  const payload: Bootstrap = {
    sessions: db.sessions,
    messages: db.messages,
    avatars: db.avatars,
    health,
    revision: db.revision,
    updatedAt: db.updatedAt,
  };
  res.json(payload);
});

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(
    `event: ready\ndata: ${JSON.stringify({
      revision: db.revision,
      updatedAt: db.updatedAt,
    })}\n\n`,
  );
  sseClients.add(res);
  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
      sseClients.delete(res);
    }
  }, 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// --- CODEX CLI ENDPOINTS ---
app.get('/api/codex/status', async (_req, res) => {
  res.json(await codexManager.getStatus());
});

app.post('/api/codex/login', async (_req, res) => {
  try {
    const deviceAuth = await codexManager.startChatGptDeviceLogin();
    publish('codex');
    res.json({ ok: true, deviceAuth });
  } catch (e) {
    sendError(res, e instanceof Error ? e.message : 'Nie udało się uruchomić logowania Codex CLI.', 500);
  }
});

// --- ARIA SVL CORE v5.6.0-QuantumWheel CONNECTION ---
async function executeAriaConnect(sessionId?: string): Promise<{
  report: SvlCoreReport;
  rawJson: string;
  message?: Message;
}> {
  const { report, rawJson, pid } = await runPythonSvlCoreReport(process.cwd());
  db.svlCoreState = {
    ariaConnected: false,
    ariaPid: null,
    ariaConnectedAt: null,
    lastReport: report,
  };


  let createdMsg: Message | undefined;
  const targetSession = sessionId
    ? db.sessions.find((s) => s.id === sessionId)
    : db.sessions.find((s) => !s.archived);

  if (targetSession) {
    const uiBlock = {
      components: [
        {
          type: 'status',
          title: `Aria (si_1) · ${report.System}`,
          status: 'info',
          text: `Operator: ${report.Operator} · Wydajność: ${report.Performance} · PID: ${pid}`,
        },
        {
          type: 'kv',
          title: 'TopologicalInfinityEngine (Algebra 97 · [-1, 1])',
          items: [
            { key: 'Operator (SVLProtectedVariable)', value: report.Operator },
            { key: 'Wersja systemu (SYS_VERSION)', value: report.System },
            { key: 'Wzorzec Kalibracji', value: report.Performance },
            { key: 'Compact_Metric_C', value: String(report.Compact_Metric_C) },
            { key: 'Tryb jądra', value: report.Config_Snapshot.mode },
            { key: 'Bufor Fouriera', value: report.Config_Snapshot.fourier_buffer },
            { key: 'Rezonans akustyczny', value: `${report.Config_Snapshot.acoustic_resonance_hz} Hz` },
            { key: 'Terapia środowiskowa (Milieu)', value: String(report.Config_Snapshot.milieu_therapy_active) },
            { key: 'Brama rotacji IP', value: report.Config_Snapshot.ip_rotation_gateway },
            { key: 'Wpisów w Rejestrze Chrono', value: String(report.Actual_SI_Updates_Count) },
          ],
        },
        {
          type: 'json',
          title: 'Zrzut stanu SVLSystemKernel (svl_core.py)',
          data: JSON.parse(rawJson),
        },
      ],
    };

    const content = [
      `Podłączono agenta AI Aria (si_1) przez natywny pipeline Python svl_core.py (PID ${pid}). Klasa SVLProtectedVariable zabezpieczona (MAXIMUM, zakres CAŁOŚĆ, geometria Spherical-PXYZ).`,
      '',
      '```svl-ui',
      JSON.stringify(uiBlock, null, 2),
      '```',
    ].join('\n');

    createdMsg = {
      id: randomUUID(),
      sessionId: targetSession.id,
      role: 'agent',
      author: 'Aria',
      content,
      createdAt: new Date().toISOString(),
      status: 'delivered',
      provider: `Python3 · SVLSystemKernel ${report.System}`,
    };
    db.messages.push(createdMsg);
    targetSession.updatedAt = createdMsg.createdAt;
  }

  persist();
  publish('aria-connected');
  return { report, rawJson, message: createdMsg };
}

app.post('/api/aria/connect', async (req, res) => {
  try {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined;
    const result = await executeAriaConnect(sessionId);
    res.json({ ok: true, ...result });
  } catch (e) {
    sendError(res, e instanceof Error ? e.message : 'Błąd wykonania svl_core.py', 500);
  }
});

// --- 5 REAL TERMINALS: HTTP EXEC + WEBSOCKET PTY ---
let lastBashCwd = process.cwd();

app.post('/api/terminal/exec', async (req, res) => {
  const terminal: TerminalKind = ['bash', 'python', 'codex', 'ai-nlp', 'admin-sudo'].includes(
    req.body?.terminal,
  )
    ? req.body.terminal
    : 'bash';
  const rawCommand = typeof req.body?.command === 'string' ? req.body.command.trim() : '';
  if (!rawCommand) {
    return sendError(res, 'Podaj polecenie do wykonania w terminalu.', 400);
  }
  if (rawCommand.length > 4000) {
    return sendError(res, 'Polecenie przekracza limit 4000 znaków.', 400);
  }

  const startMs = Date.now();
  const executedAt = new Date().toISOString();

  try {
    if (terminal === 'python') {
      const pyBanner = `from svl_core import VisualScope, SVLProtectedVariable, TopologicalInfinityEngine, SVLSystemKernel, kernel\n`;
      const { stdout, stderr } = await execFileAsync('python3', ['-c', pyBanner + rawCommand], {
        cwd: lastBashCwd,
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });
      const resp: TerminalExecResponse = {
        terminal,
        command: rawCommand,
        stdout,
        stderr,
        exitCode: 0,
        cwd: lastBashCwd,
        executedAt,
        durationMs: Date.now() - startMs,
        provider: 'Python 3.10 · SVL Core',
      };
      return res.json(resp);
    }

    if (terminal === 'codex') {
      const codexBin = codexManager.getCodexBinary() || 'codex';
      const args = parseCodexCliCommand(rawCommand);
      if (isCodexDeviceAuthCommand(args)) {
        const device = await codexManager.startChatGptDeviceLogin();
        const out = [
          device.rawOutput || 'Uruchomiono autoryzację urządzenia OpenAI Codex CLI.',
          device.verificationUrl ? `URL weryfikacji: ${device.verificationUrl}` : '',
          device.userCode ? `Kod jednorazowy: ${device.userCode}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        return res.json({
          terminal,
          command: rawCommand,
          stdout: out,
          stderr: '',
          exitCode: 0,
          cwd: lastBashCwd,
          executedAt,
          durationMs: Date.now() - startMs,
          provider: 'OpenAI Codex CLI (Device Auth)',
        });
      }

      const { stdout, stderr } = await execFileAsync(codexBin, args.length ? args : ['--version'], {
        cwd: lastBashCwd,
        timeout: 20000,
        env: { ...process.env, CODEX_HOME: path.join(DATA_DIR, '.codex'), NO_COLOR: '1' },
      });
      return res.json({
        terminal,
        command: rawCommand,
        stdout: stripAnsiCodes(stdout),
        stderr: stripAnsiCodes(stderr),
        exitCode: 0,
        cwd: lastBashCwd,
        executedAt,
        durationMs: Date.now() - startMs,
        provider: 'OpenAI Codex CLI',
      });
    }

    if (terminal === 'ai-nlp') {
      if (isAriaConnectCommand(rawCommand)) {
        const ariaRes = await executeAriaConnect();
        return res.json({
          terminal,
          command: rawCommand,
          stdout: `Podłączono AI Aria (${ariaRes.report.System}, PID ${ariaRes.report.ariaPid}).\n${ariaRes.rawJson}`,
          stderr: '',
          exitCode: 0,
          cwd: lastBashCwd,
          executedAt,
          durationMs: Date.now() - startMs,
          provider: 'SVLSystemKernel · Aria',
        });
      }

      const reply = await answerNaturalLanguageCommand(rawCommand);
      return res.json({
        terminal,
        command: rawCommand,
        stdout: reply.content,
        stderr: '',
        exitCode: 0,
        cwd: lastBashCwd,
        executedAt,
        durationMs: Date.now() - startMs,
        provider: reply.provider,
      });
    }

    if (terminal === 'admin-sudo') {
      const auth = getOperatorAuthState(req);
      if (!auth.authenticated) {
        return sendError(res, 'Terminal administracyjny wymaga uwierzytelnionej sesji operatora.', 403);
      }
      const cleanCmd = rawCommand.replace(/^sudo\s+/i, '');
      fs.appendFileSync(
        ADMIN_AUDIT_LOG,
        `[${executedAt}] [OPERATOR:${auth.sessionSource}] ${rawCommand}\n`,
        { mode: 0o600 },
      );
      const { stdout, stderr } = await execFileAsync('/bin/bash', ['-c', cleanCmd], {
        cwd: lastBashCwd,
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });
      return res.json({
        terminal,
        command: rawCommand,
        stdout,
        stderr,
        exitCode: 0,
        cwd: lastBashCwd,
        executedAt,
        durationMs: Date.now() - startMs,
        provider: 'Admin Audit Shell (UID 0)',
      });
    }

    // Default: Linux Bash
    const wrappedCmd = `${rawCommand}\necho "__BASTILLA_CWD__:$(pwd)"`;
    const { stdout, stderr } = await execFileAsync('/bin/bash', ['-c', wrappedCmd], {
      cwd: lastBashCwd,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    let cleanStdout = stdout;
    const cwdMatch = stdout.match(/__BASTILLA_CWD__:([^\r\n]+)/);
    if (cwdMatch && cwdMatch[1]) {
      lastBashCwd = cwdMatch[1].trim();
      cleanStdout = stdout.replace(/\n?__BASTILLA_CWD__:[^\r\n]+\n?/, '\n').trimEnd();
    }
    return res.json({
      terminal: 'bash',
      command: rawCommand,
      stdout: cleanStdout,
      stderr,
      exitCode: 0,
      cwd: lastBashCwd,
      executedAt,
      durationMs: Date.now() - startMs,
      provider: 'Linux Bash (/bin/bash)',
    });
  } catch (err: any) {
    return res.json({
      terminal,
      command: rawCommand,
      stdout: stripAnsiCodes(String(err?.stdout || '')),
      stderr: stripAnsiCodes(String(err?.stderr || err?.message || 'Błąd wykonania polecenia')),
      exitCode: typeof err?.code === 'number' ? err.code : 1,
      cwd: lastBashCwd,
      executedAt,
      durationMs: Date.now() - startMs,
    });
  }
});

// --- GITHUB SYNC ENDPOINTS ---
app.get('/api/github/status', async (_req, res) => {
  res.json(await getGitHubSyncState());
});

app.post('/api/github/sync', async (req, res) => {
  const action = req.body?.action;
  if (!['status', 'fetch', 'pull', 'push'].includes(action)) {
    return sendError(res, 'Nieobsługiwana operacja GitHub.', 400);
  }
  try {
    let output = '';
    if (action === 'status') {
      const { stdout } = await execFileAsync('git', ['status', '-sb'], { timeout: 6000 });
      output = stdout.trim();
    } else if (action === 'fetch') {
      const { stdout, stderr } = await execFileAsync('git', ['fetch', 'origin', 'main'], {
        timeout: 12000,
      });
      output = `${stdout}\n${stderr}`.trim() || 'Pobrano referencje origin/main.';
    } else if (action === 'pull') {
      const { stdout, stderr } = await execFileAsync(
        'git',
        ['pull', '--ff-only', 'origin', 'main'],
        { timeout: 15000 },
      );
      output = `${stdout}\n${stderr}`.trim();
    } else if (action === 'push') {
      const state = await getGitHubSyncState();
      if (!state.ghAuthenticated) {
        return sendError(
          res,
          'Publikacja na gałąź main wymaga aktywnej autoryzacji GitHub CLI (gh auth login) lub GITHUB_TOKEN.',
          403,
        );
      }
      const { stdout, stderr } = await execFileAsync('git', ['push', 'origin', 'main'], {
        timeout: 15000,
      });
      output = `${stdout}\n${stderr}`.trim();
    }
    const state = await getGitHubSyncState();
    publish('github');
    res.json({ ok: true, output, state });
  } catch (err: any) {
    sendError(
      res,
      stripAnsiCodes(String(err?.stderr || err?.message || 'Błąd operacji git')),
      500,
    );
  }
});

// --- SERVICES RESTART ---
app.post('/api/services/restart', async (_req, res) => {
  if (debian13Process && debian13Process.exitCode === null) {
    try {
      debian13Process.kill('SIGTERM');
    } catch {}
    debian13Process = null;
  }
  const pid = startDebian13PythonDaemon();
  publish('services');
  res.json({
    ok: true,
    debian13Pid: pid,
    message: `Zrestartowano demona Debian 13 Python API (PID: ${pid ?? 'brak'}).`,
  });
});

// --- LINUX HOST OBSERVER INGEST & STATUS ---
const linuxSecret = (process.env.SVL_LINUX_SYNC_TOKEN || '').trim();
app.post('/api/linux/ingest', (req, res) => {
  const provided = (req.header('authorization') || '').replace(/^Bearer /i, '');
  if (linuxSecret.length < 32 || !secureEqual(provided, linuxSecret)) {
    return sendError(res, 'Brak autoryzacji obserwatora Linux.', 401);
  }
  const body = req.body || {};
  if (
    typeof body.hostname !== 'string' ||
    body.hostname.length > 128 ||
    body.scope !== 'linux-host' ||
    typeof body.os !== 'string' ||
    typeof body.memoryPercent !== 'number' ||
    !Array.isArray(body.services)
  ) {
    return sendError(res, 'Niepoprawna próbka Linux.');
  }
  hostData = {
    hostname: body.hostname,
    os: body.os.slice(0, 150),
    kernel: String(body.kernel || '').slice(0, 150),
    scope: 'linux-host',
    uid: Number.isInteger(body.uid) ? body.uid : undefined,
    observedAt: String(body.observedAt || '').slice(0, 50),
    memoryPercent: Math.max(0, Math.min(100, body.memoryPercent)),
    diskPercent: Number(body.diskPercent) || 0,
    processCount: Number(body.processCount) || 0,
    services: body.services.map((item: any) => ({
      name: String(item.name || '').slice(0, 120),
      state: String(item.state || '').slice(0, 32),
    })),
    ollama:
      body.ollama && typeof body.ollama === 'object'
        ? {
            reachable: body.ollama.reachable === true,
            models: Array.isArray(body.ollama.models)
              ? body.ollama.models.filter((x: unknown) => typeof x === 'string').slice(0, 40)
              : [],
          }
        : undefined,
  };
  hostReceivedAt = Date.now();
  publish('linux');
  res.json({ ok: true, revision: db.revision });
});

app.get('/api/linux/status', async (_req, res) => {
  const connected = hostData !== null && Date.now() - hostReceivedAt < 45000;
  const container = await getDebian13RuntimeState();
  res.json({
    connected,
    receivedAt: connected ? new Date(hostReceivedAt).toISOString() : null,
    host: connected ? hostData : null,
    container,
    note: connected
      ? 'Rzeczywisty odczyt z uwierzytelnionego obserwatora Linux'
      : 'Lokalny kontener Linux + demon Debian 13 Python API aktywny. Zewnętrzny host observer (linux-sync-agent) nie przesłał jeszcze próbki.',
  });
});

// --- SESSIONS & AVATARS ---
function validSession(id: string): Session | undefined {
  return db.sessions.find((s) => s.id === id && !s.archived);
}

app.post('/api/sessions', (req, res) => {
  const now = new Date().toISOString();
  const title =
    typeof req.body?.title === 'string' && req.body.title.trim()
      ? req.body.title.trim().slice(0, 80)
      : 'Nowa rozmowa';
  const session: Session = {
    id: randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    archived: false,
  };
  db.sessions.unshift(session);
  persist();
  publish('sessions');
  res.status(201).json(session);
});

app.post('/api/sessions/:id/archive', (req, res) => {
  const s = db.sessions.find((x) => x.id === req.params.id);
  if (!s) return sendError(res, 'Nie znaleziono rozmowy.', 404);
  s.archived = true;
  s.updatedAt = new Date().toISOString();
  if (!db.sessions.some((x) => !x.archived)) {
    const now = new Date().toISOString();
    db.sessions.unshift({
      id: randomUUID(),
      title: 'Nowa rozmowa',
      createdAt: now,
      updatedAt: now,
      archived: false,
    });
  }
  persist();
  publish('sessions');
  res.json({ success: true });
});

app.put('/api/avatars', (req, res) => {
  const name = String(req.body?.name || '');
  const value = String(req.body?.value || '').trim();
  if (!['Operator', ...AGENTS].includes(name)) return sendError(res, 'Nieznany profil.');
  if (value === '') {
    delete db.avatars[name];
  } else {
    const validHttps = /^https:\/\/[^\s"'<>]+$/i.test(value) && value.length <= 2048;
    const validData =
      /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value) &&
      value.length <= 550000;
    if (!validHttps && !validData) {
      return sendError(res, 'Awatar wymaga adresu HTTPS lub obrazu PNG/JPEG/WEBP/GIF do 390 KB.');
    }
    db.avatars[name] = value;
  }
  persist();
  publish('avatars');
  res.json({ success: true, avatars: db.avatars });
});

// --- AI MODEL INFERENCE (OLLAMA -> GEMINI -> SVL KERNEL) ---
async function answerWithOllama(
  input: string,
  history: Message[],
  attachments?: ChatAttachmentPayload[],
): Promise<{ content: string; provider: string }> {
  const state = await checkOllamaStatus();
  if (!state.reachable || !state.model) {
    throw new Error(state.error || 'Demon Ollama nie odpowiada lub brak pobranego modelu.');
  }
  const images = (attachments || [])
    .filter((a) => a.mimeType.startsWith('image/') && a.dataUrl.includes(','))
    .map((a) => a.dataUrl.split(',')[1]);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 35000);
  try {
    const messagesPayload = [
      {
        role: 'system',
        content:
          'Jesteś systemowym asystentem Bastilla OS / SVL_System na Debian 13. Odpowiadaj konkretnie po polsku. Nie symuluj wykonanych operacji.',
      },
      ...history.slice(-10).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
      {
        role: 'user',
        content: input,
        ...(images.length ? { images } : {}),
      },
    ];
    const r = await fetch(`${ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: state.model, stream: false, messages: messagesPayload }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
    const body = (await r.json()) as { message?: { content?: string } };
    const content = body.message?.content?.trim();
    if (!content) throw new Error('Ollama zwróciła pustą odpowiedź.');
    return { content, provider: `Ollama · ${state.model}` };
  } finally {
    clearTimeout(timer);
  }
}

async function answerWithGemini(
  input: string,
  attachments?: ChatAttachmentPayload[],
): Promise<{ content: string; provider: string }> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('Brak skonfigurowanego GEMINI_API_KEY po stronie serwera.');

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const parts: any[] = [];
  for (const att of attachments || []) {
    if (att.mimeType.startsWith('image/') && att.dataUrl.includes(',')) {
      parts.push({
        inlineData: {
          mimeType: att.mimeType,
          data: att.dataUrl.split(',')[1],
        },
      });
    }
  }
  parts.push({
    text:
      `Jesteś asystentem systemu Bastilla OS / SVL_System (v5.6.0-QuantumWheel) zintegrowanego z Debianem 13. ` +
      `Operator: Mateusz Mitek. Odpowiadaj po polsku, rzeczowo i technicznie. ` +
      `Jeśli użytkownik prosi o wykres, tabelę lub kartę diagnostyczną, możesz dołączyć blok \`\`\`svl-ui {"components":[...]}\`\`\`.\n\nPolecenie użytkownika:\n${input}`,
  });

  const modelName = 'gemini-3.8-flash';
  const response = await ai.models.generateContent({
    model: modelName,
    contents: { parts },
  });
  const text = (response.text || '').trim();
  if (!text) throw new Error('Gemini zwróciło pustą odpowiedź.');
  return { content: text, provider: `Gemini · ${modelName}` };
}

async function answerNaturalLanguageCommand(
  input: string,
  history: Message[] = [],
  attachments?: ChatAttachmentPayload[],
): Promise<{ content: string; provider: string }> {
  const lower = input.toLowerCase().trim();

  if (
    lower === '/status' ||
    lower === 'status' ||
    lower === '/raport' ||
    lower === 'raport' ||
    lower.includes('pokaż element')
  ) {
    const [deb, oll, codex, gh] = await Promise.all([
      getDebian13RuntimeState(),
      checkOllamaStatus(),
      codexManager.getStatus(),
      getGitHubSyncState(),
    ]);
    const svl = getCurrentSvlCoreReport();
    const uiBlock = {
      components: [
        {
          type: 'metric',
          title: 'Compact Metric C (Algebra 97)',
          value: String(svl.Compact_Metric_C),
          text: `${svl.System} · ${svl.Performance}`,
        },
        {
          type: 'table',
          title: 'Rzeczywisty status usług Bastilla OS',
          columns: ['Komponent', 'Stan', 'Szczegóły'],
          rows: [
            ['SVLSystemKernel', svl.System, `Operator: ${svl.Operator}`],
            [
              'Agent Aria (si_1)',
              svl.ariaConnected ? 'PODŁĄCZONA' : 'OCZEKUJE',
              svl.ariaConnected ? `PID ${svl.ariaPid}` : 'Użyj: podłącz moje ai aria',
            ],
            [
              'Debian 13 Python API',
              deb.daemonRunning ? 'ONLINE' : 'OFFLINE',
              `127.0.0.1:${deb.daemonPort} (PID ${deb.daemonPid ?? '—'})`,
            ],
            ['Kontener Linux', 'AKTYWNY', `${deb.containerOs} (${deb.kernelRelease})`],
            [
              'OpenAI Codex CLI',
              codex.installed ? codex.version || 'ZAINSTALOWANY' : 'BRAK',
              codex.authenticated ? 'Zalogowano' : 'Wymaga: codex login --device-auth',
            ],
            [
              'Ollama (14B Vision)',
              oll.reachable ? 'ONLINE' : 'OFFLINE',
              `RAM: ${oll.resources.totalRamMB} MB, Dysk: ${oll.resources.diskFreeGB} GB`,
            ],
            ['GitHub CLI (main)', gh.ghVersion || 'git', `SHA: ${gh.commitSha} (${gh.branch})`],
          ],
        },
      ],
    };
    return {
      content:
        `Aktualny raport diagnostyczny **Bastilla OS / SVL_System** (\`${svl.System}\`):\n\n` +
        '```svl-ui\n' +
        JSON.stringify(uiBlock, null, 2) +
        '\n```',
      provider: 'SVLSystemKernel · Live Telemetry',
    };
  }

  // Try Ollama first if reachable
  try {
    return await answerWithOllama(input, history, attachments);
  } catch {
    // Next try server-side Gemini if configured
    try {
      return await answerWithGemini(input, attachments);
    } catch {
      // Fallback to deterministic SVL Kernel & system report
      const svl = getCurrentSvlCoreReport();
      const deb = await getDebian13RuntimeState();
      return {
        content:
          `Wiadomość zapisana w bazie Bastilla OS. Lokalny demon Ollama (\`${ollamaBaseUrl}\`) jest obecnie niedostępny, a klucz chmurowy nie odpowiedział.\n\n` +
          `- **Jądro SVL Core:** \`${svl.System}\` (Compact_Metric_C = \`${svl.Compact_Metric_C}\`, Operator: \`${svl.Operator}\`)\n` +
          `- **Agent Aria:** \`${svl.ariaConnected ? 'PODŁĄCZONA (PID ' + svl.ariaPid + ')' : 'Niepodłączona — wpisz: podłącz moje ai aria'}\`\n` +
          `- **Backend Debian 13:** \`${deb.daemonRunning ? 'AKTYWNY (port ' + deb.daemonPort + ')' : 'OFFLINE'}\`\n` +
          `- **Podpowiedź:** Wpisz \`podłącz moje ai aria\` lub \`/status\`, albo wykonaj polecenia bezpośrednio w zakładce **Terminale PTY**.`,
        provider: 'SVL Deterministic Kernel',
      };
    }
  }
}

// --- APP PREVIEW ROUTE ---
app.get('/api/apps/preview/:appId/:file(*)', (req, res) => {
  const { appId, file } = req.params;
  const filePath = path.join(process.cwd(), 'apps', appId, file || 'index.html');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('File not found');
  }
});

// --- CHAT MESSAGES ENDPOINT ---
app.post('/api/messages', async (req, res) => {
  const sessionId = String(req.body?.sessionId || '');
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  const target = req.body?.target || 'Wszyscy';
  const attachments: ChatAttachmentPayload[] = Array.isArray(req.body?.attachments)
    ? req.body.attachments.slice(0, 4)
    : [];

  const session = validSession(sessionId);
  if (!session) return sendError(res, 'Nie znaleziono aktywnej rozmowy.', 404);
  if (!content && attachments.length === 0) {
    return sendError(res, 'Wiadomość nie może być pusta.');
  }
  if (content.length > 12000) {
    return sendError(res, 'Wiadomość musi mieć 1–12000 znaków.');
  }
  if (!['Wszyscy', ...AGENTS].includes(target)) {
    return sendError(res, 'Nieznany odbiorca.');
  }

  const now = new Date().toISOString();
  const userMsg: Message = {
    id: randomUUID(),
    sessionId,
    role: 'user',
    author: target === 'Wszyscy' ? 'Operator' : `Operator → ${target}`,
    content: content || `[Załączono plików: ${attachments.length}]`,
    createdAt: now,
    status: 'saved',
    ...(attachments.length ? { attachments } : {}),
  };
  db.messages.push(userMsg);
  session.updatedAt = now;
  if (session.title === 'Nowa rozmowa' && content) {
    session.title = content.slice(0, 48);
  }

  if (isAriaConnectCommand(content)) {
    persist();
    publish('messages');
    res.status(202).json({ user: userMsg, response: null, provider: null });
    void executeAriaConnect(sessionId).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      console.error('Nie udało się podłączyć Aria:', error);
      db.messages.push({
        id: randomUUID(), sessionId, role: 'system', author: 'Bastilla OS',
        content: `Nie udało się podłączyć Aria: ${reason}`,
        createdAt: new Date().toISOString(), status: 'failed', error: reason,
      });
      persist();
      publish('messages');
    });
    return;
  }

  if (target === 'Aria' && db.svlCoreState?.ariaConnected) {
    const ariaMsg: Message = {
      id: randomUUID(),
      sessionId,
      role: 'agent',
      author: 'Aria',
      content: 'Przygotowuję odpowiedź…',
      createdAt: new Date().toISOString(),
      status: 'queued',
    };
    db.messages.push(ariaMsg);
    persist();
    publish('messages');
    res.status(202).json({ user: userMsg, response: ariaMsg, provider: null });
    void (async () => {
      try {
        const { report, rawJson, pid } = await runPythonSvlCoreReport(process.cwd());
        const replyContent = await answerNaturalLanguageCommand(
          content,
          db.messages.filter((m) => m.sessionId === sessionId && m.id !== ariaMsg.id),
          attachments,
        );
        ariaMsg.content = `${replyContent.content}\n\n---\n*SVL Core Telemetry (${report.System}, Compact_Metric_C=${report.Compact_Metric_C}, PID=${pid})*\n\`\`\`json\n${rawJson}\n\`\`\``;
        ariaMsg.provider = `Aria · SVLSystemKernel ${report.System}`;
        ariaMsg.status = 'delivered';
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error('Nie udało się wygenerować odpowiedzi Aria:', error);
        ariaMsg.content = `Nie udało się wygenerować odpowiedzi: ${reason}`;
        ariaMsg.error = reason;
        ariaMsg.status = 'failed';
      }
      ariaMsg.createdAt = new Date().toISOString();
      session.updatedAt = ariaMsg.createdAt;
      persist();
      publish('messages');
    })();
    return;
  }

  // If addressed to a specific unverified agent, queue the job honestly without simulating!
  if (target !== 'Wszyscy') {
    userMsg.status = 'queued';
    db.jobs.push({
      id: randomUUID(),
      sessionId,
      messageId: userMsg.id,
      to: target as AgentName,
      content,
      status: 'queued',
      leaseUntil: 0,
      attempts: 0,
    });
    persist();
    publish('messages');
    return res.status(202).json({
      user: userMsg,
      response: null,
      provider: null,
      jobQueued: true,
    });
  }

  const sessionHistory = db.messages.filter((m) => m.sessionId === sessionId);
  const responseMessage: Message = {
    id: randomUUID(),
    sessionId,
    role: 'assistant',
    author: 'Bastilla OS',
    content: 'Przygotowuję odpowiedź…',
    provider: 'Ollama → Gemini fallback',
    createdAt: new Date().toISOString(),
    status: 'queued',
  };
  db.messages.push(responseMessage);
  session.updatedAt = responseMessage.createdAt;
  persist();
  publish('messages');

  void (async () => {
    try {
      const answer = await answerNaturalLanguageCommand(content, sessionHistory, attachments);
      responseMessage.content = answer.content;
      responseMessage.provider = answer.provider;
      responseMessage.status = 'delivered';
      responseMessage.createdAt = new Date().toISOString();
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.error(`Nie udało się wygenerować odpowiedzi dla wiadomości ${userMsg.id}:`, e);
      responseMessage.content = `Nie udało się wygenerować odpowiedzi: ${reason}`;
      responseMessage.error = reason;
      responseMessage.status = 'failed';
      responseMessage.createdAt = new Date().toISOString();
    }
    session.updatedAt = responseMessage.createdAt;
    persist();
    publish('messages');
  })();

  res.status(202).json({
    user: userMsg,
    response: responseMessage,
    provider: responseMessage.provider,
  });
});

// --- AUTHENTICATED WORKER CALLBACKS ---
let workerTokens: Record<string, string> = {};
try {
  workerTokens = JSON.parse(process.env.SVL_WORKER_TOKENS || '{}');
} catch {}
const tokensValid =
  AGENTS.every((a) => typeof workerTokens[a] === 'string' && workerTokens[a].length >= 32) &&
  new Set(AGENTS.map((a) => workerTokens[a])).size === 4;

function workerAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!tokensValid) {
    return sendError(res, 'Nie skonfigurowano czterech unikalnych tokenów agentów (SVL_WORKER_TOKENS).', 503);
  }
  const provided = (req.header('authorization') || '').replace(/^Bearer /i, '');
  const entry = AGENTS.find((a) => secureEqual(workerTokens[a], provided));
  if (!entry) return sendError(res, 'Nieprawidłowy token workera.', 401);
  res.locals.agent = entry;
  next();
}

app.post('/api/worker/heartbeat', workerAuth, (req, res) => {
  const agent = res.locals.agent as AgentName;
  const workerId =
    typeof req.body?.workerId === 'string' ? req.body.workerId.slice(0, 100) : agent;
  heartbeats.set(agent, { workerId, lastSeen: new Date().toISOString() });
  publish('workers');
  res.json({ ok: true, agent });
});

app.post('/api/worker/next', workerAuth, (req, res) => {
  const agent = res.locals.agent as AgentName;
  const workerId =
    typeof req.body?.workerId === 'string' ? req.body.workerId.slice(0, 100) : agent;
  const job = db.jobs.find(
    (j) =>
      j.to === agent &&
      (j.status === 'queued' || (j.status === 'running' && j.leaseUntil < Date.now())),
  );
  if (!job) return res.json({ job: null });
  job.status = 'running';
  job.leaseUntil = Date.now() + 60000;
  job.attempts += 1;
  job.workerId = workerId;
  const requestMessage = db.messages.find((message) => message.id === job.messageId);
  if (requestMessage) requestMessage.status = 'running';
  persist();
  publish('workers');
  res.json({ job });
});

app.post('/api/worker/complete', workerAuth, (req, res) => {
  const agent = res.locals.agent as AgentName;
  const job = db.jobs.find(
    (j) =>
      j.id === req.body?.jobId &&
      j.to === agent &&
      j.status === 'running' &&
      j.leaseUntil > Date.now(),
  );
  if (!job || job.workerId !== req.body?.workerId) {
    return sendError(res, 'Brak ważnej dzierżawy zadania.', 409);
  }
  const content = String(req.body?.content || '').trim();
  if (!content || content.length > 16000) {
    return sendError(res, 'Nieprawidłowa odpowiedź workera.');
  }
  job.status = 'done';
  const requestMessage = db.messages.find((message) => message.id === job.messageId);
  if (requestMessage) requestMessage.status = 'delivered';
  const m: Message = {
    id: randomUUID(),
    sessionId: job.sessionId,
    role: 'agent',
    author: agent,
    content,
    createdAt: new Date().toISOString(),
    status: 'delivered',
    provider: `Worker · ${agent}`,
  };
  db.messages.push(m);
  persist();
  publish('messages');
  res.json({ ok: true, messageId: m.id });
});

// --- HTTP SERVER + WEBSOCKET PTY SERVER ---
const PORT = Number(process.env.PORT) || 3000;
const httpServer = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  const parsedUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (parsedUrl.pathname === '/ws/terminal') {
    const explicitTokenRequired = Boolean((process.env.SVL_OPERATOR_TOKEN || '').trim().length >= 32);
    if (!hasAllowedWebSocketOrigin(request.headers.origin, request.headers.host) || !isOperatorAccessAllowed({ cookieHeader: String(request.headers.cookie || ''), remoteAddress: request.socket.remoteAddress, host: request.headers.host, operatorSessions, explicitTokenRequired, forwardedFor: String(request.headers['x-forwarded-for'] || '') })) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, parsedUrl);
    });
  }
});

wss.on('connection', (ws: WebSocket, _req: http.IncomingMessage, parsedUrl: URL) => {
  const modeParam = parsedUrl.searchParams.get('mode') || 'bash';
  const mode = ['bash', 'python', 'codex', 'admin'].includes(modeParam) ? modeParam : 'bash';
  const ptyScript = path.resolve('scripts/pty_bridge.py');

  const child = spawn('python3', ['-u', ptyScript, mode, process.cwd()], {
    env: {
      ...process.env,
      CODEX_HOME: path.join(DATA_DIR, '.codex'),
      TERM: 'xterm-256color',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const sendJson = (payload: Record<string, unknown>) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  sendJson({
    type: 'connected',
    mode,
    pid: child.pid,
    timestamp: new Date().toISOString(),
  });

  child.stdout?.on('data', (chunk: Buffer) => {
    sendJson({ type: 'output', data: chunk.toString('utf-8') });
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    sendJson({ type: 'output', data: chunk.toString('utf-8') });
  });

  child.on('exit', (code) => {
    sendJson({ type: 'exit', code });
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'input' && typeof msg.data === 'string') {
        child.stdin?.write(msg.data);
      }
    } catch {
      child.stdin?.write(String(raw));
    }
  });

  ws.on('close', () => {
    if (child.exitCode === null) {
      try {
        child.kill('SIGTERM');
      } catch {}
    }
  });
});

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve('dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Bastilla OS / SVL_System & Debian 13 listening on http://0.0.0.0:${PORT}`);
});
