import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  buildInsufficientDataCoachResponseEntryValues,
  buildInvalidCoachResponseEntryValues,
  buildReadyCoachEntryValues,
  COACH_INSUFFICIENT_DATA_ERROR_CODE,
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
  coachQuotaBucketForSource,
  COACH_QUOTA_EXHAUSTED_ERROR_CODE,
  type CoachQuotaSource,
  projectCoachQuotaForSource,
  reserveCoachQuota,
  refundCoachQuotaEventWithRetry,
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
  logPhase2Info,
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
import {
  COACH_RESPONSE_FORMAT_INSTRUCTIONS,
  applyResponseFormatToPersona,
} from '../../../shared/coachResponseFormatRules.ts';
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

// CO-05 (cf. SCANNER_COACH_AUDIT_2026_05.md §6) — quand un scan a flagge
// `urgency_flag=true` (ex: high_body_fat, severe_deficiency), on injecte un
// disclaimer medical en tete du tone_instructions du persona choisi. Le LLM
// coach garde le persona/style demande par l'utilisateur mais doit prioriser
// la recommandation de consultation professionnelle. C'est un override
// strictement defensif : si le workflow n8n ignore les nouveaux flags
// `urgency_mode` / `force_disclaimer` ajoutes au payload, le persona modifie
// force quand meme un comportement plus prudent.
const MEDICAL_REFERRAL_PROMPT_PREFIX =
  'IMPORTANT MEDICAL DISCLAIMER (urgent signal): the user\'s recent scan flagged a potentially urgent health signal. ' +
  'You MUST: (1) recommend consulting a healthcare professional as the primary action, ' +
  '(2) avoid giving specific medical, diagnostic, or treatment advice, ' +
  '(3) keep general wellness suggestions short and conservative, ' +
  '(4) never minimize the signal, never claim certainty about diagnosis. ' +
  'Begin your reply with a clear referral statement before any other content. ';

/**
 * Suffixe append au tone_instructions persona pour cadrer le FORMAT de la
 * reponse coach. Aligne avec les nouvelles questions plus attractives
 * (top 3, action n°1, 10 min, ce soir, plan 24h) sans modifier le workflow n8n.
 *
 * Pourquoi append et pas prepend :
 *  - L'urgency override (MEDICAL_REFERRAL_PROMPT_PREFIX) doit rester en tete
 *    pour que le LLM le lise en priorite.
 *  - Le ton du persona doit rester intact (warmth, strictness, etc.).
 *  - Les regles de format viennent en dernier comme un rappel structurel.
 *
 * Note : ces regles sont des HINTS pour le LLM. Le rendu final depend du
 * workflow n8n + du parser cote handler (`resolveCoachPayload`). Si le LLM
 * ignore les hints, la reponse reste fonctionnelle (juste moins structuree).
 */
// Re-export pour préserver la surface API actuelle (le handler exposait ces
// symboles avant le refactor vers `shared/coachResponseFormatRules.ts`).
export { COACH_RESPONSE_FORMAT_INSTRUCTIONS, applyResponseFormatToPersona };

function hasUrgencySignal(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const root = payload as Record<string, unknown>;

  const checkScanLike = (scanLike: unknown): boolean => {
    if (!scanLike || typeof scanLike !== 'object') return false;
    const scan = scanLike as Record<string, unknown>;
    const digest = scan.digest as Record<string, unknown> | undefined;
    const metrics = digest?.metrics as Record<string, unknown> | undefined;
    if (metrics && metrics.urgency_flag === true) return true;

    const keyMetrics = scan.key_metrics as Record<string, unknown> | undefined;
    if (keyMetrics && keyMetrics.urgency_flag === true) return true;

    return false;
  };

  if (checkScanLike(root.latest_scan)) return true;
  if (checkScanLike(root.selected_scan)) return true;
  const recent = root.recent_scans;
  if (Array.isArray(recent) && recent.some(checkScanLike)) return true;
  const prior = root.prior_scans;
  if (Array.isArray(prior) && prior.some(checkScanLike)) return true;
  return false;
}

function applyUrgencyOverrideToPersona<
  T extends { toneInstructions: string },
>(persona: T, urgencyDetected: boolean): T {
  if (!urgencyDetected) return persona;
  return {
    ...persona,
    toneInstructions: `${MEDICAL_REFERRAL_PROMPT_PREFIX}${persona.toneInstructions}`,
  };
}

interface EdgeRuntimeLike {
  waitUntil?: (promise: Promise<unknown>) => void;
}

type CoachPromptTypeValue = NonNullable<
  ReturnType<typeof normalizeCoachGenerationPromptType>
>;

export const COACH_GENERATE_REQUEST_MAX_BYTES = 256 * 1024;

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
  // Quota usage event id reserved before the webhook call. When the background
  // task ends in an error (webhook down / invalid response / too large), we
  // refund this event so the user is not charged for an unusable response.
  // Optional so existing tests (which never debited a quota) keep compiling.
  usageEventId?: string | null;
  // Diagnostic context preserved across retries: when the request's upsert
  // overwrote an existing errored entry (same user_id + cache_key), the prior
  // error_code/updated_at are captured here so the eventual finalize (ready or
  // error) can merge them into response_payload_json. Without this the retry
  // wipes the original error and makes incident triage impossible.
  previousErrorContext?: Record<string, unknown> | null;
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

function throwCoachQuotaExhausted(
  quota: CoachQuotaStatus,
  source: CoachQuotaSource,
): never {
  // The reserved quota snapshot has top-level fields that mirror the GENERAL
  // bucket (legacy contract). When the exhaustion is on the scan_cta bucket
  // we project the snapshot so `available` and `next_recharge_at` reflect the
  // bucket the user actually tried to hit — otherwise the 24h countdown shown
  // by the UI would be misleading (it could even be `null` if general still
  // has slots left while scan_cta is exhausted).
  const projected = projectCoachQuotaForSource(quota, source);
  throw new Phase2HttpError(
    429,
    COACH_QUOTA_EXHAUSTED_ERROR_CODE,
    'Coach quota exhausted',
    buildCoachQuotaErrorDetails(projected, source),
  );
}

async function attachCoachQuotaEventBestEffort(
  client: any,
  options: {
    usageEventId: string | null;
    userId: string;
    coachEntryId: string;
    source: CoachQuotaSource;
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

// Returns true when the incoming Coach generation request originates from a
// scanner result CTA (i.e. payload.scan_intent is a populated object). This
// drives bucket selection — scan_cta vs general — so the two flows do not
// share a single counter. Free users get 1+1, premium 8+8, admin unlimited.
function isCoachScanCtaRequest(payload: unknown): boolean {
  return isRecord(payload) && isRecord((payload as Record<string, unknown>).scan_intent);
}

function pickCoachQuotaSource(
  payload: unknown,
  kind: 'generation' | 'cache',
): CoachQuotaSource {
  const scanCta = isCoachScanCtaRequest(payload);
  if (kind === 'generation') {
    return scanCta ? 'coach_scan_cta_generation' : 'coach_generation';
  }
  return scanCta ? 'coach_scan_cta_cache' : 'coach_cache';
}

// Single structured log line emitted right after the bucket decision so we
// can quantify, in production logs, the split between general vs scan_cta
// flows and correlate quota exhaustion / refund events with the request that
// caused them. Kept minimal (no payload echoes) so it stays under the
// SENSITIVE_KEY_PATTERN guards and never carries scan content.
function logCoachQuotaDecision(options: {
  requestId: string;
  source: CoachQuotaSource;
  payload: unknown;
  kind: 'generation' | 'cache';
}) {
  const promptType =
    isRecord(options.payload) &&
    typeof (options.payload as Record<string, unknown>).prompt_type === 'string'
      ? ((options.payload as Record<string, unknown>).prompt_type as string)
      : null;
  logPhase2Info('[coach-generate-response] quota-decision', {
    request_id: options.requestId,
    quota_source: options.source,
    quota_bucket: coachQuotaBucketForSource(options.source),
    quota_kind: options.kind,
    has_scan_intent: isCoachScanCtaRequest(options.payload),
    prompt_type: promptType,
  });
}

function buildPreviousErrorContext(
  existingEntry:
    | { status?: unknown; error_code?: unknown; updated_at?: unknown }
    | null
    | undefined,
): Record<string, unknown> | null {
  if (!existingEntry || existingEntry.status !== 'error') return null;
  const previousErrorCode = readOptionalString(existingEntry.error_code);
  if (!previousErrorCode) return null;
  return {
    previous_error_code: previousErrorCode,
    previous_errored_at: readOptionalString(existingEntry.updated_at) ?? null,
  };
}

function resolveCoachBackgroundErrorCode(error: unknown) {
  if (error instanceof Phase2HttpError) {
    if (error.code === COACH_RESPONSE_TOO_LARGE_ERROR_CODE) {
      return COACH_RESPONSE_TOO_LARGE_ERROR_CODE;
    }

    if (error.code === INVALID_COACH_RESPONSE_ERROR_CODE) {
      return INVALID_COACH_RESPONSE_ERROR_CODE;
    }

    if (error.code === COACH_INSUFFICIENT_DATA_ERROR_CODE) {
      return COACH_INSUFFICIENT_DATA_ERROR_CODE;
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
    usageEventId,
  } = options;

  let usedFallback = false;

  let webhookResult: Awaited<
    ReturnType<typeof postCoachGenerateWebhook>
  >['webhookResult'];
  let terminalEntryWritten = false;
  const previousErrorContext = options.previousErrorContext ?? null;
  const decoratePayload = (
    payload: Record<string, unknown>,
  ): Record<string, unknown> =>
    previousErrorContext ? { ...payload, ...previousErrorContext } : payload;
  const markPendingEntryError = async (values: {
    status: 'error';
    error_code: string;
    response_payload_json: Record<string, unknown>;
  }) => {
    // Refund the credit when the background task cannot produce useful
    // coaching for the user before clients can observe the terminal failure.
    // The refund is retried a few times with short backoff to ride out
    // transient DB contention. On final failure, emit a CRITICAL log so ops
    // can spot leaked credits — the entry is still flipped to `error` so the
    // user never gets stuck on a permanently-pending state.
    if (usageEventId) {
      const refundResult = await refundCoachQuotaEventWithRetry(client, {
        usageEventId,
        userId,
        reason: values.error_code,
      });
      if (!refundResult.success) {
        logPhase2Error(
          '[coach-generate-response][CRITICAL] Failed to refund quota after retries',
          refundResult.lastError,
          {
            request_id: requestId,
            user_id: userId,
            entry_id: pendingEntry.id,
            usage_event_id: usageEventId,
            error_code: values.error_code,
            attempt_count: refundResult.attempts,
          },
        );
      }
    }

    await updateCoachEntryToError(client, pendingEntry.id, {
      ...values,
      response_payload_json: decoratePayload(values.response_payload_json),
    });
    terminalEntryWritten = true;
  };

  // Toute operation post-reservation doit terminer l'entree et rembourser le
  // quota en cas d'echec, y compris la preparation du payload.
  try {
  // CO-05 — flag observable cote n8n pour declencher un disclaimer renforce.
  // `persona.toneInstructions` est deja override (cf. applyUrgencyOverrideToPersona)
  // donc le LLM coach voit le prefix medical en tete du tone meme si n8n
  // ignore les flags ci-dessous (defense en profondeur).
  const urgencyMode = hasUrgencySignal(requestBody.payload);

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
    ...(urgencyMode ? { urgency_mode: true, force_disclaimer: true } : {}),
  };

  // CO-07 (cf. SCANNER_COACH_AUDIT_2026_05.md §6) — borne la taille du payload
  // OUTBOUND apres expansion serveur (la requete entrante est plafonnee a 64KB
  // mais le handler enrichit avec persona/contracts/etc, et le payload final
  // peut atteindre 100+ KB sur les cas pathologiques recent_scans=32 * digest
  // complet). Cap bumpe a 1000KB (2026-05-20) suite aux 3 incidents
  // `coach_payload_too_large` sur 24h : prior_scans + rich contexts depassent
  // les 200KB precedents pour les super-users. 1000KB couvre le pire cas
  // mesure et reste dans les limites raisonnables pour le LLM en aval.
  const COACH_OUTBOUND_PAYLOAD_MAX_BYTES = 1000 * 1024;
  const serializedPayload = JSON.stringify(webhookPayload);
  const serializedPayloadBytes = serializedPayload.length;
  if (serializedPayloadBytes > COACH_OUTBOUND_PAYLOAD_MAX_BYTES) {
    await markPendingEntryError({
      status: 'error',
      error_code: 'coach_payload_too_large',
      response_payload_json: {
        payload_bytes: serializedPayloadBytes,
        max_bytes: COACH_OUTBOUND_PAYLOAD_MAX_BYTES,
      },
    });
    throw new Phase2HttpError(
      413,
      'coach_payload_too_large',
      `Coach outbound payload (${serializedPayloadBytes} bytes) exceeds the limit of ${COACH_OUTBOUND_PAYLOAD_MAX_BYTES} bytes`,
      {
        payload_bytes: serializedPayloadBytes,
        max_bytes: COACH_OUTBOUND_PAYLOAD_MAX_BYTES,
      },
    );
  }

  // CO-04 (cf. SCANNER_COACH_AUDIT_2026_05.md §6) — quota tokens par user.
  // Approximation 1 token ~= 4 caracteres. Le check bloque l'appel webhook si
  // l'utilisateur a deja consomme > p_per_hour_limit (200K) ou > p_per_day_limit
  // (1M) tokens sur les fenetres glissantes. L'estimation est volontairement
  // optimiste (compte uniquement le payload outbound, pas la reponse LLM) — la
  // reponse est plafonnee a 32KB cote webhook (C-03) donc le ratio req/rep est
  // borne.
  const estimatedTokens = Math.ceil(serializedPayloadBytes / 4);
  const { data: tokenQuotaData, error: tokenQuotaError } = await client.rpc(
    'record_coach_token_consumption',
    {
      p_user_id: userId,
      p_estimated_tokens: estimatedTokens,
      p_per_hour_limit: 200_000,
      p_per_day_limit: 1_000_000,
    },
  );
  if (tokenQuotaError) {
    // Defense en profondeur : si la RPC echoue (DB down, schema mismatch),
    // on continue sans bloquer (le rate limit appels protege deja) mais on log.
    logPhase2Error(
      '[coach-generate-response] Token quota check failed',
      tokenQuotaError,
      { request_id: requestId, entry_id: pendingEntry.id },
    );
  } else if (
    tokenQuotaData &&
    typeof tokenQuotaData === 'object' &&
    (tokenQuotaData as Record<string, unknown>).allowed === false
  ) {
    const windowExceeded =
      typeof (tokenQuotaData as Record<string, unknown>).window_exceeded ===
      'string'
        ? ((tokenQuotaData as Record<string, unknown>).window_exceeded as string)
        : 'unknown';
    await markPendingEntryError({
      status: 'error',
      error_code: 'coach_token_quota_exceeded',
      response_payload_json: {
        window_exceeded: windowExceeded,
        estimated_tokens: estimatedTokens,
      },
    });
    throw new Phase2HttpError(
      429,
      'coach_token_quota_exceeded',
      `Coach token quota exceeded for window: ${windowExceeded}`,
      {
        window_exceeded: windowExceeded,
        estimated_tokens: estimatedTokens,
      },
    );
  }

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
    } else if (
      error instanceof Phase2HttpError &&
      error.code === COACH_INSUFFICIENT_DATA_ERROR_CODE
    ) {
      // n8n could not produce a useful reply (LLM refusal or empty content
      // fell back to a generic message). Treat as a non-consuming failure:
      // markPendingEntryError refunds the quota event before persisting the
      // error entry, so the user is not charged for a fabricated response.
      await markPendingEntryError(
        buildInsufficientDataCoachResponseEntryValues({
          payload: webhookResult.payload,
          usedFallback,
          requestId,
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

  const readyValues = buildReadyCoachEntryValues({
    payload: webhookResult.payload,
    normalizedResponse,
    locale: resolvedLocale,
    usedFallback,
    generatedAt,
    expiresAt,
  });
  const { data: finalEntry, error: finalEntryError } = await client
    .from('coach_entries')
    .update({
      ...readyValues,
      response_payload_json: decoratePayload(readyValues.response_payload_json),
    })
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

    const basePersona = getCoachPersona(requestBody.persona_key);
    // CO-05 — applique l'override "medical referral" si un scan recent flagge
    // `urgency_flag=true` (cf. hasUrgencySignal).
    const urgencyDetected = hasUrgencySignal(requestBody.payload);
    // Pipeline d'enrichissement du tone_instructions :
    //   urgency (prepend)  →  persona base  →  format rules (append)
    // Le format rules est append APRES l'urgency pour que le disclaimer
    // medical reste en tete du system prompt vu par le LLM coach.
    const persona = applyResponseFormatToPersona(
      applyUrgencyOverrideToPersona(basePersona, urgencyDetected),
    );
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
      const cacheSource = pickCoachQuotaSource(requestBody.payload, 'cache');
      logCoachQuotaDecision({
        requestId,
        source: cacheSource,
        payload: requestBody.payload,
        kind: 'cache',
      });
      const quotaReservation = await reserveCoachQuota(supabase, {
        userId: user.id,
        source: cacheSource,
        requestId,
      });

      if (!quotaReservation.allowed) {
        throwCoachQuotaExhausted(quotaReservation.quota, cacheSource);
      }

      await attachCoachQuotaEventBestEffort(supabase, {
        usageEventId: quotaReservation.usage_event_id,
        userId: user.id,
        coachEntryId: existingEntry.id,
        source: cacheSource,
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
    const generationSource = pickCoachQuotaSource(
      requestBody.payload,
      'generation',
    );
    logCoachQuotaDecision({
      requestId,
      source: generationSource,
      payload: requestBody.payload,
      kind: 'generation',
    });
    const quotaReservation = await reserveCoachQuota(supabase, {
      userId: user.id,
      source: generationSource,
      requestId,
    });

    if (!quotaReservation.allowed) {
      throwCoachQuotaExhausted(quotaReservation.quota, generationSource);
    }

    const previousErrorContext = buildPreviousErrorContext(existingEntry);

    // Fix Bug B (2026-05-21) — quand force_refresh=true et qu'une entry ready
    // existe deja avec ce cacheKey, l'UPSERT (onConflict: user_id,cache_key)
    // ECRASE cette row en remettant status='pending', body=null, title=null.
    // Si le background task echoue, l'utilisateur perd l'ancien conseil ET
    // l'historique en perd la trace (puisqu'il lit la meme table). On evite
    // ca en utilisant une cache_key unique pour la nouvelle row pending quand
    // force_refresh est arme : l'INSERT cree une nouvelle ligne, l'ancienne
    // entry ready reste intacte et reste visible dans l'historique meme si
    // n8n echoue. Le cold-start suivant (sans force_refresh) recupere la
    // derniere entry ready via fetchLatestReadyCoachEntry qui trie par
    // generated_at desc — donc bien la nouvelle quand elle aura abouti.
    const writeCacheKey =
      requestBody.force_refresh && existingEntry?.status === 'ready'
        ? `${cacheKey}__fr_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`
        : cacheKey;

    const pendingValues = {
      user_id: user.id,
      cache_key: writeCacheKey,
      input_hash: inputHash,
      request_payload_json: requestBody.payload,
      response_payload_json: previousErrorContext ?? {},
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
      const refundResult = await refundCoachQuotaEventWithRetry(supabase, {
        usageEventId: quotaReservation.usage_event_id,
        userId: user.id,
        reason: 'coach_entry_upsert_failed',
      });
      if (!refundResult.success) {
        logPhase2Error(
          '[coach-generate-response][CRITICAL] Failed to refund quota after retries',
          refundResult.lastError,
          {
            request_id: requestId,
            user_id: user.id,
            usage_event_id: quotaReservation.usage_event_id,
            error_code: 'coach_entry_upsert_failed',
            attempt_count: refundResult.attempts,
          },
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
      source: generationSource,
      requestId,
    });

    const backgroundTask = runPendingCoachGenerationTask({
      client: supabase,
      featureFlags,
      userId: user.id,
      cacheKey: writeCacheKey,
      inputHash,
      requestBody,
      pendingEntry,
      requestId,
      resolvedLocale,
      persona,
      webhookEndpoints,
      usageEventId: quotaReservation.usage_event_id ?? null,
      previousErrorContext,
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
