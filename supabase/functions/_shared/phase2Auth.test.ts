import {
  createSocialModerationWorkerSignature,
  enforceAdminRateLimit,
  logAdminAuditEvent,
  requireSocialModerationWorkerOrAdmin,
  SOCIAL_MODERATION_WORKER_NONCE_HEADER,
  SOCIAL_MODERATION_WORKER_SIGNATURE_HEADER,
  SOCIAL_MODERATION_WORKER_TIMESTAMP_HEADER,
} from './phase2Auth.ts';
import { Phase2HttpError } from './phase2Errors.ts';

const TEST_ENV_NAMES = [
  'PHASE2_SOCIAL_MODERATION_WORKER_HMAC_SECRET',
] as const;

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(
  actual: T,
  expected: T,
  message: string,
) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function assertRejectsPhase2HttpError(
  action: () => Promise<unknown>,
  expectedCode: string,
) {
  try {
    await action();
  } catch (error) {
    assert(
      error instanceof Phase2HttpError,
      'Expected a Phase2HttpError to be thrown',
    );
    assertEquals(error.code, expectedCode, 'Unexpected Phase2HttpError code');
    return;
  }

  throw new Error('Expected the action to throw');
}

async function withWorkerAuthEnv(
  overrides: Partial<Record<(typeof TEST_ENV_NAMES)[number], string>>,
  action: () => Promise<void> | void,
) {
  const originalValues = new Map<string, string | undefined>();

  for (const envName of TEST_ENV_NAMES) {
    originalValues.set(envName, Deno.env.get(envName));
    if (Object.prototype.hasOwnProperty.call(overrides, envName)) {
      Deno.env.set(envName, overrides[envName] ?? '');
    } else {
      Deno.env.set(envName, '');
    }
  }

  try {
    await action();
  } finally {
    for (const envName of TEST_ENV_NAMES) {
      const originalValue = originalValues.get(envName);
      Deno.env.set(envName, originalValue ?? '');
    }
  }
}

function encodeJwtPayload(payload: Record<string, unknown>) {
  return btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createAdminRequest(token: string) {
  return new Request('https://example.com/social-process-moderation-queue', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
}

async function createWorkerRequest(options: {
  rawBody: string;
  secret: string;
  timestamp?: string;
  nonce?: string;
}) {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const nonce = options.nonce ?? crypto.randomUUID();
  const unsignedRequest = new Request(
    'https://example.com/social-process-moderation-queue',
    {
      method: 'POST',
    },
  );
  const signature = await createSocialModerationWorkerSignature({
    req: unsignedRequest,
    rawBody: options.rawBody,
    timestamp,
    nonce,
    secret: options.secret,
  });

  return new Request('https://example.com/social-process-moderation-queue', {
    method: 'POST',
    headers: {
      [SOCIAL_MODERATION_WORKER_TIMESTAMP_HEADER]: timestamp,
      [SOCIAL_MODERATION_WORKER_NONCE_HEADER]: nonce,
      [SOCIAL_MODERATION_WORKER_SIGNATURE_HEADER]: signature,
      'Content-Type': 'application/json',
    },
    body: options.rawBody,
  });
}

function createClient(options: {
  authUserId?: string | null;
  authError?: unknown;
  adminTier?: string;
  nonceInsertError?: { code?: string; message?: string } | null;
}) {
  const authCalls: string[] = [];
  const profileCalls: string[] = [];
  const nonceInserts: unknown[] = [];

  return {
    client: {
      auth: {
        getUser(token: string) {
          authCalls.push(token);
          return Promise.resolve({
            data: {
              user: options.authUserId ? { id: options.authUserId } : null,
            },
            error: options.authError ?? null,
          });
        },
      },
      from(tableName: string) {
        if (tableName === 'edge_request_nonces') {
          return {
            delete() {
              return {
                eq() {
                  return {
                    lte() {
                      return Promise.resolve({ error: null });
                    },
                  };
                },
              };
            },
            insert(payload: unknown) {
              nonceInserts.push(payload);
              return Promise.resolve({
                error: options.nonceInsertError ?? null,
              });
            },
          };
        }

        assertEquals(tableName, 'user_profiles', 'Unexpected profile table');
        return {
          select() {
            return {
              eq(columnName: string, value: string) {
                assertEquals(columnName, 'id', 'Unexpected profile filter column');
                profileCalls.push(value);
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: options.authUserId
                        ? {
                          id: options.authUserId,
                          account_tier: options.adminTier ?? 'free',
                        }
                        : null,
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      },
    },
    authCalls,
    nonceInserts,
    profileCalls,
  };
}

Deno.test('requireSocialModerationWorkerOrAdmin accepts a fresh worker HMAC signature', async () => {
  await withWorkerAuthEnv({
    PHASE2_SOCIAL_MODERATION_WORKER_HMAC_SECRET: 'worker-secret',
  }, async () => {
    const { client, authCalls, nonceInserts, profileCalls } = createClient({});
    const actor = await requireSocialModerationWorkerOrAdmin(
      client,
      await createWorkerRequest({
        rawBody: '{}',
        secret: 'worker-secret',
      }),
      { rawBody: '{}' },
    );

    assertEquals(actor.actor_type, 'system', 'Worker signature should authenticate as system');
    assertEquals(actor.actor_id, null, 'Worker signature should not resolve to a user id');
    assertEquals(
      actor.actor_label,
      'social-moderation-worker',
      'Worker signature should use the worker actor label',
    );
    assertEquals(nonceInserts.length, 1, 'Worker nonce should be recorded once');
    assertEquals(authCalls.length, 0, 'Worker signature should bypass user auth lookups');
    assertEquals(profileCalls.length, 0, 'Worker signature should bypass admin profile checks');
  });
});

Deno.test('requireSocialModerationWorkerOrAdmin rejects replayed worker nonces', async () => {
  await withWorkerAuthEnv({
    PHASE2_SOCIAL_MODERATION_WORKER_HMAC_SECRET: 'worker-secret',
  }, async () => {
    const { client } = createClient({
      nonceInsertError: {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      },
    });

    await assertRejectsPhase2HttpError(
      async () =>
        requireSocialModerationWorkerOrAdmin(
          client,
          await createWorkerRequest({
            rawBody: '{}',
            secret: 'worker-secret',
          }),
          { rawBody: '{}' },
        ),
      'replayed_worker_nonce',
    );
  });
});

Deno.test('requireSocialModerationWorkerOrAdmin accepts admin JWTs as a manual trigger path', async () => {
  await withWorkerAuthEnv({
    PHASE2_SOCIAL_MODERATION_WORKER_HMAC_SECRET: 'worker-secret',
  }, async () => {
    const { client, authCalls, profileCalls } = createClient({
      authUserId: '33333333-3333-4333-8333-333333333333',
      adminTier: 'admin',
    });
    const actor = await requireSocialModerationWorkerOrAdmin(
      client,
      createAdminRequest(`header.${encodeJwtPayload({ aal: 'aal2' })}.signature`),
    );

    assertEquals(actor.actor_type, 'admin', 'Admin JWT should authenticate as admin');
    assertEquals(
      actor.actor_id,
      '33333333-3333-4333-8333-333333333333',
      'Admin JWT should expose the admin id',
    );
    assertEquals(actor.actor_label, null, 'Admin actors should not use a system label');
    assertEquals(authCalls.length, 1, 'Admin JWT should be validated through auth.getUser');
    assertEquals(profileCalls.length, 1, 'Admin JWT should be checked against user_profiles');
  });
});

Deno.test('requireSocialModerationWorkerOrAdmin rejects invalid and non-admin tokens', async () => {
  await withWorkerAuthEnv({
    PHASE2_SOCIAL_MODERATION_WORKER_HMAC_SECRET: 'worker-secret',
  }, async () => {
    const invalidClient = createClient({
      authUserId: null,
      authError: new Error('invalid token'),
    });

    await assertRejectsPhase2HttpError(
      () =>
        requireSocialModerationWorkerOrAdmin(
          invalidClient.client,
          createAdminRequest(`header.${encodeJwtPayload({ aal: 'aal2' })}.signature`),
        ),
      'invalid_authentication',
    );

    const nonAdminClient = createClient({
      authUserId: '44444444-4444-4444-8444-444444444444',
      adminTier: 'free',
    });

    await assertRejectsPhase2HttpError(
      () =>
        requireSocialModerationWorkerOrAdmin(
          nonAdminClient.client,
          createAdminRequest(`header.${encodeJwtPayload({ aal: 'aal2' })}.signature`),
        ),
      'admin_required',
    );
  });
});

// =============================================================================
// S-04 — enforceAdminRateLimit fail-closed
// =============================================================================

interface AdminAuditClientOptions {
  selectError?: { code?: string; message?: string } | null;
  selectCount?: number;
  insertError?: { code?: string; message?: string } | null;
}

function createAdminAuditClient(options: AdminAuditClientOptions = {}) {
  const inserts: unknown[] = [];
  return {
    inserts,
    client: {
      from(tableName: string) {
        if (tableName !== 'admin_audit_events') {
          throw new Error(`Unexpected table: ${tableName}`);
        }
        return {
          // Chain for SELECT counts (used by enforceAdminRateLimit)
          select() {
            return {
              eq() {
                return {
                  like() {
                    return {
                      gte() {
                        return Promise.resolve({
                          count: options.selectCount ?? 0,
                          error: options.selectError ?? null,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
          // Chain for INSERT (used by logAdminAuditEvent)
          insert(payload: unknown) {
            inserts.push(payload);
            return Promise.resolve({ error: options.insertError ?? null });
          },
        };
      },
    },
  };
}

Deno.test('S-04: enforceAdminRateLimit fails closed when DB select errors', async () => {
  const { client } = createAdminAuditClient({
    selectError: { code: '57P01', message: 'connection terminated' },
  });

  await assertRejectsPhase2HttpError(
    () =>
      enforceAdminRateLimit(client, {
        actorId: 'admin-1',
        actionPattern: 'social_admin_eradicate_user%',
        maxActions: 5,
        windowMs: 60 * 60 * 1000,
      }),
    'admin_rate_limit_unavailable',
  );
});

Deno.test('S-04: enforceAdminRateLimit fails open when failOpenOnError=true', async () => {
  const { client } = createAdminAuditClient({
    selectError: { code: '57P01', message: 'connection terminated' },
  });

  // Should NOT throw — caller explicitly authorized fail-open
  await enforceAdminRateLimit(client, {
    actorId: 'admin-1',
    actionPattern: 'social_admin_approve%',
    maxActions: 100,
    windowMs: 60 * 60 * 1000,
    failOpenOnError: true,
  });
});

Deno.test('S-04: enforceAdminRateLimit throws 429 when limit exceeded', async () => {
  const { client } = createAdminAuditClient({ selectCount: 10 });

  await assertRejectsPhase2HttpError(
    () =>
      enforceAdminRateLimit(client, {
        actorId: 'admin-1',
        actionPattern: 'social_admin_eradicate_user%',
        maxActions: 5,
        windowMs: 60 * 60 * 1000,
      }),
    'admin_rate_limit_exceeded',
  );
});

Deno.test('S-04: enforceAdminRateLimit accepts when count below threshold', async () => {
  const { client } = createAdminAuditClient({ selectCount: 2 });

  // Should NOT throw
  await enforceAdminRateLimit(client, {
    actorId: 'admin-1',
    actionPattern: 'social_admin_eradicate_user%',
    maxActions: 5,
    windowMs: 60 * 60 * 1000,
  });
});

// =============================================================================
// S-05 — logAdminAuditEvent critical=true default
// =============================================================================

Deno.test('S-05: logAdminAuditEvent throws 503 when insert fails (default critical=true)', async () => {
  const { client } = createAdminAuditClient({
    insertError: { code: '23503', message: 'foreign key violation' },
  });

  await assertRejectsPhase2HttpError(
    () =>
      logAdminAuditEvent(client, {
        actorId: 'admin-1',
        action: 'social_admin_eradicate_user',
        metadata: { target_user_id: 'user-xxx' },
      }),
    'admin_audit_log_unavailable',
  );
});

Deno.test('S-05: logAdminAuditEvent silent when critical=false (legacy best-effort)', async () => {
  const { client } = createAdminAuditClient({
    insertError: { code: '23503', message: 'foreign key violation' },
  });

  // Should NOT throw — caller explicitly opted into best-effort.
  await logAdminAuditEvent(client, {
    actorId: 'admin-1',
    action: 'social_admin_approve',
    critical: false,
  });
});

Deno.test('S-05: logAdminAuditEvent writes idempotency_key when provided', async () => {
  const { client, inserts } = createAdminAuditClient({});

  await logAdminAuditEvent(client, {
    actorId: 'admin-1',
    action: 'social_admin_eradicate_user',
    idempotencyKey: 'abc-123-def',
    metadata: { target_user_id: 'user-xxx' },
  });

  assertEquals(inserts.length, 1, 'One insert should have happened');
  const insertPayload = inserts[0] as Record<string, unknown>;
  assertEquals(
    insertPayload.idempotency_key,
    'abc-123-def',
    'idempotency_key should be persisted',
  );
});

Deno.test('S-05: logAdminAuditEvent omits idempotency_key when not provided', async () => {
  const { client, inserts } = createAdminAuditClient({});

  await logAdminAuditEvent(client, {
    actorId: 'admin-1',
    action: 'social_admin_approve',
    critical: false,
  });

  const insertPayload = inserts[0] as Record<string, unknown>;
  assert(
    !('idempotency_key' in insertPayload),
    'idempotency_key should be omitted when caller did not pass one',
  );
});

// =============================================================================
// S-09 — logAdminAuditEvent UNIQUE 23505 → 409 idempotent_request_already_processed
// =============================================================================

Deno.test('S-09: logAdminAuditEvent surfaces UNIQUE violation as 409 when idempotencyKey provided', async () => {
  const { client } = createAdminAuditClient({
    insertError: { code: '23505', message: 'duplicate key value violates unique constraint' },
  });

  try {
    await logAdminAuditEvent(client, {
      actorId: 'admin-1',
      action: 'social_admin_moderate_user_ban_user.intent',
      idempotencyKey: 'abc-123-def',
      metadata: { target_user_id: 'user-xxx' },
      critical: true,
    });
    throw new Error('Expected Phase2HttpError to be thrown');
  } catch (error) {
    assert(error instanceof Phase2HttpError, 'Expected Phase2HttpError');
    assertEquals(error.status, 409, 'Should surface as 409 not 503');
    assertEquals(
      error.code,
      'idempotent_request_already_processed',
      'Should use idempotent_request_already_processed code',
    );
  }
});

Deno.test('S-09: logAdminAuditEvent still 503 on non-23505 errors even with idempotencyKey', async () => {
  const { client } = createAdminAuditClient({
    insertError: { code: '08000', message: 'connection failure' },
  });

  await assertRejectsPhase2HttpError(
    () =>
      logAdminAuditEvent(client, {
        actorId: 'admin-1',
        action: 'social_admin_moderate_user_ban_user.intent',
        idempotencyKey: 'abc-123-def',
        critical: true,
      }),
    'admin_audit_log_unavailable',
  );
});

Deno.test('S-09: logAdminAuditEvent does not surface 23505 as 409 if no idempotencyKey', async () => {
  // Edge case : si on a une UNIQUE violation sur un autre champ que
  // idempotency_key (improbable mais possible), on ne doit pas confondre
  // avec un idempotent replay.
  const { client } = createAdminAuditClient({
    insertError: { code: '23505', message: 'duplicate key' },
  });

  await assertRejectsPhase2HttpError(
    () =>
      logAdminAuditEvent(client, {
        actorId: 'admin-1',
        action: 'social_admin_eradicate_user',
        critical: true,
        // pas d'idempotencyKey
      }),
    'admin_audit_log_unavailable',
  );
});
