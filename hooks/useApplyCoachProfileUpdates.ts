import { useEffect, useRef } from 'react';

import { ApiService } from '@/services/api';
import type {
  CoachEntry,
  CoachProfileUpdate,
  CoachProfileUpdateStructured,
  CoachStructuredContent,
} from '@/types';
import { isCoachProfileUpdateFocus } from '@/shared/coachContent';
import {
  COACH_PERSONA_KEYS,
  isCoachPersonaKey,
  type CoachPersonaKey,
} from '@/shared/coachPersonas';
import { logOperationalError } from '@/utils/observability';

function structuredUpdatesToCoachProfileUpdate(
  structured: CoachProfileUpdateStructured,
): CoachProfileUpdate {
  return {
    detected_diet_signals: structured.detected_diet_signals,
    detected_strong_focus:
      structured.detected_strong_focus &&
      isCoachProfileUpdateFocus(structured.detected_strong_focus)
        ? structured.detected_strong_focus
        : null,
    suggested_goals: structured.suggested_goals,
    suggested_persona_key:
      structured.suggested_persona_key &&
      isCoachPersonaKey(structured.suggested_persona_key)
        ? (structured.suggested_persona_key as CoachPersonaKey)
        : null,
  };
}

/**
 * Side-effect hook that watches the latest ready coach entry and, when its
 * structured content carries profile_updates, merges them into
 * user_profiles.inferred_persona. Each entry id is processed at most once per
 * mount to avoid double-writes when the same entry is re-rendered.
 *
 * The hook is intentionally fire-and-forget: failures are logged via
 * observability but never thrown to the caller, so coach rendering remains
 * uninterrupted.
 */
export function useApplyCoachProfileUpdates(
  entry: Pick<CoachEntry, 'id' | 'status' | 'content'> | null | undefined,
): void {
  const processedEntryIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!entry) return;
    if (entry.status !== 'ready') return;

    const content: CoachStructuredContent | null | undefined = entry.content ?? null;
    const updates = content?.profile_updates;
    if (!updates) return;

    if (processedEntryIdsRef.current.has(entry.id)) return;
    processedEntryIdsRef.current.add(entry.id);

    const profileUpdate = structuredUpdatesToCoachProfileUpdate(updates);

    ApiService.applyCoachProfileUpdates(profileUpdate).catch((error) => {
      logOperationalError(
        '[useApplyCoachProfileUpdates] failed to persist profile updates',
        error,
        { entry_id: entry.id },
      );
    });
  }, [entry?.id, entry?.status, entry?.content?.profile_updates]);
}

// Re-export for convenience so callers can introspect available persona keys.
export { COACH_PERSONA_KEYS };
