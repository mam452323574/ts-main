import { Image as RNImage } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

import { submitFridgeScanCapture } from '@/services/fridgeScan';
import { resetRuntimeConfigForTests } from '@/services/runtimeConfig';

const mockGetSession = jest.fn();
const mockFetch = jest.fn();

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: {
    JPEG: 'jpeg',
  },
  manipulateAsync: jest.fn(),
}));

describe('FridgeScanService', () => {
  let consoleInfoSpy: jest.SpyInstance;
  let getSizeSpy: jest.SpyInstance;
  const previousSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const previousSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRuntimeConfigForTests();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test-ref.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'user-access-token',
        },
      },
    });
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          allowed: true,
          message: 'Fridge scan queued',
          request_id: 'req-1',
          remaining: 4,
          current_count: 1,
          limit: 5,
          is_premium_required: false,
          fridge_scan_id: 'scan-1',
          status: 'queued',
          image_path: 'user/fridge-scans/scan-1.jpg',
          selected_mode: 'diet',
        }),
        { status: 200, headers: { 'x-request-id': 'req-1' } },
      ),
    );
    global.fetch = mockFetch;
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    getSizeSpy = jest
      .spyOn(RNImage, 'getSize')
      .mockImplementation((_uri: string, success: (width: number, height: number) => void) => {
        success(1200, 900);
      });
    jest.mocked(ImageManipulator.manipulateAsync).mockResolvedValue({
      uri: 'file:///normalized.jpg',
      width: 1200,
      height: 900,
      base64: 'VERY_SECRET_IMAGE_BASE64',
    } as any);
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    getSizeSpy.mockRestore();
    if (previousSupabaseUrl === undefined) {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    } else {
      process.env.EXPO_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
    }
    if (previousSupabaseAnonKey === undefined) {
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = previousSupabaseAnonKey;
    }
    resetRuntimeConfigForTests();
  });

  it('sends the canonical submit payload and keeps image bytes out of logs', async () => {
    await expect(
      submitFridgeScanCapture({
        imageUri: 'file:///fridge.jpg',
        source: 'camera',
        selectedMode: 'diet',
        locale: 'fr-FR',
        clientMetadata: {
          screen: 'fridge_scan',
        },
      }),
    ).resolves.toMatchObject({
      fridgeScanId: 'scan-1',
      status: 'queued',
      imagePath: 'user/fridge-scans/scan-1.jpg',
      selectedMode: 'diet',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/functions\/v1\/fridge-scan-submit$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer user-access-token',
          'Content-Type': 'application/json',
        }),
      }),
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      source: 'camera',
      selected_mode: 'diet',
      image_base64: 'VERY_SECRET_IMAGE_BASE64',
      locale: 'fr-FR',
      client_metadata: {
        normalized_width: 1200,
        normalized_height: 900,
        screen: 'fridge_scan',
      },
    });

    const serializedLogs = JSON.stringify(consoleInfoSpy.mock.calls);
    expect(serializedLogs).toContain('upload_present');
    expect(serializedLogs).not.toContain('VERY_SECRET_IMAGE_BASE64');
    expect(serializedLogs).not.toContain('image_base64":"VERY_SECRET_IMAGE_BASE64');
  });
});
