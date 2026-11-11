/**
 * @param {string} cookieHeader
 */
export function operatorSessionTicket(cookieHeader) {
  const entry = String(cookieHeader || '')
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('svl_session='));
  return entry ? entry.slice('svl_session='.length) : '';
}

/**
 * @param {string} cookieHeader
 * @param {Map<string, number>} operatorSessions
 * @param {number} [now]
 */
export function hasValidOperatorSession(cookieHeader, operatorSessions, now = Date.now()) {
  const expiry = operatorSessions.get(operatorSessionTicket(cookieHeader)) || 0;
  return expiry > now;
}

/**
 * @param {string | undefined} address
 */
export function isLoopbackAddress(address) {
  if (!address) return false;
  const normalized = address.toLowerCase();
  if (normalized === '::1') return true;
  const ipv4 = normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
  const octets = ipv4.split('.');
  return (
    octets.length === 4 &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255) &&
    Number(octets[0]) === 127
  );
}

/**
 * @param {string | undefined} host
 */
export function isLoopbackHost(host) {
  if (!host) return false;
  try {
    const hostname = new URL(`http://${host}`).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return hostname === 'localhost' || isLoopbackAddress(hostname);
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   cookieHeader: string,
 *   remoteAddress: string | undefined,
 *   host: string | undefined,
 *   operatorSessions: Map<string, number>,
 *   explicitTokenRequired: boolean,
 *   forwardedFor?: string | undefined,
 *   now?: number,
 * }} options
 */
export function isOperatorAccessAllowed({
  cookieHeader,
  remoteAddress,
  host,
  operatorSessions,
  explicitTokenRequired,
  forwardedFor,
  now = Date.now(),
}) {
  return (
    hasValidOperatorSession(cookieHeader, operatorSessions, now) ||
    (!explicitTokenRequired &&
      !forwardedFor &&
      isLoopbackAddress(remoteAddress) &&
      isLoopbackHost(host))
  );
}

/**
 * @param {string | undefined} origin
 * @param {string | undefined} host
 */
export function hasAllowedWebSocketOrigin(origin, host) {
  if (!origin) return true;
  try {
    const parsedOrigin = new URL(origin);
    return (
      ['http:', 'https:'].includes(parsedOrigin.protocol) &&
      parsedOrigin.host.toLowerCase() === String(host || '').toLowerCase()
    );
  } catch {
    return false;
  }
}
