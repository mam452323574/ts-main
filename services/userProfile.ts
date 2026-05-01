import * as Localization from 'expo-localization';

import { supabase } from '@/services/supabase';
import type { LocaleCode } from '@/i18n/config';

const LANGUAGE_CODE_REGEX = /^[a-z]{2}$/;
const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;

export interface ProfileLocaleSyncResult {
  language_code: string | null;
  country_code: string | null;
  updated: boolean;
}

interface ProfileLocaleSyncInput {
  id: string;
  language_code?: string | null;
  country_code?: string | null;
}

function readDeviceCountryCode(): string | null {
  const raw = Localization.getLocales()[0]?.regionCode;
  if (typeof raw !== 'string') {
    return null;
  }
  const upper = raw.toUpperCase();
  return COUNTRY_CODE_REGEX.test(upper) ? upper : null;
}

export async function syncDeviceLocaleToProfile(
  profile: ProfileLocaleSyncInput,
  currentLocale: LocaleCode,
): Promise<ProfileLocaleSyncResult> {
  const desiredLanguage = LANGUAGE_CODE_REGEX.test(currentLocale)
    ? currentLocale
    : null;
  const desiredCountry = readDeviceCountryCode();

  const updates: Record<string, string | null> = {};
  if (desiredLanguage && desiredLanguage !== profile.language_code) {
    updates.language_code = desiredLanguage;
  }
  if (desiredCountry && desiredCountry !== profile.country_code) {
    updates.country_code = desiredCountry;
  }

  if (Object.keys(updates).length === 0) {
    return {
      language_code: profile.language_code ?? null,
      country_code: profile.country_code ?? null,
      updated: false,
    };
  }

  const { error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('id', profile.id);

  if (error) {
    console.warn('[userProfile.syncDeviceLocale] failed', error);
    return {
      language_code: profile.language_code ?? null,
      country_code: profile.country_code ?? null,
      updated: false,
    };
  }

  return {
    language_code: updates.language_code ?? profile.language_code ?? null,
    country_code: updates.country_code ?? profile.country_code ?? null,
    updated: true,
  };
}
