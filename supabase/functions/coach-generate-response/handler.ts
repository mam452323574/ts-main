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
import { applyCoachProfileUpdatesForEntry } from '../_shared/coachProfileMemory.ts';
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
import {
  normalizeCoachQuestionKey,
  normalizeCoachQuestionText,
  resolveCoachQuestionSelection,
} from '../../../shared/coachQuestions.ts';
import { normalizeCoachGenerationPromptType } from '../../../shared/coachPromptTypes.ts';
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

type CoachPromptTypeValue = NonNullable<
  ReturnType<typeof normalizeCoachGenerationPromptType>
>;

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

function readCoachPromptType(value: unknown): CoachPromptTypeValue | null {
  return normalizeCoachGenerationPromptType(value);
}

interface PendingCoachEntry {
  id: string;
  persona_key?: string | null;
  prompt_type?: string | null;
  question_key?: string | null;
  question_text?: string | null;
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

interface CoachWebhookInvalidResponseMetadata {
  providerFailureKind: 'json_parse_failed' | 'agent_output_parse_failed';
  providerFailureStage: 'n8n_chain_llm';
  providerNodeType: string | null;
  providerNodeName: string | null;
}

const COACH_INVALID_PROVIDER_RESPONSE_PATTERNS = [
  /unterminated string in json/i,
  /unexpected end of json input/i,
  /json\.parse/i,
  /failed to parse agent steps/i,
] as const;

const COACH_CHAIN_LLM_MARKERS = [
  /@n8n\/n8n-nodes-langchain\.chainllm/i,
  /chainllm\.node\.ts/i,
  /chainllm/i,
] as const;

function buildCoachWebhookFailureHaystack(
  webhookResult: Awaited<
    ReturnType<typeof postCoachGenerateWebhook>
  >['webhookResult'],
) {
  return [
    webhookResult.rawText,
    webhookResult.payload ? JSON.stringify(webhookResult.payload) : null,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');
}

function extractCoachProviderNodeType(text: string) {
  const labeledMatch = text.match(/Node type\s+([^\r\n]+)/i);
  if (labeledMatch?.[1]) {
    return labeledMatch[1].trim();
  }

  const inlineMatch = text.match(/(@n8n\/n8n-nodes-langchain\.chainLlm)/i);
  return inlineMatch?.[1] ?? null;
}

function extractCoachProviderNodeName(text: string) {
  const directMatch = text.match(/^\s*(Coach [^\r\n"]+?)\s*$/m);
  if (directMatch?.[1]) {
    return directMatch[1].trim();
  }

  const quotedMatch = text.match(/"([^"\r\n]*Coach [^"\r\n]+)"/i);
  return quotedMatch?.[1]?.trim() ?? null;
}

function resolveInvalidCoachWebhookResponseMetadata(
  webhookResult: Awaited<
    ReturnType<typeof postCoachGenerateWebhook>
  >['webhookResult'],
): CoachWebhookInvalidResponseMetadata | null {
  if (webhookResult.status < 500) {
    return null;
  }

  const haystack = buildCoachWebhookFailureHaystack(webhookResult);
  if (!haystack) {
    return null;
  }

  const hasParseSignal = COACH_INVALID_PROVIDER_RESPONSE_PATTERNS.some((pattern) =>
    pattern.test(haystack),
  );
  const hasChainSignal = COACH_CHAIN_LLM_MARKERS.some((pattern) =>
    pattern.test(haystack),
  );

  if (!hasParseSignal || !hasChainSignal) {
    return null;
  }

  return {
    providerFailureKind: /failed to parse agent steps/i.test(haystack)
      ? 'agent_output_parse_failed'
      : 'json_parse_failed',
    providerFailureStage: 'n8n_chain_llm',
    providerNodeType: extractCoachProviderNodeType(haystack),
    providerNodeName: extractCoachProviderNodeName(haystack),
  };
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

function resolveCoachBackgroundErrorCode(error: unknown) {
  if (error instanceof Phase2HttpError) {
    if (error.code === COACH_RESPONSE_TOO_LARGE_ERROR_CODE) {
      return COACH_RESPONSE_TOO_LARGE_ERROR_CODE;
    }

    if (error.code === INVALID_COACH_RESPONSE_ERROR_CODE) {
      return INVALID_COACH_RESPONSE_ERROR_CODE;
    }

    if (error.code) {
      return error.code;
    }

    if (error.status === 502 || error.status === 503) {
      return 'coach_webhook_failed';
    }
  }

  return 'coach_generation_failed';
}

function buildCoachBackgroundErrorPayload(
  error: unknown,
  options: {
    errorCode: string;
    requestId: string;
    usedFallback: boolean;
  },
) {
  const errorRecord = isRecord(error) ? error : null;
  const errorCode =
    error instanceof Phase2HttpError
      ? error.code
      : readOptionalString(errorRecord?.code);
  const errorStatus =
    error instanceof Phase2HttpError
      ? error.status
      : typeof errorRecord?.status === 'number'
        ? errorRecord.status
        : undefined;

  return summarizeProviderPayload(null, {
    error_name:
      error instanceof Error
        ? error.name
        : readOptionalString(errorRecord?.name) ?? undefined,
    code: errorCode ?? undefined,
    status: errorStatus,
    error_code: options.errorCode,
    fallback: options.usedFallback,
    provider: 'n8n',
    request_id: options.requestId,
    source: 'coach_generation',
  });
}

async function updateCoachEntryToError(
  client: any,
  entryId: string,
  values: {
    status: 'error';
    error_code: string;
    response_payload_json: Record<string, unknown>;
  },
) {
  const { error } = await client
    .from('coach_entries')
    .update(values)
    .eq('id', entryId);

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach generation error finalization',
      fallbackCode: 'coach_entry_error_finalize_failed',
      fallbackMessage: 'Failed to mark the coach response as failed',
      relationName: 'coach_entries',
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
  const requestPayloadJson = isRecord(entry?.request_payload_json)
    ? entry.request_payload_json
    : null;
  const legacyPromptType = requestPayloadJson
    ? readCoachPromptType(requestPayloadJson.prompt_type)
    : null;
  const promptType = readCoachPromptType(entry.prompt_type) ?? legacyPromptType;
  const responseVersion: 1 | 2 =
    entry?.response_version === 2 ? 2 : 1;
  const content = isRecord(entry?.content_json)
    ? (entry.content_json as Record<string, unknown>)
    : null;
  const rawQuestionKey =
    normalizeCoachQuestionKey(entry?.question_key) ??
    (requestPayloadJson
      ? normalizeCoachQuestionKey(requestPayloadJson.question_key)
      : null);
  const rawQuestionText =
    normalizeCoachQuestionText(entry?.question_text) ??
    normalizeCoachQuestionText(requestPayloadJson?.question_text);
  const resolvedQuestionSelection = promptType
    ? resolveCoachQuestionSelection({
        promptType,
        questionKey: rawQuestionKey,
        questionText: rawQuestionText,
        locale: typeof entry?.locale === 'string' ? entry.locale : null,
      })
    : {
        questionKey: rawQuestionKey,
        questionText: rawQuestionText,
      };

  return {
    success: true,
    cached,
    entry_id: entry.id,
    persona_key: isCoachPersonaKey(entry.persona_key)
      ? entry.persona_key
      : DEFAULT_COACH_PERSONA_KEY,
    prompt_type: promptType,
    question_key: resolvedQuestionSelection.questionKey ?? null,
    question_text: resolvedQuestionSelection.questionText ?? null,
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
  let terminalEntryWritten = false;
  const markPendingEntryError = async (values: {
    status: 'error';
    error_code: string;
    response_payload_json: Record<string, unknown>;
  }) => {
    await updateCoachEntryToError(client, pendingEntry.id, values);
    terminalEntryWritten = true;
  };

  try {
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
        await markPendingEntryError({
          status: 'error',
          error_code: COACH_RESPONSE_TOO_LARGE_ERROR_CODE,
          response_payload_json: buildCoachBackgroundErrorPayload(error, {
            errorCode: COACH_RESPONSE_TOO_LARGE_ERROR_CODE,
            usedFallback,
            requestId,
          }),
        });
      }

      throw error;
    }

    await markPendingEntryError({
      status: 'error',
      error_code: 'coach_webhook_unreachable',
      response_payload_json: buildCoachBackgroundErrorPayload(error, {
        errorCode: 'coach_webhook_unreachable',
        usedFallback,
        requestId,
      }),
    });

    throw new Phase2HttpError(
      502,
      'coach_webhook_failed',
      'Coach generation provider could not be reached',
    );
  }

  if (!webhookResult.ok) {
    const invalidResponseMetadata =
      resolveInvalidCoachWebhookResponseMetadata(webhookResult);

    if (invalidResponseMetadata) {
      await markPendingEntryError(
        buildInvalidCoachResponseEntryValues({
          payload: webhookResult.payload,
          usedFallback,
          requestId,
          webhookStatus: webhookResult.status,
          responseBodyPresent: webhookResult.bodyPresent,
          ...invalidResponseMetadata,
        }),
      );

      throw new Phase2HttpError(
        502,
        INVALID_COACH_RESPONSE_ERROR_CODE,
        'Coach generation provider returned an invalid response',
      );
    }

    await markPendingEntryError({
      status: 'error',
      error_code: `coach_webhook_${webhookResult.status}`,
      response_payload_json: summarizeWebhookResult(webhookResult, {
        fallback: usedFallback,
        provider: 'n8n',
        request_id: requestId,
        source: 'coach_generation',
        error_code: `coach_webhook_${webhookResult.status}`,
      }),
    });

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
      await markPendingEntryError(
        buildInvalidCoachResponseEntryValues({
          payload: webhookResult.payload,
          usedFallback,
          requestId,
          webhookStatus: webhookResult.status,
          responseBodyPresent: webhookResult.bodyPresent,
        }),
      );
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

  terminalEntryWritten = true;

  await applyCoachProfileUpdatesForEntry(client, {
    id: finalEntry.id,
    user_id: userId,
    content_json: isRecord(finalEntry.content_json)
      ? finalEntry.content_json
      : null,
  });
  } catch (error) {
    if (!terminalEntryWritten) {
      const errorCode = resolveCoachBackgroundErrorCode(error);

      try {
        await markPendingEntryError({
          status: 'error',
          error_code: errorCode,
          response_payload_json: buildCoachBackgroundErrorPayload(error, {
            errorCode,
            usedFallback,
            requestId,
          }),
        });
      } catch (markError) {
        logPhase2Error(
          '[coach-generate-response] Failed to mark pending entry as errored',
          markError,
          {
            request_id: requestId,
            entry_id: pendingEntry.id,
          },
        );
      }
    }

    throw error;
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
      question_key:
        normalizeCoachQuestionKey(
          isRecord(requestBody.payload) ? requestBody.payload.question_key : null,
        ),
      question_text: normalizeCoachQuestionText(
        isRecord(requestBody.payload) ? requestBody.payload.question_text : null,
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
