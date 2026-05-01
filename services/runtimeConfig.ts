import Constants from 'expo-constants';

type RuntimeConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  revenueCatIosApiKey: string | null;
  revenueCatAndroidApiKey: string | null;
  aptabaseAppKey: string | null;
  aptabaseHost: string | null;
};

type PublicConfigKey =
  | 'EXPO_PUBLIC_SUPABASE_URL'
  | 'EXPO_PUBLIC_SUPABASE_ANON_KEY'
  | 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY'
  | 'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY'
  | 'EXPO_PUBLIC_APTABASE_APP_KEY'
  | 'EXPO_PUBLIC_APTABASE_HOST';

function readExpoExtraValue(key: PublicConfigKey) {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = extra?.[key];

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readPublicConfigValue(key: PublicConfigKey) {
  const expoValue = readExpoExtraValue(key);
  if (expoValue) {
    return expoValue;
  }

  const processValue = process.env[key];
  return typeof processValue === 'string' && processValue.trim().length > 0
    ? processValue.trim()
    : null;
}

function requirePublicConfigValue(key: PublicConfigKey) {
  const value = readPublicConfigValue(key);
  if (!value) {
    throw new Error(`Missing required public config: ${key}`);
  }

  return value;
}

// P3-O Phase 2 — valide que la valeur ressemble bien à une URL Supabase HTTPS
// au startup. Empêche un tampering de config (typo, env var poussée
// accidentellement) qui pointerait l'app vers un faux backend.
function assertValidSupabaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid EXPO_PUBLIC_SUPABASE_URL: not a valid URL`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(
      `Invalid EXPO_PUBLIC_SUPABASE_URL: must be HTTPS (got "${parsed.protocol}")`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error(`Invalid EXPO_PUBLIC_SUPABASE_URL: must not contain credentials`);
  }

  // Tolère *.supabase.co et *.supabase.in (deux TLDs officiels Supabase)
  // sans imposer un projet ref précis (les déploiements de pre-prod / staging
  // peuvent avoir des refs différents).
  if (!/\.supabase\.(co|in)$/i.test(parsed.hostname)) {
    throw new Error(
      `Invalid EXPO_PUBLIC_SUPABASE_URL: hostname "${parsed.hostname}" is not a Supabase host`,
    );
  }

  return value;
}

let runtimeConfigCache: RuntimeConfig | null = null;

export function getRuntimeConfig(): RuntimeConfig {
  if (runtimeConfigCache) {
    return runtimeConfigCache;
  }

  runtimeConfigCache = {
    supabaseUrl: assertValidSupabaseUrl(
      requirePublicConfigValue('EXPO_PUBLIC_SUPABASE_URL'),
    ),
    supabaseAnonKey: requirePublicConfigValue('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
    revenueCatIosApiKey: readPublicConfigValue('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY'),
    revenueCatAndroidApiKey: readPublicConfigValue('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY'),
    aptabaseAppKey: readPublicConfigValue('EXPO_PUBLIC_APTABASE_APP_KEY'),
    aptabaseHost: readPublicConfigValue('EXPO_PUBLIC_APTABASE_HOST'),
  };

  return runtimeConfigCache;
}

export function getSupabaseFunctionUrl(functionName: string) {
  return `${getRuntimeConfig().supabaseUrl.replace(/\/+$/, '')}/functions/v1/${functionName}`;
}

export function resetRuntimeConfigForTests() {
  runtimeConfigCache = null;
}
