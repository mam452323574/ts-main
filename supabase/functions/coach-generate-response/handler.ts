import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  buildInvalidCoachResponseEntryValues,
  buildReadyCoachEntryValues,
  INVALID_COACH_RESPONSE_ERROR_CODE,
  resolveCoachPayload,
} from '../_shared/coachPayload.ts';
import {
  COACH_GENERATE_RESPONSE_WEBHOOK_TIMEOUT_MS,
  COACH_RESPONSE_TOO_LARGE_ERROR_CODE,
  postCoachGenerateWebhook,
  requireCoachGenerateWebhookEndpoints,
} from '../_shared/coachProvider.ts';
import {
  attachCoachQuotaEvent,
  buildCoachQuotaErrorDetails,
  COACH_QUOTA_EXHAUSTED_ERROR_CODE,
  reserveCoachQuota,
  refundCoachQuotaEvent,
  type CoachQuotaStatus,
} from '../_shared/coachQuota.ts';
import { createServiceRoleClient, requireAuthenticatedUser } from '../_shared/phase2Auth.ts';
import { loadPhase2FeatureFlags, requireFeatureEnabled } from '../_shared/phase2Config.ts';
import { parseCoachGenerateRequest } from '../_shared/phase2Contracts.ts';
import {
  createPhase2DatabaseError,
  getPhase2ErrorStatus,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
  summarizeProviderPayload,
  summarizeWebhookResult,
} from '../_shared/phase2Observability.ts';
import {
  buildNormalizedPayloadHash,
  isRecord,
  readJsonBody,
  readOptionalString,
} from '../_shared/phase2Utils.ts';
import { getDefaultCoachDisclaimer } from '../../../shared/coachCopy.ts';
import type {
  CoachGenerateRequest,
  CoachGenerateResponse,
  Phase2CoachEntryStatus,
  Phase2FeatureFlags,
} from '../_shared/phase2Types.ts';
import {
  DEFAULT_COACH_PERSONA_KEY,
  getCoachPersona,
  hasCoachPersonaAccess,
  isCoachPersonaKey,
} from '../../../shared/coachPersonas.ts';

interface EdgeRuntimeLike {
  waitUntil?: (promise: Promise<unknown>) => void;
}

const COACH_PROMPT_TYPE_VALUES = [
  'latest_scan',
  'weekly_plan',
  'recovery_plan',
  'nutrition_focus',
  'body_focus',
  'face_focus',
  'hydration_focus',
  'sleep_coach',
  'risk_watch',
  'trend_review',
] as const;

export const COACH_GENERATE_REQUEST_MAX_BYTES = 64 * 1024;

// Rate limit defaults for coach generation (C-01 of COACH_SECURITY_AUDIT).
// Tuned conservatively: a typical session triggers 1-3 generations, so 5/min
// covers spikes while 120/day caps cost amplification.
export const COACH_GENERATE_RATE_LIMIT_PER_MINUTE = 5;
export const COACH_GENERATE_RATE_LIMIT_PER_HOUR = 30;
export const COACH_GENERATE_RATE_LIMIT_PER_DAY = 120;

async function enforceCoachGenerationRateLimit(client: any, userId: string) {
  const { data, error } = await client.rpc('record_coach_generation_attempt', {
    p_user_id: userId,
    p_per_minute: COACH_GENERATE_RATE_LIMIT_PER_MINUTE,
    p_per_hour: COACH_GENERATE_RATE_LIMIT_PER_HOUR,
    p_per_day: COACH_GENERATE_RATE_LIMIT_PER_DAY,
  });

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach generation rate limit check',
      fallbackCode: 'coach_rate_limit_check_failed',
      fallbackMessage: 'Failed to evaluate coach generation quota',
      relationName: 'coach_generation_attempts',
    });
  }

  if (isRecord(data) && data.allowed === false) {
    const windowExceeded =
      typeof data.window_exceeded === 'string' ? data.window_exceeded : 'unknown';
    throw new Phase2HttpError(
      429,
      'coach_rate_limit_exceeded',
      `Coach generation quota exceeded for window: ${windowExceeded}`,
    );
  }
}

function readCoachPromptType(value: unknown): string | null {
  return typeof value === 'string' &&
    (COACH_PROMPT_TYPE_VALUES as readonly string[]).includes(value)
    ? value
    : null;
}

interface PendingCoachEntry {
  id: string;
  persona_key?: string | null;
  prompt_type?: string | null;
  response_version?: 1 | 2 | null;
  status?: Phase2CoachEntryStatus | null;
  title?: string | null;
  body?: string | null;
  disclaimer?: string | null;
  cta_label?: string | null;
  cta_route?: string | null;
  source?: string | null;
  expires_at?: string | null;
  content_json?: Record<string, unknown> | null;
  response_payload_json?: Record<string, unknown> | null;
  request_payload_json?: Record<string, unknown> | null;
}

interface RunPendingCoachGenerationTaskOptions {
  client: any;
  featureFlags: Phase2FeatureFlags;
  userId: string;
  cacheKey: string;
  inputHash: string;
  requestBody: CoachGenerateRequest;
  pendingEntry: PendingCoachEntry;
  requestId: string;
  resolvedLocale: string | null;
  persona: ReturnType<typeof getCoachPersona>;
  webhookEndpoints: Awaited<ReturnType<typeof requireCoachGenerateWebhookEndpoints>>;
}

function normalizeCoachLocale(locale?: string) {
  const normalizedLocale = readOptionalString(locale)?.slice(0, 2).toLowerCase();
  return normalizedLocale && normalizedLocale.length > 0 ? normalizedLocale : null;
}

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

async function computeCoachCacheKey(client: any, userId: string, inputHash: string) {
  const { data, error } = await client.rpc('compute_coach_cache_key', {
    p_user_id: userId,
    p_input_hash: inputHash,
  });

  if (error) {
    return `${userId}:${inputHash}`;
  }

  if (typeof data === 'string' && data.length > 0) {
    return data;
  }

  if (Array.isArray(data) && typeof data[0] === 'string' && data[0].length > 0) {
    return data[0];
  }

  return `${userId}:${inputHash}`;
}

function isFreshCoachEntry(entry: any) {
  if (!entry || entry.status !== 'ready') {
    return false;
  }

  if (!entry.expires_at) {
    return true;
  }

  return new Date(entry.expires_at).getTime() > Date.now();
}

function hasRecordValue(value: unknown) {
  return isRecord(value) && Object.keys(value).length > 0;
}

function coachPayloadHasUsableScan(payload: Record<string, unknown>) {
  if (hasRecordValue(payload.latest_scan) || hasRecordValue(payload.selected_scan)) {
    return true;
  }

  if (Array.isArray(payload.recent_scans) && payload.recent_scans.length > 0) {
    return payload.recent_scans.some(hasRecordValue);
  }

  const latestByType = isRecord(payload.latest_by_type)
    ? payload.latest_by_type
    : null;
  if (latestByType && Object.values(latestByType).some(hasRecordValue)) {
    return true;
  }

  const byType = isRecord(payload.by_type) ? payload.by_type : null;
  return !!byType && Object.values(byType).some(hasRecordValue);
}

function throwCoachQuotaExhausted(quota: CoachQuotaStatus): never {
  throw new Phase2HttpError(
    429,
    COACH_QUOTA_EXHAUSTED_ERROR_CODE,
    'Coach quota exhausted',
    buildCoachQuotaErrorDetails(quota),
  );
}

async function attachCoachQuotaEventBestEffort(
  client: any,
  options: {
    usageEventId: string | null;
    userId: string;
    coachEntryId: string;
    source: 'coach_generation' | 'coach_cache';
    requestId: string;
  },
) {
  try {
    await attachCoachQuotaEvent(client, options);
  } catch (error) {
    logPhase2Error('[coach-generate-response] Failed to attach quota event', error, {
      request_id: options.requestId,
      entry_id: options.coachEntryId,
    });
  }
}

export function buildCoachResponse(
  entry: any,
  cached: boolean,
  quota?: CoachQuotaStatus | null,
): CoachGenerateResponse {
  const fallbackDisclaimer = getDefaultCoachDisclaimer(
    typeof entry?.locale === 'string' ? entry.locale : null,
  );
  const legacyPromptType = isRecord(entry?.request_payload_json)
    ? readCoachPromptType(entry.request_payload_json.prompt_type)
    : null;
  const responseVersion: 1 | 2 =
    entry?.response_version === 2 ? 2 : 1;
  const content = isRecord(entry?.content_json)
    ? (entry.content_json as Record<string, unknown>)
    : null;

  return {
    success: true,
    cached,
    entry_id: entry.id,
    persona_key: isCoachPersonaKey(entry.persona_key)
      ? entry.persona_key
      : DEFAULT_COACH_PERSONA_KEY,
    prompt_type: readCoachPromptType(entry.prompt_type) ?? legacyPromptType,
    response_version: responseVersion,
    status: (entry.status as Phase2CoachEntryStatus) ?? 'pending',
    title: typeof entry.title === 'string' ? entry.title : null,
    body: typeof entry.body === 'string' ? entry.body : null,
    disclaimer:
      typeof entry.disclaimer === 'string' && entry.disclaimer.trim().length > 0
        ? entry.disclaimer
        : fallbackDisclaimer,
    cta_label: typeof entry.cta_label === 'string' ? entry.cta_label : null,
    cta_route: typeof entry.cta_route === 'string' ? entry.cta_route : null,
    content,
    source: typeof entry.source === 'string' ? entry.source : null,
    expires_at: typeof entry.expires_at === 'string' ? entry.expires_at : null,
    response_payload_json:
      isRecord(entry.response_payload_json) ? entry.response_payload_json : {},
    quota: quota ?? null,
  };
}

async function loadUserAccountTier(client: any, userId: string) {
  const { data, error } = await client
    .from('user_profiles')
    .select('account_tier')
    .eq('id', userId)
    .single();

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach generation user profile lookup',
      fallbackCode: 'user_profile_lookup_failed',
      fallbackMessage: 'Failed to load the user profile for coach generation',
      relationName: 'user_profiles',
    });
  }

  if (!data?.account_tier) {
    throw new Phase2HttpError(
      404,
      'user_profile_not_found',
      'User profile not found for coach generation',
    );
  }

  return data.account_tier as string;
}

export async function runPendingCoachGenerationTask(
  options: RunPendingCoachGenerationTaskOptions,
) {
  const {
    cacheKey,
    client,
    featureFlags,
    inputHash,
    pendingEntry,
    persona,
    requestBody,
    requestId,
    resolvedLocale,
    userId,
    webhookEndpoints,
  } = options;

  const webhookPayload = {
    entry_id: pendingEntry.id,
    user_id: userId,
    cache_key: cacheKey,
    input_hash: inputHash,
    persona_key: requestBody.persona_key,
    locale: resolvedLocale,
    output_contract_version: 2,
    persona: {
      key: persona.key,
      requires_premium: persona.requiresPremium,
      tone_instructions: persona.toneInstructions,
      style_guide: persona.styleGuide,
    },
    payload: requestBody.payload,
  };
  let usedFallback = false;

  let webhookResult: Awaited<
    ReturnType<typeof postCoachGenerateWebhook>
  >['webhookResult'];

  try {
    const webhookCall = await postCoachGenerateWebhook({
      endpoints: webhookEndpoints,
      payload: webhookPayload,
      timeoutMs: COACH_GENERATE_RESPONSE_WEBHOOK_TIMEOUT_MS,
      onFallback: ({ reason, primaryStatus }) => {
        usedFallback = true;

        console.warn(
          '[coach-generate-response] Falling back to secondary coach webhook',
          {
            request_id: requestId,
            entry_id: pendingEntry.id,
            reason,
            ...(primaryStatus === null ? {} : { primary_status: primaryStatus }),
          },
        );
      },
    });
    webhookResult = webhookCall.webhookResult;
    usedFallback = webhookCall.usedFallback;
  } catch (error) {
    if (error instanceof Phase2HttpError) {
      if (error.code === COACH_RESPONSE_TOO_LARGE_ERROR_CODE) {
        await client
          .from('coach_entries')
          .update({
            status: 'error',
            error_code: COACH_RESPONSE_TOO_LARGE_ERROR_CODE,
            response_payload_json: summarizeProviderPayload(null, {
              error_code: COACH_RESPONSE_TOO_LARGE_ERROR_CODE,
              fallback: usedFallback,
              provider: 'n8n',
              request_id: requestId,
              source: 'coach_generation',
            }),
          })
          .eq('id', pendingEntry.id);
      }

      throw error;
    }

    await client
      .from('coach_entries')
      .update({
        status: 'error',
        error_code: 'coach_webhook_unreachable',
        response_payload_json: summarizeProviderPayload(null, {
          error_code: 'coach_webhook_unreachable',
          fallback: usedFallback,
          provider: 'n8n',
          request_id: requestId,
          source: 'coach_generation',
        }),
      })
      .eq('id', pendingEntry.id);

    throw new Phase2HttpError(
      502,
      'coach_webhook_failed',
      'Coach generation provider could not be reached',
    );
  }

  if (!webhookResult.ok) {
    await client
      .from('coach_entries')
      .update({
        status: 'error',
        error_code: `coach_webhook_${webhookResult.status}`,
        response_payload_json: summarizeWebhookResult(webhookResult, {
          fallback: usedFallback,
          provider: 'n8n',
          request_id: requestId,
          source: 'coach_generation',
          error_code: `coach_webhook_${webhookResult.status}`,
        }),
      })
      .eq('id', pendingEntry.id);

    throw new Phase2HttpError(
      502,
      'coach_webhook_failed',
      'Coach generation provider returned an error',
    );
  }

  let normalizedResponse;
  try {
    normalizedResponse = resolveCoachPayload(webhookResult.payload, resolvedLocale);
  } catch (error) {
    if (
      error instanceof Phase2HttpError &&
      error.code === INVALID_COACH_RESPONSE_ERROR_CODE
    ) {
      await client
        .from('coach_entries')
        .update(
          buildInvalidCoachResponseEntryValues({
            payload: webhookResult.payload,
            usedFallback,
            requestId,
            webhookStatus: webhookResult.status,
          }),
        )
        .eq('id', pendingEntry.id);
    }

    throw error;
  }

  const expiresAt =
    normalizedResponse.expires_at ??
    new Date(
      Date.now() + featureFlags.coach_cache_ttl_minutes * 60 * 1000,
    ).toISOString();
  const generatedAt = new Date().toISOString();

  const { data: finalEntry, error: finalEntryError } = await client
    .from('coach_entries')
    .update(
      buildReadyCoachEntryValues({
        payload: webhookResult.payload,
        normalizedResponse,
        locale: resolvedLocale,
        usedFallback,
        generatedAt,
        expiresAt,
      }),
    )
    .eq('id', pendingEntry.id)
    .select('*')
    .single();

  if (finalEntryError || !finalEntry) {
    throw createPhase2DatabaseError(finalEntryError, {
      contextLabel: 'Coach generation finalization',
      fallbackCode: 'coach_entry_finalize_failed',
      fallbackMessage: 'Failed to finalize coach response',
      relationName: 'coach_entries',
    });
  }
}

export function scheduleCoachBackgroundTask(task: Promise<void>) {
  const edgeRuntime = (globalThis as typeof globalThis & {
    EdgeRuntime?: EdgeRuntimeLike;
  }).EdgeRuntime;

  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(task);
    return;
  }

  void task;
}

export async function handleCoachGenerateResponseRequest(req: Request) {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsError = validateCorsOrigin(req);
  if (corsError) {
    return corsError;
  }

  const requestId = createRequestId();

  try {
    requirePostMethod(req);

    const supabase = createServiceRoleClient();
    const user = await requireAuthenticatedUser(supabase, req);
    await enforceCoachGenerationRateLimit(supabase, user.id);
    const featureFlags = await loadPhase2FeatureFlags(supabase);
    requireFeatureEnabled(
      featureFlags.coach_enabled,
      'coach_disabled',
      'Coach generation is currently disabled',
    );

    const requestBody = parseCoachGenerateRequest(
      await readJsonBody(req, { maxBytes: COACH_GENERATE_REQUEST_MAX_BYTES }),
    );
    if (!coachPayloadHasUsableScan(requestBody.payload)) {
      throw new Phase2HttpError(
        400,
        'coach_no_usable_scan',
        'Run a scan before requesting Coach guidance',
      );
    }

    const accountTier = await loadUserAccountTier(supabase, user.id);
    if (!hasCoachPersonaAccess(requestBody.persona_key, accountTier)) {
      throw new Phase2HttpError(
        403,
        'coach_persona_requires_premium',
        'This coach persona requires premium access',
      );
    }

    const persona = getCoachPersona(requestBody.persona_key);
    const resolvedLocale = normalizeCoachLocale(requestBody.locale);
    const inputHash = await buildNormalizedPayloadHash(
      resolvedLocale
        ? {
            payload: requestBody.payload,
            persona_key: requestBody.persona_key,
            locale: resolvedLocale,
          }
        : {
            payload: requestBody.payload,
            persona_key: requestBody.persona_key,
          },
    );
    const cacheKey = await computeCoachCacheKey(supabase, user.id, inputHash);

    const { data: existingEntry, error: existingEntryError } = await supabase
      .from('coach_entries')
      .select('*')
      .eq('user_id', user.id)
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (existingEntryError) {
      throw createPhase2DatabaseError(existingEntryError, {
        contextLabel: 'Coach generation cache lookup',
        fallbackCode: 'coach_entry_lookup_failed',
        fallbackMessage: 'Failed to look up existing coach entries',
        relationName: 'coach_entries',
      });
    }

    if (!requestBody.force_refresh && isFreshCoachEntry(existingEntry)) {
      const quotaReservation = await reserveCoachQuota(supabase, {
        userId: user.id,
        source: 'coach_cache',
        requestId,
      });

      if (!quotaReservation.allowed) {
        throwCoachQuotaExhausted(quotaReservation.quota);
      }

      await attachCoachQuotaEventBestEffort(supabase, {
        usageEventId: quotaReservation.usage_event_id,
        userId: user.id,
        coachEntryId: existingEntry.id,
        source: 'coach_cache',
        requestId,
      });

      return jsonResponse(
        req,
        buildCoachResponse(existingEntry, true, quotaReservation.quota),
      );
    }

    const webhookEndpoints = await requireCoachGenerateWebhookEndpoints(
      supabase,
      null,
      requestId,
    );
    const quotaReservation = await reserveCoachQuota(supabase, {
      userId: user.id,
      source: 'coach_generation',
      requestId,
    });

    if (!quotaReservation.allowed) {
      throwCoachQuotaExhausted(quotaReservation.quota);
    }

    const pendingValues = {
      user_id: user.id,
      cache_key: cacheKey,
      input_hash: inputHash,
      request_payload_json: requestBody.payload,
      response_payload_json: {},
      status: 'pending',
      error_code: null,
      source: 'n8n',
      persona_key: requestBody.persona_key,
      prompt_type: readCoachPromptType(
        isRecord(requestBody.payload) ? requestBody.payload.prompt_type : null,
      ),
      response_version: 1,
      content_json: null,
      locale: resolvedLocale,
      title: null,
      body: null,
      disclaimer: getDefaultCoachDisclaimer(resolvedLocale),
      cta_label: null,
      cta_route: null,
      generated_at: null,
      expires_at: null,
    };

    const { data: pendingEntry, error: pendingEntryError } = await supabase
      .from('coach_entries')
      .upsert(pendingValues, {
        onConflict: 'user_id,cache_key',
      })
      .select('*')
      .single();

    if (pendingEntryError || !pendingEntry) {
      try {
        await refundCoachQuotaEvent(supabase, {
          usageEventId: quotaReservation.usage_event_id,
          userId: user.id,
          reason: 'coach_entry_upsert_failed',
        });
      } catch (refundError) {
        logPhase2Error(
          '[coach-generate-response] Failed to refund quota after preparation error',
          refundError,
          { request_id: requestId },
        );
      }

      throw createPhase2DatabaseError(pendingEntryError, {
        contextLabel: 'Coach generation preparation',
        fallbackCode: 'coach_entry_upsert_failed',
        fallbackMessage: 'Failed to prepare coach entry generation',
        relationName: 'coach_entries',
      });
    }

    await attachCoachQuotaEventBestEffort(supabase, {
      usageEventId: quotaReservation.usage_event_id,
      userId: user.id,
      coachEntryId: pendingEntry.id,
      source: 'coach_generation',
      requestId,
    });

    const backgroundTask = runPendingCoachGenerationTask({
      client: supabase,
      featureFlags,
      userId: user.id,
      cacheKey,
      inputHash,
      requestBody,
      pendingEntry,
      requestId,
      resolvedLocale,
      persona,
      webhookEndpoints,
    }).catch((error) => {
      logPhase2Error('[coach-generate-response] Background generation failed', error, {
        request_id: requestId,
        entry_id: pendingEntry.id,
      });
    });

    scheduleCoachBackgroundTask(backgroundTask);

    return jsonResponse(
      req,
      buildCoachResponse(pendingEntry, false, quotaReservation.quota),
    );
  } catch (error) {
    logPhase2Error('[coach-generate-response] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
}
