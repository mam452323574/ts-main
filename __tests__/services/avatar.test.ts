import {
  buildCanonicalAvatarPath,
  isLocalAvatarUri,
  isManagedAvatarReference,
  isRemoteAvatarUrl,
  uploadAvatarFromLocalUri,
} from '@/services/avatar';
import * as ImageManipulator from 'expo-image-manipulator';

const mockUpload = jest.fn();
const mockGetSession = jest.fn();

jest.mock('@/services/runtimeConfig', () => ({
  getRuntimeConfig: () => ({
    supabaseUrl: 'https://qpogulljnnacrxdjbwiz.supabase.co',
    supabaseAnonKey: 'test-anon-key',
    revenueCatIosApiKey: null,
    revenueCatAndroidApiKey: null,
    aptabaseAppKey: null,
    aptabaseHost: null,
  }),
  getSupabaseFunctionUrl: (name: string) =>
    `https://qpogulljnnacrxdjbwiz.supabase.co/functions/v1/${name}`,
}));

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
    storage: {
      from: jest.fn(() => ({
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed.example' },
          error: null,
        }),
        upload: (...args: unknown[]) => mockUpload(...args),
      })),
    },
  },
}));

jest.mock('@/utils/observability', () => ({
  logOperationalError: jest.fn(),
}));

describe('avatar — whitelist host (P2-A)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
          user: { id: 'user-id' },
        },
      },
    });
    mockUpload.mockResolvedValue({ data: { path: 'user-id/avatar.jpg' }, error: null });
  });

  it('rejette une URL HTTPS sur un host non Supabase', () => {
    expect(isRemoteAvatarUrl('https://attacker.com/pixel.gif')).toBe(false);
    expect(isRemoteAvatarUrl('https://evil.example/x.jpg')).toBe(false);
  });

  it("rejette une URL HTTP non HTTPS", () => {
    expect(
      isRemoteAvatarUrl('http://qpogulljnnacrxdjbwiz.supabase.co/x.jpg'),
    ).toBe(false);
  });

  it('accepte une URL HTTPS sur le host Supabase configuré', () => {
    expect(
      isRemoteAvatarUrl(
        'https://qpogulljnnacrxdjbwiz.supabase.co/storage/v1/object/sign/avatars/u/avatar.jpg',
      ),
    ).toBe(true);
  });

  it("accepte une URI locale file:// ou content://", () => {
    expect(isLocalAvatarUri('file:///tmp/foo.jpg')).toBe(true);
    expect(isLocalAvatarUri('content://media/external/images/123')).toBe(true);
  });

  it("rejette les schemes dangereux comme javascript: ou data:", () => {
    expect(isLocalAvatarUri('javascript:alert(1)')).toBe(false);
    expect(isLocalAvatarUri('data:image/png;base64,xxx')).toBe(false);
    expect(isRemoteAvatarUrl('javascript:alert(1)')).toBe(false);
  });

  it('considère une référence non-URL comme managed (path Supabase Storage)', () => {
    expect(isManagedAvatarReference('user-id/avatar.jpg')).toBe(true);
    expect(isManagedAvatarReference('https://attacker.com/x.jpg')).toBe(false);
  });

  it('construit le chemin canonique avatar', () => {
    expect(buildCanonicalAvatarPath('user-id')).toBe('user-id/avatar.jpg');
  });

  it('upload une URI locale vers le dossier du bon utilisateur', async () => {
    const result = await uploadAvatarFromLocalUri('user-id', 'file:///avatar.jpg');

    expect(mockUpload).toHaveBeenCalledWith(
      'user-id/avatar.jpg',
      expect.any(ArrayBuffer),
      {
        contentType: 'image/jpeg',
        upsert: true,
        headers: {
          Authorization: 'Bearer session-token',
        },
      },
    );
    expect(result.avatarReference).toBe('user-id/avatar.jpg');
  });

  it('applique le crop carre avant le resize quand une selection est fournie', async () => {
    await uploadAvatarFromLocalUri('user-id', 'file:///avatar.jpg', {
      originX: 12.3,
      originY: 44.6,
      width: 300,
      height: 300,
    });

    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///avatar.jpg',
      [
        {
          crop: {
            originX: 12,
            originY: 45,
            width: 300,
            height: 300,
          },
        },
        { resize: { width: 512, height: 512 } },
      ],
      {
        compress: 0.82,
        format: 'jpeg',
      },
    );
  });

  it('refuse l upload avatar si la session courante manque', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });

    await expect(
      uploadAvatarFromLocalUri('user-id', 'file:///avatar.jpg'),
    ).rejects.toMatchObject({
      code: 'auth_session_required',
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('refuse l upload avatar si la session courante appartient a un autre user', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'session-token',
          user: { id: 'other-user' },
        },
      },
    });

    await expect(
      uploadAvatarFromLocalUri('user-id', 'file:///avatar.jpg'),
    ).rejects.toMatchObject({
      code: 'auth_session_mismatch',
      expectedUserId: 'user-id',
      actualUserId: 'other-user',
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('propage les erreurs d upload avatar', async () => {
    mockUpload.mockResolvedValueOnce({
      data: null,
      error: new Error('upload failed'),
    });

    await expect(
      uploadAvatarFromLocalUri('user-id', 'file:///avatar.jpg'),
    ).rejects.toThrow('upload failed');
  });
});
