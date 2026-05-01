// Per-user storage quota check, used by Edge Functions before they accept
// or finalize an upload.
//
// Backed by the SQL function public.user_storage_bytes_used(uuid) introduced
// in migration 20260425250000_user_storage_quota.sql, which sums the size
// of every storage.objects row owned by the user.

import { Phase2HttpError } from './phase2Errors.ts';

export const USER_STORAGE_QUOTA_BYTES = 100 * 1024 * 1024; // 100 MB

export async function getUserStorageBytesUsed(
  client: any,
  userId: string,
): Promise<number> {
  const { data, error } = await client.rpc('user_storage_bytes_used', {
    p_user_id: userId,
  });
  if (error) {
    throw new Phase2HttpError(
      500,
      'storage_quota_check_failed',
      error.message ?? 'Failed to read storage quota',
    );
  }
  return Number(data) || 0;
}

export async function assertUserWithinStorageQuota(
  client: any,
  userId: string,
  incomingBytes: number,
  quotaBytes: number = USER_STORAGE_QUOTA_BYTES,
): Promise<void> {
  const used = await getUserStorageBytesUsed(client, userId);
  if (used + incomingBytes > quotaBytes) {
    throw new Phase2HttpError(
      413,
      'storage_quota_exceeded',
      `User storage quota exceeded (${used + incomingBytes} > ${quotaBytes} bytes)`,
    );
  }
}
