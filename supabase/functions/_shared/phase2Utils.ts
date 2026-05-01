import { Phase2HttpError } from './phase2Errors.ts';
import type {
  Phase2ModerationState,
  Phase2SocialCategory,
} from './phase2Types.ts';
import { buildCanonicalScanImagePath as buildSharedCanonicalScanImagePath } from '../../../shared/scanContract.ts';

export const PHASE2_SOCIAL_BUCKET = 'social-posts';
export const PHASE2_SOCIAL_POST_MAX_LENGTH = 500;
export const PHASE2_SOCIAL_COMMENT_MAX_LENGTH = 280;
export const PHASE2_SOCIAL_REPORT_DETAILS_MAX_LENGTH = 500;
export const PHASE2_SOCIAL_MODERATION_NOTE_MAX_LENGTH = 500;
export const PHASE2_SOCIAL_IMPRESSION_BATCH_MAX = 20;
export const PHASE2_SOCIAL_REQUEST_MAX_BYTES = 32 * 1024;

const PHASE2_ALLOWED_SOCIAL_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const DISALLOWED_CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
const DISALLOWED_BIDI_CONTROL_PATTERN = /[\u202A-\u202E\u2066-\u2069]/u;
const DISALLOWED_INVISIBLE_FORMAT_PATTERN = /[\u00AD\u200B\u200E\u200F\u2060\uFEFF]/u;
const DISALLOWED_HTML_LIKE_PATTERN = /<\s*\/?\s*[a-zA-Z!?]/u;
const DISALLOWED_DANGEROUS_SCHEME_PATTERN = /\b(javascript|vbscript|data):/i;

const PHASE2_SOCIAL_CATEGORIES: readonly Phase2SocialCategory[] = [
  'before_after',
  'food',
  'physique',
] as const;

const PHASE2_SOCIAL_IMPRESSION_SOURCES = [
  'feed',
  'detail',
  'comments',
] as const;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function readOptionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

export function readOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeSocialText(value: string) {
  const normalizedValue = value.normalize('NFKC');

  if (normalizedValue.includes('\u0000')) {
    throw new Phase2HttpError(
      400,
      'invalid_text',
      'Text cannot contain null bytes',
    );
  }

  if (DISALLOWED_CONTROL_CHAR_PATTERN.test(normalizedValue)) {
    throw new Phase2HttpError(
      400,
      'invalid_text',
      'Text cannot contain control characters',
    );
  }

  if (DISALLOWED_BIDI_CONTROL_PATTERN.test(normalizedValue)) {
    throw new Phase2HttpError(
      400,
      'invalid_text',
      'Text contains unsupported directional control characters',
    );
  }

  if (DISALLOWED_INVISIBLE_FORMAT_PATTERN.test(normalizedValue)) {
    throw new Phase2HttpError(
      400,
      'invalid_text',
      'Text contains unsupported invisible characters',
    );
  }

  if (DISALLOWED_HTML_LIKE_PATTERN.test(normalizedValue)) {
    throw new Phase2HttpError(
      400,
      'invalid_text',
      'Text cannot contain HTML-like markup',
    );
  }

  if (DISALLOWED_DANGEROUS_SCHEME_PATTERN.test(normalizedValue)) {
    throw new Phase2HttpError(
      400,
      'invalid_text',
      'Text cannot contain unsupported URI schemes',
    );
  }

  return normalizedValue.replace(/\p{White_Space}+/gu, ' ').trim();
}

export function assertNoUnknownKeys(
  payload: Record<string, unknown>,
  allowedKeys: readonly string[],
  contextName = 'Request body',
) {
  const allowedKeySet = new Set(allowedKeys);
  const unknownKeys = Object.keys(payload).filter((key) => !allowedKeySet.has(key));

  if (unknownKeys.length > 0) {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      `${contextName} contains unsupported fields`,
      { unknown_keys: unknownKeys },
    );
  }
}

export function assertNormalizedTextLength(
  value: string,
  maxLength: number,
  fieldName: string,
) {
  if (Array.from(value).length > maxLength) {
    throw new Phase2HttpError(
      400,
      'text_too_long',
      `${fieldName} must be ${maxLength} characters or fewer`,
    );
  }
}

export function normalizeOptionalFreeText(
  value: unknown,
  options: {
    fieldName: string;
    maxLength: number;
    required?: boolean;
  },
) {
  if (typeof value !== 'string') {
    if (options.required) {
      throw new Phase2HttpError(
        400,
        'invalid_payload',
        `${options.fieldName} is required`,
      );
    }

    return undefined;
  }

  const normalizedValue = normalizeSocialText(value);
  if (!normalizedValue) {
    if (options.required) {
      throw new Phase2HttpError(
        400,
        'invalid_payload',
        `${options.fieldName} is required`,
      );
    }

    return undefined;
  }

  assertNormalizedTextLength(normalizedValue, options.maxLength, options.fieldName);
  return normalizedValue;
}

export async function readJsonBody(
  req: Request,
  options: {
    maxBytes?: number;
  } = {},
) {
  const maxBytes = options.maxBytes ?? Infinity;

  const contentLengthHeader = req.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredContentLength = Number(contentLengthHeader);
    if (Number.isFinite(declaredContentLength) && declaredContentLength > maxBytes) {
      throw new Phase2HttpError(
        413,
        'payload_too_large',
        `Request body must be ${maxBytes} bytes or fewer`,
      );
    }
  }

  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > maxBytes) {
      throw new Phase2HttpError(
        413,
        'payload_too_large',
        `Request body must be ${maxBytes} bytes or fewer`,
      );
    }

    return JSON.parse(rawBody);
  } catch (error) {
    if (error instanceof Phase2HttpError) {
      throw error;
    }

    throw new Phase2HttpError(400, 'invalid_json', 'Request body must be valid JSON');
  }
}

export function assertUuidLike(value: string | null, fieldName: string) {
  if (!value || !uuidPattern.test(value)) {
    throw new Phase2HttpError(400, 'invalid_uuid', `Invalid ${fieldName}`);
  }
}

export function validatePhase2SocialCategory(
  value: string | null,
): Phase2SocialCategory {
  if (value && PHASE2_SOCIAL_CATEGORIES.includes(value as Phase2SocialCategory)) {
    return value as Phase2SocialCategory;
  }

  throw new Phase2HttpError(
    400,
    'invalid_category',
    'category must be one of before_after, food, or physique',
  );
}

export function assertMaxTextLength(
  value: string,
  maxLength: number,
  fieldName: string,
) {
  assertNormalizedTextLength(value, maxLength, fieldName);
}

export function validateStableSocialAssetPath(rawPath: string) {
  const trimmedPath = rawPath.trim();

  if (!trimmedPath) {
    throw new Phase2HttpError(400, 'invalid_asset_path', 'Asset path cannot be empty');
  }

  const lowerPath = trimmedPath.toLowerCase();
  if (
    lowerPath.startsWith('http://') ||
    lowerPath.startsWith('https://') ||
    lowerPath.startsWith('data:') ||
    lowerPath.startsWith('file://') ||
    lowerPath.startsWith('exp://')
  ) {
    throw new Phase2HttpError(
      400,
      'invalid_asset_path',
      'Asset path must be a stable storage path, not a URL',
    );
  }

  if (trimmedPath.startsWith('/')) {
    throw new Phase2HttpError(
      400,
      'invalid_asset_path',
      'Asset path must not start with a slash',
    );
  }

  if (trimmedPath.includes('?') || trimmedPath.includes('#') || lowerPath.includes('scan-images')) {
    throw new Phase2HttpError(
      400,
      'invalid_asset_path',
      'Asset path must target a stable social asset',
    );
  }

  const segments = trimmedPath.split('/').filter((segment) => segment.length > 0);
  if (segments.length < 2) {
    throw new Phase2HttpError(
      400,
      'invalid_asset_path',
      'Asset path must include the user folder and a filename',
    );
  }

  return segments.join('/');
}

export function isSocialAssetOwnedByUser(userId: string, assetPath: string) {
  const segments = assetPath.split('/');
  return segments[0] === userId && segments[1] === 'posts';
}

export function normalizeSocialImageMimeType(value: unknown) {
  if (typeof value !== 'string') {
    throw new Phase2HttpError(400, 'invalid_mime_type', 'mime_type is required');
  }

  const normalizedMimeType = value.trim().toLowerCase();
  if (!PHASE2_ALLOWED_SOCIAL_IMAGE_MIME_TYPES.has(normalizedMimeType)) {
    throw new Phase2HttpError(
      400,
      'invalid_mime_type',
      'mime_type must be image/jpeg, image/jpg, image/png, or image/webp',
    );
  }

  return normalizedMimeType;
}

export function resolveImageExtensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      throw new Phase2HttpError(
        400,
        'invalid_mime_type',
        'Unsupported image mime_type',
      );
  }
}

export function buildReservedSocialUploadPath(
  userId: string,
  uploadId: string,
  mimeType: string,
) {
  return `${userId}/posts/${uploadId}.${resolveImageExtensionForMimeType(mimeType)}`;
}

export function buildCanonicalAvatarPath(
  userId: string,
  mimeType: string,
) {
  return `${userId}/avatar.${resolveImageExtensionForMimeType(mimeType)}`;
}

export function buildCanonicalScanImagePath(userId: string, scanId: string) {
  return buildSharedCanonicalScanImagePath(userId, scanId);
}

export function validateSocialImpressionSource(
  value: unknown,
  fallback: (typeof PHASE2_SOCIAL_IMPRESSION_SOURCES)[number] = 'feed',
) {
  return typeof value === 'string' &&
    (PHASE2_SOCIAL_IMPRESSION_SOURCES as readonly string[]).includes(value)
    ? (value as (typeof PHASE2_SOCIAL_IMPRESSION_SOURCES)[number])
    : fallback;
}

export function isCanonicalScanImagePath(
  userId: string,
  scanId: string,
  assetPath: string,
) {
  return assetPath === buildCanonicalScanImagePath(userId, scanId);
}

export function buildPublicStorageUrl(
  supabaseUrl: string,
  bucket: string,
  assetPath: string,
) {
  const normalizedUrl = supabaseUrl.replace(/\/+$/, '');
  return `${normalizedUrl}/storage/v1/object/public/${bucket}/${assetPath}`;
}

export function resolveQueuedModerationResult(): {
  moderation_state: Phase2ModerationState;
  published: boolean;
} {
  return {
    moderation_state: 'pending',
    published: false,
  };
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return `{${entries
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
    .join(',')}}`;
}

export async function sha256Hex(value: string) {
  const buffer = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildNormalizedPayloadHash(payload: Record<string, unknown>) {
  return sha256Hex(stableStringify(payload));
}
