import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { CodexCliState } from './types';

const execFileAsync = promisify(execFile);

export function stripAnsiCodes(input: string): string {
  return input.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

export function parseCodexCliCommand(rawCommand: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let tokenStarted = false;

  for (const char of rawCommand) {
    if (escaped) {
      current += char;
      escaped = false;
      tokenStarted = true;
      continue;
    }

    if (char === '\\' && quote !== "'") {
      escaped = true;
      tokenStarted = true;
      continue;
    }

    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      tokenStarted = true;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      tokenStarted = true;
    } else if (/\s/.test(char)) {
      if (tokenStarted) {
        args.push(current);
        current = '';
        tokenStarted = false;
      }
    } else {
      current += char;
      tokenStarted = true;
    }
  }

  if (escaped) throw new Error('Polecenie Codex kończy się niekompletnym escape.');
  if (quote) throw new Error('Polecenie Codex zawiera niedomknięty cudzysłów.');
  if (tokenStarted) args.push(current);

  if (args[0]?.toLowerCase() === 'codex') args.shift();
  return args;
}

export function isCodexDeviceAuthCommand(args: readonly string[]): boolean {
  return args[0]?.toLowerCase() === 'login' && args.includes('--device-auth');
}

export function parseCodexDeviceAuthOutput(rawOutput: string): {
  verificationUrl: string | null;
  userCode: string | null;
} {
  const clean = stripAnsiCodes(rawOutput);
  const urlMatch = clean.match(/https:\/\/auth\.openai\.com\/[^\s]+/i);
  const codeMatch = clean.match(/\b([A-Z0-9]{4,5}-[A-Z0-9]{4,6})\b/);
  return {
    verificationUrl: urlMatch ? urlMatch[0].trim() : null,
    userCode: codeMatch ? codeMatch[1].trim() : null,
  };
}

export class CodexCliManager {
  private readonly codexHome: string;
  private activeDeviceProcess: ChildProcess | null = null;
  private deviceAuthState: NonNullable<CodexCliState['deviceAuth']> = {
    active: false,
    verificationUrl: null,
    userCode: null,
    startedAt: null,
    rawOutput: '',
  };

  constructor(dataDir: string) {
    this.codexHome = path.resolve(dataDir, '.codex');
    fs.mkdirSync(this.codexHome, { recursive: true, mode: 0o700 });
  }

  getCodexBinary(): string | null {
    const candidates = [
      '/usr/local/bin/codex',
      path.resolve('node_modules/.bin/codex'),
      '/usr/bin/codex',
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private getEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      CODEX_HOME: this.codexHome,
      NO_COLOR: '1',
    };
  }

  async getStatus(): Promise<CodexCliState> {
    const binaryPath = this.getCodexBinary();
    const observedAt = new Date().toISOString();

    if (!binaryPath) {
      return {
        installed: false,
        binaryPath: null,
        version: null,
        authenticated: false,
        authMethod: 'not_logged_in',
        statusText: 'OpenAI Codex CLI nie jest zainstalowane.',
        codexHome: this.codexHome,
        deviceAuth: { ...this.deviceAuthState },
        observedAt,
      };
    }

    let version: string | null = null;
    try {
      const { stdout } = await execFileAsync(binaryPath, ['--version'], {
        timeout: 4000,
        env: this.getEnv(),
      });
      version = stripAnsiCodes(stdout).trim() || null;
    } catch {
      version = null;
    }

    let statusText = 'Not logged in';
    let authenticated = false;
    let authMethod: CodexCliState['authMethod'] = 'not_logged_in';

    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, ['login', 'status'], {
        timeout: 4000,
        env: this.getEnv(),
      });
      const combined = stripAnsiCodes(`${stdout}\n${stderr}`).trim();
      statusText = combined || 'Not logged in';
      if (!/not logged in/i.test(combined) && combined.length > 0) {
        authenticated = true;
        authMethod = /api[_ -]?key/i.test(combined) ? 'api_key' : 'chatgpt_oauth';
      }
    } catch (err: any) {
      const combined = stripAnsiCodes(`${err?.stdout || ''}\n${err?.stderr || ''}`).trim();
      statusText = combined || 'Not logged in';
    }

    // Also inspect CODEX_HOME/auth.json if present
    const authJsonPath = path.join(this.codexHome, 'auth.json');
    if (!authenticated && fs.existsSync(authJsonPath)) {
      try {
        const authData = JSON.parse(fs.readFileSync(authJsonPath, 'utf-8'));
        if (authData && (authData.tokens || authData.access_token || authData.OPENAI_API_KEY)) {
          authenticated = true;
          authMethod = authData.OPENAI_API_KEY ? 'api_key' : 'chatgpt_oauth';
          statusText = 'Zalogowano (poświadczenia w CODEX_HOME/auth.json)';
        }
      } catch {
        // ignore malformed auth.json
      }
    }

    return {
      installed: Boolean(version),
      binaryPath,
      version,
      authenticated,
      authMethod,
      statusText,
      codexHome: this.codexHome,
      deviceAuth: { ...this.deviceAuthState },
      observedAt,
    };
  }

  async startChatGptDeviceLogin(): Promise<NonNullable<CodexCliState['deviceAuth']>> {
    const binaryPath = this.getCodexBinary();
    if (!binaryPath) {
      throw new Error('Brak zainstalowanego OpenAI Codex CLI.');
    }

    if (this.activeDeviceProcess && this.activeDeviceProcess.exitCode === null) {
      try {
        this.activeDeviceProcess.kill('SIGTERM');
      } catch {
        // ignore
      }
    }

    this.deviceAuthState = {
      active: true,
      verificationUrl: null,
      userCode: null,
      startedAt: new Date().toISOString(),
      rawOutput: '',
    };

    return await new Promise((resolve) => {
      const child = spawn(binaryPath, ['login', '--device-auth'], {
        env: this.getEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.activeDeviceProcess = child;

      let settled = false;
      const finishWait = () => {
        if (!settled) {
          settled = true;
          resolve({ ...this.deviceAuthState });
        }
      };

      const onChunk = (chunk: Buffer) => {
        this.deviceAuthState.rawOutput += stripAnsiCodes(chunk.toString('utf-8'));
        const parsed = parseCodexDeviceAuthOutput(this.deviceAuthState.rawOutput);
        if (parsed.verificationUrl) {
          this.deviceAuthState.verificationUrl = parsed.verificationUrl;
        }
        if (parsed.userCode) {
          this.deviceAuthState.userCode = parsed.userCode;
        }
        if (this.deviceAuthState.verificationUrl && this.deviceAuthState.userCode) {
          finishWait();
        }
      };

      child.stdout?.on('data', onChunk);
      child.stderr?.on('data', onChunk);

      child.on('exit', () => {
        this.deviceAuthState.active = false;
        finishWait();
      });

      setTimeout(finishWait, 3800);
    });
  }
}
