import { Image as RNImage } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

import { ApiError } from '@/services/api';
import { submitFridgeScanCapture } from '@/services/fridgeScan';
import { resetRuntimeConfigForTests } from '@/services/runtimeConfig';

const mockGetSession = jest.fn();
const mockFetch = jest.fn();

function createImageContextLostError() {
  return new Error(
    "Calling the 'renderAsync' function has failed\n-> Caused by: Image context has been lost",
  );
}

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
  let consoleErrorSpy: jest.SpyInstance;
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
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
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
    consoleErrorSpy.mockRestore();
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

  it('uses a guarded pre-encoded JPEG fallback when native rendering loses image context', async () => {
    jest
      .mocked(ImageManipulator.manipulateAsync)
      .mockRejectedValueOnce(createImageContextLostError());

    await expect(
      submitFridgeScanCapture({
        imageUri: 'file:///gallery-fridge.jpg',
        source: 'gallery',
        selectedMode: 'muscle_gain',
        locale: 'fr-FR',
        preEncodedJpeg: {
          base64: 'FALLBACK_IMAGE_BASE64',
          width: 1000,
          height: 800,
          source: 'gallery',
        },
        clientMetadata: {
          screen: 'fridge_scan',
        },
      }),
    ).resolves.toMatchObject({
      fridgeScanId: 'scan-1',
      status: 'queued',
      imagePath: 'user/fridge-scans/scan-1.jpg',
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      source: 'gallery',
      selected_mode: 'muscle_gain',
      image_base64: 'FALLBACK_IMAGE_BASE64',
      locale: 'fr-FR',
      client_metadata: {
        normalized_width: 1000,
        normalized_height: 800,
        normalization_fallback: 'pre_encoded_jpeg',
        normalization_fallback_source: 'gallery',
        screen: 'fridge_scan',
      },
    });
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[FridgeScanService] Fridge scan pre-encoded fallback used',
      expect.objectContaining({
        source: 'gallery',
        fallback_width: 1000,
        fallback_height: 800,
      }),
    );
    expect(JSON.stringify(consoleInfoSpy.mock.calls)).not.toContain(
      'FALLBACK_IMAGE_BASE64',
    );
  });

  it('rejects a missing pre-encoded fallback and keeps the normalization failure path', async () => {
    jest
      .mocked(ImageManipulator.manipulateAsync)
      .mockRejectedValueOnce(createImageContextLostError());

    await expect(
      submitFridgeScanCapture({
        imageUri: 'file:///gallery-fridge.jpg',
        source: 'gallery',
        selectedMode: 'diet',
        locale: 'fr-FR',
        preEncodedJpeg: {
          base64: null,
          width: 1000,
          height: 800,
          source: 'gallery',
        },
      }),
    ).rejects.toMatchObject({
      code: 'fridge_scan_image_normalization_failed',
      context: expect.objectContaining({
        stage: 'image_normalization',
      }),
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[FridgeScanService] Fridge scan pre-encoded fallback rejected',
      expect.objectContaining({
        reason: 'missing_base64',
        fallback_width: 1000,
        fallback_height: 800,
      }),
    );
  });

  it('rejects an oversized pre-encoded fallback and keeps the normalization failure path', async () => {
    const oversizedBase64 = 'A'.repeat(
      Math.ceil((6 * 1024 * 1024 * 4) / 3) + 4,
    );
    jest
      .mocked(ImageManipulator.manipulateAsync)
      .mockRejectedValueOnce(createImageContextLostError());

    await expect(
      submitFridgeScanCapture({
        imageUri: 'file:///gallery-fridge.jpg',
        source: 'gallery',
        selectedMode: 'diet',
        locale: 'fr-FR',
        preEncodedJpeg: {
          base64: oversizedBase64,
          width: 1000,
          height: 800,
          source: 'gallery',
        },
      }),
    ).rejects.toMatchObject({
      code: 'fridge_scan_image_normalization_failed',
      context: expect.objectContaining({
        stage: 'image_normalization',
      }),
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[FridgeScanService] Fridge scan pre-encoded fallback rejected',
      expect.objectContaining({
        reason: 'payload_too_large',
        fallback_width: 1000,
        fallback_height: 800,
      }),
    );
  });

  it('rejects an over-pixel pre-encoded fallback and keeps the normalization failure path', async () => {
    jest
      .mocked(ImageManipulator.manipulateAsync)
      .mockRejectedValueOnce(createImageContextLostError());

    await expect(
      submitFridgeScanCapture({
        imageUri: 'file:///gallery-fridge.jpg',
        source: 'gallery',
        selectedMode: 'diet',
        locale: 'fr-FR',
        preEncodedJpeg: {
          base64: 'FALLBACK_IMAGE_BASE64',
          width: 5000,
          height: 4000,
          source: 'gallery',
        },
      }),
    ).rejects.toMatchObject({
      code: 'fridge_scan_image_normalization_failed',
      context: expect.objectContaining({
        stage: 'image_normalization',
      }),
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[FridgeScanService] Fridge scan pre-encoded fallback rejected',
      expect.objectContaining({
        reason: 'pixel_budget_exceeded',
        fallback_width: 5000,
        fallback_height: 4000,
      }),
    );
  });

  it('keeps the image normalization stage when native normalization fails', async () => {
    jest
      .mocked(ImageManipulator.manipulateAsync)
      .mockRejectedValueOnce(new Error('native resize failed'));

    let thrownError: unknown;

    try {
      await submitFridgeScanCapture({
        imageUri: 'file:///fridge.jpg',
        source: 'camera',
        selectedMode: 'diet',
        locale: 'fr-FR',
        clientMetadata: {
          screen: 'fridge_scan',
        },
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(ApiError);
    expect(thrownError).toMatchObject({
      code: 'fridge_scan_image_normalization_failed',
      context: expect.objectContaining({
        stage: 'image_normalization',
      }),
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[FridgeScanService] Fridge scan image normalization failed',
      expect.objectContaining({
        code: 'fridge_scan_image_normalization_failed',
        stage: 'image_normalization',
      }),
    );
  });
});
