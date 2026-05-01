import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import {
  applyOptimisticLikeToSocialComment,
  applyOptimisticReactionToSocialPost,
  applyServerLikeStateToSocialComment,
  applyServerReactionStateToSocialPost,
  buildStableSocialSharePayloadSnapshot,
  createSocialComment,
  createSocialPost,
  deleteSocialComment,
  deleteSocialPost,
  fetchSocialComments,
  fetchSocialCommentsPage,
  fetchSocialFeed,
  fetchSocialPostDetail,
  fetchSocialPublicProfile,
  flattenSocialCommentsPages,
  getDisplayedSocialCommentCount,
  normalizeSocialImpressionPostIds,
  prioritizeViewerSocialComments,
  recordSocialPostImpressions,
  recordSocialPostViews,
  removeSocialCommentFromThread,
  reportSocialContent,
  setSocialCommentLike,
  setReactionOnSocialPost,
  updateSocialComment,
  updateSocialCommentLikeState,
  updateSocialCommentLikeStateInPages,
  upsertSocialCommentInPages,
  upsertSocialCommentInThread,
  uploadSocialAssetFromUri,
  validateSocialCommentInput,
} from '@/services/social';
import type {
  SocialComment,
  SocialCommentsPage,
  SocialPost,
  SocialReactionState,
} from '@/types';

jest.mock('@/services/authenticatedStorage', () => {
  class AuthenticatedStorageSessionError extends Error {
    code: 'auth_session_required' | 'auth_session_mismatch';
    status = 401;
    constructor(message: string, options: { code: 'auth_session_required' | 'auth_session_mismatch' }) {
      super(message);
      this.name = 'AuthenticatedStorageSessionError';
      this.code = options.code;
    }
  }

  return {
    AuthenticatedStorageSessionError,
    requireCurrentSessionForUser: jest.fn((userId: string) =>
      Promise.resolve({
        access_token: 'test-token',
        user: { id: userId },
      }),
    ),
    uploadAuthenticatedStorageObject: jest.fn(async (options: { bucket: string; path: string; fileBody: ArrayBuffer; fileOptions?: unknown }) => {
      const supabaseModule = jest.requireMock('@/services/supabase') as {
        supabase: { storage?: { from?: jest.Mock } };
      };
      const result = await supabaseModule.supabase.storage
        ?.from?.(options.bucket)
        .upload(options.path, options.fileBody, options.fileOptions);
      return { error: result?.error ?? null };
    }),
    removeAuthenticatedStorageObject: jest.fn(() => Promise.resolve({ error: null })),
  };
});

const { supabase } = jest.requireMock('@/services/supabase') as {
  supabase: {
    rpc?: jest.Mock;
    from?: jest.Mock;
    auth?: {
      getSession?: jest.Mock;
    };
    storage?: {
      from?: jest.Mock;
    };
  };
};

const mockStorageUpload = jest.fn();
const mockStorageGetPublicUrl = jest.fn();
const mockStorageCreateSignedUrl = jest.fn();
const mockStorageRemove = jest.fn();
const mockProfileMaybeSingle = jest.fn();
const mockProfileEq = jest.fn(() => ({
  maybeSingle: mockProfileMaybeSingle,
}));
const mockProfileSelect = jest.fn(() => ({
  eq: mockProfileEq,
}));
const mockFrom = jest.fn(() => ({
  select: mockProfileSelect,
}));
const mockStorageFrom = jest.fn(() => ({
  upload: mockStorageUpload,
  getPublicUrl: mockStorageGetPublicUrl,
  createSignedUrl: mockStorageCreateSignedUrl,
  remove: mockStorageRemove,
}));
const mockGetInfoAsync = FileSystemLegacy.getInfoAsync as jest.Mock;
const mockReadAsStringAsync = FileSystemLegacy.readAsStringAsync as jest.Mock;
const mockManipulateAsync = ImageManipulator.manipulateAsync as jest.Mock;

function buildSocialComment(
  overrides: Partial<SocialComment> = {},
): SocialComment {
  return {
    id: 'comment-1',
    post_id: 'post-1',
    author_id: 'user-1',
    author_username: 'alice',
    author_avatar_url: null,
    content_text: 'Sharp progress',
    created_at: '2026-04-06T10:00:00.000Z',
    like_count: 0,
    viewer_has_liked: false,
    moderation_status: 'approved',
    ...overrides,
  };
}

describe('social service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.rpc = jest.fn();
    supabase.from = mockFrom;
    supabase.auth = {
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'test-token',
          },
        },
      }),
    };
    supabase.storage = {
      from: mockStorageFrom,
    };
    mockStorageUpload.mockResolvedValue({ error: null });
    mockStorageGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://cdn.example.com/social-post.jpg' },
    });
    mockStorageCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://cdn.example.com/social-post.jpg' },
      error: null,
    });
    mockStorageRemove.mockResolvedValue({ data: null, error: null });
    mockProfileMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
    mockReadAsStringAsync.mockResolvedValue('dGVzdA==');
    mockManipulateAsync.mockResolvedValue({
      uri: 'manipulated-image-uri',
      width: 100,
      height: 100,
    });
    global.fetch = jest.fn();
  });

  it('paginates the social feed through the backend RPC and filters malformed rows safely', async () => {
    supabase.rpc?.mockResolvedValueOnce({
      data: [
        {
          id: 'post-1',
          author_id: 'user-1',
          author_username: 'alice',
          category: 'food',
          content_text: 'Fresh meal',
          created_at: '2026-04-06T10:00:00.000Z',
          like_count: 4,
          comment_count: 2,
          viewer_visible_comment_count: 5,
          viewer_has_liked: true,
          moderation_status: 'approved',
          asset_url: 'https://cdn.example.com/post-1.jpg',
          image_url: 'https://cdn.example.com/post-1.jpg',
        },
        {
          id: 'bad-row',
          category: 'physique',
        },
      ],
      error: null,
    });

    const page = await fetchSocialFeed('food', '2', 2);

    expect(supabase.rpc).toHaveBeenCalledWith('get_social_feed_page', {
      p_category: 'food',
      p_limit: 2,
      p_offset: 2,
      p_viewer_language_code: null,
      p_viewer_country_code: null,
    });
    expect(page).toEqual({
      items: [
        expect.objectContaining({
          id: 'post-1',
          category: 'food',
          viewer_reaction: 'neutral',
          viewer_has_liked: true,
          viewer_visible_comment_count: 5,
        }),
      ],
      next_cursor: '4',
    });
  });

  it('forwards the viewer language/country context to the social feed RPC', async () => {
    supabase.rpc?.mockResolvedValueOnce({
      data: [
        {
          id: 'post-fr-1',
          author_id: 'user-fr',
          category: 'food',
          content_text: 'Repas',
          created_at: '2026-04-25T10:00:00.000Z',
          like_count: 0,
          comment_count: 0,
          moderation_status: 'approved',
          language_code: 'fr',
          country_code: 'FR',
        },
      ],
      error: null,
    });

    const page = await fetchSocialFeed('all', null, 5, {
      languageCode: 'fr',
      countryCode: 'FR',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('get_social_feed_page', {
      p_category: null,
      p_limit: 5,
      p_offset: 0,
      p_viewer_language_code: 'fr',
      p_viewer_country_code: 'FR',
    });
    expect(page.items[0]).toEqual(
      expect.objectContaining({
        id: 'post-fr-1',
        language_code: 'fr',
        country_code: 'FR',
      }),
    );
  });

  it('fails safely when the backend returns malformed social payloads', async () => {
    supabase.rpc?.mockResolvedValueOnce({
      data: [{ nope: true }],
      error: null,
    });

    await expect(fetchSocialFeed('all', null, 12)).resolves.toEqual({
      items: [],
      next_cursor: null,
    });
  });

  it('surfaces a precise feed query error instead of collapsing into an empty state', async () => {
    supabase.rpc?.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find function public.get_social_feed_page',
      },
    });

    await expect(fetchSocialFeed('all', null, 12)).rejects.toMatchObject({
      code: 'social_feed_query_unavailable',
      status: 503,
      message: expect.stringContaining('get_social_feed_page'),
    });
  });

  it('surfaces a precise comments query error instead of returning an empty thread', async () => {
    supabase.rpc?.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find function public.get_social_comments_for_post',
      },
    });

    await expect(fetchSocialComments('post-1')).rejects.toMatchObject({
      code: 'social_comments_query_unavailable',
      status: 503,
      message: expect.stringContaining('get_social_comments_for_post'),
    });
  });

  it('fetches one canonical social post detail through the dedicated RPC', async () => {
    supabase.rpc?.mockResolvedValueOnce({
      data: {
        id: 'post-1',
        author_id: 'user-1',
        author_username: 'alice',
        author_avatar_url: null,
        category: 'food',
        content_text: 'Fresh meal',
        created_at: '2026-04-06T10:00:00.000Z',
        like_count: 4,
        dislike_count: 1,
        comment_count: 2,
        viewer_visible_comment_count: 5,
        viewer_reaction: 'like',
        viewer_has_liked: true,
        moderation_status: 'approved',
        asset_url: 'https://cdn.example.com/post-1.jpg',
        image_url: 'https://cdn.example.com/post-1.jpg',
      },
      error: null,
    });

    await expect(fetchSocialPostDetail('post-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'post-1',
        viewer_reaction: 'like',
        dislike_count: 1,
        viewer_visible_comment_count: 5,
      }),
    );
    expect(supabase.rpc).toHaveBeenCalledWith('get_social_post_detail', {
      p_post_id: 'post-1',
    });
  });

  it('maps the social post detail RPC not-found error to a stable post_not_found code', async () => {
    supabase.rpc?.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'P0001',
        message: 'Social post not found',
      },
    });

    await expect(fetchSocialPostDetail('post-1')).rejects.toMatchObject({
      code: 'post_not_found',
      status: 404,
    });
  });

  it('reads the public social profile with the minimal safe projection', async () => {
    mockProfileMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'user-1',
        username: 'alice',
        avatar_url: 'https://cdn.example.com/avatar.jpg',
        account_created_at: '2026-01-01T10:00:00.000Z',
        created_at: '2026-01-01T10:00:00.000Z',
        scan_count: 108,
      },
      error: null,
    });

    await expect(fetchSocialPublicProfile('user-1')).resolves.toEqual({
      id: 'user-1',
      username: 'alice',
      avatar_url: 'https://cdn.example.com/avatar.jpg',
      account_created_at: '2026-01-01T10:00:00.000Z',
      created_at: '2026-01-01T10:00:00.000Z',
      scan_count: 108,
    });
    expect(mockFrom).toHaveBeenCalledWith('user_profiles_public');
    expect(mockProfileSelect).toHaveBeenCalledWith(
      'id, username, avatar_url, account_created_at, created_at, scan_count',
    );
    expect(mockProfileEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('reads comment like_count and viewer_has_liked directly from the comments RPC payload', async () => {
    supabase.rpc?.mockResolvedValueOnce({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'user-1',
          author_username: 'alice',
          content_text: 'Sharp progress',
          created_at: '2026-04-06T10:00:00.000Z',
          like_count: 7,
          viewer_has_liked: true,
          moderation_status: 'approved',
        },
      ],
      error: null,
    });

    await expect(fetchSocialComments('post-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'comment-1',
        like_count: 7,
        viewer_has_liked: true,
        moderation_status: 'approved',
      }),
    ]);
  });

  it('paginates comments with a like_count cursor and returns the next popularity cursor', async () => {
    supabase.rpc?.mockResolvedValueOnce({
      data: [
        {
          id: 'comment-9',
          post_id: 'post-1',
          author_id: 'user-1',
          author_username: 'alice',
          content_text: 'Popular progress',
          created_at: '2026-04-06T10:00:00.000Z',
          like_count: 12,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
      ],
      error: null,
    });

    await expect(
      fetchSocialCommentsPage('post-1', '20|comment-cursor', 1),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'comment-9',
          like_count: 12,
        }),
      ],
      next_cursor: '12|comment-9',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('get_social_comments_page', {
      p_post_id: 'post-1',
      p_cursor_like_count: 20,
      p_cursor_id: 'comment-cursor',
      p_page_size: 1,
    });
  });

  it('surfaces a precise feed policy denial when Supabase policies block the feed query', async () => {
    supabase.rpc?.mockResolvedValueOnce({
      data: null,
      error: {
        code: '42501',
        message: 'permission denied for table social_posts',
      },
    });

    await expect(fetchSocialFeed('all', null, 12)).rejects.toMatchObject({
      code: 'social_feed_policy_denied',
      status: 403,
      message: expect.stringContaining('denied'),
    });
  });

  it('surfaces a precise comments schema mismatch when required columns are missing', async () => {
    supabase.rpc?.mockResolvedValueOnce({
      data: null,
      error: {
        code: '42703',
        message: 'column "moderation_provider" does not exist',
      },
    });

    await expect(fetchSocialComments('post-1')).rejects.toMatchObject({
      code: 'social_comments_schema_mismatch',
      status: 503,
      message: expect.stringContaining('missing required database schema'),
    });
  });

  it('surfaces a schema mismatch when the comments RPC omits comment like fields', async () => {
    supabase.rpc?.mockResolvedValueOnce({
      data: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'user-1',
          author_username: 'alice',
          content_text: 'Sharp progress',
          created_at: '2026-04-06T10:00:00.000Z',
          moderation_status: 'approved',
        },
      ],
      error: null,
    });

    await expect(fetchSocialComments('post-1')).rejects.toMatchObject({
      code: 'social_comments_schema_mismatch',
      status: 503,
    });
  });

  it('normalizes and validates comment creation input', () => {
    expect(validateSocialCommentInput('  Great   progress  ')).toBe(
      'Great progress',
    );
    expect(() => validateSocialCommentInput(' '.repeat(4))).toThrow(
      'Comment content is required',
    );
  });

  it('publishes a stable share payload snapshot without the original hero image uri', () => {
    expect(
      buildStableSocialSharePayloadSnapshot({
        variant: 'body',
        variantLabel: 'Body',
        score: 88,
        scoreLabel: 'Body score',
        heroImageUri: 'file:///scan-result.jpg',
        metrics: [],
        accentColor: '#000000',
        footerBrand: 'HEALTH SCAN',
        footerCta: 'Track your progress',
      }),
    ).toEqual(
      expect.objectContaining({
        variant: 'body',
        heroImageUri: null,
      }),
    );
  });

  it('rejects expiring or signed scan asset sources for stable social publishing', async () => {
    await expect(
      uploadSocialAssetFromUri({
        sourceUri:
          'https://test.supabase.co/storage/v1/object/sign/scan-images/user-1/tmp.jpg?token=expiring',
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({
      code: 'invalid_asset_source',
    });
  });

  it('uploads a native social image through the file-system base64 path', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          upload_id: '11111111-1111-4111-8111-111111111111',
          asset_path: 'user-1/posts/11111111-1111-4111-8111-111111111111.jpg',
          bucket: 'social-posts',
          mime_type: 'image/jpeg',
        }),
    });

    const result = await uploadSocialAssetFromUri({
      sourceUri: 'file:///photo.jpg',
      userId: 'user-1',
    });

    expect(mockManipulateAsync).toHaveBeenCalledWith(
      'file:///photo.jpg',
      [],
      expect.objectContaining({
        compress: 0.9,
        format: 'jpeg',
      }),
    );
    expect(mockGetInfoAsync).toHaveBeenCalledWith('manipulated-image-uri');
    expect(mockReadAsStringAsync).toHaveBeenCalledWith(
      'manipulated-image-uri',
      expect.objectContaining({
        encoding: 'base64',
      }),
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalledWith('manipulated-image-uri');
    expect(mockStorageFrom).toHaveBeenCalledWith('social-posts');
    expect(mockStorageUpload).toHaveBeenCalledWith(
      'user-1/posts/11111111-1111-4111-8111-111111111111.jpg',
      expect.any(ArrayBuffer),
      expect.objectContaining({
        contentType: 'image/jpeg',
        upsert: false,
      }),
    );
    expect(result).toEqual({
      uploadId: '11111111-1111-4111-8111-111111111111',
      assetPath: 'user-1/posts/11111111-1111-4111-8111-111111111111.jpg',
      assetUrl: 'https://cdn.example.com/social-post.jpg',
    });
  });

  it('surfaces a readable asset preparation error when the native file is unavailable', async () => {
    mockGetInfoAsync.mockResolvedValueOnce({ exists: false, size: null });

    await expect(
      uploadSocialAssetFromUri({
        sourceUri: 'file:///missing.jpg',
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({
      code: 'asset_prepare_failed',
      message: 'The image could not be prepared for upload.',
      status: 400,
    });

    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it('forwards the reserved asset path during create-post for deterministic backend resolution', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            upload_id: '11111111-1111-4111-8111-111111111111',
            asset_path: 'viewer-1/posts/11111111-1111-4111-8111-111111111111.jpg',
            bucket: 'social-posts',
            mime_type: 'image/jpeg',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            post_id: 'post-1',
            moderation_state: 'pending',
            published: false,
            asset_url: 'https://cdn.example.com/social-post.jpg',
            rate_limit: {
              allowed: true,
              limit_count: 3,
              window_seconds: 86400,
              recent_count: 0,
              retry_after_seconds: 0,
            },
            cooldown: {
              active: false,
              cooldown_until: null,
              recent_rejection_count: 0,
              rejection_threshold: 3,
              cooldown_hours: 24,
            },
          }),
      });

    await expect(
      createSocialPost({
        viewerProfile: {
          id: 'viewer-1',
          username: 'alice',
          avatar_url: null,
        },
        category: 'food',
        assetSourceUri: 'file:///photo.jpg',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'post-1',
        asset_path: 'viewer-1/posts/11111111-1111-4111-8111-111111111111.jpg',
        asset_url: 'https://cdn.example.com/social-post.jpg',
      }),
    );

    const createPostRequest = (global.fetch as jest.Mock).mock.calls[1]?.[1] as {
      body?: string;
    };
    expect(JSON.parse(createPostRequest.body ?? '{}')).toEqual(
      expect.objectContaining({
        category: 'food',
        upload_id: '11111111-1111-4111-8111-111111111111',
        reserved_asset_path:
          'viewer-1/posts/11111111-1111-4111-8111-111111111111.jpg',
      }),
    );
  });

  it('removes the uploaded social asset when post creation fails after upload', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            upload_id: '11111111-1111-4111-8111-111111111111',
            asset_path: 'viewer-1/posts/11111111-1111-4111-8111-111111111111.jpg',
            bucket: 'social-posts',
            mime_type: 'image/jpeg',
          }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () =>
          JSON.stringify({
            error: 'Backend exploded',
            code: 'social_post_create_failed',
          }),
      });

    await expect(
      createSocialPost({
        viewerProfile: {
          id: 'viewer-1',
          username: 'alice',
          avatar_url: null,
        },
        category: 'food',
        assetSourceUri: 'file:///photo.jpg',
      }),
    ).rejects.toMatchObject({
      code: 'social_post_create_failed',
      message: 'Backend exploded',
      status: 500,
    });

    expect(mockStorageRemove).toHaveBeenCalledWith([
      'viewer-1/posts/11111111-1111-4111-8111-111111111111.jpg',
    ]);
  });

  it('keeps the uploaded social asset when the backend accepts the post into pending moderation', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            upload_id: '22222222-2222-4222-8222-222222222222',
            asset_path: 'viewer-1/posts/22222222-2222-4222-8222-222222222222.jpg',
            bucket: 'social-posts',
            mime_type: 'image/jpeg',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            post_id: 'post-pending',
            moderation_state: 'pending',
            published: false,
            asset_url: 'https://cdn.example.com/social-post.jpg',
            rate_limit: {
              allowed: true,
              limit_count: 3,
              window_seconds: 86400,
              recent_count: 0,
              retry_after_seconds: 0,
            },
            cooldown: {
              active: false,
              cooldown_until: null,
              recent_rejection_count: 0,
              rejection_threshold: 3,
              cooldown_hours: 24,
            },
          }),
      });

    await expect(
      createSocialPost({
        viewerProfile: {
          id: 'viewer-1',
          username: 'alice',
          avatar_url: null,
        },
        category: 'food',
        assetSourceUri: 'file:///photo.jpg',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'post-pending',
        moderation_state: 'pending',
        moderation_status: 'pending',
        asset_path: 'viewer-1/posts/22222222-2222-4222-8222-222222222222.jpg',
        asset_url: 'https://cdn.example.com/social-post.jpg',
      }),
    );

    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it('uses the backend moderation state as the source of truth when publish is immediately approved', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          post_id: 'post-approved',
          moderation_state: 'approved',
          published: true,
          asset_url: null,
          rate_limit: {
            allowed: true,
            limit_count: 3,
            window_seconds: 86400,
            recent_count: 0,
            retry_after_seconds: 0,
          },
          cooldown: {
            active: false,
            cooldown_until: null,
            recent_rejection_count: 0,
            rejection_threshold: 3,
            cooldown_hours: 24,
          },
        }),
    });

    await expect(
      createSocialPost({
        viewerProfile: {
          id: 'viewer-1',
          username: 'alice',
          avatar_url: null,
        },
        category: 'food',
        contentText: 'Fresh meal',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'post-approved',
        moderation_state: 'approved',
        moderation_status: 'approved',
      }),
    );
  });

  it('uses the backend moderation state as the source of truth when comments are created as pending', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          comment_id: 'comment-pending',
          post_id: 'post-1',
          moderation_state: 'pending',
          published: false,
          rate_limit: {
            allowed: true,
            limit_count: 10,
            window_seconds: 3600,
            recent_count: 0,
            retry_after_seconds: 0,
          },
          cooldown: {
            active: false,
            cooldown_until: null,
            recent_rejection_count: 0,
            rejection_threshold: 3,
            cooldown_hours: 24,
          },
        }),
    });

    await expect(
      createSocialComment({
        viewerProfile: {
          id: 'viewer-1',
          username: 'alice',
          avatar_url: null,
        },
        postId: 'post-1',
        contentText: 'Nice progress',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'comment-pending',
        post_id: 'post-1',
        like_count: 0,
        viewer_has_liked: false,
        moderation_state: 'pending',
        moderation_status: 'pending',
        content_text: 'Nice progress',
      }),
    );
  });

  it('returns the validated server truth for social post reactions', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          post_id: 'post-1',
          viewer_reaction: 'like',
          like_count: 8,
          dislike_count: 3,
        }),
    });

    await expect(setReactionOnSocialPost('post-1', 'like')).resolves.toEqual({
      success: true,
      post_id: 'post-1',
      viewer_reaction: 'like',
      like_count: 8,
      dislike_count: 3,
    });
  });

  it('accepts the server truth for neutralized post reactions without changing the contract', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          post_id: 'post-1',
          viewer_reaction: 'neutral',
          like_count: 7,
          dislike_count: 1,
        }),
    });

    await expect(setReactionOnSocialPost('post-1', 'neutral')).resolves.toEqual({
      success: true,
      post_id: 'post-1',
      viewer_reaction: 'neutral',
      like_count: 7,
      dislike_count: 1,
    });
  });

  it('sends the exact post reaction payload to the edge function', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          post_id: 'post-1',
          viewer_reaction: 'dislike',
          like_count: 2,
          dislike_count: 7,
        }),
    });

    await setReactionOnSocialPost('post-1', 'dislike');

    const reactionRequest = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
      body?: string;
    };

    expect(JSON.parse(reactionRequest.body ?? '{}')).toEqual({
      post_id: 'post-1',
      reaction: 'dislike',
    });
  });

  it('propagates backend reaction diagnostics with code, status, request id, and details', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: 'Failed to update the social reaction',
          code: 'database_constraint_violation',
          status: 400,
          request_id: 'req-reaction',
          details: {
            source_code: '23503',
            relation: 'social_post_likes',
            column: 'user_id',
            rpc: 'set_social_post_reaction',
          },
        }),
    });

    await expect(setReactionOnSocialPost('post-1', 'like')).rejects.toMatchObject({
      message: 'Failed to update the social reaction',
      code: 'database_constraint_violation',
      status: 400,
      functionName: 'social-set-reaction',
      requestId: 'req-reaction',
      details: {
        source_code: '23503',
        relation: 'social_post_likes',
        column: 'user_id',
        rpc: 'set_social_post_reaction',
      },
    });
  });

  it.each([
    {
      label: 'success is missing',
      payload: {
        post_id: 'post-1',
        viewer_reaction: 'like',
        like_count: 8,
        dislike_count: 3,
      },
    },
    {
      label: 'success is false',
      payload: {
        success: false,
        post_id: 'post-1',
        viewer_reaction: 'like',
        like_count: 8,
        dislike_count: 3,
      },
    },
    {
      label: 'post_id does not match the requested post',
      payload: {
        success: true,
        post_id: 'post-2',
        viewer_reaction: 'like',
        like_count: 8,
        dislike_count: 3,
      },
    },
    {
      label: 'viewer_reaction is invalid',
      payload: {
        success: true,
        post_id: 'post-1',
        viewer_reaction: 'heart',
        like_count: 8,
        dislike_count: 3,
      },
    },
    {
      label: 'reaction counters are negative',
      payload: {
        success: true,
        post_id: 'post-1',
        viewer_reaction: 'like',
        like_count: -1,
        dislike_count: 3,
      },
    },
  ])(
    'rejects malformed social post reaction payloads when $label',
    async ({ payload }) => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(payload),
      });

      await expect(setReactionOnSocialPost('post-1', 'like')).rejects.toMatchObject({
        code: 'social_reaction_schema_mismatch',
        status: 503,
        functionName: 'social-set-reaction',
        message: 'Social reaction update returned malformed data.',
      });
    },
  );

  it('sends explicit like state for comment likes and returns the server truth', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          comment_id: 'comment-1',
          viewer_has_liked: true,
          like_count: 8,
        }),
    });

    await expect(setSocialCommentLike('comment-1', true)).resolves.toEqual({
      success: true,
      comment_id: 'comment-1',
      viewer_has_liked: true,
      like_count: 8,
    });

    const commentLikeRequest = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
      body?: string;
    };

    expect((global.fetch as jest.Mock).mock.calls[0]?.[0]).toEqual(
      expect.stringContaining('/social-set-comment-like'),
    );
    expect(JSON.parse(commentLikeRequest.body ?? '{}')).toEqual({
      comment_id: 'comment-1',
      liked: true,
    });
  });

  it('accepts the server truth for comment unlikes without changing the contract', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          comment_id: 'comment-1',
          viewer_has_liked: false,
          like_count: 2,
        }),
    });

    await expect(setSocialCommentLike('comment-1', false)).resolves.toEqual({
      success: true,
      comment_id: 'comment-1',
      viewer_has_liked: false,
      like_count: 2,
    });
  });

  it('propagates backend comment-like diagnostics with code, status, request id, and details', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: 'Failed to update the social comment like',
          code: 'database_constraint_violation',
          status: 400,
          request_id: 'req-comment-like',
          details: {
            source_code: '23503',
            relation: 'social_comment_likes',
            column: 'user_id',
            rpc: 'set_social_comment_like',
          },
        }),
    });

    await expect(setSocialCommentLike('comment-1', true)).rejects.toMatchObject({
      message: 'Failed to update the social comment like',
      code: 'database_constraint_violation',
      status: 400,
      functionName: 'social-set-comment-like',
      requestId: 'req-comment-like',
      details: {
        source_code: '23503',
        relation: 'social_comment_likes',
        column: 'user_id',
        rpc: 'set_social_comment_like',
      },
    });
  });

  it.each([
    {
      label: 'comment_id does not match the requested comment',
      payload: {
        success: true,
        comment_id: 'comment-2',
        viewer_has_liked: true,
        like_count: 8,
      },
    },
    {
      label: 'like_count is negative',
      payload: {
        success: true,
        comment_id: 'comment-1',
        viewer_has_liked: true,
        like_count: -1,
      },
    },
  ])(
    'rejects malformed social comment like payloads when $label',
    async ({ payload }) => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(payload),
      });

      await expect(setSocialCommentLike('comment-1', true)).rejects.toMatchObject({
        code: 'social_comment_like_schema_mismatch',
        status: 503,
        functionName: 'social-set-comment-like',
        message: 'Comment like update returned malformed data.',
      });
    },
  );

  it('uses the backend comment snapshot as the source of truth when updating a comment', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          comment: {
            id: 'comment-1',
            post_id: 'post-1',
            author_id: 'viewer-1',
            author_username: 'alice',
            author_avatar_url: null,
            content_text: 'Edited copy',
            created_at: '2026-04-06T10:00:00.000Z',
            like_count: 5,
            viewer_has_liked: false,
            moderation_status: 'pending',
            moderation_state: 'pending',
            moderation_reason: null,
            moderation_provider: null,
            rejection_count: 1,
            last_rejected_at: null,
            deleted_at: null,
          },
        }),
    });

    await expect(
      updateSocialComment('comment-1', '  Edited   copy  '),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'comment-1',
        content_text: 'Edited copy',
        moderation_status: 'pending',
        like_count: 5,
      }),
    );

    const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
      body?: string;
    };
    expect((global.fetch as jest.Mock).mock.calls[0]?.[0]).toEqual(
      expect.stringContaining('/social-update-comment'),
    );
    expect(JSON.parse(request.body ?? '{}')).toEqual({
      comment_id: 'comment-1',
      content_text: 'Edited copy',
    });
  });

  it('rejects malformed comment update payloads when the backend snapshot is invalid', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          comment: {
            post_id: 'post-1',
            content_text: 'Edited copy',
          },
        }),
    });

    await expect(
      updateSocialComment('comment-1', 'Edited copy'),
    ).rejects.toMatchObject({
      code: 'social_comment_schema_mismatch',
      status: 503,
      functionName: 'social-update-comment',
      message: 'Social comment mutation returned malformed data.',
    });
  });

  it('soft deletes a comment through the dedicated edge function and returns the server truth', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          comment_id: 'comment-1',
          post_id: 'post-1',
          deleted_at: '2026-04-15T10:00:00.000Z',
          moderation_state: 'removed',
        }),
    });

    await expect(deleteSocialComment('comment-1')).resolves.toEqual({
      success: true,
      comment_id: 'comment-1',
      post_id: 'post-1',
      deleted_at: '2026-04-15T10:00:00.000Z',
      moderation_state: 'removed',
    });
    expect((global.fetch as jest.Mock).mock.calls[0]?.[0]).toEqual(
      expect.stringContaining('/social-delete-comment'),
    );
  });

  it('rejects malformed comment delete payloads when required fields are missing', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          comment_id: 'comment-1',
          moderation_state: 'removed',
        }),
    });

    await expect(deleteSocialComment('comment-1')).rejects.toMatchObject({
      code: 'social_comment_delete_schema_mismatch',
      status: 503,
      functionName: 'social-delete-comment',
      message: 'Social comment deletion returned malformed data.',
    });
  });

  it('soft deletes a post through the dedicated edge function and returns the server truth', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          post_id: 'post-1',
          deleted_at: '2026-04-15T10:00:00.000Z',
          moderation_state: 'removed',
        }),
    });

    await expect(deleteSocialPost('post-1')).resolves.toEqual({
      success: true,
      post_id: 'post-1',
      deleted_at: '2026-04-15T10:00:00.000Z',
      moderation_state: 'removed',
    });

    const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
      body?: string;
    };
    expect((global.fetch as jest.Mock).mock.calls[0]?.[0]).toEqual(
      expect.stringContaining('/social-delete-post'),
    );
    expect(JSON.parse(request.body ?? '{}')).toEqual({
      post_id: 'post-1',
    });
  });

  it('rejects malformed post delete payloads when required fields are missing', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          post_id: 'post-1',
        }),
    });

    await expect(deleteSocialPost('post-1')).rejects.toMatchObject({
      code: 'social_post_delete_schema_mismatch',
      status: 503,
      functionName: 'social-delete-post',
      message: 'Social post deletion returned malformed data.',
    });
  });

  it('names the missing Social publish route when the create-post function is not deployed', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => '',
    });

    await expect(
      createSocialPost({
        viewerProfile: {
          id: 'viewer-1',
          username: 'alice',
          avatar_url: null,
        },
        category: 'food',
        contentText: 'Fresh meal',
      }),
    ).rejects.toMatchObject({
      code: 'edge_function_route_missing',
      status: 404,
      functionName: 'social-create-post',
      message: expect.stringContaining('social-create-post'),
    });
  });

  it('names the missing Social impression route when impressions cannot be recorded', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => '',
    });

    await expect(
      recordSocialPostImpressions(['post-1', 'post-2']),
    ).rejects.toMatchObject({
      code: 'edge_function_route_missing',
      status: 404,
      functionName: 'social-record-impressions',
      message: expect.stringContaining('social-record-impressions'),
    });
  });

  it('names the missing Social unique-view route when post views cannot be recorded', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => '',
    });

    await expect(
      recordSocialPostViews(['post-1', 'post-2']),
    ).rejects.toMatchObject({
      code: 'edge_function_route_missing',
      status: 404,
      functionName: 'social-record-post-views',
      message: expect.stringContaining('social-record-post-views'),
    });
  });

  it('names the missing Social update route when the comment update function is not deployed', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => '',
    });

    await expect(
      updateSocialComment('comment-1', 'Edited copy'),
    ).rejects.toMatchObject({
      code: 'edge_function_route_missing',
      status: 404,
      functionName: 'social-update-comment',
      message: expect.stringContaining('social-update-comment'),
    });
  });

  it('names the missing Social delete route when the comment delete function is not deployed', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => '',
    });

    await expect(deleteSocialComment('comment-1')).rejects.toMatchObject({
      code: 'edge_function_route_missing',
      status: 404,
      functionName: 'social-delete-comment',
      message: expect.stringContaining('social-delete-comment'),
    });
  });

  it('names the missing Social delete route when the post delete function is not deployed', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => '',
    });

    await expect(deleteSocialPost('post-1')).rejects.toMatchObject({
      code: 'edge_function_route_missing',
      status: 404,
      functionName: 'social-delete-post',
      message: expect.stringContaining('social-delete-post'),
    });
  });

  const optimisticReactionCases: Array<{
    label: string;
    post: SocialPost;
    nextReaction: SocialReactionState;
    expected: Partial<SocialPost>;
  }> = [
    {
      label: 'switching from like to dislike',
      post: {
        id: 'post-1',
        author_id: 'user-1',
        author_username: 'alice',
        author_avatar_url: null,
        category: 'food',
        content_text: 'Fresh meal',
        image_url: null,
        created_at: '2026-04-06T10:00:00.000Z',
        like_count: 4,
        dislike_count: 1,
        comment_count: 2,
        viewer_reaction: 'like' as const,
        viewer_has_liked: true,
        moderation_status: 'approved',
      },
      nextReaction: 'dislike' as const,
      expected: {
        viewer_reaction: 'dislike',
        viewer_has_liked: false,
        like_count: 3,
        dislike_count: 2,
      },
    },
    {
      label: 'liking from neutral',
      post: {
        id: 'post-1',
        author_id: 'user-1',
        author_username: 'alice',
        author_avatar_url: null,
        category: 'food',
        content_text: 'Fresh meal',
        image_url: null,
        created_at: '2026-04-06T10:00:00.000Z',
        like_count: 4,
        dislike_count: 1,
        comment_count: 2,
        viewer_reaction: 'neutral' as const,
        viewer_has_liked: false,
        moderation_status: 'approved',
      },
      nextReaction: 'like' as const,
      expected: {
        viewer_reaction: 'like',
        viewer_has_liked: true,
        like_count: 5,
        dislike_count: 1,
      },
    },
    {
      label: 'disliking from neutral',
      post: {
        id: 'post-1',
        author_id: 'user-1',
        author_username: 'alice',
        author_avatar_url: null,
        category: 'food',
        content_text: 'Fresh meal',
        image_url: null,
        created_at: '2026-04-06T10:00:00.000Z',
        like_count: 4,
        dislike_count: 1,
        comment_count: 2,
        viewer_reaction: 'neutral' as const,
        viewer_has_liked: false,
        moderation_status: 'approved',
      },
      nextReaction: 'dislike' as const,
      expected: {
        viewer_reaction: 'dislike',
        viewer_has_liked: false,
        like_count: 4,
        dislike_count: 2,
      },
    },
    {
      label: 'neutralizing a previous like',
      post: {
        id: 'post-1',
        author_id: 'user-1',
        author_username: 'alice',
        author_avatar_url: null,
        category: 'food',
        content_text: 'Fresh meal',
        image_url: null,
        created_at: '2026-04-06T10:00:00.000Z',
        like_count: 1,
        dislike_count: 1,
        comment_count: 2,
        viewer_reaction: 'like' as const,
        viewer_has_liked: true,
        moderation_status: 'approved',
      },
      nextReaction: 'neutral' as const,
      expected: {
        viewer_reaction: 'neutral',
        viewer_has_liked: false,
        like_count: 0,
        dislike_count: 1,
      },
    },
    {
      label: 'neutralizing a previous dislike without going negative',
      post: {
        id: 'post-1',
        author_id: 'user-1',
        author_username: 'alice',
        author_avatar_url: null,
        category: 'food',
        content_text: 'Fresh meal',
        image_url: null,
        created_at: '2026-04-06T10:00:00.000Z',
        like_count: 0,
        dislike_count: 0,
        comment_count: 2,
        viewer_reaction: 'dislike' as const,
        viewer_has_liked: false,
        moderation_status: 'approved',
      },
      nextReaction: 'neutral' as const,
      expected: {
        viewer_reaction: 'neutral',
        viewer_has_liked: false,
        like_count: 0,
        dislike_count: 0,
      },
    },
  ];

  it.each(optimisticReactionCases)(
    'updates reaction counts optimistically when $label',
    ({ post, nextReaction, expected }) => {
      expect(applyOptimisticReactionToSocialPost(post, nextReaction)).toEqual(
        expect.objectContaining(expected),
      );
    },
  );

  it('updates comment like counts optimistically when toggling the viewer like state', () => {
    expect(
      applyOptimisticLikeToSocialComment(
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'user-1',
          author_username: 'alice',
          author_avatar_url: null,
          content_text: 'Sharp progress',
          created_at: '2026-04-06T10:00:00.000Z',
          like_count: 4,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
        true,
      ),
    ).toEqual(
      expect.objectContaining({
        like_count: 5,
        viewer_has_liked: true,
      }),
    );

    expect(
      applyOptimisticLikeToSocialComment(
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'user-1',
          author_username: 'alice',
          author_avatar_url: null,
          content_text: 'Sharp progress',
          created_at: '2026-04-06T10:00:00.000Z',
          like_count: 0,
          viewer_has_liked: true,
          moderation_status: 'approved',
        },
        false,
      ),
    ).toEqual(
      expect.objectContaining({
        like_count: 0,
        viewer_has_liked: false,
      }),
    );
  });

  it('applies server reaction payloads as the single source of truth', () => {
    expect(
      applyServerReactionStateToSocialPost(
        {
          id: 'post-1',
          author_id: 'user-1',
          author_username: 'alice',
          author_avatar_url: null,
          category: 'food',
          content_text: 'Fresh meal',
          image_url: null,
          created_at: '2026-04-06T10:00:00.000Z',
          like_count: 1,
          dislike_count: 0,
          comment_count: 2,
          viewer_reaction: 'neutral',
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
        {
          success: true,
          post_id: 'post-1',
          viewer_reaction: 'like',
          like_count: 6,
          dislike_count: 2,
        },
      ),
    ).toEqual(
      expect.objectContaining({
        viewer_reaction: 'like',
        viewer_has_liked: true,
        like_count: 6,
        dislike_count: 2,
      }),
    );
  });

  it('applies server comment like payloads as the single source of truth', () => {
    expect(
      applyServerLikeStateToSocialComment(
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'user-1',
          author_username: 'alice',
          author_avatar_url: null,
          content_text: 'Sharp progress',
          created_at: '2026-04-06T10:00:00.000Z',
          like_count: 1,
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
        {
          success: true,
          comment_id: 'comment-1',
          viewer_has_liked: true,
          like_count: 6,
        },
      ),
    ).toEqual(
      expect.objectContaining({
        like_count: 6,
        viewer_has_liked: true,
      }),
    );
  });

  it('applies server neutral and unlike payloads without drifting the viewer state', () => {
    expect(
      applyServerReactionStateToSocialPost(
        {
          id: 'post-1',
          author_id: 'user-1',
          author_username: 'alice',
          author_avatar_url: null,
          category: 'food',
          content_text: 'Fresh meal',
          image_url: null,
          created_at: '2026-04-06T10:00:00.000Z',
          like_count: 4,
          dislike_count: 2,
          comment_count: 2,
          viewer_reaction: 'dislike',
          viewer_has_liked: false,
          moderation_status: 'approved',
        },
        {
          success: true,
          post_id: 'post-1',
          viewer_reaction: 'neutral',
          like_count: 4,
          dislike_count: 1,
        },
      ),
    ).toEqual(
      expect.objectContaining({
        viewer_reaction: 'neutral',
        viewer_has_liked: false,
        like_count: 4,
        dislike_count: 1,
      }),
    );

    expect(
      applyServerLikeStateToSocialComment(
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'user-1',
          author_username: 'alice',
          author_avatar_url: null,
          content_text: 'Sharp progress',
          created_at: '2026-04-06T10:00:00.000Z',
          like_count: 2,
          viewer_has_liked: true,
          moderation_status: 'approved',
        },
        {
          success: true,
          comment_id: 'comment-1',
          viewer_has_liked: false,
          like_count: 1,
        },
      ),
    ).toEqual(
      expect.objectContaining({
        like_count: 1,
        viewer_has_liked: false,
      }),
    );
  });

  it('updates a single comment like state without reordering a cached thread', () => {
    expect(
      updateSocialCommentLikeState(
        [
          {
            id: 'comment-1',
            post_id: 'post-1',
            author_id: 'user-1',
            author_username: 'alice',
            author_avatar_url: null,
            content_text: 'Sharp progress',
            created_at: '2026-04-06T10:00:00.000Z',
            like_count: 1,
            viewer_has_liked: false,
            moderation_status: 'approved',
          },
          {
            id: 'comment-2',
            post_id: 'post-1',
            author_id: 'user-2',
            author_username: 'bob',
            author_avatar_url: null,
            content_text: 'Keep going',
            created_at: '2026-04-06T10:05:00.000Z',
            like_count: 3,
            viewer_has_liked: false,
            moderation_status: 'approved',
          },
        ],
        'comment-2',
        (comment) => ({
          ...comment,
          like_count: 4,
          viewer_has_liked: true,
        }),
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'comment-1',
        like_count: 1,
        viewer_has_liked: false,
      }),
      expect.objectContaining({
        id: 'comment-2',
        like_count: 4,
        viewer_has_liked: true,
      }),
    ]);
  });

  it('uses the server viewer-visible comment count when it is present', () => {
    expect(
      getDisplayedSocialCommentCount({
        comment_count: 50,
        viewer_visible_comment_count: 55,
      }),
    ).toBe(55);
  });

  it('falls back to the backend approved count without a viewer-visible count', () => {
    expect(
      getDisplayedSocialCommentCount({
        comment_count: 50,
      }),
    ).toBe(50);
    expect(
      getDisplayedSocialCommentCount({
        comment_count: 50,
        viewer_visible_comment_count: null,
      }),
    ).toBe(50);
  });

  it('sanitizes displayed comment counts without deriving from loaded pages', () => {
    expect(
      getDisplayedSocialCommentCount({
        comment_count: 50,
        viewer_visible_comment_count: 500.9,
      }),
    ).toBe(500);
    expect(
      getDisplayedSocialCommentCount({
        comment_count: 50,
        viewer_visible_comment_count: -1,
      }),
    ).toBe(0);
    expect(
      getDisplayedSocialCommentCount({
        comment_count: 50,
        viewer_visible_comment_count: Number.NaN,
      }),
    ).toBe(50);
    expect(
      getDisplayedSocialCommentCount({
        comment_count: Number.POSITIVE_INFINITY,
        viewer_visible_comment_count: undefined,
      }),
    ).toBe(0);
  });

  it('flattens paginated comments in first-seen page order without duplicates', () => {
    const pages: SocialCommentsPage[] = [
      {
        items: [
          buildSocialComment({ id: 'comment-b', like_count: 2 }),
          buildSocialComment({ id: 'comment-dup', like_count: 1 }),
        ],
        next_cursor: '1|comment-dup',
      },
      {
        items: [
          buildSocialComment({ id: 'comment-a', like_count: 5 }),
          buildSocialComment({ id: 'comment-z', like_count: 5 }),
          buildSocialComment({
            id: 'comment-dup',
            content_text: 'Duplicate from a later page',
            like_count: 99,
          }),
        ],
        next_cursor: null,
      },
    ];

    expect(flattenSocialCommentsPages(pages).map((comment) => comment.id)).toEqual([
      'comment-b',
      'comment-dup',
      'comment-a',
      'comment-z',
    ]);
    expect(flattenSocialCommentsPages(pages).find(
      (comment) => comment.id === 'comment-dup',
    )).toEqual(expect.objectContaining({ like_count: 1 }));
  });

  it('prioritizes viewer comments above others without changing group order', () => {
    const comments = [
      buildSocialComment({ id: 'comment-other-1', author_id: 'author-1' }),
      buildSocialComment({ id: 'comment-own-1', author_id: 'viewer-1' }),
      buildSocialComment({ id: 'comment-other-2', author_id: 'author-2' }),
      buildSocialComment({ id: 'comment-own-2', author_id: 'viewer-1' }),
      buildSocialComment({ id: 'comment-other-3', author_id: 'author-3' }),
    ];

    expect(
      prioritizeViewerSocialComments(comments, 'viewer-1').map(
        (comment) => comment.id,
      ),
    ).toEqual([
      'comment-own-1',
      'comment-own-2',
      'comment-other-1',
      'comment-other-2',
      'comment-other-3',
    ]);
  });

  it('keeps the existing comment order when there is no current viewer', () => {
    const comments = [
      buildSocialComment({ id: 'comment-a', author_id: 'author-1' }),
      buildSocialComment({ id: 'comment-b', author_id: 'viewer-1' }),
    ];

    expect(prioritizeViewerSocialComments(comments, null)).toBe(comments);
    expect(prioritizeViewerSocialComments(comments, undefined)).toBe(comments);
  });

  it('keeps the existing comment order when the viewer has no comments', () => {
    const comments = [
      buildSocialComment({ id: 'comment-a', author_id: 'author-1' }),
      buildSocialComment({ id: 'comment-b', author_id: 'author-2' }),
    ];

    expect(prioritizeViewerSocialComments(comments, 'viewer-1')).toBe(comments);
  });

  it('upserts cached paginated comments without reordering visible comments', () => {
    const pages: SocialCommentsPage[] = [
      {
        items: [
          buildSocialComment({ id: 'comment-z', like_count: 5 }),
          buildSocialComment({ id: 'comment-a', like_count: 1 }),
        ],
        next_cursor: null,
      },
    ];

    const updatedPages = upsertSocialCommentInPages(
      pages,
      buildSocialComment({ id: 'comment-a', like_count: 6 }),
    );
    expect(flattenSocialCommentsPages(updatedPages).map((comment) => comment.id)).toEqual([
      'comment-z',
      'comment-a',
    ]);

    const withNewComment = upsertSocialCommentInPages(
      updatedPages,
      buildSocialComment({ id: 'comment-new', like_count: 0 }),
    );
    expect(
      flattenSocialCommentsPages(withNewComment).map((comment) => comment.id),
    ).toEqual(['comment-z', 'comment-a', 'comment-new']);
  });

  it('keeps cached paginated comment order stable after local like count patches', () => {
    const pages: SocialCommentsPage[] = [
      {
        items: [
          buildSocialComment({ id: 'comment-z', like_count: 5 }),
          buildSocialComment({ id: 'comment-a', like_count: 1 }),
        ],
        next_cursor: null,
      },
    ];

    const updatedPages = updateSocialCommentLikeStateInPages(
      pages,
      'comment-a',
      (comment) => ({ ...comment, like_count: 6, viewer_has_liked: true }),
    );

    expect(flattenSocialCommentsPages(updatedPages).map((comment) => comment.id)).toEqual([
      'comment-z',
      'comment-a',
    ]);
  });

  it('upserts an edited comment snapshot into the cached thread in place', () => {
    expect(
      upsertSocialCommentInThread(
        [
          {
            id: 'comment-1',
            post_id: 'post-1',
            author_id: 'user-1',
            author_username: 'alice',
            author_avatar_url: null,
            content_text: 'First',
            created_at: '2026-04-06T10:00:00.000Z',
            like_count: 0,
            viewer_has_liked: false,
            moderation_status: 'approved',
          },
          {
            id: 'comment-2',
            post_id: 'post-1',
            author_id: 'user-2',
            author_username: 'bob',
            author_avatar_url: null,
            content_text: 'Second',
            created_at: '2026-04-06T10:05:00.000Z',
            like_count: 0,
            viewer_has_liked: false,
            moderation_status: 'approved',
          },
        ],
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'user-1',
          author_username: 'alice',
          author_avatar_url: null,
          content_text: 'First edited',
          created_at: '2026-04-06T10:00:00.000Z',
          like_count: 4,
          viewer_has_liked: true,
          moderation_status: 'pending',
        },
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'comment-1',
        content_text: 'First edited',
        moderation_status: 'pending',
      }),
      expect.objectContaining({
        id: 'comment-2',
      }),
    ]);
  });

  it('removes a deleted comment from the cached thread', () => {
    expect(
      removeSocialCommentFromThread(
        [
          {
            id: 'comment-1',
            post_id: 'post-1',
            author_id: 'user-1',
            author_username: 'alice',
            author_avatar_url: null,
            content_text: 'First',
            created_at: '2026-04-06T10:00:00.000Z',
            like_count: 0,
            viewer_has_liked: false,
            moderation_status: 'approved',
          },
          {
            id: 'comment-2',
            post_id: 'post-1',
            author_id: 'user-2',
            author_username: 'bob',
            author_avatar_url: null,
            content_text: 'Second',
            created_at: '2026-04-06T10:05:00.000Z',
            like_count: 0,
            viewer_has_liked: false,
            moderation_status: 'approved',
          },
        ],
        'comment-1',
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'comment-2',
      }),
    ]);
  });

  it('dedupes and caps impression batches before sending them to the backend', () => {
    expect(
      normalizeSocialImpressionPostIds([
        'post-1',
        'post-1',
        'post-2',
        '',
        'post-3',
      ], 2),
    ).toEqual(['post-1', 'post-2']);
  });

  it('preserves the backend feed order instead of re-ranking posts on the client', async () => {
    supabase.rpc?.mockResolvedValueOnce({
      data: [
        {
          id: 'backend-first',
          author_id: 'user-1',
          category: 'food',
          content_text: 'Backend ranked first',
          created_at: '2026-04-06T08:00:00.000Z',
          like_count: 1,
          dislike_count: 0,
          comment_count: 0,
          impression_count: 5000,
          moderation_status: 'approved',
        },
        {
          id: 'backend-second',
          author_id: 'user-2',
          category: 'food',
          content_text: 'Backend ranked second',
          created_at: '2026-04-07T11:00:00.000Z',
          like_count: 9,
          dislike_count: 0,
          comment_count: 4,
          impression_count: 32,
          moderation_status: 'approved',
        },
      ],
      error: null,
    });

    const page = await fetchSocialFeed('all', null, 2);

    expect(page.items.map((item) => item.id)).toEqual([
      'backend-first',
      'backend-second',
    ]);
  });

  it('surfaces duplicate social reports from the backend as a conflict error', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: async () =>
        JSON.stringify({
          error: 'This content has already been reported by the current user',
          code: 'duplicate_report',
        }),
    });

    await expect(
      reportSocialContent({
        target_type: 'post',
        target_post_id: '99999999-9999-4999-8999-999999999999',
        reason_code: 'harassment',
      }),
    ).rejects.toMatchObject({
      code: 'duplicate_report',
      status: 409,
    });
  });
});
