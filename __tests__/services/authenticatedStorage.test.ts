import {
  requireCurrentSessionForUser,
  uploadAuthenticatedStorageObject,
} from '@/services/authenticatedStorage';

const { supabase } = jest.requireMock('@/services/supabase') as {
  supabase: {
    auth: {
      getSession: jest.Mock;
    };
    storage: {
      from: jest.Mock;
    };
  };
};

const mockUpload = jest.fn();

describe('authenticated storage upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'scan-session-token',
          user: { id: 'user-1' },
        },
      },
    });
    supabase.storage.from.mockReturnValue({
      upload: mockUpload,
    });
    mockUpload.mockResolvedValue({
      data: { path: 'user-1/scans/scan-1.jpg' },
      error: null,
    });
  });

  it('uploads scan objects with the freshly verified session token', async () => {
    const fileBody = new ArrayBuffer(4);

    await uploadAuthenticatedStorageObject({
      bucket: 'scan-images',
      path: 'user-1/scans/scan-1.jpg',
      fileBody,
      ownerUserId: 'user-1',
      context: 'scan image upload',
      fileOptions: {
        contentType: 'image/jpeg',
        upsert: false,
      },
    });

    expect(supabase.storage.from).toHaveBeenCalledWith('scan-images');
    expect(mockUpload).toHaveBeenCalledWith(
      'user-1/scans/scan-1.jpg',
      fileBody,
      {
        contentType: 'image/jpeg',
        upsert: false,
        headers: {
          Authorization: 'Bearer scan-session-token',
        },
      },
    );
  });

  it('throws before storage when no current session exists', async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });

    await expect(
      requireCurrentSessionForUser('user-1', 'scan image upload'),
    ).rejects.toMatchObject({
      code: 'auth_session_required',
      expectedUserId: 'user-1',
      actualUserId: null,
    });
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it('throws before storage when the current session belongs to another user', async () => {
    supabase.auth.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'other-token',
          user: { id: 'other-user' },
        },
      },
    });

    await expect(
      uploadAuthenticatedStorageObject({
        bucket: 'scan-images',
        path: 'user-1/scans/scan-1.jpg',
        fileBody: new ArrayBuffer(4),
        ownerUserId: 'user-1',
        context: 'scan image upload',
        fileOptions: {
          contentType: 'image/jpeg',
          upsert: false,
        },
      }),
    ).rejects.toMatchObject({
      code: 'auth_session_mismatch',
      expectedUserId: 'user-1',
      actualUserId: 'other-user',
    });
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });
});
