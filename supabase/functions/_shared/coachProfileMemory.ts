import {
  extractCoachProfileUpdateFromStructuredContent,
  mergeCoachProfileUpdates,
  normalizePersistedInferredPersona,
  profileUpdateHasContent,
} from '../../../shared/coachProfileMemory.ts';
import type { PersistedInferredPersona } from '../../../types/index.ts';

import { createPhase2DatabaseError, Phase2HttpError } from './phase2Errors.ts';
import { isRecord } from './phase2Utils.ts';

const COACH_PROFILE_MEMORY_WRITE_MAX_ATTEMPTS = 3;

interface CoachProfileMemoryEntrySource {
  id: string;
  user_id?: string | null;
  content_json?: Record<string, unknown> | null;
}

interface UserProfileMemoryRow {
  inferred_persona?: unknown;
  updated_at?: unknown;
}

async function rollbackProfileUpdateLedger(client: any, coachEntryId: string) {
  await client
    .from('coach_profile_update_applications')
    .delete()
    .eq('coach_entry_id', coachEntryId);
}

function normalizeProfileMemoryRow(row: UserProfileMemoryRow | null | undefined) {
  return normalizePersistedInferredPersona(row?.inferred_persona ?? null);
}

export async function readCoachProfileMemory(
  client: any,
  userId: string,
): Promise<PersistedInferredPersona | null> {
  const { data, error } = await client
    .from('user_profiles')
    .select('inferred_persona')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach profile memory read',
      fallbackCode: 'coach_profile_memory_read_failed',
      fallbackMessage: 'Failed to read coach profile memory',
      relationName: 'user_profiles',
    });
  }

  if (!data || !isRecord(data)) {
    return null;
  }

  return normalizeProfileMemoryRow(data);
}

async function mergeCoachProfileMemoryWithRetries(
  client: any,
  options: {
    coachEntryId: string;
    userId: string;
    profileUpdate: NonNullable<
      ReturnType<typeof extractCoachProfileUpdateFromStructuredContent>
    >;
  },
) {
  for (
    let attemptIndex = 0;
    attemptIndex < COACH_PROFILE_MEMORY_WRITE_MAX_ATTEMPTS;
    attemptIndex += 1
  ) {
    const { data: existingRow, error: existingRowError } = await client
      .from('user_profiles')
      .select('inferred_persona, updated_at')
      .eq('id', options.userId)
      .single();

    if (existingRowError || !existingRow) {
      throw createPhase2DatabaseError(existingRowError, {
        contextLabel: 'Coach profile memory pre-merge read',
        fallbackCode: 'coach_profile_memory_read_failed',
        fallbackMessage: 'Failed to load coach profile memory before merge',
        relationName: 'user_profiles',
      });
    }

    const previous = normalizeProfileMemoryRow(existingRow);
    const merged = mergeCoachProfileUpdates(
      previous,
      options.profileUpdate,
      new Date().toISOString(),
    );
    let updateQuery = client
      .from('user_profiles')
      .update({
        inferred_persona: merged,
      })
      .eq('id', options.userId);

    if (
      typeof existingRow.updated_at === 'string' &&
      existingRow.updated_at.trim().length > 0
    ) {
      updateQuery = updateQuery.eq('updated_at', existingRow.updated_at);
    }

    const { data: updatedRows, error: updateError } = await updateQuery.select(
      'inferred_persona, updated_at',
    );

    if (updateError) {
      throw createPhase2DatabaseError(updateError, {
        contextLabel: 'Coach profile memory merge',
        fallbackCode: 'coach_profile_memory_write_failed',
        fallbackMessage: 'Failed to persist coach profile memory',
        relationName: 'user_profiles',
      });
    }

    if (Array.isArray(updatedRows) && updatedRows.length > 0) {
      return normalizeProfileMemoryRow(updatedRows[0]);
    }
  }

  throw new Phase2HttpError(
    409,
    'coach_profile_memory_write_conflict',
    'Failed to persist coach profile memory after concurrent updates',
    {
      coach_entry_id: options.coachEntryId,
      user_id: options.userId,
    },
  );
}

export async function applyCoachProfileUpdatesForEntry(
  client: any,
  entry: CoachProfileMemoryEntrySource,
) {
  const userId =
    typeof entry.user_id === 'string' && entry.user_id.trim().length > 0
      ? entry.user_id
      : null;
  const profileUpdate = extractCoachProfileUpdateFromStructuredContent(
    entry.content_json ?? null,
  );

  if (!userId || !profileUpdate || !profileUpdateHasContent(profileUpdate)) {
    return {
      applied: false,
      profileMemory: null,
      profileUpdate: null,
    };
  }

  const payloadSnapshot =
    isRecord(entry.content_json) && isRecord(entry.content_json.profile_updates)
      ? entry.content_json.profile_updates
      : profileUpdate;
  const { data: insertedRows, error: ledgerError } = await client
    .from('coach_profile_update_applications')
    .upsert(
      {
        coach_entry_id: entry.id,
        user_id: userId,
        applied_at: new Date().toISOString(),
        payload_snapshot: payloadSnapshot,
      },
      {
        onConflict: 'coach_entry_id',
        ignoreDuplicates: true,
      },
    )
    .select('coach_entry_id');

  if (ledgerError) {
    throw createPhase2DatabaseError(ledgerError, {
      contextLabel: 'Coach profile memory ledger insert',
      fallbackCode: 'coach_profile_memory_ledger_failed',
      fallbackMessage: 'Failed to register the coach profile memory application',
      relationName: 'coach_profile_update_applications',
    });
  }

  const inserted =
    Array.isArray(insertedRows) ? insertedRows.length > 0 : Boolean(insertedRows);
  if (!inserted) {
    return {
      applied: false,
      profileMemory: null,
      profileUpdate,
    };
  }

  try {
    const profileMemory = await mergeCoachProfileMemoryWithRetries(client, {
      coachEntryId: entry.id,
      userId,
      profileUpdate,
    });

    return {
      applied: true,
      profileMemory,
      profileUpdate,
    };
  } catch (error) {
    await rollbackProfileUpdateLedger(client, entry.id);
    throw error;
  }
}
