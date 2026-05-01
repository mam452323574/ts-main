export type SafeObservabilityValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type SafeObservabilityProperties = Record<
  string,
  SafeObservabilityValue
>;

const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|authorization|cookie|session|payload|details|webhook_text|response_text|raw_body|request_body|email|image[_-]?(?:base64|bytes|data|blob|buffer|content)|base64|^body$|^image$)/i;
const MAX_STRING_LENGTH = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function readOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizeString(value: string) {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH - 3)}...`
    : value;
}

export function sanitizeObservabilityProperties(
  properties?: SafeObservabilityProperties,
) {
  if (!properties) {
    return undefined;
  }

  const sanitizedEntries: Array<[string, string | number | boolean]> = [];

  for (const [key, value] of Object.entries(properties)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }

    if (typeof value === 'string') {
      sanitizedEntries.push([key, sanitizeString(value)]);
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      sanitizedEntries.push([key, value]);
    }
  }

  return sanitizedEntries.length > 0
    ? Object.fromEntries(sanitizedEntries)
    : undefined;
}

export function getSafeErrorTelemetry(error: unknown): SafeObservabilityProperties {
  if (!isRecord(error)) {
    if (error instanceof Error) {
      return {
        error_name: error.name,
        message: error.message,
      };
    }

    return {};
  }

  return {
    error_name:
      readOptionalString(error.name) ??
      (error instanceof Error ? error.name : null) ??
      undefined,
    message:
      readOptionalString(error.message) ??
      (error instanceof Error ? error.message : null) ??
      undefined,
    code:
      readOptionalString(error.code) ??
      readOptionalString(error.type) ??
      undefined,
    status: readOptionalNumber(error.status) ?? undefined,
    request_id:
      readOptionalString(error.requestId) ??
      readOptionalString(error.request_id) ??
      undefined,
    event_id:
      readOptionalString(error.eventId) ??
      readOptionalString(error.event_id) ??
      undefined,
    cancelled:
      typeof error.userCancelled === 'boolean'
        ? error.userCancelled
        : typeof error.cancelled === 'boolean'
          ? error.cancelled
          : undefined,
  };
}

function emitWithLevel(
  level: 'error' | 'warn',
  scope: string,
  error: unknown,
  properties?: SafeObservabilityProperties,
) {
  const metadata = sanitizeObservabilityProperties({
    ...properties,
    ...getSafeErrorTelemetry(error),
  });
  const logFn = level === 'warn' ? console.warn : console.error;

  if (metadata) {
    logFn(scope, metadata);
    return;
  }

  logFn(scope);
}

export function logOperationalError(
  scope: string,
  error: unknown,
  properties?: SafeObservabilityProperties,
) {
  emitWithLevel('error', scope, error, properties);
}

export function logExpectedFailure(
  scope: string,
  error: unknown,
  properties?: SafeObservabilityProperties,
) {
  emitWithLevel('warn', scope, error, properties);
}

export function logOperationalInfo(
  scope: string,
  properties?: SafeObservabilityProperties,
) {
  const metadata = sanitizeObservabilityProperties(properties);

  if (metadata) {
    console.info(scope, metadata);
    return;
  }

  console.info(scope);
}
