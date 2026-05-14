import {
  COACH_SCREEN_SNAPSHOT_PENDING_POLL_INTERVAL_MS,
  COACH_SCREEN_SNAPSHOT_PENDING_TIMEOUT_MS,
  getCoachSnapshotTrackedEntryPollInterval,
  isCoachSnapshotTrackedEntryStale,
} from '@/hooks/queries/useCoachScreenSnapshot';

const pendingEntry = {
  id: 'entry-pending',
  created_at: '2026-05-13T10:00:00.000Z',
  status: 'pending',
} as any;

describe('useCoachScreenSnapshot pending polling helpers', () => {
  it('keeps polling a pending tracked entry before the timeout', () => {
    expect(
      getCoachSnapshotTrackedEntryPollInterval({
        trackedEntryId: 'entry-pending',
        trackedEntry: pendingEntry,
        nowMs:
          new Date(pendingEntry.created_at).getTime() +
          COACH_SCREEN_SNAPSHOT_PENDING_TIMEOUT_MS -
          1,
      }),
    ).toBe(COACH_SCREEN_SNAPSHOT_PENDING_POLL_INTERVAL_MS);
  });

  it('stops polling a pending tracked entry once it is stale', () => {
    const nowMs =
      new Date(pendingEntry.created_at).getTime() +
      COACH_SCREEN_SNAPSHOT_PENDING_TIMEOUT_MS;

    expect(
      isCoachSnapshotTrackedEntryStale({
        trackedEntry: pendingEntry,
        nowMs,
      }),
    ).toBe(true);
    expect(
      getCoachSnapshotTrackedEntryPollInterval({
        trackedEntryId: 'entry-pending',
        trackedEntry: pendingEntry,
        nowMs,
      }),
    ).toBe(false);
  });

  it('stops polling when the tracked entry is terminal', () => {
    expect(
      getCoachSnapshotTrackedEntryPollInterval({
        trackedEntryId: 'entry-ready',
        trackedEntry: {
          ...pendingEntry,
          id: 'entry-ready',
          status: 'ready',
        },
      }),
    ).toBe(false);
  });

  it('uses the local fallback start time while the tracked entry is missing', () => {
    expect(
      getCoachSnapshotTrackedEntryPollInterval({
        trackedEntryId: 'entry-missing',
        trackedEntry: null,
        fallbackStartedAtMs: 1000,
        nowMs: 1000 + COACH_SCREEN_SNAPSHOT_PENDING_TIMEOUT_MS,
      }),
    ).toBe(false);
  });
});
