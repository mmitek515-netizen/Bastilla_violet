export interface GitPushConfirmation {
  ok: boolean;
  message: string;
}

/**
 * A successful HTTP response is not proof that changes reached GitHub.
 * In particular, AI Studio previews often lack a real Git checkout.
 */
export function confirmGitPush(httpOk: boolean, httpStatus: number, payload: unknown): GitPushConfirmation {
  const data = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};

  if (httpOk && data.success === true && data.pushed === true && data.branch === 'main') {
    const sha = typeof data.sha === 'string' && /^[0-9a-f]{7,40}$/i.test(data.sha)
      ? data.sha
      : null;
    return {
      ok: true,
      message: sha
        ? `Zapisano commit ${sha} i potwierdzono wysłanie do origin/main.`
        : 'Potwierdzono synchronizację z origin/main; brak nowych zmian do commita.',
    };
  }

  const serverError = typeof data.error === 'string' && data.error.trim()
    ? data.error.trim()
    : null;
  if (serverError) return { ok: false, message: `Błąd synchronizacji z GitHub: ${serverError}` };

  if (httpOk && data.success === true && data.pushed !== true) {
    return {
      ok: false,
      message: 'Backend odpowiedział, lecz nie potwierdził git push (pushed:true). Zmiany nie są zweryfikowane na GitHub. W AI Studio pobierz main przez integrację GitHub.',
    };
  }

  if (httpOk && data.success === true) {
    return {
      ok: false,
      message: 'Nie potwierdzono synchronizacji z gałęzią main. Sprawdź konfigurację lokalnego origin/main.',
    };
  }

  return {
    ok: false,
    message: `Błąd synchronizacji z GitHub: HTTP ${httpStatus}. Sprawdź lokalne połączenie Git i backend.`,
  };
}
