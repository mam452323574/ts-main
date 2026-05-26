import { Phase2HttpError } from './phase2Errors.ts';
import { summarizeProviderPayload } from './phase2Observability.ts';
import { isRecord, readOptionalString } from './phase2Utils.ts';
import {
  getDefaultCoachDisclaimer,
} from '../../../shared/coachCopy.ts';
import type { CoachStructuredContent } from '../../../shared/coachContent.ts';
import {
  parseCoachStructuredContent,
  synthesizeCoachBody,
} from '../../../shared/coachContentParser.ts';
export { DEFAULT_COACH_DISCLAIMER } from '../../../shared/coachCopy.ts';

export const INVALID_COACH_RESPONSE_ERROR_CODE = 'invalid_coach_response';
export const COACH_INSUFFICIENT_DATA_ERROR_CODE = 'coach_insufficient_data';

export interface ResolvedCoachPayload {
  title: string;
  body: string;
  disclaimer: string;
  cta_label: string | null;
  cta_route: string | null;
  source: string;
  expires_at: string | null;
  response_version: 1 | 2;
  content: CoachStructuredContent | null;
}

interface BuildReadyCoachEntryValuesOptions {
  payload: Record<string, unknown> | null;
  normalizedResponse: ResolvedCoachPayload;
  locale: string | null;
  usedFallback: boolean;
  generatedAt: string;
  expiresAt: string;
}

function extractCoachResponseVersion(value: unknown): 1 | 2 | null {
  if (value === 2 || value === '2') {
    return 2;
  }

  if (value === 1 || value === '1') {
    return 1;
  }

  return null;
}

interface BuildInvalidCoachResponseEntryValuesOptions {
  payload: Record<string, unknown> | null;
  usedFallback: boolean;
  requestId?: string | null;
  webhookStatus?: number | null;
  responseBodyPresent?: boolean | null;
  providerFailureKind?: string | null;
  providerFailureStage?: string | null;
  providerNodeType?: string | null;
  providerNodeName?: string | null;
}

interface BuildInsufficientDataCoachResponseEntryValuesOptions {
  payload: Record<string, unknown> | null;
  usedFallback: boolean;
  requestId?: string | null;
  fallbackReason?: string | null;
  language?: string | null;
  promptType?: string | null;
  coachRoute?: string | null;
  hasScanIntent?: boolean | null;
}

type CoachPayloadWrapperSource = 'root' | 'data' | 'entry';

function resolveCoachPayloadSource(
  payload: Record<string, unknown> | null,
): {
  source: CoachPayloadWrapperSource;
  candidate: Record<string, unknown> | null;
} {
  if (payload && isRecord(payload.data)) {
    return {
      source: 'data',
      candidate: payload.data,
    };
  }

  if (payload && isRecord(payload.entry)) {
    return {
      source: 'entry',
      candidate: payload.entry,
    };
  }

  return {
    source: 'root',
    candidate: payload,
  };
}

export function readCoachPayloadCandidate(
  payload: Record<string, unknown> | null,
): Record<string, unknown> | null {
  return resolveCoachPayloadSource(payload).candidate;
}

export function resolveCoachPayload(
  payload: Record<string, unknown> | null,
  locale?: string | null,
) {
  const basePayload = readCoachPayloadCandidate(payload);

  if (!basePayload || !isRecord(basePayload)) {
    throw new Phase2HttpError(
      502,
      INVALID_COACH_RESPONSE_ERROR_CODE,
      'Coach webhook returned an invalid payload',
    );
  }

  // n8n signals when it had to fall back to a generic/templated body because
  // the LLM produced nothing usable. Treat that as a non-consuming failure so
  // the caller can refund the quota instead of persisting a fabricated reply.
  if (basePayload.insufficient_data === true) {
    throw new Phase2HttpError(
      422,
      COACH_INSUFFICIENT_DATA_ERROR_CODE,
      'Coach webhook reported insufficient data to produce a useful reply',
    );
  }

  const title = readOptionalString(basePayload.title);
  const providedBody = readOptionalString(basePayload.body);
  const declaredVersion = extractCoachResponseVersion(
    basePayload.response_version,
  );
  const parsedContent = parseCoachStructuredContent(basePayload.content, {
    fallbackTitle: title,
  });
  const content = parsedContent.content;
  const synthesizedBody = parsedContent.synthesizedBody;
  const body = providedBody ?? (synthesizedBody.length > 0 ? synthesizedBody : null);

  if (!title || !body) {
    throw new Phase2HttpError(
      502,
      INVALID_COACH_RESPONSE_ERROR_CODE,
      'Coach webhook response must include title and body',
    );
  }

  const resolvedVersion: 1 | 2 = content
    ? 2
    : declaredVersion === 2
      ? 2
      : 1;

  const resolvedContent =
    resolvedVersion === 2 && !content && title && body
      ? ({
          title,
          summary: '',
          context_notes: [],
          priorities: [],
          action_steps: [],
          warnings: [],
          encouragement: null,
          primary_metric_delta: null,
          data_gaps: [],
          confidence: null,
        } satisfies CoachStructuredContent)
      : content;

  return {
    title,
    body,
    disclaimer:
      readOptionalString(basePayload.disclaimer) ??
      getDefaultCoachDisclaimer(locale),
    cta_label: readOptionalString(basePayload.cta_label),
    cta_route: readOptionalString(basePayload.cta_route),
    source: readOptionalString(basePayload.source) ?? 'n8n',
    expires_at: readOptionalString(basePayload.expires_at),
    response_version: resolvedVersion,
    content: resolvedContent,
  } satisfies ResolvedCoachPayload;
}

export { synthesizeCoachBody };

export function buildReadyCoachEntryValues(
  options: BuildReadyCoachEntryValuesOptions,
) {
  const providerSummaryPayload = readCoachPayloadCandidate(options.payload);

  return {
    title: options.normalizedResponse.title,
    body: options.normalizedResponse.body,
    disclaimer: options.normalizedResponse.disclaimer,
    cta_label: options.normalizedResponse.cta_label ?? null,
    cta_route: options.normalizedResponse.cta_route ?? null,
    source: options.normalizedResponse.source,
    locale: options.locale,
    response_version: options.normalizedResponse.response_version,
    content_json: options.normalizedResponse.content ?? null,
    response_payload_json: summarizeProviderPayload(providerSummaryPayload, {
      fallback: options.usedFallback,
      source: options.normalizedResponse.source,
      status: 'ready',
    }),
    status: 'ready' as const,
    error_code: null,
    generated_at: options.generatedAt,
    expires_at: options.expiresAt,
  };
}

export function buildInvalidCoachResponseEntryValues(
  options: BuildInvalidCoachResponseEntryValuesOptions,
) {
  const { source: payloadWrapperSource, candidate: providerSummaryPayload } =
    resolveCoachPayloadSource(options.payload);
  const title = readOptionalString(providerSummaryPayload?.title);
  const body = readOptionalString(providerSummaryPayload?.body);

  return {
    status: 'error' as const,
    error_code: INVALID_COACH_RESPONSE_ERROR_CODE,
    response_payload_json: summarizeProviderPayload(providerSummaryPayload, {
      fallback: options.usedFallback,
      source: 'coach_generation',
      provider: 'n8n',
      status: 'error',
      error_code: INVALID_COACH_RESPONSE_ERROR_CODE,
      request_id: options.requestId ?? undefined,
      webhook_status: options.webhookStatus ?? undefined,
      response_body_present: options.responseBodyPresent ?? undefined,
      provider_failure_kind: options.providerFailureKind ?? undefined,
      provider_failure_stage: options.providerFailureStage ?? undefined,
      provider_node_type: options.providerNodeType ?? undefined,
      provider_node_name: options.providerNodeName ?? undefined,
      wrapper_source: payloadWrapperSource,
      title_present: Boolean(title),
      body_present: Boolean(body),
    }),
  };
}

export function buildInsufficientDataCoachResponseEntryValues(
  options: BuildInsufficientDataCoachResponseEntryValuesOptions,
) {
  const { source: payloadWrapperSource, candidate: providerSummaryPayload } =
    resolveCoachPayloadSource(options.payload);
  const debugSource =
    providerSummaryPayload && isRecord(providerSummaryPayload.debug)
      ? (providerSummaryPayload.debug as Record<string, unknown>)
      : null;
  const fallbackReason =
    options.fallbackReason ??
    (debugSource && typeof debugSource.fallback_reason === 'string'
      ? (debugSource.fallback_reason as string)
      : null);
  const language =
    options.language ??
    (debugSource && typeof debugSource.language === 'string'
      ? (debugSource.language as string)
      : null);
  const promptType =
    options.promptType ??
    (debugSource && typeof debugSource.prompt_type === 'string'
      ? (debugSource.prompt_type as string)
      : null);
  const coachRoute =
    options.coachRoute ??
    (debugSource && typeof debugSource.coach_route === 'string'
      ? (debugSource.coach_route as string)
      : null);
  const hasScanIntent =
    options.hasScanIntent ??
    (debugSource && typeof debugSource.has_scan_intent === 'boolean'
      ? (debugSource.has_scan_intent as boolean)
      : null);

  return {
    status: 'error' as const,
    error_code: COACH_INSUFFICIENT_DATA_ERROR_CODE,
    response_payload_json: summarizeProviderPayload(providerSummaryPayload, {
      fallback: options.usedFallback,
      source: 'coach_generation',
      provider: 'n8n',
      status: 'error',
      error_code: COACH_INSUFFICIENT_DATA_ERROR_CODE,
      request_id: options.requestId ?? undefined,
      wrapper_source: payloadWrapperSource,
      fallback_reason: fallbackReason ?? undefined,
      language: language ?? undefined,
      prompt_type: promptType ?? undefined,
      coach_route: coachRoute ?? undefined,
      has_scan_intent: hasScanIntent ?? undefined,
    }),
  };
}
