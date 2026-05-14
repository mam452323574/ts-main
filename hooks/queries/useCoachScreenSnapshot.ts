import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import {
  fetchCoachScreenSnapshot,
  type CoachScreenSnapshot,
  type CoachServiceError,
} from '@/services/coach';
import type { CoachPersonaKey } from '@/types';
import { shouldRetryCoachReadQuery } from './coachQueryRetry';

export const COACH_SCREEN_SNAPSHOT_QUERY_KEY = ['coachScreenSnapshot'] as const;

export const getCoachScreenSnapshotQueryKey = (
  userId?: string | null,
  options: {
    personaKey?: CoachPersonaKey | null;
    locale?: string | null;
    excludeEntryId?: string | null;
    entriesLimit?: number | null;
  } = {},
) =>
  [
    ...COACH_SCREEN_SNAPSHOT_QUERY_KEY,
    userId ?? 'anonymous',
    options.personaKey ?? 'default',
    options.locale?.slice(0, 2).toLowerCase() ?? null,
    options.excludeEntryId ?? null,
    typeof options.entriesLimit === 'number' ? options.entriesLimit : 'default',
  ] as const;

export const COACH_SCREEN_SNAPSHOT_PENDING_POLL_INTERVAL_MS = 2000;
export const COACH_SCREEN_SNAPSHOT_PENDING_TIMEOUT_MS = 90_000;

type SnapshotTrackedEntry = CoachScreenSnapshot['entries'][number];

function readTimestampMs(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isPendingTrackedEntry(
  trackedEntry: SnapshotTrackedEntry | null | undefined,
) {
  return !trackedEntry || (trackedEntry.status ?? 'pending') === 'pending';
}

export function isCoachSnapshotTrackedEntryStale(options: {
  trackedEntry?: SnapshotTrackedEntry | null;
  fallbackStartedAtMs?: number | null;
  nowMs?: number;
}) {
  const { trackedEntry = null, fallbackStartedAtMs = null } = options;

  if (!isPendingTrackedEntry(trackedEntry)) {
    return false;
  }

  const startedAtMs =
    readTimestampMs(trackedEntry?.created_at) ?? fallbackStartedAtMs;

  if (typeof startedAtMs !== 'number') {
    return false;
  }

  const nowMs = options.nowMs ?? Date.now();
  return nowMs - startedAtMs >= COACH_SCREEN_SNAPSHOT_PENDING_TIMEOUT_MS;
}

export function getCoachSnapshotTrackedEntryPollInterval(options: {
  trackedEntryId?: string | null;
  trackedEntry?: SnapshotTrackedEntry | null;
  fallbackStartedAtMs?: number | null;
  nowMs?: number;
}) {
  if (!options.trackedEntryId) {
    return false;
  }

  if (!isPendingTrackedEntry(options.trackedEntry)) {
    return false;
  }

  return isCoachSnapshotTrackedEntryStale(options)
    ? false
    : COACH_SCREEN_SNAPSHOT_PENDING_POLL_INTERVAL_MS;
}

export function useCoachScreenSnapshot(options: {
  personaKey?: CoachPersonaKey | null;
  locale?: string | null;
  excludeEntryId?: string | null;
  trackedEntryId?: string | null;
  entriesLimit?: number;
} = {}) {
  const { user } = useAuth();
  const trackedEntryId = options.trackedEntryId ?? null;
  const trackedEntryStartedAtRef = useRef<{
    entryId: string | null;
    startedAtMs: number | null;
  }>({
    entryId: null,
    startedAtMs: null,
  });

  if (trackedEntryStartedAtRef.current.entryId !== trackedEntryId) {
    trackedEntryStartedAtRef.current = {
      entryId: trackedEntryId,
      startedAtMs: trackedEntryId ? Date.now() : null,
    };
  }

  const query = useQuery<CoachScreenSnapshot, CoachServiceError>({
    queryKey: getCoachScreenSnapshotQueryKey(user?.id, options),
    queryFn: () =>
      fetchCoachScreenSnapshot({
        personaKey: options.personaKey ?? null,
        locale: options.locale ?? null,
        excludeEntryId: options.excludeEntryId ?? null,
        entriesLimit: options.entriesLimit,
      }),
    enabled: !!user?.id,
    staleTime: trackedEntryId ? 0 : 1000 * 60,
    placeholderData: (previousData) => previousData,
    retry: shouldRetryCoachReadQuery,
    refetchInterval: (query) => {
      const trackedEntry = query.state.data?.entries.find(
        (entry) => entry.id === trackedEntryId,
      );

      return getCoachSnapshotTrackedEntryPollInterval({
        trackedEntryId,
        trackedEntry,
        fallbackStartedAtMs: trackedEntryStartedAtRef.current.startedAtMs,
      });
    },
  });

  const trackedEntry = trackedEntryId
    ? query.data?.entries.find((entry) => entry.id === trackedEntryId)
    : null;

  return {
    ...query,
    isTrackedEntryStale: isCoachSnapshotTrackedEntryStale({
      trackedEntry,
      fallbackStartedAtMs: trackedEntryStartedAtRef.current.startedAtMs,
    }),
  };
}
