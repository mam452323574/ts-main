import { readOptionalServerEnv, readOptionalServerEnvList } from './phase2Env.ts';
import { Phase2HttpError } from './phase2Errors.ts';
import type { SupportedScanType } from './scanReservations.ts';
import { sha256Hex } from './phase2Utils.ts';
import { validateWebhookUrl } from './webhookHostAllowlist.ts';

export const N8N_SCAN_ANALYZE_WEBHOOK_URL_ENV_NAME =
  'N8N_SCAN_ANALYZE_WEBHOOK_URL';
export const N8N_SCAN_ANALYZE_WEBHOOK_URLS_ENV_NAME =
  'N8N_SCAN_ANALYZE_WEBHOOK_URLS';
export const N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URL_ENV_NAME =
  'N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URL';
export const N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URLS_ENV_NAME =
  'N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URLS';

const SCAN_WEBHOOK_NOT_CONFIGURED_CODE = 'scan_webhook_not_configured';
const SCAN_WEBHOOK_NOT_CONFIGURED_MESSAGE =
  'Scan analysis provider is not configured';

export interface ResolvedScanWebhookPool {
  envName: string;
  urls: string[];
}

export interface SelectedScanWebhookEndpoint extends ResolvedScanWebhookPool {
  selectionKey: string;
  selectedIndex: number;
  url: string;
}

function createScanWebhookNotConfiguredError() {
  return new Phase2HttpError(
    503,
    SCAN_WEBHOOK_NOT_CONFIGURED_CODE,
    SCAN_WEBHOOK_NOT_CONFIGURED_MESSAGE,
  );
}

function assertValidWebhookUrl(url: string) {
  const result = validateWebhookUrl(url);
  if (!result.ok) {
    throw createScanWebhookNotConfiguredError();
  }
}

function normalizeWebhookPool(urls: string[], envName: string): ResolvedScanWebhookPool {
  if (urls.length === 0) {
    throw createScanWebhookNotConfiguredError();
  }

  for (const url of urls) {
    assertValidWebhookUrl(url);
  }

  return {
    envName,
    urls,
  };
}

function resolveConfiguredWebhookPool(
  pluralEnvName: string,
  singularEnvName: string,
): ResolvedScanWebhookPool | null {
  const pluralUrls = readOptionalServerEnvList(pluralEnvName);
  if (pluralUrls !== null) {
    return normalizeWebhookPool(pluralUrls, pluralEnvName);
  }

  const singularUrl = readOptionalServerEnv(singularEnvName);
  if (singularUrl !== null) {
    return normalizeWebhookPool([singularUrl], singularEnvName);
  }

  return null;
}

export function resolveScanWebhookPool(
  scanType: SupportedScanType,
): ResolvedScanWebhookPool {
  const defaultPool = resolveConfiguredWebhookPool(
    N8N_SCAN_ANALYZE_WEBHOOK_URLS_ENV_NAME,
    N8N_SCAN_ANALYZE_WEBHOOK_URL_ENV_NAME,
  );

  if (!defaultPool) {
    throw createScanWebhookNotConfiguredError();
  }

  if (scanType !== 'super') {
    return defaultPool;
  }

  return resolveConfiguredWebhookPool(
    N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URLS_ENV_NAME,
    N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URL_ENV_NAME,
  ) ?? defaultPool;
}

export async function selectScanWebhookEndpoint(options: {
  scanId: string;
  scanType: SupportedScanType;
  userId: string;
}): Promise<SelectedScanWebhookEndpoint> {
  const pool = resolveScanWebhookPool(options.scanType);
  const selectionKey = `${options.userId}:${options.scanId}`;
  const digest = await sha256Hex(selectionKey);
  const selectedIndex = Number.parseInt(digest.slice(0, 8), 16) % pool.urls.length;

  return {
    ...pool,
    selectionKey,
    selectedIndex,
    url: pool.urls[selectedIndex]!,
  };
}
