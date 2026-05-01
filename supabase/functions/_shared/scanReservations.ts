import { Phase2HttpError } from './phase2Errors.ts';
import {
  SCAN_IMAGE_BUCKET,
  type AppScanType,
} from '../../../shared/scanContract.ts';

export type SupportedScanType = AppScanType;

export type ScanUsageRecord = {
  last_scan_date: string | null;
  scan_timestamps: string[];
};

export type ScanUsage = Record<SupportedScanType, ScanUsageRecord>;

export type WelcomeCredits = {
  health: number;
  body: number;
  nutrition: number;
};

export type ScanReservationProfileSnapshot = {
  scanUsage: ScanUsage;
  welcomeCredits: WelcomeCredits;
};

export type PendingScanRollback = {
  scanId: string;
  userId: string;
  scanType: SupportedScanType;
  createdAt: string;
  usedWelcomeCredit: boolean;
  canonicalPath: string;
};

export const DEFAULT_SCAN_USAGE: ScanUsage = {
  health: { last_scan_date: null, scan_timestamps: [] },
  body: { last_scan_date: null, scan_timestamps: [] },
  nutrition: { last_scan_date: null, scan_timestamps: [] },
  super: { last_scan_date: null, scan_timestamps: [] },
};

export const DEFAULT_WELCOME_CREDITS: WelcomeCredits = {
  health: 0,
  body: 0,
  nutrition: 0,
};

export function normalizeScanUsage(value: unknown): ScanUsage {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<ScanUsage>)
      : {};

  return {
    health: source.health ?? DEFAULT_SCAN_USAGE.health,
    body: source.body ?? DEFAULT_SCAN_USAGE.body,
    nutrition: source.nutrition ?? DEFAULT_SCAN_USAGE.nutrition,
    super: source.super ?? DEFAULT_SCAN_USAGE.super,
  };
}

export function normalizeWelcomeCredits(value: unknown): WelcomeCredits {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<WelcomeCredits>)
      : {};

  return {
    health: Number(source.health ?? DEFAULT_WELCOME_CREDITS.health),
    body: Number(source.body ?? DEFAULT_WELCOME_CREDITS.body),
    nutrition: Number(source.nutrition ?? DEFAULT_WELCOME_CREDITS.nutrition),
  };
}

export function createScanReservationProfileSnapshot(
  scanUsage: unknown,
  welcomeCredits: unknown,
): ScanReservationProfileSnapshot {
  return {
    scanUsage: normalizeScanUsage(scanUsage),
    welcomeCredits: normalizeWelcomeCredits(welcomeCredits),
  };
}

export async function restoreScanReservationProfile(
  client: any,
  userId: string,
  snapshot: ScanReservationProfileSnapshot,
) {
  const { error } = await client
    .from('user_profiles')
    .update({
      scan_usage: snapshot.scanUsage,
      welcome_credits: snapshot.welcomeCredits,
    })
    .eq('id', userId);

  if (error) {
    throw new Phase2HttpError(
      500,
      'scan_reservation_rollback_failed',
      'Failed to restore scan reservation state',
    );
  }
}

export function removeScanTimestamp(record: ScanUsageRecord, createdAt: string): ScanUsageRecord {
  const timestamps = Array.isArray(record.scan_timestamps)
    ? record.scan_timestamps.filter((value): value is string => typeof value === 'string')
    : [];
  const filteredTimestamps = timestamps.filter((timestamp) => timestamp !== createdAt);
  const nextTimestamps =
    filteredTimestamps.length < timestamps.length
      ? filteredTimestamps
      : timestamps.slice(0, -1);

  return {
    last_scan_date:
      nextTimestamps.length > 0
        ? nextTimestamps[nextTimestamps.length - 1]
        : null,
    scan_timestamps: nextTimestamps,
  };
}

export function isPendingScanRollback(
  pendingRollback: PendingScanRollback | null | undefined,
): pendingRollback is PendingScanRollback {
  return Boolean(pendingRollback?.scanId);
}

export async function rollbackScanCharge(client: any, pendingRollback: PendingScanRollback) {
  const { data: profile, error: profileError } = await client
    .from('user_profiles')
    .select('welcome_credits, scan_usage')
    .eq('id', pendingRollback.userId)
    .single();

  if (profileError) {
    throw new Phase2HttpError(
      500,
      'scan_refund_failed',
      'Failed to load profile during scan refund',
    );
  }

  const welcomeCredits = normalizeWelcomeCredits(profile?.welcome_credits);
  const scanUsage = normalizeScanUsage(profile?.scan_usage);
  const nextScanUsage = {
    ...scanUsage,
    [pendingRollback.scanType]: removeScanTimestamp(
      scanUsage[pendingRollback.scanType],
      pendingRollback.createdAt,
    ),
  };

  const nextWelcomeCredits = {
    ...welcomeCredits,
  };

  if (pendingRollback.usedWelcomeCredit && pendingRollback.scanType !== 'super') {
    nextWelcomeCredits[pendingRollback.scanType] =
      (nextWelcomeCredits[pendingRollback.scanType] ?? 0) + 1;
  }

  const { error: updateProfileError } = await client
    .from('user_profiles')
    .update({
      scan_usage: nextScanUsage,
      welcome_credits: nextWelcomeCredits,
    })
    .eq('id', pendingRollback.userId);

  if (updateProfileError) {
    throw new Phase2HttpError(
      500,
      'scan_refund_failed',
      'Failed to restore scan allowance',
    );
  }

  const { error: deleteScanError } = await client
    .from('scans')
    .delete()
    .eq('id', pendingRollback.scanId)
    .eq('user_id', pendingRollback.userId);

  if (deleteScanError) {
    console.error('[scan-reservations] Failed to delete refunded scan:', deleteScanError);
  }

  const { error: removeStorageError } = await client.storage
    .from(SCAN_IMAGE_BUCKET)
    .remove([pendingRollback.canonicalPath]);

  if (removeStorageError) {
    console.error('[scan-reservations] Failed to remove refunded scan image:', removeStorageError);
  }
}
