const MAX_DEEP_LINK_PAYLOAD_BYTES = 64 * 1024;
const DISALLOWED_CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
const DISALLOWED_BIDI_CONTROL_PATTERN = /[\u202A-\u202E\u2066-\u2069]/u;

function getByteLength(value: string) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}

function readSerializedParam(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return null;
  }
  return candidate;
}

export function safeParseJsonRouteParam(
  value: string | string[] | undefined,
): unknown {
  const serialized = readSerializedParam(value);
  if (!serialized) {
    return null;
  }

  if (getByteLength(serialized) > MAX_DEEP_LINK_PAYLOAD_BYTES) {
    return null;
  }

  if (
    DISALLOWED_CONTROL_CHAR_PATTERN.test(serialized) ||
    DISALLOWED_BIDI_CONTROL_PATTERN.test(serialized)
  ) {
    return null;
  }

  try {
    return JSON.parse(serialized);
  } catch {
    return null;
  }
}

export function safeReadStringRouteParam(
  value: string | string[] | undefined,
): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return undefined;
  }

  if (getByteLength(candidate) > MAX_DEEP_LINK_PAYLOAD_BYTES) {
    return undefined;
  }

  if (
    DISALLOWED_CONTROL_CHAR_PATTERN.test(candidate) ||
    DISALLOWED_BIDI_CONTROL_PATTERN.test(candidate)
  ) {
    return undefined;
  }

  return candidate;
}
