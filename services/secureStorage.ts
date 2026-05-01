import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { logOperationalError } from '@/utils/observability';

// Adapter compatible avec l'option `auth.storage` de @supabase/supabase-js.
// Utilise expo-secure-store sur iOS/Android (Keychain / EncryptedSharedPreferences),
// avec fallback localStorage sur le web.
//
// Migration : si une session a déjà été persistée sous AsyncStorage par une
// version précédente de l'app, on la rapatrie vers SecureStore au premier
// accès et on supprime la version AsyncStorage. Voir P0-1 dans
// FRONTEND_SECURITY_AUDIT.md.

const SECURE_STORE_VALUE_LIMIT = 2048;

function isSecureStoreAvailable(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function sanitizeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function removeSecureStoreItem(key: string, logPrefix: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(sanitizeKey(key));
  } catch (error) {
    logOperationalError(logPrefix, error, { key });
  }
}

const webStorage = {
  async getItem(key: string): Promise<string | null> {
    if (typeof globalThis === 'undefined') {
      return null;
    }
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    if (!storage) {
      return null;
    }
    return storage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    if (!storage) {
      return;
    }
    storage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    if (!storage) {
      return;
    }
    storage.removeItem(key);
  },
};

async function migrateLegacyAsyncStorageItem(key: string): Promise<string | null> {
  try {
    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue == null) {
      return null;
    }

    if (!isSecureStoreAvailable() || legacyValue.length > SECURE_STORE_VALUE_LIMIT) {
      return legacyValue;
    }

    try {
      await SecureStore.setItemAsync(sanitizeKey(key), legacyValue);
    } catch (error) {
      logOperationalError('[SecureStorage] Failed to copy legacy item', error, {
        key,
      });
      return legacyValue;
    }

    await AsyncStorage.removeItem(key);
    return legacyValue;
  } catch (error) {
    logOperationalError('[SecureStorage] Failed to migrate legacy item', error, {
      key,
    });
    return null;
  }
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!isSecureStoreAvailable()) {
      return webStorage.getItem(key);
    }

    try {
      const stored = await SecureStore.getItemAsync(sanitizeKey(key));
      if (stored != null) {
        return stored;
      }
    } catch (error) {
      logOperationalError('[SecureStorage] getItem failed', error, { key });
    }

    return migrateLegacyAsyncStorageItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!isSecureStoreAvailable()) {
      await webStorage.setItem(key, value);
      return;
    }

    if (value.length > SECURE_STORE_VALUE_LIMIT) {
      // SecureStore Android (EncryptedSharedPreferences) a une limite de
      // taille pratique. Au-delà, on retombe sur AsyncStorage pour ne pas
      // bloquer le flux d'auth — c'est le comportement par défaut de
      // certains adapters Supabase. Cas rare en pratique (sessions JWT < 2 KB).
      await AsyncStorage.setItem(key, value);
      await removeSecureStoreItem(
        key,
        '[SecureStorage] Failed to clear stale SecureStore item',
      );
      return;
    }

    try {
      await SecureStore.setItemAsync(sanitizeKey(key), value);
      // Nettoie une éventuelle copie AsyncStorage du même item (post-migration).
      await AsyncStorage.removeItem(key).catch(() => undefined);
    } catch (error) {
      logOperationalError('[SecureStorage] setItem failed', error, { key });
      await AsyncStorage.setItem(key, value);
      await removeSecureStoreItem(
        key,
        '[SecureStorage] Failed to clear stale SecureStore item',
      );
    }
  },

  async removeItem(key: string): Promise<void> {
    if (!isSecureStoreAvailable()) {
      await webStorage.removeItem(key);
      return;
    }

    await removeSecureStoreItem(key, '[SecureStorage] removeItem failed');
    await AsyncStorage.removeItem(key).catch(() => undefined);
  },
};
