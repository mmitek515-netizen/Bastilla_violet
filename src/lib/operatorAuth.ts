export function hasValidOperatorSession(expiry: number | undefined, now: number): boolean {
  return typeof expiry === 'number' && Number.isFinite(expiry) && expiry > now;
}
