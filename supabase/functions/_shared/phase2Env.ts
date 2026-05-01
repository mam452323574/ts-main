import { Phase2HttpError } from './phase2Errors.ts';

const DEFAULT_REVENUECAT_API_BASE_URL = 'https://api.revenuecat.com';
const PHASE2_WEBHOOK_AUTH_HEADER_NAME_PATTERN =
  /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const PHASE2_WEBHOOK_AUTH_METHOD_ORDER = [
  'bearer',
  'header',
  'hmac',
] as const;

export type Phase2WebhookAuthMethod =
  (typeof PHASE2_WEBHOOK_AUTH_METHOD_ORDER)[number];

export type Phase2WebhookAuthMode =
  | 'none'
  | 'bearer'
  | 'header'
  | 'hmac'
  | 'bearer+header'
  | 'bearer+hmac'
  | 'header+hmac'
  | 'bearer+header+hmac';

export interface Phase2WebhookAuthConfig {
  mode: Phase2WebhookAuthMode;
  useBearer: boolean;
  useHeader: boolean;
  useHmac: boolean;
  bearerToken: string | null;
  secretHeaderName: string | null;
  secretHeaderValue: string | null;
  hmacSecret: string | null;
}

function readEnvValue(name: string) {
  const value = Deno.env.get(name);
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function readOptionalServerEnv(name: string) {
  return readEnvValue(name);
}

export function readOptionalServerEnvList(name: string) {
  const value = readEnvValue(name);
  if (value === null) {
    return null;
  }

  return value
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function createWebhookAuthConfigError(message: string) {
  return new Phase2HttpError(
    500,
    'invalid_webhook_auth_configuration',
    message,
  );
}

function parsePhase2WebhookAuthMethods(
  rawMode: string | null,
): Set<Phase2WebhookAuthMethod> {
  if (!rawMode) {
    return new Set();
  }

  const rawSegments = rawMode.split('+');
  if (rawSegments.some((segment) => segment.trim().length === 0)) {
    throw createWebhookAuthConfigError(
      'PHASE2_WEBHOOK_AUTH_MODE must be "none" or a "+"-joined combination of bearer, header, and hmac',
    );
  }

  const methods = new Set<Phase2WebhookAuthMethod>();

  for (const rawSegment of rawSegments) {
    const normalizedSegment = rawSegment.trim().toLowerCase();
    if (normalizedSegment === 'none') {
      if (rawSegments.length === 1) {
        return new Set();
      }

      throw createWebhookAuthConfigError(
        'PHASE2_WEBHOOK_AUTH_MODE cannot combine "none" with other auth methods',
      );
    }

    if (
      normalizedSegment !== 'bearer' &&
      normalizedSegment !== 'header' &&
      normalizedSegment !== 'hmac'
    ) {
      throw createWebhookAuthConfigError(
        'PHASE2_WEBHOOK_AUTH_MODE must be "none" or a "+"-joined combination of bearer, header, and hmac',
      );
    }

    const method = normalizedSegment as Phase2WebhookAuthMethod;
    if (methods.has(method)) {
      throw createWebhookAuthConfigError(
        'PHASE2_WEBHOOK_AUTH_MODE cannot include duplicate auth methods',
      );
    }

    methods.add(method);
  }

  return methods;
}

function normalizePhase2WebhookAuthMode(
  methods: Set<Phase2WebhookAuthMethod>,
): Phase2WebhookAuthMode {
  if (methods.size === 0) {
    return 'none';
  }

  return PHASE2_WEBHOOK_AUTH_METHOD_ORDER
    .filter((method) => methods.has(method))
    .join('+') as Phase2WebhookAuthMode;
}

function requirePhase2WebhookAuthEnv(
  name: string,
  message: string,
) {
  return requireServerEnv(name, {
    code: 'invalid_webhook_auth_configuration',
    message,
  });
}

function requirePhase2WebhookSecretHeaderName() {
  const headerName = requirePhase2WebhookAuthEnv(
    'PHASE2_WEBHOOK_SECRET_HEADER_NAME',
    'PHASE2_WEBHOOK_SECRET_HEADER_NAME is required when PHASE2_WEBHOOK_AUTH_MODE includes header',
  );

  if (!PHASE2_WEBHOOK_AUTH_HEADER_NAME_PATTERN.test(headerName)) {
    throw createWebhookAuthConfigError(
      'PHASE2_WEBHOOK_SECRET_HEADER_NAME must be a valid HTTP header name',
    );
  }

  return headerName;
}

export function requireServerEnv(
  name: string,
  options: {
    status?: number;
    code?: string;
    message?: string;
  } = {},
) {
  const value = readEnvValue(name);
  if (value) {
    return value;
  }

  throw new Phase2HttpError(
    options.status ?? 500,
    options.code ?? 'missing_server_configuration',
    options.message ?? `${name} is not configured`,
  );
}

export function getSupabaseServerConfig() {
  return {
    supabaseUrl: requireServerEnv('SUPABASE_URL', {
      code: 'missing_supabase_url',
      message: 'SUPABASE_URL is not configured',
    }),
    serviceRoleKey: requireServerEnv('SUPABASE_SERVICE_ROLE_KEY', {
      code: 'missing_supabase_service_role_key',
      message: 'SUPABASE_SERVICE_ROLE_KEY is not configured',
    }),
  };
}

export function getRevenueCatServerConfig() {
  return {
    apiBaseUrl:
      readOptionalServerEnv('REVENUECAT_API_BASE_URL') ??
      DEFAULT_REVENUECAT_API_BASE_URL,
    apiKey: requireServerEnv('REVENUECAT_API_KEY', {
      code: 'missing_revenuecat_api_key',
      message: 'REVENUECAT_API_KEY is not configured',
    }),
    premiumEntitlementId:
      readOptionalServerEnv('REVENUECAT_PREMIUM_ENTITLEMENT_ID') ?? 'premium',
    webhookAuthorization:
      readOptionalServerEnv('REVENUECAT_WEBHOOK_AUTHORIZATION') ??
      readOptionalServerEnv('REVENUECAT_WEBHOOK_SECRET'),
  };
}

export function getPhase2WebhookAuthConfig(): Phase2WebhookAuthConfig {
  const methods = parsePhase2WebhookAuthMethods(
    readOptionalServerEnv('PHASE2_WEBHOOK_AUTH_MODE'),
  );
  const useBearer = methods.has('bearer');
  const useHeader = methods.has('header');
  const useHmac = methods.has('hmac');

  return {
    mode: normalizePhase2WebhookAuthMode(methods),
    useBearer,
    useHeader,
    useHmac,
    bearerToken: useBearer
      ? requirePhase2WebhookAuthEnv(
        'PHASE2_WEBHOOK_BEARER_TOKEN',
        'PHASE2_WEBHOOK_BEARER_TOKEN is required when PHASE2_WEBHOOK_AUTH_MODE includes bearer',
      )
      : null,
    secretHeaderName: useHeader ? requirePhase2WebhookSecretHeaderName() : null,
    secretHeaderValue: useHeader
      ? requirePhase2WebhookAuthEnv(
        'PHASE2_WEBHOOK_SECRET_HEADER_VALUE',
        'PHASE2_WEBHOOK_SECRET_HEADER_VALUE is required when PHASE2_WEBHOOK_AUTH_MODE includes header',
      )
      : null,
    hmacSecret: useHmac
      ? requirePhase2WebhookAuthEnv(
        'PHASE2_WEBHOOK_HMAC_SECRET',
        'PHASE2_WEBHOOK_HMAC_SECRET is required when PHASE2_WEBHOOK_AUTH_MODE includes hmac',
      )
      : null,
  };
}

export function getOptionalWebhookUrl(envName: string) {
  return readOptionalServerEnv(envName) ?? '';
}

export function getOptionalSocialModerationWorkerHmacSecret() {
  return readOptionalServerEnv('PHASE2_SOCIAL_MODERATION_WORKER_HMAC_SECRET');
}

export function requireWebhookUrl(
  envName: string,
  options: {
    code?: string;
    message?: string;
  } = {},
) {
  return requireServerEnv(envName, {
    status: 503,
    code: options.code ?? 'missing_webhook_url',
    message: options.message ?? `${envName} is not configured`,
  });
}
