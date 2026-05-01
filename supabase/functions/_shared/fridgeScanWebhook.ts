import { readOptionalServerEnv, readOptionalServerEnvList } from './phase2Env.ts';
import { Phase2HttpError } from './phase2Errors.ts';
import {
  buildPhase2WebhookHeaders,
  type Phase2WebhookResult,
  postWebhookJson,
} from './phase2Webhook.ts';
import { logPhase2Info, summarizeWebhookResult } from './phase2Observability.ts';
import { sha256Hex } from './phase2Utils.ts';
import { validateWebhookUrl } from './webhookHostAllowlist.ts';
import type { FridgeScanWebhookPayload } from '../../../shared/fridgeScanContract.ts';

export const N8N_FRIDGE_SCAN_WEBHOOK_URL_ENV_NAME =
  'N8N_FRIDGE_SCAN_WEBHOOK_URL';
export const N8N_FRIDGE_SCAN_WEBHOOK_URLS_ENV_NAME =
  'N8N_FRIDGE_SCAN_WEBHOOK_URLS';

const FRIDGE_SCAN_WEBHOOK_NOT_CONFIGURED_CODE =
  'fridge_scan_webhook_not_configured';
const FRIDGE_SCAN_WEBHOOK_NOT_CONFIGURED_MESSAGE =
  'Fridge scan webhook provider is not configured';
export const FRIDGE_SCAN_WEBHOOK_REQUEST_FAILED_CODE =
  'fridge_scan_webhook_failed';
export const FRIDGE_SCAN_WEBHOOK_UNREACHABLE_CODE =
  'fridge_scan_webhook_unreachable';
export const DEFAULT_FRIDGE_SCAN_WEBHOOK_TIMEOUT_MS = 10_000;

export interface ResolvedFridgeScanWebhookPool {
  envName: string;
  urls: string[];
}

export interface SelectedFridgeScanWebhookEndpoint
  extends ResolvedFridgeScanWebhookPool {
  selectionKey: string;
  selectedIndex: number;
  url: string;
}

export interface PreparedFridgeScanWebhookCall {
  endpoint: SelectedFridgeScanWebhookEndpoint;
  rawBody: string;
  headers: Headers;
}

export interface FridgeScanWebhookDispatchResult {
  endpoint: SelectedFridgeScanWebhookEndpoint;
  webhookResult: Phase2WebhookResult;
}

function createFridgeScanWebhookNotConfiguredError() {
  return new Phase2HttpError(
    503,
    FRIDGE_SCAN_WEBHOOK_NOT_CONFIGURED_CODE,
    FRIDGE_SCAN_WEBHOOK_NOT_CONFIGURED_MESSAGE,
  );
}

function assertValidWebhookUrl(url: string) {
  const result = validateWebhookUrl(url);
  if (!result.ok) {
    throw createFridgeScanWebhookNotConfiguredError();
  }
}

function normalizeWebhookPool(
  urls: string[],
  envName: string,
): ResolvedFridgeScanWebhookPool {
  if (urls.length === 0) {
    throw createFridgeScanWebhookNotConfiguredError();
  }

  for (const url of urls) {
    assertValidWebhookUrl(url);
  }

  return {
    envName,
    urls,
  };
}

export function resolveFridgeScanWebhookPool(): ResolvedFridgeScanWebhookPool {
  const pluralUrls = readOptionalServerEnvList(N8N_FRIDGE_SCAN_WEBHOOK_URLS_ENV_NAME);
  if (pluralUrls !== null) {
    return normalizeWebhookPool(pluralUrls, N8N_FRIDGE_SCAN_WEBHOOK_URLS_ENV_NAME);
  }

  const singularUrl = readOptionalServerEnv(N8N_FRIDGE_SCAN_WEBHOOK_URL_ENV_NAME);
  if (singularUrl !== null) {
    return normalizeWebhookPool([singularUrl], N8N_FRIDGE_SCAN_WEBHOOK_URL_ENV_NAME);
  }

  throw createFridgeScanWebhookNotConfiguredError();
}

export async function selectFridgeScanWebhookEndpoint(options: {
  fridgeScanId: string;
  userId: string;
}): Promise<SelectedFridgeScanWebhookEndpoint> {
  const pool = resolveFridgeScanWebhookPool();
  const selectionKey = `${options.userId}:${options.fridgeScanId}`;
  const digest = await sha256Hex(selectionKey);
  const selectedIndex = Number.parseInt(digest.slice(0, 8), 16) % pool.urls.length;

  return {
    ...pool,
    selectionKey,
    selectedIndex,
    url: pool.urls[selectedIndex]!,
  };
}

export async function prepareFridgeScanWebhookCall(options: {
  payload: FridgeScanWebhookPayload;
  endpoint?: SelectedFridgeScanWebhookEndpoint;
}): Promise<PreparedFridgeScanWebhookCall> {
  const endpoint =
    options.endpoint ??
    (await selectFridgeScanWebhookEndpoint({
      fridgeScanId: options.payload.fridge_scan_id,
      userId: options.payload.user_id,
    }));
  const rawBody = JSON.stringify(options.payload);
  const headers = await buildPhase2WebhookHeaders(rawBody);

  return {
    endpoint,
    rawBody,
    headers,
  };
}

export async function postFridgeScanWebhook(options: {
  payload: FridgeScanWebhookPayload;
  endpoint?: SelectedFridgeScanWebhookEndpoint;
  timeoutMs?: number;
}): Promise<FridgeScanWebhookDispatchResult> {
  const endpoint =
    options.endpoint ??
    (await selectFridgeScanWebhookEndpoint({
      fridgeScanId: options.payload.fridge_scan_id,
      userId: options.payload.user_id,
    }));
  logPhase2Info('[fridgeScanWebhook] Dispatching fridge scan webhook', {
    endpoint_env: endpoint.envName,
    endpoint_index: endpoint.selectedIndex,
    request_id: options.payload.request_id,
    fridge_scan_id: options.payload.fridge_scan_id,
    selected_mode: options.payload.selected_mode,
    source: options.payload.source,
    locale: options.payload.locale,
    image_path_present: Boolean(options.payload.image.path),
  });
  const webhookResult = await postWebhookJson(
    endpoint.url,
    options.payload as unknown as Record<string, unknown>,
    options.timeoutMs ?? DEFAULT_FRIDGE_SCAN_WEBHOOK_TIMEOUT_MS,
  );

  logPhase2Info(
    '[fridgeScanWebhook] Fridge scan webhook response received',
    summarizeWebhookResult(webhookResult, {
      endpoint_env: endpoint.envName,
      endpoint_index: endpoint.selectedIndex,
      request_id: options.payload.request_id,
      fridge_scan_id: options.payload.fridge_scan_id,
    }),
  );

  return {
    endpoint,
    webhookResult,
  };
}
