import {
  assertDeletableSocialComment,
  assertDeletableSocialPost,
  assertEditableSocialComment,
  assertNoRecentDuplicateComment,
  assertReportableTargetNotOwnedByUser,
  isSocialCommentEditableForUser,
  isSocialPostInteractiveForUser,
  resolveReservedSocialUpload,
} from '@/supabase/functions/_shared/phase2Social';

type StorageQueryResult = {
  data: unknown;
  error: unknown;
};

function createStorageClient(options: {
  exactResult?: StorageQueryResult;
  prefixResult?: StorageQueryResult;
}) {
  const list = jest.fn(
    async (_folderPath: string, listOptions: Record<string, unknown>) => {
      const search = typeof listOptions.search === 'string' ? listOptions.search : '';
      const isExactLookup = search.length > 0 && !search.endsWith('.');

      return isExactLookup
        ? options.exactResult ?? { data: null, error: null }
        : options.prefixResult ?? { data: [], error: null };
    },
  );

  return {
    client: {
      storage: {
        from: jest.fn(() => ({
          list,
        })),
      },
    },
    list,
  };
}

function createStorageRow(
  name: string,
  metadata: Record<string, unknown> = { mimetype: 'image/jpeg' },
) {
  return {
    bucket_id: 'social-posts',
    name,
    metadata,
  };
}

function createSocialPostLookupClient(result: {
  data: unknown;
  error: unknown;
}) {
  const chain = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(async () => result),
  } as any;

  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);

  return {
    client: {
      from: jest.fn(() => chain),
    },
    chain,
  };
}

function createDuplicateCommentLookupClient(result: {
  data: unknown;
  error: unknown;
}) {
  const chain = {
    select: jest.fn(),
    eq: jest.fn(),
    gte: jest.fn(),
    limit: jest.fn(),
    maybeSingle: jest.fn(async () => result),
  } as any;

  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.gte.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);

  return {
    client: {
      from: jest.fn(() => chain),
    },
    chain,
  };
}

function createSocialCommentAuthorizationClient(options: {
  comment: Record<string, unknown>;
  post?: Record<string, unknown>;
  viewerIsAdmin?: boolean;
}) {
  const post = options.post ?? {
    id: options.comment.post_id,
    author_id: 'post-author',
    author_username: 'alice',
    category: 'food',
    content_text: 'Parent post',
    asset_url: null,
    moderation_state: 'approved',
    deleted_at: null,
    like_count: 0,
    dislike_count: 0,
    impression_count: 0,
    comment_count: 1,
    created_at: '2026-04-14T08:00:00.000Z',
  };

  return {
    client: {
      from: jest.fn((tableName: string) => {
        const filters: Record<string, unknown> = {};
        const chain = {
          select: jest.fn(() => chain),
          eq: jest.fn((column: string, value: unknown) => {
            filters[column] = value;
            return chain;
          }),
          maybeSingle: jest.fn(async () => {
            if (tableName === 'social_comments') {
              return filters.id === options.comment.id
                ? { data: options.comment, error: null }
                : { data: null, error: { message: 'comment not found' } };
            }

            if (tableName === 'social_posts') {
              return filters.id === post.id
                ? { data: post, error: null }
                : { data: null, error: { message: 'post not found' } };
            }

            if (tableName === 'user_profiles') {
              return {
                data: { account_tier: options.viewerIsAdmin ? 'admin' : 'free' },
                error: null,
              };
            }

            return { data: null, error: { message: `Unexpected table ${tableName}` } };
          }),
        } as any;

        return chain;
      }),
    },
  };
}

describe('phase2 social upload resolution', () => {
  it('resolves a reserved upload by exact canonical path when reserved_asset_path is provided', async () => {
    const { client, list } = createStorageClient({
      exactResult: {
        data: [
          createStorageRow('11111111-1111-4111-8111-111111111111.jpg'),
        ],
        error: null,
      },
    });

    await expect(
      resolveReservedSocialUpload(client, {
        userId: 'user-1',
        uploadId: '11111111-1111-4111-8111-111111111111',
        reservedAssetPath:
          'user-1/posts/11111111-1111-4111-8111-111111111111.jpg',
      }),
    ).resolves.toEqual({
      asset_path: 'user-1/posts/11111111-1111-4111-8111-111111111111.jpg',
      mime_type: 'image/jpeg',
    });

    expect(list).toHaveBeenCalledWith('user-1/posts', {
      limit: 10,
      search: '11111111-1111-4111-8111-111111111111.jpg',
    });
  });

  it('returns reserved_upload_not_found when the exact canonical path does not exist', async () => {
    const { client } = createStorageClient({
      exactResult: {
        data: [],
        error: null,
      },
    });

    await expect(
      resolveReservedSocialUpload(client, {
        userId: 'user-1',
        uploadId: '11111111-1111-4111-8111-111111111111',
        reservedAssetPath:
          'user-1/posts/11111111-1111-4111-8111-111111111111.jpg',
      }),
    ).rejects.toMatchObject({
      code: 'reserved_upload_not_found',
      status: 404,
    });
  });

  it('rejects mismatched reserved_asset_path values as invalid upload references', async () => {
    const { client, list } = createStorageClient({});

    await expect(
      resolveReservedSocialUpload(client, {
        userId: 'user-1',
        uploadId: '11111111-1111-4111-8111-111111111111',
        reservedAssetPath:
          'user-1/posts/22222222-2222-4222-8222-222222222222.jpg',
      }),
    ).rejects.toMatchObject({
      code: 'invalid_upload_reference',
      status: 400,
    });

    expect(list).not.toHaveBeenCalled();
  });

  it('falls back to the legacy prefix lookup when reserved_asset_path is missing', async () => {
    const { client, list } = createStorageClient({
      prefixResult: {
        data: [
          createStorageRow(
            '11111111-1111-4111-8111-111111111111.png',
            { contentType: 'image/png' },
          ),
        ],
        error: null,
      },
    });

    await expect(
      resolveReservedSocialUpload(client, {
        userId: 'user-1',
        uploadId: '11111111-1111-4111-8111-111111111111',
      }),
    ).resolves.toEqual({
      asset_path: 'user-1/posts/11111111-1111-4111-8111-111111111111.png',
      mime_type: 'image/png',
    });

    expect(list).toHaveBeenCalledWith('user-1/posts', {
      limit: 10,
      search: '11111111-1111-4111-8111-111111111111.',
    });
  });

  it('rejects ambiguous legacy prefix matches as invalid upload references', async () => {
    const { client } = createStorageClient({
      prefixResult: {
        data: [
          createStorageRow('11111111-1111-4111-8111-111111111111.jpg'),
          createStorageRow('11111111-1111-4111-8111-111111111111.png'),
        ],
        error: null,
      },
    });

    await expect(
      resolveReservedSocialUpload(client, {
        userId: 'user-1',
        uploadId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toMatchObject({
      code: 'invalid_upload_reference',
      status: 400,
    });
  });

  it('returns a precise lookup failure when storage resolution errors', async () => {
    const { client } = createStorageClient({
      exactResult: {
        data: null,
        error: {
          code: '57014',
          message: 'canceling statement due to timeout',
        },
      },
    });

    await expect(
      resolveReservedSocialUpload(client, {
        userId: 'user-1',
        uploadId: '11111111-1111-4111-8111-111111111111',
        reservedAssetPath:
          'user-1/posts/11111111-1111-4111-8111-111111111111.jpg',
      }),
    ).rejects.toMatchObject({
      code: 'social_upload_lookup_failed',
      status: 503,
    });
  });

  it('keeps post interactions limited to approved posts and the author pending post', () => {
    expect(
      isSocialPostInteractiveForUser(
        {
          author_id: 'viewer-1',
          moderation_state: 'pending',
          deleted_at: null,
        },
        'viewer-1',
      ),
    ).toBe(true);
    expect(
      isSocialPostInteractiveForUser(
        {
          author_id: 'author-2',
          moderation_state: 'pending',
          deleted_at: null,
        },
        'viewer-1',
      ),
    ).toBe(false);
    expect(
      isSocialPostInteractiveForUser(
        {
          author_id: 'author-2',
          moderation_state: 'approved',
          deleted_at: null,
        },
        'viewer-1',
      ),
    ).toBe(true);
    expect(
      isSocialPostInteractiveForUser(
        {
          author_id: 'viewer-1',
          moderation_state: 'hidden',
          deleted_at: null,
        },
        'viewer-1',
      ),
    ).toBe(false);
    expect(
      isSocialPostInteractiveForUser(
        {
          author_id: 'viewer-1',
          moderation_state: 'approved',
          deleted_at: '2026-04-14T12:00:00.000Z',
        },
        'viewer-1',
      ),
    ).toBe(false);
  });

  it('rejects reporting your own social content', () => {
    expect(() =>
      assertReportableTargetNotOwnedByUser(
        {
          author_id: 'viewer-1',
        },
        'viewer-1',
      ),
    ).toThrow('You cannot report your own content');

    expect(() =>
      assertReportableTargetNotOwnedByUser(
        {
          author_id: 'author-2',
        },
        'viewer-1',
      ),
    ).not.toThrow();
  });

  it('scopes recent duplicate comment checks to the same post', async () => {
    const dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-04-30T12:00:00.000Z'));
    const { client, chain } = createDuplicateCommentLookupClient({
      data: null,
      error: null,
    });

    try {
      await expect(
        assertNoRecentDuplicateComment(
          client,
          'viewer-1',
          'post-1',
          'hash-1',
        ),
      ).resolves.toBeUndefined();
    } finally {
      dateNowSpy.mockRestore();
    }

    expect(client.from).toHaveBeenCalledWith('social_comments');
    expect(chain.select).toHaveBeenCalledWith('id');
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'author_id', 'viewer-1');
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'post_id', 'post-1');
    expect(chain.eq).toHaveBeenNthCalledWith(3, 'content_hash', 'hash-1');
    expect(chain.gte).toHaveBeenCalledWith(
      'created_at',
      '2026-04-29T12:00:00.000Z',
    );
    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(chain.maybeSingle).toHaveBeenCalled();
  });

  it('rejects a recent duplicate comment on the same post', async () => {
    const { client } = createDuplicateCommentLookupClient({
      data: {
        id: 'comment-1',
      },
      error: null,
    });

    await expect(
      assertNoRecentDuplicateComment(
        client,
        'viewer-1',
        'post-1',
        'hash-1',
      ),
    ).rejects.toMatchObject({
      code: 'duplicate_content',
      status: 409,
      message: 'A similar comment was already submitted recently',
    });
  });

  it('allows deleting a post only when it belongs to the viewer and is not already deleted', async () => {
    const { client } = createSocialPostLookupClient({
      data: {
        id: 'post-1',
        author_id: 'viewer-1',
        deleted_at: null,
        moderation_state: 'approved',
        moderation_reason: null,
        moderation_provider: null,
        moderation_summary_json: {},
      },
      error: null,
    });

    await expect(
      assertDeletableSocialPost(client, 'viewer-1', 'post-1'),
    ).resolves.toMatchObject({
      id: 'post-1',
      author_id: 'viewer-1',
      deleted_at: null,
    });
  });

  it('rejects deleting posts that are owned by someone else or already deleted', async () => {
    const { client: foreignClient } = createSocialPostLookupClient({
      data: {
        id: 'post-1',
        author_id: 'author-2',
        deleted_at: null,
        moderation_state: 'approved',
        moderation_reason: null,
        moderation_provider: null,
        moderation_summary_json: {},
      },
      error: null,
    });
    const { client: deletedClient } = createSocialPostLookupClient({
      data: {
        id: 'post-1',
        author_id: 'viewer-1',
        deleted_at: '2026-04-15T10:00:00.000Z',
        moderation_state: 'removed',
        moderation_reason: 'author_deleted',
        moderation_provider: 'user_delete',
        moderation_summary_json: {},
      },
      error: null,
    });

    await expect(
      assertDeletableSocialPost(foreignClient, 'viewer-1', 'post-1'),
    ).rejects.toMatchObject({
      code: 'post_delete_forbidden',
      status: 403,
    });
    await expect(
      assertDeletableSocialPost(deletedClient, 'viewer-1', 'post-1'),
    ).rejects.toMatchObject({
      code: 'post_already_deleted',
      status: 409,
    });
  });

  it('allows authors to edit approved or pending comments and delete their own active comment', async () => {
    const comment = {
      id: 'comment-1',
      post_id: 'post-1',
      author_id: 'viewer-1',
      author_username: 'viewer',
      author_avatar_url: null,
      content_text: 'Original',
      content_hash: 'hash-1',
      created_at: '2026-04-14T09:00:00.000Z',
      like_count: 0,
      moderation_state: 'approved',
      moderation_reason: null,
      moderation_provider: null,
      moderation_summary_json: {},
      rejection_count: 0,
      last_rejected_at: null,
      deleted_at: null,
    };
    const { client } = createSocialCommentAuthorizationClient({
      comment,
    });

    await expect(
      assertEditableSocialComment(client, 'viewer-1', 'comment-1'),
    ).resolves.toMatchObject({
      id: 'comment-1',
      author_id: 'viewer-1',
    });
    await expect(
      assertDeletableSocialComment(client, 'viewer-1', 'comment-1'),
    ).resolves.toMatchObject({
      id: 'comment-1',
      author_id: 'viewer-1',
    });
    expect(isSocialCommentEditableForUser(comment, 'viewer-1')).toBe(true);
    expect(
      isSocialCommentEditableForUser(
        {
          ...comment,
          moderation_state: 'pending',
        },
        'viewer-1',
      ),
    ).toBe(true);
  });

  it('rejects editing or deleting comments that belong to another viewer', async () => {
    const { client } = createSocialCommentAuthorizationClient({
      comment: {
        id: 'comment-1',
        post_id: 'post-1',
        author_id: 'author-2',
        author_username: 'bob',
        author_avatar_url: null,
        content_text: 'Original',
        content_hash: 'hash-1',
        created_at: '2026-04-14T09:00:00.000Z',
        like_count: 0,
        moderation_state: 'approved',
        moderation_reason: null,
        moderation_provider: null,
        moderation_summary_json: {},
        rejection_count: 0,
        last_rejected_at: null,
        deleted_at: null,
      },
    });

    await expect(
      assertEditableSocialComment(client, 'viewer-1', 'comment-1'),
    ).rejects.toMatchObject({
      code: 'comment_edit_forbidden',
      status: 403,
    });
    await expect(
      assertDeletableSocialComment(client, 'viewer-1', 'comment-1'),
    ).rejects.toMatchObject({
      code: 'comment_delete_forbidden',
      status: 403,
    });
    expect(
      isSocialCommentEditableForUser(
        {
          author_id: 'author-2',
          moderation_state: 'approved',
          deleted_at: null,
        },
        'viewer-1',
      ),
    ).toBe(false);
  });

  it('rejects editing terminally moderated comments and deleting comments already soft-deleted', async () => {
    const { client: rejectedClient } = createSocialCommentAuthorizationClient({
      comment: {
        id: 'comment-1',
        post_id: 'post-1',
        author_id: 'viewer-1',
        author_username: 'viewer',
        author_avatar_url: null,
        content_text: 'Rejected',
        content_hash: 'hash-1',
        created_at: '2026-04-14T09:00:00.000Z',
        like_count: 0,
        moderation_state: 'rejected',
        moderation_reason: 'manual_review_required',
        moderation_provider: 'manual_review',
        moderation_summary_json: {},
        rejection_count: 1,
        last_rejected_at: '2026-04-14T10:00:00.000Z',
        deleted_at: null,
      },
    });
    const { client: deletedClient } = createSocialCommentAuthorizationClient({
      comment: {
        id: 'comment-1',
        post_id: 'post-1',
        author_id: 'viewer-1',
        author_username: 'viewer',
        author_avatar_url: null,
        content_text: 'Deleted',
        content_hash: 'hash-2',
        created_at: '2026-04-14T09:00:00.000Z',
        like_count: 0,
        moderation_state: 'removed',
        moderation_reason: 'author_deleted',
        moderation_provider: 'user_delete',
        moderation_summary_json: {},
        rejection_count: 0,
        last_rejected_at: null,
        deleted_at: '2026-04-15T10:00:00.000Z',
      },
    });

    await expect(
      assertEditableSocialComment(rejectedClient, 'viewer-1', 'comment-1'),
    ).rejects.toMatchObject({
      code: 'comment_edit_forbidden',
      status: 403,
    });
    await expect(
      assertDeletableSocialComment(deletedClient, 'viewer-1', 'comment-1'),
    ).rejects.toMatchObject({
      code: 'comment_already_deleted',
      status: 409,
    });
    expect(
      isSocialCommentEditableForUser(
        {
          author_id: 'viewer-1',
          moderation_state: 'rejected',
          deleted_at: null,
        },
        'viewer-1',
      ),
    ).toBe(false);
  });
});
