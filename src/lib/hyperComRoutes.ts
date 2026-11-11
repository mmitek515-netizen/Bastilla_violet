import { spawn } from 'node:child_process';
import path from 'node:path';
import { Router } from 'express';

export function createHyperComRouter(dataDir: string) {
  const router = Router();
  const script = path.resolve('apps/hyper_com_module/transmitter.py');
  const database = process.env.HYPER_COM_DB_PATH || path.join(dataDir, 'databases', 'hyper_com_db.sqlite');

  const run = (payload: Record<string, unknown>): Promise<string> => new Promise((resolve, reject) => {
    const child = spawn('python3', [script, 'json-stdin'], {
      env: { ...process.env, HYPER_COM_DB_PATH: database },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 10000);
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `HyperCom zakończył działanie (kod ${code}).`));
    });
    child.stdin.on('error', (error) => reject(error));
    child.stdin.end(JSON.stringify(payload));
  });

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const execute = async (res: import('express').Response, payload: Record<string, unknown>) => {
    try {
      const result: unknown = JSON.parse(await run(payload));
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        const detail: unknown = JSON.parse(message);
        if (detail && typeof detail === 'object' && 'kind' in detail && detail.kind === 'validation' &&
            'error' in detail && typeof detail.error === 'string') {
          res.status(400).json({ success: false, error: detail.error });
          return;
        }
      } catch {
        // The process error is not a structured HyperCom response.
      }
      console.error('HyperCom error:', message);
      res.status(500).json({ success: false, error: 'Nie udało się odczytać lub zapisać rejestru HyperCom.' });
    }
  };

  router.get('/transmissions', (_req, res) => void execute(res, { action: 'list' }));
  router.post('/transmissions', (req, res) => {
    const { action, content, sender, replyTo } = req.body || {};
    if (!['receive', 'reply', 'broadcast'].includes(action) ||
        typeof content !== 'string' || content.length > 4000 ||
        (action === 'receive' && (typeof sender !== 'string' || sender.length > 120)) ||
        (action === 'reply' && (!Number.isSafeInteger(replyTo) || replyTo < 1))) {
      res.status(400).json({ success: false, error: 'Nieprawidłowe żądanie HyperCom.' });
      return;
    }
    void execute(res, { action, content, sender, replyTo });
  });
  return router;
}
