import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Reject all remote GitHub writes unless the operator configured a separate
 * high-entropy SVL_GITHUB_WRITE_TOKEN. Never reuse GITHUB_TOKEN/PAT for this.
 * Read-only status endpoints remain available to existing monitoring.
 */
export function isGitHubWritePath(path: string): boolean {
  // Express routes are case-insensitive by default; the guard must be too.
  const normalized = path.toLowerCase();
  return normalized === '/api/triad/commit' || normalized.startsWith('/api/github/')
    || normalized.startsWith('/api/triad/github/')
    || normalized.startsWith('/api/triad/git/');
}

export function validGitHubWriteToken(expectedValue: string | undefined, authHeader: string | undefined): boolean {
  const expected = (expectedValue || '').trim();
  if (expected.length < 32 || expected.length > 512) return false;
  const match = /^Bearer ([A-Za-z0-9._~+\/=\-]{32,512})$/.exec(authHeader || '');
  if (!match) return false;
  const candidate = Buffer.from(match[1], 'utf8');
  const reference = Buffer.from(expected, 'utf8');
  return candidate.length === reference.length && timingSafeEqual(candidate, reference);
}

export function requireGitHubWriteToken(req: Request, res: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !isGitHubWritePath(req.path)) {
    next();
    return;
  }
  if (!validGitHubWriteToken(process.env.SVL_GITHUB_WRITE_TOKEN, req.get('authorization'))) {
    res.status(403).set('Cache-Control', 'no-store').json({
      success: false,
      error: 'Zapis GitHub wymaga osobnego tokenu SVL_GITHUB_WRITE_TOKEN w nagłówku Authorization: Bearer. Bez konfiguracji operacja jest zablokowana.',
    });
    return;
  }
  next();
}
