import { Router, type Request, type Response, type NextFunction } from 'express';

/**
 * A local, read-only, process-scoped event stream. No fake success: event
 * means a request finished and clients should re-read authoritative APIs.
 * Persistent state and external host changes still need real adapters.
 */
export function createGlobalLiveSync() {
  const router = Router();
  const watchers = new Set<Response>();
  let revision = 0;

  router.get('/status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, source: 'process-local-events', revision,
      connectedClients: watchers.size, observedAt: new Date().toISOString() });
  });

  router.get('/events', (req, res) => {
    if (watchers.size >= 50) {
      return res.status(503).json({ success: false, error: 'Zbyt wiele klientów synchronizacji.' });
    }
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    watchers.add(res);
    res.write('retry: 3000\n\n');
    res.write('event: connected\ndata: ' + JSON.stringify({ revision }) + '\n\n');

    const ping = setInterval(() => {
      if (!res.destroyed) res.write(': keepalive\n\n');
    }, 15000);
    const done = () => { clearInterval(ping); watchers.delete(res); };
    req.on('close', done);
    res.on('close', done);
  });

  const mutationPrefixes = [
    '/api/triad/', '/api/kernel/', '/api/apps/', '/api/fleet/',
    '/api/astyria/', '/api/ai/runtime/', '/api/hyper-com/',
    '/api/databases/', '/api/explorer/', '/api/github/',
  ];
  const observeMutation = (req: Request, res: Response, next: NextFunction) => {
    const path = req.path;
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      && mutationPrefixes.some(prefix => path.startsWith(prefix));
    if (mutating) {
      res.once('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          revision++;
          const data = JSON.stringify({
            revision, resource: path.split('/').slice(0, 4).join('/'),
            observedAt: new Date().toISOString(),
            note: 'HTTP mutation finished; reload real data to verify changes',
          });
          for (const client of watchers) {
            try { client.write('event: change\ndata: ' + data + '\n\n'); }
            catch { watchers.delete(client); }
          }
        }
      });
    }
    next();
  };
  return { router, observeMutation };
}
