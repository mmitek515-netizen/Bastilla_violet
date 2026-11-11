export async function runAstyriaMission(action: string, request: typeof fetch = fetch) {
  if (action === 'deep_scan') {
    throw new Error('Skan logów jest niedostępny: brak zweryfikowanego, wyłącznie odczytowego endpointu.');
  }
  const response = await request('/api/astyria/mission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!response.ok) throw new Error(`Błąd HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Nieprawidłowa odpowiedź misji Astyrii.');
  }
  const result = data as Record<string, unknown>;
  return {
    reply: typeof result.reply === 'string' ? result.reply : '',
    actionTitle: typeof result.actionTitle === 'string' ? result.actionTitle : '',
  };
}
