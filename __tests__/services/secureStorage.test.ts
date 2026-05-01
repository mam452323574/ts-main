import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { secureStorage } from '@/services/secureStorage';

jest.mock('@/utils/observability', () => ({
  logOperationalError: jest.fn(),
}));

const originalOS = Platform.OS;

function setPlatformOS(value: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => value,
  });
}

describe('secureStorage adapter', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (SecureStore as unknown as { __resetSecureStoreMock: () => void }).__resetSecureStoreMock?.();
    setPlatformOS('ios');
  });

  afterAll(() => {
    setPlatformOS(originalOS);
  });

  it('persiste les valeurs via expo-secure-store sur iOS/Android', async () => {
    await secureStorage.setItem('supabase.auth.token', 'jwt-1');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'supabase.auth.token',
      'jwt-1'
    );

    const stored = await secureStorage.getItem('supabase.auth.token');
    expect(stored).toBe('jwt-1');
  });

  it('supprime la clé via deleteItemAsync', async () => {
    await secureStorage.setItem('supabase.auth.token', 'jwt-2');
    await secureStorage.removeItem('supabase.auth.token');

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      'supabase.auth.token'
    );

    const stored = await secureStorage.getItem('supabase.auth.token');
    expect(stored).toBeNull();
  });

  it('migre une session héritée depuis AsyncStorage vers SecureStore', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('legacy-jwt');

    const value = await secureStorage.getItem('supabase.auth.token');

    expect(value).toBe('legacy-jwt');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'supabase.auth.token',
      'legacy-jwt'
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      'supabase.auth.token'
    );
  });

  it('conserve une session hereditee trop volumineuse dans AsyncStorage', async () => {
    const hugeLegacySession = 'x'.repeat(4096);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(hugeLegacySession);

    const value = await secureStorage.getItem('supabase.auth.token');

    expect(value).toBe(hugeLegacySession);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith(
      'supabase.auth.token'
    );
  });

  it('retombe sur AsyncStorage pour les valeurs trop volumineuses', async () => {
    const huge = 'x'.repeat(4096);
    await secureStorage.setItem('big-blob', huge);

    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('big-blob', huge);
  });

  it('remplace une ancienne valeur SecureStore par le fallback AsyncStorage volumineux', async () => {
    const hugeSession = 'x'.repeat(4096);

    await secureStorage.setItem('supabase.auth.token', 'small-session');
    await secureStorage.setItem('supabase.auth.token', hugeSession);

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      'supabase.auth.token'
    );
    await expect(secureStorage.getItem('supabase.auth.token')).resolves.toBe(
      hugeSession
    );
  });

  it('supprime la valeur SecureStore stale quand setItemAsync echoue', async () => {
    await secureStorage.setItem('supabase.auth.token', 'old-session');
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('secure-store-unavailable')
    );

    await secureStorage.setItem('supabase.auth.token', 'new-session');

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'supabase.auth.token',
      'new-session'
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      'supabase.auth.token'
    );
    await expect(secureStorage.getItem('supabase.auth.token')).resolves.toBe(
      'new-session'
    );
  });

  it('utilise localStorage sur le web', async () => {
    setPlatformOS('web');
    const fakeStorage: Record<string, string> = {};
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => (key in fakeStorage ? fakeStorage[key] : null),
        setItem: (key: string, value: string) => {
          fakeStorage[key] = value;
        },
        removeItem: (key: string) => {
          delete fakeStorage[key];
        },
      } as Storage,
    });

    await secureStorage.setItem('web-key', 'web-value');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();

    const stored = await secureStorage.getItem('web-key');
    expect(stored).toBe('web-value');

    await secureStorage.removeItem('web-key');
    expect(await secureStorage.getItem('web-key')).toBeNull();
  });
});
