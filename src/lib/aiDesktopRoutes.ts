import { Router } from 'express';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';

const PROGRAMS = [
  { id: 'Xvfb', file: '/usr/bin/Xvfb' },
  { id: 'XFCE', file: '/usr/bin/startxfce4' },
  { id: 'x11vnc', file: '/usr/bin/x11vnc' },
  { id: 'noVNC', file: '/usr/share/novnc/vnc.html' },
  { id: 'websockify', file: '/usr/bin/websockify' },
];
function checkPort(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ host: '127.0.0.1', port });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1200);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}
const portEnv = (key: string, fallback: number) => {
  const value = Number(process.env[key]);
  return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : fallback;
};
const safeViewerUrl = () => {
  const url = (process.env.SVL_DESKTOP_VIEWER_URL || '').trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch { return null; }
};

/** Live process namespace facts, not invented VM/agent status. */
export function createAiDesktopRouter(): Router {
  const router = Router();
  router.get('/status', async (_req, res) => {
    const vncPort = portEnv('SVL_DESKTOP_VNC_PORT', 5901);
    const webPort = portEnv('SVL_DESKTOP_WEB_PORT', 6080);
    const [vncTcp, webTcp] = await Promise.all([checkPort(vncPort), checkPort(webPort)]);
    const tools = PROGRAMS.map(({ id, file }) => {
      try {
        accessSync(file, constants.R_OK);
        return { id, installed: true };
      } catch {
        return { id, installed: false };
      }
    });
    let displaySocket = false;
    try { displaySocket = existsSync('/tmp/.X11-unix/X99'); } catch { /* no display */ }
    const viewer = safeViewerUrl();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      source: 'backend-local-socket-and-executable-check',
      scope: 'backend-process-namespace',
      platform: process.platform,
      display: ':99',
      observedAt: new Date().toISOString(),
      tools,
      displaySocket,
      vncTcp,
      webTcp,
      vncPort,
      webPort,
      readyForOperator: displaySocket && vncTcp && webTcp,
      // A reachable service does not prove authentication, working window
      // management, frame delivery or that remote AI agents can control it.
      agentControlVerified: false,
      viewerUrl: viewer && webTcp ? viewer : null,
      message: !webTcp ? 'Brak działającego lokalnego websockify/noVNC na backendzie.'
        : !displaySocket ? 'Port odpowiada, ale nie wykryto Xvfb :99 w tej przestrzeni.'
        : 'Wykryto lokalne usługi. Sprawdź hasło VNC i obraz pulpitu w przeglądarce.',
    });
  });
  return router;
}
