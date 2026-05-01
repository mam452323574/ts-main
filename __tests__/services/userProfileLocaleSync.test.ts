import * as Localization from 'expo-localization';

import { syncDeviceLocaleToProfile } from '@/services/userProfile';

const { supabase } = jest.requireMock('@/services/supabase') as {
  supabase: {
    from?: jest.Mock;
  };
};

const mockUpdateEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));
const mockFrom = jest.fn(() => ({ update: mockUpdate }));

const mockGetLocales = Localization.getLocales as unknown as jest.Mock;

describe('syncDeviceLocaleToProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.from = mockFrom;
    mockUpdateEq.mockResolvedValue({ data: null, error: null });
  });

  it('writes both fields when the profile has neither and the device exposes a regionCode', () => {
    mockGetLocales.mockReturnValueOnce([
      { languageTag: 'fr-FR', languageCode: 'fr', regionCode: 'FR' },
    ]);

    return syncDeviceLocaleToProfile(
      { id: 'user-1', language_code: null, country_code: null },
      'fr',
    ).then((result) => {
      expect(mockFrom).toHaveBeenCalledWith('user_profiles');
      expect(mockUpdate).toHaveBeenCalledWith({
        language_code: 'fr',
        country_code: 'FR',
      });
      expect(mockUpdateEq).toHaveBeenCalledWith('id', 'user-1');
      expect(result).toEqual({
        language_code: 'fr',
        country_code: 'FR',
        updated: true,
      });
    });
  });

  it('does not call .update() when both fields already match the device signals', async () => {
    mockGetLocales.mockReturnValueOnce([
      { languageTag: 'fr-FR', languageCode: 'fr', regionCode: 'FR' },
    ]);

    const result = await syncDeviceLocaleToProfile(
      { id: 'user-1', language_code: 'fr', country_code: 'FR' },
      'fr',
    );

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.updated).toBe(false);
    expect(result.language_code).toBe('fr');
    expect(result.country_code).toBe('FR');
  });

  it('skips country_code when the device returns a non-ISO regionCode', async () => {
    mockGetLocales.mockReturnValueOnce([
      { languageTag: 'es-419', languageCode: 'es', regionCode: '419' },
    ]);

    await syncDeviceLocaleToProfile(
      { id: 'user-2', language_code: null, country_code: null },
      'es',
    );

    expect(mockUpdate).toHaveBeenCalledWith({ language_code: 'es' });
  });

  it('only writes country_code when the language is already in sync', async () => {
    mockGetLocales.mockReturnValueOnce([
      { languageTag: 'en-US', languageCode: 'en', regionCode: 'US' },
    ]);

    await syncDeviceLocaleToProfile(
      { id: 'user-3', language_code: 'en', country_code: null },
      'en',
    );

    expect(mockUpdate).toHaveBeenCalledWith({ country_code: 'US' });
  });

  it('reports updated=false when the database write fails (no throw)', async () => {
    mockGetLocales.mockReturnValueOnce([
      { languageTag: 'de-DE', languageCode: 'de', regionCode: 'DE' },
    ]);
    mockUpdateEq.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied' },
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await syncDeviceLocaleToProfile(
      { id: 'user-4', language_code: null, country_code: null },
      'de',
    );

    expect(result.updated).toBe(false);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('returns updated=false without calling the DB when the device exposes no usable signal', async () => {
    mockGetLocales.mockReturnValueOnce([{ languageTag: 'xx', regionCode: null }]);

    const result = await syncDeviceLocaleToProfile(
      { id: 'user-5', language_code: 'fr', country_code: 'FR' },
      'fr',
    );

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.updated).toBe(false);
  });
});
