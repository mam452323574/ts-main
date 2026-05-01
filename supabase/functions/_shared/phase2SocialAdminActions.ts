import { createPhase2DatabaseError, Phase2HttpError } from './phase2Errors.ts';

const AVATAR_BUCKET = 'avatars';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeStoragePaths(
  paths: Array<string | null | undefined>,
): string[] {
  return Array.from(
    new Set(
      paths
        .filter((path): path is string => typeof path === 'string')
        .map((path) => path.trim())
        .filter((path) => path.length > 0),
    ),
  );
}

export async function removeStorageObjectsIndividually(
  client: any,
  bucket: string,
  paths: Array<string | null | undefined>,
) {
  const normalizedPaths = normalizeStoragePaths(paths);
  const deletedPaths: string[] = [];
  const failedPaths: string[] = [];

  for (const path of normalizedPaths) {
    const { error } = await client.storage.from(bucket).remove([path]);

    if (error) {
      failedPaths.push(path);
      continue;
    }

    deletedPaths.push(path);
  }

  return {
    deletedPaths,
    failedPaths,
  };
}

export async function listAvatarStoragePaths(client: any, userId: string) {
  const { data, error } = await client.storage.from(AVATAR_BUCKET).list(userId, {
    limit: 100,
  });

  if (error) {
    throw new Phase2HttpError(
      503,
      'avatar_lookup_failed',
      'Failed to inspect avatar storage objects',
    );
  }

  return normalizeStoragePaths(
    (Array.isArray(data) ? data : []).map((row) =>
      typeof row?.name === 'string' ? `${userId}/${row.name}` : null
    ),
  );
}

export async function clearUserAvatarReference(client: any, userId: string) {
  const { error } = await client
    .from('user_profiles')
    .update({ avatar_url: null })
    .eq('id', userId);

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'User avatar reference reset',
      fallbackCode: 'avatar_profile_reset_failed',
      fallbackMessage: 'Failed to reset the stored avatar reference',
      relationName: 'user_profiles',
    });
  }
}

export async function removeUserAvatar(client: any, userId: string) {
  const avatarPaths = await listAvatarStoragePaths(client, userId);
  const cleanup = await removeStorageObjectsIndividually(
    client,
    AVATAR_BUCKET,
    avatarPaths,
  );

  await clearUserAvatarReference(client, userId);

  return {
    avatarPaths,
    deletedAvatarPaths: cleanup.deletedPaths,
    failedAvatarPaths: cleanup.failedPaths,
  };
}

export async function createUserBan(
  client: any,
  options: {
    userId: string;
    scope: 'all' | 'posts' | 'comments' | 'avatar';
    reason?: string | null;
    issuedBy: string;
    endsAt?: string | null;
  },
) {
  const { data, error } = await client
    .from('user_bans')
    .insert({
      user_id: options.userId,
      scope: options.scope,
      reason: options.reason ?? null,
      issued_by: options.issuedBy,
      ends_at: options.endsAt ?? null,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'User ban creation',
      fallbackCode: 'ban_creation_failed',
      fallbackMessage: 'Failed to create user ban',
      relationName: 'user_bans',
    });
  }

  return data.id as string;
}

export async function revokeActiveUserBans(
  client: any,
  options: {
    userId: string;
    revokedBy: string;
  },
) {
  const { data, error } = await client
    .from('user_bans')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: options.revokedBy,
    })
    .eq('user_id', options.userId)
    .is('revoked_at', null)
    .select('id');

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'User ban revocation',
      fallbackCode: 'ban_revoke_failed',
      fallbackMessage: 'Failed to revoke user bans',
      relationName: 'user_bans',
    });
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export async function appendSocialModerationEventMetadata(
  client: any,
  eventId: string,
  metadataPatch: Record<string, unknown>,
) {
  const { data: existingEvent, error: readError } = await client
    .from('social_moderation_events')
    .select('metadata_json')
    .eq('id', eventId)
    .maybeSingle();

  if (readError || !existingEvent) {
    throw createPhase2DatabaseError(readError, {
      contextLabel: 'Social moderation event metadata lookup',
      fallbackCode: 'moderation_event_lookup_failed',
      fallbackMessage: 'Failed to load the moderation audit event',
      relationName: 'social_moderation_events',
    });
  }

  const existingMetadata = isRecord(existingEvent.metadata_json)
    ? existingEvent.metadata_json
    : {};

  const { error: updateError } = await client
    .from('social_moderation_events')
    .update({
      metadata_json: {
        ...existingMetadata,
        ...metadataPatch,
      },
    })
    .eq('id', eventId);

  if (updateError) {
    throw createPhase2DatabaseError(updateError, {
      contextLabel: 'Social moderation event metadata update',
      fallbackCode: 'moderation_event_update_failed',
      fallbackMessage: 'Failed to update the moderation audit event',
      relationName: 'social_moderation_events',
    });
  }
}
