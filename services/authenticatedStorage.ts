import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/services/supabase';

type StorageFileOptions = {
  cacheControl?: string;
  contentType?: string;
  upsert?: boolean;
  duplex?: string;
  metadata?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export class AuthenticatedStorageSessionError extends Error {
  code: 'auth_session_required' | 'auth_session_mismatch';
  status = 401;
  context?: string;
  expectedUserId: string;
  actualUserId?: string | null;

  constructor(
    message: string,
    options: {
      code: AuthenticatedStorageSessionError['code'];
      context?: string;
      expectedUserId: string;
      actualUserId?: string | null;
    },
  ) {
    super(message);
    this.name = 'AuthenticatedStorageSessionError';
    this.code = options.code;
    this.context = options.context;
    this.expectedUserId = options.expectedUserId;
    this.actualUserId = options.actualUserId;
  }
}

function buildStorageAuthMessage(context?: string) {
  return context
    ? `Authentication required for ${context}.`
    : 'Authentication required for storage upload.';
}

export async function requireCurrentSessionForUser(
  userId: string,
  context?: string,
): Promise<Session> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token || !session.user?.id) {
    throw new AuthenticatedStorageSessionError(buildStorageAuthMessage(context), {
      code: 'auth_session_required',
      context,
      expectedUserId: userId,
      actualUserId: session?.user?.id ?? null,
    });
  }

  if (session.user.id !== userId) {
    throw new AuthenticatedStorageSessionError(
      'Authenticated session does not match the storage object owner.',
      {
        code: 'auth_session_mismatch',
        context,
        expectedUserId: userId,
        actualUserId: session.user.id,
      },
    );
  }

  return session;
}

export async function uploadAuthenticatedStorageObject(options: {
  bucket: string;
  path: string;
  fileBody: ArrayBuffer;
  ownerUserId: string;
  context?: string;
  fileOptions?: StorageFileOptions;
}) {
  const session = await requireCurrentSessionForUser(
    options.ownerUserId,
    options.context,
  );

  return supabase.storage.from(options.bucket).upload(
    options.path,
    options.fileBody,
    {
      ...options.fileOptions,
      headers: {
        ...options.fileOptions?.headers,
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  );
}
