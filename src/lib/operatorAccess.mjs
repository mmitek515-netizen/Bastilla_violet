export function isLoopbackAddress(address) {
  if (typeof address !== 'string') return false;
  const normalized = address.toLowerCase();
  if (normalized === '::1') return true;
  const ipv4 = normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
  const octets = ipv4.split('.');
  return octets.length === 4
    && Number(octets[0]) === 127
    && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

export function hasValidOperatorSession(cookieHeader, sessions, now = Date.now()) {
  const cookie = String(cookieHeader || '')
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('svl_session='));
  const ticket = cookie?.slice('svl_session='.length);
  return Boolean(ticket && (sessions.get(ticket) || 0) > now);
}

export function isOperatorRequestAllowed({
  cookieHeader,
  sessions,
  tokenRequired,
  remoteAddress,
  now = Date.now(),
}) {
  return hasValidOperatorSession(cookieHeader, sessions, now)
    || (!tokenRequired && isLoopbackAddress(remoteAddress));
}

export function isSameOrigin(origin, host) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol)
      && typeof host === 'string'
      && url.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
