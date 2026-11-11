import { Router } from 'express';
import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';

/**
 * Debian-compatible security/forensics utilities drawn from well maintained
 * upstream projects also represented in Kali. NO Kali APT sources are added.
 * The current process/namespace is all we can measure; this is not proof of
 * access to the physical host, of an agent identity, or of sudo permission.
 */
export const SECURITY_TOOL_SPECS = [
  { id: 'nmap', binary: 'nmap', debianPackage: 'nmap', category: 'network', upstream: 'https://github.com/nmap/nmap' },
  { id: 'tcpdump', binary: 'tcpdump', debianPackage: 'tcpdump', category: 'network', upstream: 'https://github.com/the-tcpdump-group/tcpdump' },
  { id: 'lynis', binary: 'lynis', debianPackage: 'lynis', category: 'audit', upstream: 'https://github.com/CISOfy/lynis' },
  { id: 'yara', binary: 'yara', debianPackage: 'yara', category: 'forensics', upstream: 'https://github.com/VirusTotal/yara' },
  { id: 'strace', binary: 'strace', debianPackage: 'strace', category: 'diagnostics', upstream: 'https://github.com/strace/strace' },
  { id: 'jq', binary: 'jq', debianPackage: 'jq', category: 'data', upstream: 'https://github.com/jqlang/jq' },
  { id: 'ripgrep', binary: 'rg', debianPackage: 'ripgrep', category: 'data', upstream: 'https://github.com/BurntSushi/ripgrep' },
  { id: 'binwalk', binary: 'binwalk', debianPackage: 'binwalk', category: 'forensics', upstream: 'https://github.com/ReFirmLabs/binwalk' },
  { id: 'exiftool', binary: 'exiftool', debianPackage: 'libimage-exiftool-perl', category: 'forensics', upstream: 'https://github.com/exiftool/exiftool' },
  { id: 'ip', binary: 'ip', debianPackage: 'iproute2', category: 'network', upstream: 'https://salsa.debian.org/debian/iproute2' },
  { id: 'ss', binary: 'ss', debianPackage: 'iproute2', category: 'network', upstream: 'https://salsa.debian.org/debian/iproute2' },
  { id: 'lsof', binary: 'lsof', debianPackage: 'lsof', category: 'diagnostics', upstream: 'https://github.com/lsof-org/lsof' },
  { id: 'debsums', binary: 'debsums', debianPackage: 'debsums', category: 'audit', upstream: 'https://packages.debian.org/trixie/debsums' },
  { id: 'maltego', binary: 'maltego', debianPackage: 'vendor .deb (manual account/license)', category: 'osint', upstream: 'https://www.maltego.com/downloads/' },
  // Proprietary graphical OSINT suite. Install ONLY from an official vendor-supplied .deb.
  // This records executable presence, NOT a running GUI, activated licence or working transforms.
  { id: 'maltego', binary: 'maltego', debianPackage: 'Maltego Graph (official .deb)', category: 'osint-graph', upstream: 'https://www.maltego.com/downloads/' },
] as const;

type SecurityCheck = { id: string; binary: string; args: readonly string[]; timeoutMs: number; description: string };

/** Fixed presets; no target host, filename, shell program or flags from API input. */
export const SECURITY_READ_ONLY_CHECKS: readonly SecurityCheck[] = [
  { id: 'failed-services', binary: 'systemctl', args: ['--failed', '--no-pager', '--plain'], timeoutMs: 8000, description: 'Nieudane jednostki systemd widoczne z backendu' },
  { id: 'listening-ports', binary: 'ss', args: ['-lnt'], timeoutMs: 8000, description: 'Porty TCP nasłuchujące w przestrzeni sieciowej backendu' },
  { id: 'network-interfaces', binary: 'ip', args: ['-brief', 'address'], timeoutMs: 8000, description: 'Interfejsy dostępne dla backendu' },
  { id: 'network-routes', binary: 'ip', args: ['route', 'show'], timeoutMs: 8000, description: 'Trasy sieciowe backendu' },
  { id: 'local-ports', binary: 'nmap', args: ['-sT', '-Pn', '-p', '22,80,443,3000,8000,8080,11434', '127.0.0.1'], timeoutMs: 20000, description: 'Sprawdzenie wybranych portów wyłącznie lokalnie' },
  { id: 'package-integrity', binary: 'debsums', args: ['--changed'], timeoutMs: 25000, description: 'Sprawdzenie sum pakietów Debiana (może wymagać dostępu)' },
  { id: 'open-ports', binary: 'lsof', args: ['-nP', '-iTCP', '-sTCP:LISTEN'], timeoutMs: 10000, description: 'Procesy przypisane do lokalnych portów, jeśli masz uprawnienia' },
  { id: 'kernel-release', binary: 'uname', args: ['-a'], timeoutMs: 5000, description: 'Informacje o jądrze widocznym w bieżącym środowisku' },
];

const KNOWN_DIRS = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];
function executable(binary: string): string | null {
  if (!/^[a-z0-9-]+$/i.test(binary)) return null;
  // Maltego is vendor software, not a Debian/Kali APT dependency.
  if (binary === 'maltego') {
    for (const installedPath of ['/opt/Maltego/bin/maltego', '/opt/maltego/bin/maltego', '/usr/local/bin/maltego']) {
      try { accessSync(installedPath, constants.X_OK); return installedPath; } catch { /* missing */ }
    }
  }
  for (const dir of KNOWN_DIRS) {
    const full = dir + '/' + binary;
    try { accessSync(full, constants.X_OK); return full; } catch { /* absent */ }
  }
  return null;
}

function authorized(value: string, expected: string): boolean {
  const lhs = Buffer.from(value);
  const rhs = Buffer.from(expected);
  return expected.length >= 32 && lhs.length === rhs.length && timingSafeEqual(lhs, rhs);
}

export function createAiSecurityToolkitRouter(): Router {
  const router = Router();
  const configured = (process.env.SVL_SECURITY_TOOL_TOKEN || '').trim();

  router.get('/status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      source: 'runtime-executable-check',
      runtimeScope: 'backend-process-namespace',
      platform: process.platform,
      uid: process.getuid?.() ?? null,
      protectedExecutionConfigured: configured.length >= 32,
      // A backend DISPLAY is only a hint, not proof of an accessible user desktop.
      graphicalSessionObserved: Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY),
      tools: SECURITY_TOOL_SPECS.map((spec) => ({
        ...spec, installed: executable(spec.binary) !== null,
      })),
      checks: SECURITY_READ_ONLY_CHECKS.map(({ id, binary, description }) => ({
        id, description, available: executable(binary) !== null,
      })),
      observedAt: new Date().toISOString(),
    });
  });

  router.post('/run', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (configured.length < 32) {
      return res.status(503).json({ success: false, error: 'Ustaw SVL_SECURITY_TOOL_TOKEN (min. 32 znaki) po stronie hosta.' });
    }
    const bearer = String(req.headers.authorization || '').match(/^Bearer (.+)$/i)?.[1] || '';
    if (!authorized(bearer, configured)) {
      return res.status(401).json({ success: false, error: 'Nieprawidłowe uprawnienia narzędzi diagnostycznych.' });
    }
    const checkId = req.body?.checkId;
    if (typeof checkId !== 'string') {
      return res.status(400).json({ success: false, error: 'Wymagane checkId.' });
    }
    const preset = SECURITY_READ_ONLY_CHECKS.find((item) => item.id === checkId);
    if (!preset) {
      return res.status(400).json({ success: false, error: 'Nieznany profil diagnostyczny.' });
    }
    const command = executable(preset.binary);
    if (!command) {
      return res.status(503).json({ success: false, error: 'Brak programu na tym Linuxie: ' + preset.binary });
    }
    const started = Date.now();
    // Fixed argv only. No shell, remote scan target, mutation, environment inheritance,
    // model-generated commands or ambient root escalation.
    execFile(command, [...preset.args], {
      timeout: preset.timeoutMs,
      maxBuffer: 128 * 1024,
      windowsHide: true,
      env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LC_ALL: 'C' },
    }, (error, stdout, stderr) => {
      const timedOut = Boolean(error && 'killed' in error && error.killed);
      const exitCode = error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
      console.info('[AI SECURITY TOOLKIT]', JSON.stringify({ checkId, exitCode, durationMs: Date.now() - started }));
      res.status(error ? 422 : 200).json({
        success: !error,
        checkId,
        source: 'host-cli-execution',
        scope: 'backend-process-namespace',
        exitCode,
        timedOut,
        output: String(stdout || '').slice(0, 120000),
        stderr: String(stderr || '').slice(0, 8000),
        durationMs: Date.now() - started,
        observedAt: new Date().toISOString(),
      });
    });
  });

  return router;
}
