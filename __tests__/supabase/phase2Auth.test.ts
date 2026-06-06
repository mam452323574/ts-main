jest.mock(
  'npm:@supabase/supabase-js@2.58.0',
  () => ({
    createClient: jest.fn(),
  }),
  { virtual: true },
);

import {
  createAuthenticatedRequestClient,
  createSocialModerationWorkerSignature,
  ensureUserProfileExistsForAuthenticatedUser,
  requireSocialModerationWorkerOrAdmin,
  SOCIAL_MODERATION_WORKER_NONCE_HEADER,
  SOCIAL_MODERATION_WORKER_SIGNATURE_HEADER,
  SOCIAL_MODERATION_WORKER_TIMESTAMP_HEADER,
} from '@/supabase/functions/_shared/phase2Auth';

const mockSupabaseCreateClient = jest.requireMock(
  'npm:@supabase/supabase-js@2.58.0',
).createClient as jest.Mock;

function createSelectProfileChain(result: { data: unknown; error: unknown }) {
  const chain: any = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    maybeSingle: jest.fn(async () => result),
  };

  return chain;
}

function createInsertProfileChain(result: { data: unknown; error: any }) {
  const chain: any = {
    insert: jest.fn(() => chain),
    select: jest.fn(() => chain),
    single: jest.fn(async () => result),
  };

  return chain;
}

describe('phase2 auth user profile repair', () => {
  let env: Record<string, string | undefined>;

  beforeEach(() => {
    mockSupabaseCreateClient.mockReset();
    env = {};
    (global as any).Deno = {
      env: {
        get: jest.fn((name: string) => env[name]),
      },
    };
  });

  it('creates a bearer-authenticated Supabase client for RLS-backed requests', () => {
    env.SUPABASE_URL = 'https://project.supabase.co';
    env.SUPABASE_ANON_KEY = 'anon-key';
    const client = {};
    mockSupabaseCreateClient.mockReturnValue(client);

    expect(
      createAuthenticatedRequestClient(
        new Request('https://example.com/functions/v1/coach-conversations-list', {
          headers: {
            Authorization: 'Bearer user-jwt',
          },
        }),
      ),
    ).toBe(client);

    expect(mockSupabaseCreateClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'anon-key',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: 'Bearer user-jwt',
          },
        },
      },
    );
  });

  it('rejects an authenticated-request client without a bearer before creating it', () => {
    expect(() =>
      createAuthenticatedRequestClient(
        new Request('https://example.com/functions/v1/coach-conversations-list'),
      ),
    ).toThrow('Missing authorization header');

    expect(mockSupabaseCreateClient).not.toHaveBeenCalled();
  });

  it('returns the existing profile without writing when the authenticated user profile already exists', async () => {
    const selectProfileChain = createSelectProfileChain({
      data: {
        id: 'viewer-1',
        email: 'viewer@example.com',
        username: 'viewer',
        avatar_url: null,
        account_tier: 'free',
      },
      error: null,
    });
    const insertProfileChain = createInsertProfileChain({
      data: null,
      error: null,
    });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(selectProfileChain)
        .mockReturnValueOnce(insertProfileChain),
    };

    await expect(
      ensureUserProfileExistsForAuthenticatedUser(client, {
        id: 'viewer-1',
        email: 'viewer@example.com',
      }),
    ).resolves.toMatchObject({
      id: 'viewer-1',
      email: 'viewer@example.com',
      username: 'viewer',
    });

    expect(insertProfileChain.insert).not.toHaveBeenCalled();
  });

  it('creates a minimal profile snapshot when the authenticated user is orphaned', async () => {
    const selectMissingChain = createSelectProfileChain({
      data: null,
      error: null,
    });
    const insertProfileChain = createInsertProfileChain({
      data: {
        id: 'viewer-1',
        email: 'viewer@example.com',
        username: null,
        avatar_url: 'https://avatar.test/viewer.jpg',
        account_tier: 'free',
      },
      error: null,
    });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(selectMissingChain)
        .mockReturnValueOnce(insertProfileChain),
    };

    await expect(
      ensureUserProfileExistsForAuthenticatedUser(client, {
        id: 'viewer-1',
        email: 'viewer@example.com',
        user_metadata: {
          avatar_url: 'https://avatar.test/viewer.jpg',
        },
      }),
    ).resolves.toMatchObject({
      id: 'viewer-1',
      email: 'viewer@example.com',
      username: null,
      avatar_url: 'https://avatar.test/viewer.jpg',
    });

    expect(insertProfileChain.insert).toHaveBeenCalledWith({
      id: 'viewer-1',
      email: 'viewer@example.com',
      username: null,
      avatar_url: 'https://avatar.test/viewer.jpg',
    });
  });

  it('re-reads the profile after a duplicate insert race and stays idempotent', async () => {
    const firstLookupChain = createSelectProfileChain({
      data: null,
      error: null,
    });
    const insertProfileChain = createInsertProfileChain({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      },
    });
    const secondLookupChain = createSelectProfileChain({
      data: {
        id: 'viewer-1',
        email: 'viewer-1@oauth.temp',
        username: null,
        avatar_url: null,
        account_tier: 'free',
      },
      error: null,
    });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(firstLookupChain)
        .mockReturnValueOnce(insertProfileChain)
        .mockReturnValueOnce(secondLookupChain),
    };

    await expect(
      ensureUserProfileExistsForAuthenticatedUser(client, {
        id: 'viewer-1',
        email: null,
      }),
    ).resolves.toMatchObject({
      id: 'viewer-1',
      email: 'viewer-1@oauth.temp',
      username: null,
      avatar_url: null,
    });

    expect(insertProfileChain.insert).toHaveBeenCalledWith({
      id: 'viewer-1',
      email: 'viewer-1@oauth.temp',
      username: null,
      avatar_url: null,
    });
  });

  it('rejects social moderation worker calls without worker or admin credentials', async () => {
    await expect(
      requireSocialModerationWorkerOrAdmin(
        {},
        new Request('https://example.com/functions/v1/social-process-moderation-queue', {
          method: 'POST',
        }),
        { rawBody: '{}' },
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: 'missing_authorization',
    });
  });

  it('accepts a fresh social moderation worker HMAC signature once', async () => {
    env.PHASE2_SOCIAL_MODERATION_WORKER_HMAC_SECRET = 'worker-secret';
    const rawBody = JSON.stringify({ limit: 2, dry_run: true });
    const timestamp = new Date().toISOString();
    const nonce = 'nonce-1';
    const unsignedRequest = new Request(
      'https://example.com/functions/v1/social-process-moderation-queue',
      {
        method: 'POST',
      },
    );
    const signature = await createSocialModerationWorkerSignature({
      req: unsignedRequest,
      rawBody,
      timestamp,
      nonce,
      secret: 'worker-secret',
    });
    const nonceChain: any = {
      delete: jest.fn(() => nonceChain),
      eq: jest.fn(() => nonceChain),
      lte: jest.fn().mockResolvedValue({ error: null }),
      insert: jest.fn().mockResolvedValue({ error: null }),
    };
    const client = {
      from: jest.fn(() => nonceChain),
    };

    await expect(
      requireSocialModerationWorkerOrAdmin(
        client,
        new Request(
          'https://example.com/functions/v1/social-process-moderation-queue',
          {
            method: 'POST',
            headers: {
              [SOCIAL_MODERATION_WORKER_TIMESTAMP_HEADER]: timestamp,
              [SOCIAL_MODERATION_WORKER_NONCE_HEADER]: nonce,
              [SOCIAL_MODERATION_WORKER_SIGNATURE_HEADER]: signature,
            },
            body: rawBody,
          },
        ),
        { rawBody },
      ),
    ).resolves.toEqual({
      actor_type: 'system',
      actor_id: null,
      actor_label: 'social-moderation-worker',
    });
    expect(client.from).toHaveBeenCalledWith('edge_request_nonces');
    expect(nonceChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'social_moderation_worker',
        nonce_hash: expect.any(String),
      }),
    );
  });

  it('rejects replayed social moderation worker nonces', async () => {
    env.PHASE2_SOCIAL_MODERATION_WORKER_HMAC_SECRET = 'worker-secret';
    const rawBody = '{}';
    const timestamp = new Date().toISOString();
    const nonce = 'nonce-replay';
    const unsignedRequest = new Request(
      'https://example.com/functions/v1/social-process-moderation-queue',
      {
        method: 'POST',
      },
    );
    const signature = await createSocialModerationWorkerSignature({
      req: unsignedRequest,
      rawBody,
      timestamp,
      nonce,
      secret: 'worker-secret',
    });
    const nonceChain: any = {
      delete: jest.fn(() => nonceChain),
      eq: jest.fn(() => nonceChain),
      lte: jest.fn().mockResolvedValue({ error: null }),
      insert: jest.fn().mockResolvedValue({
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
        },
      }),
    };
    const client = {
      from: jest.fn(() => nonceChain),
    };

    await expect(
      requireSocialModerationWorkerOrAdmin(
        client,
        new Request(
          'https://example.com/functions/v1/social-process-moderation-queue',
          {
            method: 'POST',
            headers: {
              [SOCIAL_MODERATION_WORKER_TIMESTAMP_HEADER]: timestamp,
              [SOCIAL_MODERATION_WORKER_NONCE_HEADER]: nonce,
              [SOCIAL_MODERATION_WORKER_SIGNATURE_HEADER]: signature,
            },
            body: rawBody,
          },
        ),
        { rawBody },
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: 'replayed_worker_nonce',
    });
  });

  it('rejects stale social moderation worker signatures before recording a nonce', async () => {
    env.PHASE2_SOCIAL_MODERATION_WORKER_HMAC_SECRET = 'worker-secret';
    const rawBody = '{}';
    const timestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const nonce = 'nonce-stale';
    const unsignedRequest = new Request(
      'https://example.com/functions/v1/social-process-moderation-queue',
      {
        method: 'POST',
      },
    );
    const signature = await createSocialModerationWorkerSignature({
      req: unsignedRequest,
      rawBody,
      timestamp,
      nonce,
      secret: 'worker-secret',
    });
    const nonceChain: any = {
      delete: jest.fn(() => nonceChain),
      eq: jest.fn(() => nonceChain),
      lte: jest.fn().mockResolvedValue({ error: null }),
      insert: jest.fn().mockResolvedValue({ error: null }),
    };
    const client = {
      from: jest.fn(() => nonceChain),
    };

    await expect(
      requireSocialModerationWorkerOrAdmin(
        client,
        new Request(
          'https://example.com/functions/v1/social-process-moderation-queue',
          {
            method: 'POST',
            headers: {
              [SOCIAL_MODERATION_WORKER_TIMESTAMP_HEADER]: timestamp,
              [SOCIAL_MODERATION_WORKER_NONCE_HEADER]: nonce,
              [SOCIAL_MODERATION_WORKER_SIGNATURE_HEADER]: signature,
            },
            body: rawBody,
          },
        ),
        { rawBody },
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: 'stale_worker_signature',
    });
    expect(nonceChain.insert).not.toHaveBeenCalled();
  });

  it('keeps AAL2 admin JWTs as the fallback actor for moderation queue processing', async () => {
    const jwtPayload = Buffer.from(JSON.stringify({ aal: 'aal2' })).toString(
      'base64url',
    );
    const profileChain: any = {
      select: jest.fn(() => profileChain),
      eq: jest.fn(() => profileChain),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'admin-1',
          account_tier: 'admin',
        },
        error: null,
      }),
    };
    const client = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: {
              id: 'admin-1',
            },
          },
          error: null,
        }),
      },
      from: jest.fn(() => profileChain),
    };

    await expect(
      requireSocialModerationWorkerOrAdmin(
        client,
        new Request(
          'https://example.com/functions/v1/social-process-moderation-queue',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer test.${jwtPayload}.signature`,
            },
          },
        ),
      ),
    ).resolves.toEqual({
      actor_type: 'admin',
      actor_id: 'admin-1',
      actor_label: null,
    });
  });
});
