/**
 * Helpers pour distinguer une annulation OAuth volontaire d'une vraie panne.
 *
 * Quand l'utilisateur ferme / rejette l'onglet d'authentification avant la fin
 * du flux (`WebBrowser.openAuthSessionAsync` renvoie `cancel`/`dismiss`), ce
 * n'est PAS une erreur opérationnelle : il ne faut ni la logger en `ERROR`
 * (console.error + stack trace bruyante), ni afficher un bandeau rouge à
 * l'utilisateur — il sait qu'il vient d'abandonner.
 *
 * On tague l'erreur (`name` + flag `cancelled`) pour que la couche contexte et
 * les écrans la reconnaissent. Le flag `cancelled` est aussi remonté tel quel
 * par `getSafeErrorTelemetry` dans `@/utils/observability`.
 */
export const OAUTH_CANCELLED_ERROR_NAME = 'OAuthCancelledError';

export type OAuthCancelledError = Error & { cancelled: true };

export function createOAuthCancelledError(message: string): OAuthCancelledError {
  const error = new Error(message) as OAuthCancelledError;
  error.name = OAUTH_CANCELLED_ERROR_NAME;
  error.cancelled = true;
  return error;
}

export function isOAuthCancellationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as { name?: unknown; cancelled?: unknown };
  return (
    record.name === OAUTH_CANCELLED_ERROR_NAME || record.cancelled === true
  );
}
