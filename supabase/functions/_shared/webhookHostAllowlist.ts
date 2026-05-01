import { readOptionalServerEnv, readOptionalServerEnvList } from './phase2Env.ts';

export const WEBHOOK_ALLOWED_HOSTS_ENV_NAME = 'WEBHOOK_ALLOWED_HOSTS';
export const WEBHOOK_ALLOW_HTTP_ENV_NAME = 'WEBHOOK_ALLOW_HTTP';

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export type WebhookUrlValidationFailure =
  | 'invalid_url'
  | 'forbidden_protocol'
  | 'host_not_allowed'
  | 'allowlist_not_configured';

export type WebhookUrlValidationResult =
  | { ok: true; url: URL }
  | { ok: false; reason: WebhookUrlValidationFailure; details?: Record<string, unknown> };

function readAllowedHosts(): string[] | null {
  const list = readOptionalServerEnvList(WEBHOOK_ALLOWED_HOSTS_ENV_NAME);
  if (list === null) {
    return null;
  }

  const normalized = list
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? normalized : null;
}

function readAllowHttp(): boolean {
  const raw = readOptionalServerEnv(WEBHOOK_ALLOW_HTTP_ENV_NAME);
  if (!raw) {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function hostMatches(allowed: string, hostname: string) {
  if (allowed === hostname) {
    return true;
  }

  if (allowed.startsWith('*.')) {
    const suffix = allowed.slice(1);
    return hostname.endsWith(suffix) && hostname.length > suffix.length;
  }

  return false;
}

export function validateWebhookUrl(rawUrl: string): WebhookUrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  const allowHttp = readAllowHttp();
  const isLocalhost = LOCALHOST_HOSTNAMES.has(parsed.hostname.toLowerCase());

  if (parsed.protocol !== 'https:') {
    if (parsed.protocol === 'http:' && (allowHttp || isLocalhost)) {
      // OK : autorisé en dev local explicitement
    } else {
      return {
        ok: false,
        reason: 'forbidden_protocol',
        details: { protocol: parsed.protocol },
      };
    }
  }

  // En dev local (WEBHOOK_ALLOW_HTTP=true), bypass l'allowlist pour les
  // hostnames localhost/loopback. Couvre les variantes 127.0.0.1, ::1,
  // 0.0.0.0 sans forcer l'opérateur à les ajouter explicitement à
  // WEBHOOK_ALLOWED_HOSTS.
  if (isLocalhost && allowHttp) {
    return { ok: true, url: parsed };
  }

  const allowedHosts = readAllowedHosts();
  if (allowedHosts === null) {
    return { ok: false, reason: 'allowlist_not_configured' };
  }

  const hostname = parsed.hostname.toLowerCase();
  for (const allowed of allowedHosts) {
    if (hostMatches(allowed, hostname)) {
      return { ok: true, url: parsed };
    }
  }

  return {
    ok: false,
    reason: 'host_not_allowed',
    details: { hostname },
  };
}

export function isWebhookUrlAllowed(rawUrl: string): boolean {
  return validateWebhookUrl(rawUrl).ok;
}
