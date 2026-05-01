import { Phase2HttpError } from './phase2Errors.ts';
import { isRecord } from './phase2Utils.ts';
import {
  getProviderScanType,
  type AppScanType,
  type ProviderScanType,
} from '../../../shared/scanContract.ts';
export {
  normalizeScanAnalysisLanguage,
  resolveScanAnalysisLanguageContract,
} from '../../../shared/scanContract.ts';

type SupportedScanType = AppScanType;
type SupportedProviderScanType = ProviderScanType | 'fat_distribution_scan_v2';
const SUPER_SCAN_CONTAINER_FIELDS = ['result', 'data', 'entry'] as const;
const LEGACY_SUPER_SCAN_TYPE = 'super_health_v2' as const;
const FAT_DISTRIBUTION_SCAN_TYPE = 'fat_distribution_scan_v2' as const;
const ACCEPTED_SUPER_PROVIDER_SCAN_TYPES = [
  LEGACY_SUPER_SCAN_TYPE,
  FAT_DISTRIBUTION_SCAN_TYPE,
] as const;
const SUPER_SCAN_CANONICAL_SUMMARY_FIELDS = [
  'analysis_summary',
  'summary_fallback_text',
] as const;
const SUPER_SCAN_TEXT_FIELDS = [
  'analysis',
  'analysis_text',
  'summary',
  'diagnosis',
  'explanation',
  'message',
  'content',
  'output',
  'response',
  'raw_response',
  'ai_text',
  'scan_text',
  'recommendation',
] as const;
const SUPER_SCAN_STATUS_FIELDS = ['status', 'label', 'severity'] as const;
const SUPER_SCAN_DISCLAIMER_FIELDS = [
  'disclaimer_text',
  'disclaimer_fallback_text',
  'disclaimer',
  'medical_disclaimer',
  'notice',
] as const;
const SUPER_SCAN_SCORE_FIELDS = [
  'global_risk_score',
  'globalRiskScore',
  'risk_score',
  'riskScore',
  'score',
] as const;
const SUPER_SCAN_URGENCY_FIELDS = ['urgency_flag', 'urgencyFlag'] as const;
const FAT_DISTRIBUTION_MARKER_NUMBER_FIELDS = [
  'global_body_fat_estimate_percent',
  'global_facial_fat_estimate_percent',
  'global_water_retention_estimate_percent',
] as const;
const FAT_DISTRIBUTION_MARKER_STRING_FIELDS = [
  'dominant_storage_pattern',
] as const;
const FAT_DISTRIBUTION_TOP_LEVEL_STRING_FIELDS = [
  'analysis_summary',
  'dominant_storage_pattern',
  'disclaimer_text',
] as const;
const FAT_DISTRIBUTION_AREA_STRING_FIELDS = [
  'area_name',
  'dominant_type',
  'explanation',
  'actionable_advice',
] as const;
const FAT_DISTRIBUTION_AREA_NUMBER_FIELDS = [
  'subcutaneous_fat_percent',
  'water_retention_percent',
  'definition_percent',
  'confidence',
] as const;

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

// S-05 — bornes appliquées au contenu textuel libre venant du provider IA
// (champs non-enum côté `fat_distribution_scan_v2`). Le LLM est une source
// untrusted ; ces limites protègent contre un payload hostile (DoS storage
// JSONB Postgres) et contre les caractères de contrôle injectés dans les
// chaînes (rendu HTML/PDF côté export).
const SCAN_TEXT_MAX_SUMMARY = 4_000;
const SCAN_TEXT_MAX_PARAGRAPH = 2_000;
const SCAN_TEXT_MAX_LABEL = 200;
const SCAN_FAT_AREAS_MAX = 20;
const SCAN_FAT_PRIORITY_ZONES_MAX = 20;
const CONTROL_CHARS_PATTERN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

function sanitizeBoundedText(value: unknown, maxLength: number) {
  const stringValue = readString(value);
  if (!stringValue) {
    return null;
  }

  return stringValue.replace(CONTROL_CHARS_PATTERN, '').slice(0, maxLength);
}

function sanitizeBoundedTextArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .slice(0, maxItems)
    .map((item) => sanitizeBoundedText(item, maxLength))
    .filter((item): item is string => item !== null);
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsedNumber = Number(value);
    return Number.isFinite(parsedNumber) ? parsedNumber : null;
  }

  return null;
}

function collectScanPayloadCandidates(payload: Record<string, unknown>) {
  const queue: Record<string, unknown>[] = [payload];
  const visited = new Set<Record<string, unknown>>();
  const candidates: Record<string, unknown>[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    candidates.push(current);

    for (const field of SUPER_SCAN_CONTAINER_FIELDS) {
      const nestedValue = current[field];
      if (isRecord(nestedValue)) {
        queue.push(nestedValue);
      }
    }
  }

  return candidates;
}

function readScanPayloadCandidate(payload: Record<string, unknown>) {
  const candidates = collectScanPayloadCandidates(payload);
  return (
    candidates.find((candidate) => readString(candidate.scan_type) !== null) ??
    candidates[0] ??
    payload
  );
}

function normalizeSchemaVersion(value: unknown) {
  return typeof value === 'number' && (value === 2 || value === 3)
    ? value
    : 3;
}

function isAcceptedSuperProviderScanType(
  value: unknown,
): value is (typeof ACCEPTED_SUPER_PROVIDER_SCAN_TYPES)[number] {
  return (
    typeof value === 'string' &&
    ACCEPTED_SUPER_PROVIDER_SCAN_TYPES.includes(
      value as (typeof ACCEPTED_SUPER_PROVIDER_SCAN_TYPES)[number]
    )
  );
}

function findArrayFieldValue(
  candidates: Record<string, unknown>[],
  field: string,
) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate[field])) {
      return candidate[field];
    }
  }

  return null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => readString(item))
    .filter((item): item is string => item !== null);
}

function hasFatDistributionMarkers(candidate: Record<string, unknown>) {
  if (
    Array.isArray(candidate.areas_analysis) ||
    Array.isArray(candidate.priority_zones)
  ) {
    return true;
  }

  for (const field of FAT_DISTRIBUTION_MARKER_NUMBER_FIELDS) {
    if (readNumber(candidate[field]) !== null) {
      return true;
    }
  }

  for (const field of FAT_DISTRIBUTION_MARKER_STRING_FIELDS) {
    if (readString(candidate[field])) {
      return true;
    }
  }

  return false;
}

function prioritizeCandidate(
  candidate: Record<string, unknown>,
  candidates: Record<string, unknown>[],
) {
  return [
    candidate,
    ...candidates.filter((entry) => entry !== candidate),
  ];
}

function findFatDistributionScanCandidate(candidates: Record<string, unknown>[]) {
  return (
    candidates.find(
      (candidate) =>
        readString(candidate.scan_type) === FAT_DISTRIBUTION_SCAN_TYPE
    ) ??
    candidates.find((candidate) => hasFatDistributionMarkers(candidate)) ??
    null
  );
}

function readLooseTextValue(value: unknown, depth = 0): string | null {
  if (depth > 3) {
    return null;
  }

  const directString = readString(value);
  if (directString) {
    return directString;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const collectedText = value
      .map((item) => readLooseTextValue(item, depth + 1))
      .filter((item): item is string => !!item);

    return collectedText.length > 0 ? collectedText.join('\n\n') : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of [
    'text',
    'content',
    'message',
    'analysis',
    'summary',
    'output',
    'response',
    'result',
    'value',
    'diagnosis',
    'explanation',
  ]) {
    const nestedText = readLooseTextValue(value[key], depth + 1);
    if (nestedText) {
      return nestedText;
    }
  }

  return null;
}

function readLooseRawText(rawText: string | null | undefined) {
  const trimmedText = readString(rawText);
  if (!trimmedText) {
    return null;
  }

  if (
    (trimmedText.startsWith('{') && trimmedText.endsWith('}')) ||
    (trimmedText.startsWith('[') && trimmedText.endsWith(']'))
  ) {
    return null;
  }

  if (trimmedText.startsWith('"') && trimmedText.endsWith('"')) {
    try {
      const parsedString = JSON.parse(trimmedText);
      return readString(parsedString) ?? trimmedText;
    } catch {
      return trimmedText;
    }
  }

  return trimmedText;
}

function findTextFieldValue(
  candidates: Record<string, unknown>[],
  fields: readonly string[],
) {
  for (const candidate of candidates) {
    for (const field of fields) {
      const resolvedText = readLooseTextValue(candidate[field]);
      if (resolvedText) {
        return {
          text: resolvedText,
          source: field,
        };
      }
    }
  }

  return null;
}

function findStringFieldValue(
  candidates: Record<string, unknown>[],
  fields: readonly string[],
) {
  for (const candidate of candidates) {
    for (const field of fields) {
      const resolvedText = readString(candidate[field]);
      if (resolvedText) {
        return {
          text: resolvedText,
          source: field,
        };
      }
    }
  }

  return null;
}

function findNumberFieldValue(
  candidates: Record<string, unknown>[],
  fields: readonly string[],
) {
  for (const candidate of candidates) {
    for (const field of fields) {
      const numericValue = readNumber(candidate[field]);
      if (numericValue !== null) {
        return numericValue;
      }
    }
  }

  return null;
}

function findBooleanFieldValue(
  candidates: Record<string, unknown>[],
  fields: readonly string[],
) {
  for (const candidate of candidates) {
    for (const field of fields) {
      const booleanValue = readBoolean(candidate[field]);
      if (booleanValue !== null) {
        return booleanValue;
      }
    }
  }

  return null;
}

function findDetectedConditions(candidates: Record<string, unknown>[]) {
  for (const candidate of candidates) {
    if (!Array.isArray(candidate.detected_conditions)) {
      continue;
    }

    return candidate.detected_conditions.filter(isRecord);
  }

  return [] as Record<string, unknown>[];
}

function normalizeFatDistributionArea(area: Record<string, unknown>) {
  const normalizedArea: Record<string, unknown> = {
    ...area,
  };

  // S-05 — bornes selon la sémantique du champ : `area_name` et
  // `dominant_type` sont des labels courts ; `explanation` et
  // `actionable_advice` peuvent être des paragraphes.
  const areaFieldLimits: Record<string, number> = {
    area_name: SCAN_TEXT_MAX_LABEL,
    dominant_type: SCAN_TEXT_MAX_LABEL,
    explanation: SCAN_TEXT_MAX_PARAGRAPH,
    actionable_advice: SCAN_TEXT_MAX_PARAGRAPH,
  };

  for (const field of FAT_DISTRIBUTION_AREA_STRING_FIELDS) {
    const normalizedValue = sanitizeBoundedText(
      area[field],
      areaFieldLimits[field] ?? SCAN_TEXT_MAX_LABEL,
    );
    if (normalizedValue) {
      normalizedArea[field] = normalizedValue;
    } else {
      delete normalizedArea[field];
    }
  }

  for (const field of FAT_DISTRIBUTION_AREA_NUMBER_FIELDS) {
    normalizedArea[field] = readNumber(area[field]);
  }

  return normalizedArea;
}

function resolveFatDistributionScanPayload(
  payload: Record<string, unknown> | null,
) {
  if (!payload) {
    return null;
  }

  const candidates = collectScanPayloadCandidates(payload);
  const selectedCandidate = findFatDistributionScanCandidate(candidates);
  if (!selectedCandidate) {
    return null;
  }

  const prioritizedCandidates = prioritizeCandidate(selectedCandidate, candidates);
  const normalizedPayload: Record<string, unknown> = {
    ...selectedCandidate,
    scan_type: FAT_DISTRIBUTION_SCAN_TYPE,
    schema_version: 3,
    global_body_fat_estimate_percent:
      findNumberFieldValue(prioritizedCandidates, [
        'global_body_fat_estimate_percent',
      ]),
    global_facial_fat_estimate_percent:
      findNumberFieldValue(prioritizedCandidates, [
        'global_facial_fat_estimate_percent',
      ]),
    global_water_retention_estimate_percent:
      findNumberFieldValue(prioritizedCandidates, [
        'global_water_retention_estimate_percent',
      ]),
    // S-05 — borne le nombre d'`areas_analysis` à 20 ; chaque area est
    // sanitisée par normalizeFatDistributionArea (champs textuels bornés).
    areas_analysis: (
      findArrayFieldValue(prioritizedCandidates, 'areas_analysis') ?? []
    )
      .slice(0, SCAN_FAT_AREAS_MAX)
      .filter(isRecord)
      .map((area) => normalizeFatDistributionArea(area)),
    // S-05 — borne le nombre de `priority_zones` à 20 et la longueur de
    // chaque label à SCAN_TEXT_MAX_LABEL.
    priority_zones: sanitizeBoundedTextArray(
      findArrayFieldValue(prioritizedCandidates, 'priority_zones'),
      SCAN_FAT_PRIORITY_ZONES_MAX,
      SCAN_TEXT_MAX_LABEL,
    ),
  };

  // S-05 — bornes sur les champs textuels libres top-level :
  // analysis_summary peut être long (paragraphe explicatif), les autres
  // sont des labels ou un disclaimer borné.
  const topLevelFieldLimits: Record<string, number> = {
    analysis_summary: SCAN_TEXT_MAX_SUMMARY,
    dominant_storage_pattern: SCAN_TEXT_MAX_LABEL,
    disclaimer_text: SCAN_TEXT_MAX_PARAGRAPH,
  };

  for (const field of FAT_DISTRIBUTION_TOP_LEVEL_STRING_FIELDS) {
    const normalizedValue = findStringFieldValue(prioritizedCandidates, [field]);
    const boundedValue = sanitizeBoundedText(
      normalizedValue?.text,
      topLevelFieldLimits[field] ?? SCAN_TEXT_MAX_PARAGRAPH,
    );
    if (boundedValue) {
      normalizedPayload[field] = boundedValue;
    } else {
      delete normalizedPayload[field];
    }
  }

  return normalizedPayload;
}

function resolveLooseLegacySuperScanPayload(
  payload: Record<string, unknown> | null,
  rawText?: string | null,
) {
  const candidates = payload ? collectScanPayloadCandidates(payload) : [];
  const resolvedSummaryKey = findTextFieldValue(candidates, ['summary_key']);
  const resolvedDisclaimerKey = findTextFieldValue(candidates, ['disclaimer_key']);
  const resolvedSummary =
    findTextFieldValue(candidates, SUPER_SCAN_CANONICAL_SUMMARY_FIELDS) ??
    findTextFieldValue(candidates, SUPER_SCAN_TEXT_FIELDS) ??
    (() => {
      const fallbackRawText = readLooseRawText(rawText);
      return fallbackRawText
        ? {
            text: fallbackRawText,
            source: 'raw_text',
          }
        : null;
    })() ??
    findTextFieldValue(candidates, SUPER_SCAN_STATUS_FIELDS);

  if (!resolvedSummary && !resolvedSummaryKey) {
    return null;
  }

  const resolvedDisclaimer = findTextFieldValue(candidates, SUPER_SCAN_DISCLAIMER_FIELDS);
  const schemaVersion = normalizeSchemaVersion(
    findNumberFieldValue(candidates, ['schema_version'])
  );
  // S-05 — bornes longueurs sur les champs textuels libres avant stockage.
  const boundedSummary = sanitizeBoundedText(
    resolvedSummary?.text,
    SCAN_TEXT_MAX_SUMMARY,
  );
  const boundedDisclaimer = sanitizeBoundedText(
    resolvedDisclaimer?.text,
    SCAN_TEXT_MAX_PARAGRAPH,
  );
  const boundedSummaryKey = sanitizeBoundedText(
    resolvedSummaryKey?.text,
    SCAN_TEXT_MAX_LABEL,
  );
  const boundedDisclaimerKey = sanitizeBoundedText(
    resolvedDisclaimerKey?.text,
    SCAN_TEXT_MAX_LABEL,
  );

  const resolvedPayload = {
    scan_type: LEGACY_SUPER_SCAN_TYPE,
    schema_version: schemaVersion,
    global_risk_score:
      findNumberFieldValue(candidates, SUPER_SCAN_SCORE_FIELDS) ?? 0,
    urgency_flag:
      findBooleanFieldValue(candidates, SUPER_SCAN_URGENCY_FIELDS) ?? false,
    ...(boundedSummary ? { analysis_summary: boundedSummary } : {}),
    detected_conditions: findDetectedConditions(candidates),
    ...(boundedDisclaimer ? { disclaimer_text: boundedDisclaimer } : {}),
    ...(boundedSummaryKey ? { summary_key: boundedSummaryKey } : {}),
    ...(boundedDisclaimerKey ? { disclaimer_key: boundedDisclaimerKey } : {}),
  };

  return resolvedPayload;
}

function resolveLooseSuperScanPayload(
  payload: Record<string, unknown> | null,
  rawText?: string | null,
) {
  return (
    resolveFatDistributionScanPayload(payload) ??
    resolveLooseLegacySuperScanPayload(payload, rawText)
  );
}

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

export function resolveNormalizedScanAnalysisPayload(
  payload: Record<string, unknown> | null,
  scanType: SupportedScanType,
  rawText?: string | null,
) {
  if (!payload) {
    if (scanType === 'super') {
      const looseSuperScanPayload = resolveLooseSuperScanPayload(null, rawText);
      if (looseSuperScanPayload) {
        return {
          ...looseSuperScanPayload,
          schema_version: 3,
        };
      }
    }

    throw new Phase2HttpError(
      502,
      'invalid_analysis_response',
      'Scan analysis provider returned an empty payload',
    );
  }

  const success = readBoolean(payload.success);
  if (success === false) {
    throw new Phase2HttpError(
      502,
      'analysis_failed',
      readString(payload.error) ?? 'Scan analysis provider reported a failure',
    );
  }

  const candidate = readScanPayloadCandidate(payload);
  if (!isRecord(candidate)) {
    if (scanType === 'super') {
      const looseSuperScanPayload = resolveLooseSuperScanPayload(payload, rawText);
      if (looseSuperScanPayload) {
        return {
          ...looseSuperScanPayload,
          schema_version: 3,
        };
      }
    }

    throw new Phase2HttpError(
      502,
      'invalid_analysis_response',
      'Scan analysis provider returned an invalid payload',
    );
  }

  const analysisType = readString(candidate.scan_type);
  const expectedType = getProviderScanType(scanType);
  if (scanType === 'super') {
    if (analysisType && !isAcceptedSuperProviderScanType(analysisType)) {
      throw new Phase2HttpError(
        422,
        'analysis_type_mismatch',
        `Expected ${LEGACY_SUPER_SCAN_TYPE} or ${FAT_DISTRIBUTION_SCAN_TYPE} analysis for ${scanType}, received ${analysisType}`,
        {
          expected_type: expectedType,
          actual_type: analysisType,
          accepted_types: [...ACCEPTED_SUPER_PROVIDER_SCAN_TYPES],
        },
      );
    }

    const resolvedSuperScanPayload = resolveLooseSuperScanPayload(payload, rawText);
    if (resolvedSuperScanPayload) {
      return resolvedSuperScanPayload;
    }
  } else if (analysisType && analysisType !== expectedType) {
    throw new Phase2HttpError(
      422,
      'analysis_type_mismatch',
      `Expected ${expectedType} analysis for ${scanType}, received ${analysisType}`,
      {
        expected_type: expectedType,
        actual_type: analysisType,
      },
    );
  }

  if (!analysisType) {
    throw new Phase2HttpError(
      502,
      'invalid_analysis_response',
      'Scan analysis payload is missing scan_type',
    );
  }

  return {
    ...candidate,
    schema_version: normalizeSchemaVersion(candidate.schema_version),
  };
}

export function isStoredScanAnalysisComplete(scanRow: {
  analysis_result?: unknown;
  analyzed_at?: string | null;
} | null | undefined) {
  return Boolean(scanRow?.analysis_result && scanRow?.analyzed_at);
}

export function isProviderScanType(
  value: unknown,
): value is SupportedProviderScanType {
  return (
    typeof value === 'string' &&
    [
      'face',
      'body',
      'nutrition',
      LEGACY_SUPER_SCAN_TYPE,
      FAT_DISTRIBUTION_SCAN_TYPE,
    ].includes(value)
  );
}
