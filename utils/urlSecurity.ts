import { Linking } from 'react-native';

import { getRuntimeConfig } from '@/services/runtimeConfig';
import { logOperationalError } from '@/utils/observability';

export const TRUSTED_SHOP_URL_HOSTS = [
  'apps.apple.com',
  'play.google.com',
] as const;

const SAFE_RETURN_PATHS = new Set([
  '/analytics',
  '/(tabs)',
  '/(tabs)/',
  '/(tabs)/coach',
  '/(tabs)/index',
  '/(tabs)/scanner',
  '/(tabs)/social',
  '/admin-social-moderation',
  '/coach',
  '/coach-history',
  '/entry-offer',
  '/exercises',
  '/fridge-scan-result',
  '/notification-settings',
  '/notifications',
  '/post-signup-onboarding',
  '/privacy-policy',
  '/recipes',
  '/scan-frigo',
  '/scan-preview',
  '/scan-result',
  '/settings',
  '/share-story',
  '/social-comments',
  '/social-compose',
  '/social-post',
  '/super-scan-result',
  '/username-setup',
]);

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

function normalizeString(value?: string | null) {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue || CONTROL_CHAR_PATTERN.test(trimmedValue)) {
    return null;
  }

  return trimmedValue;
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, '');
}

function isHostAllowed(hostname: string, allowedHosts: readonly string[]) {
  const normalizedHostname = normalizeHostname(hostname);

  return allowedHosts.some((allowedHost) => {
    const normalizedAllowedHost = normalizeHostname(allowedHost);
    return (
      normalizedHostname === normalizedAllowedHost ||
      normalizedHostname.endsWith(`.${normalizedAllowedHost}`)
    );
  });
}

export function resolveSafeExternalUrl(
  value?: string | null,
  allowedHosts: readonly string[] = TRUSTED_SHOP_URL_HOSTS,
) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue || normalizedValue.startsWith('//')) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.port ||
      parsedUrl.username ||
      parsedUrl.password ||
      !isHostAllowed(parsedUrl.hostname, allowedHosts)
    ) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

export async function safeOpenExternalUrl(
  value?: string | null,
  options: {
    allowedHosts?: readonly string[];
    context?: string;
  } = {},
) {
  const safeUrl = resolveSafeExternalUrl(value, options.allowedHosts);
  if (!safeUrl) {
    logOperationalError(options.context ?? '[URL] Blocked unsafe external URL', null);
    return false;
  }

  try {
    await Linking.openURL(safeUrl);
    return true;
  } catch (error) {
    logOperationalError(options.context ?? '[URL] Failed to open external URL', error);
    return false;
  }
}

export function resolveSafeReturnRoute(value?: string | null) {
  const normalizedValue = normalizeString(value);
  if (
    !normalizedValue ||
    normalizedValue.startsWith('//') ||
    normalizedValue.includes('\\') ||
    SCHEME_PATTERN.test(normalizedValue) ||
    !normalizedValue.startsWith('/')
  ) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedValue, 'https://healthscan.local');
    if (parsedUrl.origin !== 'https://healthscan.local') {
      return null;
    }

    const pathname = parsedUrl.pathname;
    if (!SAFE_RETURN_PATHS.has(pathname)) {
      return null;
    }

    return `${pathname}${parsedUrl.search}`;
  } catch {
    return null;
  }
}

export function normalizeAppGeneratedImageUri(value?: string | null) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    if (parsedUrl.protocol !== 'file:' || parsedUrl.hostname) {
      return null;
    }

    return normalizedValue;
  } catch {
    return null;
  }
}

function getSupabaseHostname() {
  try {
    return new URL(getRuntimeConfig().supabaseUrl).hostname;
  } catch {
    return null;
  }
}

export function normalizeTrustedImageUri(value?: string | null) {
  const localImageUri = normalizeAppGeneratedImageUri(value);
  if (localImageUri) {
    return localImageUri;
  }

  const normalizedValue = normalizeString(value);
  const supabaseHostname = getSupabaseHostname();
  if (!normalizedValue || !supabaseHostname) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.port ||
      parsedUrl.username ||
      parsedUrl.password ||
      normalizeHostname(parsedUrl.hostname) !== normalizeHostname(supabaseHostname)
    ) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

// CO-06 (cf. SCANNER_COACH_AUDIT_2026_05.md §6) — schemes autorisees pour
// les URL retournees par le coach LLM (CTA, knowledge cards, action steps).
// Bloque `javascript:`, `data:`, `intent:`, `file:`, `tel:`, `sms:` et tout
// scheme inconnu. Whitelist : `https:`, `mailto:`, `app:` (deep link app
// interne), `exp:` (Expo Go pendant le dev).
const SAFE_COACH_URL_SCHEME_PATTERN = /^(https:|mailto:|app:|exp:)/i;

export function resolveSafeCoachUrl(value?: string | null) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue || normalizedValue.startsWith('//')) {
    return null;
  }

  if (!SAFE_COACH_URL_SCHEME_PATTERN.test(normalizedValue)) {
    return null;
  }

  // Pour https, refuser user:pass et port custom (anti tracking, anti
  // reverse-shell exposed dev servers).
  if (/^https:/i.test(normalizedValue)) {
    try {
      const parsedUrl = new URL(normalizedValue);
      if (parsedUrl.username || parsedUrl.password || parsedUrl.port) {
        return null;
      }
      return parsedUrl.toString();
    } catch {
      return null;
    }
  }

  return normalizedValue;
}

export async function safeOpenCoachUrl(
  value?: string | null,
  options: { context?: string } = {},
) {
  const safeUrl = resolveSafeCoachUrl(value);
  if (!safeUrl) {
    logOperationalError(
      options.context ?? '[CoachUrl] Blocked unsafe coach URL',
      null,
      { url_preview: typeof value === 'string' ? value.slice(0, 80) : null },
    );
    return false;
  }

  try {
    await Linking.openURL(safeUrl);
    return true;
  } catch (error) {
    logOperationalError(
      options.context ?? '[CoachUrl] Failed to open coach URL',
      error,
    );
    return false;
  }
}

export function normalizeTrustedHttpsImageUri(value?: string | null) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue || normalizedValue.startsWith('//')) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.port ||
      parsedUrl.username ||
      parsedUrl.password ||
      !parsedUrl.hostname
    ) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}
