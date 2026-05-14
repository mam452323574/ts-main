import {
  COACH_CONTENT_LIMITS,
  isCoachProfileUpdateFocus,
  type CoachProfileUpdateStructured,
} from './coachContent.ts';
import { isCoachPersonaKey } from './coachPersonas.ts';

import type {
  CoachProfileUpdate,
  PersistedInferredPersona,
} from '../types/index.ts';

const MAX_PERSISTED_DIET_SIGNALS = 8;
const MAX_PERSISTED_GOALS = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStringList(
  value: unknown,
  options: { limit: number; maxLength: number },
) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }

    const trimmed = item.trim();
    if (!trimmed || trimmed.length > options.maxLength || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);

    if (normalized.length >= options.limit) {
      break;
    }
  }

  return normalized;
}

export function normalizeCoachProfileUpdate(
  value: unknown,
): CoachProfileUpdate | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    detected_diet_signals: normalizeStringList(value.detected_diet_signals, {
      limit: COACH_CONTENT_LIMITS.dietSignalsMax,
      maxLength: COACH_CONTENT_LIMITS.dietSignal,
    }),
    detected_strong_focus: isCoachProfileUpdateFocus(value.detected_strong_focus)
      ? value.detected_strong_focus
      : null,
    suggested_goals: normalizeStringList(value.suggested_goals, {
      limit: COACH_CONTENT_LIMITS.goalsMax,
      maxLength: COACH_CONTENT_LIMITS.goal,
    }),
    suggested_persona_key: isCoachPersonaKey(value.suggested_persona_key)
      ? value.suggested_persona_key
      : null,
  };
}

export function structuredUpdatesToCoachProfileUpdate(
  structured: CoachProfileUpdateStructured,
): CoachProfileUpdate {
  return normalizeCoachProfileUpdate(structured) ?? {
    detected_diet_signals: [],
    detected_strong_focus: null,
    suggested_goals: [],
    suggested_persona_key: null,
  };
}

export function extractCoachProfileUpdateFromStructuredContent(
  content: unknown,
): CoachProfileUpdate | null {
  if (!isRecord(content)) {
    return null;
  }

  return normalizeCoachProfileUpdate(content.profile_updates);
}

export function profileUpdateHasContent(updates: CoachProfileUpdate | null) {
  return !!updates && (
    updates.detected_diet_signals.length > 0 ||
    updates.suggested_goals.length > 0 ||
    updates.detected_strong_focus !== null ||
    updates.suggested_persona_key !== null
  );
}

export function normalizePersistedInferredPersona(
  value: unknown,
): PersistedInferredPersona | null {
  if (!isRecord(value)) {
    return null;
  }

  const detectedDietSignals = normalizeStringList(value.detected_diet_signals, {
    limit: MAX_PERSISTED_DIET_SIGNALS,
    maxLength: COACH_CONTENT_LIMITS.dietSignal,
  });
  const suggestedGoals = normalizeStringList(value.suggested_goals, {
    limit: MAX_PERSISTED_GOALS,
    maxLength: COACH_CONTENT_LIMITS.goal,
  });
  const detectedStrongFocus = isCoachProfileUpdateFocus(
    value.detected_strong_focus,
  )
    ? value.detected_strong_focus
    : null;
  const suggestedPersonaKey = isCoachPersonaKey(value.suggested_persona_key)
    ? value.suggested_persona_key
    : null;
  const lastUpdatedAt =
    typeof value.last_updated_at === 'string' && value.last_updated_at.trim()
      ? value.last_updated_at
      : null;
  const updateCount =
    typeof value.update_count === 'number' &&
    Number.isFinite(value.update_count) &&
    value.update_count >= 0
      ? Math.floor(value.update_count)
      : null;
  const hasMeaningfulSignals =
    detectedDietSignals.length > 0 ||
    suggestedGoals.length > 0 ||
    detectedStrongFocus !== null ||
    suggestedPersonaKey !== null;

  if (!hasMeaningfulSignals && !lastUpdatedAt && (updateCount ?? 0) === 0) {
    return null;
  }

  if (!lastUpdatedAt || updateCount === null) {
    return null;
  }

  return {
    detected_diet_signals: detectedDietSignals,
    detected_strong_focus: detectedStrongFocus,
    suggested_goals: suggestedGoals,
    suggested_persona_key: suggestedPersonaKey,
    last_updated_at: lastUpdatedAt,
    update_count: updateCount,
  };
}

export function mergeCoachProfileUpdates(
  previous: PersistedInferredPersona | null,
  updates: CoachProfileUpdate,
  nowIso: string,
): PersistedInferredPersona {
  const existing = normalizePersistedInferredPersona(previous);
  const normalizedUpdates = normalizeCoachProfileUpdate(updates) ?? {
    detected_diet_signals: [],
    detected_strong_focus: null,
    suggested_goals: [],
    suggested_persona_key: null,
  };

  const dietSignals = normalizeStringList(
    [
      ...(existing?.detected_diet_signals ?? []),
      ...normalizedUpdates.detected_diet_signals,
    ],
    {
      limit: MAX_PERSISTED_DIET_SIGNALS,
      maxLength: COACH_CONTENT_LIMITS.dietSignal,
    },
  );
  const goals = normalizeStringList(
    [...(existing?.suggested_goals ?? []), ...normalizedUpdates.suggested_goals],
    {
      limit: MAX_PERSISTED_GOALS,
      maxLength: COACH_CONTENT_LIMITS.goal,
    },
  );

  return {
    detected_diet_signals: dietSignals,
    detected_strong_focus:
      normalizedUpdates.detected_strong_focus ??
      existing?.detected_strong_focus ??
      null,
    suggested_goals: goals,
    suggested_persona_key:
      normalizedUpdates.suggested_persona_key ??
      existing?.suggested_persona_key ??
      null,
    last_updated_at: nowIso,
    update_count: (existing?.update_count ?? 0) + 1,
  };
}
