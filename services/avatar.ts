import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodeBase64 } from 'base64-arraybuffer';

import { supabase } from '@/services/supabase';
import { uploadAuthenticatedStorageObject } from '@/services/authenticatedStorage';
import { logOperationalError } from '@/utils/observability';
import { normalizeTrustedImageUri } from '@/utils/urlSecurity';
import {
  AVATAR_OUTPUT_SIZE,
  normalizeAvatarCropSelection,
  type AvatarCropSelection,
} from '@/utils/avatarCrop';

const AVATAR_BUCKET = 'avatars';
const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
// Cache expire 60 s avant l'URL signée elle-même pour éviter de servir une
// URL périmée juste après un cache hit (P2-H Phase 2).
const AVATAR_SIGNED_URL_CACHE_TTL_MS = (AVATAR_SIGNED_URL_TTL_SECONDS - 60) * 1000;

const LOCAL_AVATAR_URI_PATTERN = /^(file|content):/i;

type CachedAvatarUrl = {
  signedUrl: string;
  expiresAt: number;
};

const avatarSignedUrlCache = new Map<string, CachedAvatarUrl>();

function normalizeAvatarValue(value?: string | null) {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function isRemoteAvatarUrl(value?: string | null) {
  const normalizedValue = normalizeAvatarValue(value);
  if (!normalizedValue) {
    return false;
  }

  return normalizeTrustedImageUri(normalizedValue) !== null
    && /^https:\/\//i.test(normalizedValue);
}

export function isLocalAvatarUri(value?: string | null) {
  const normalizedValue = normalizeAvatarValue(value);
  return normalizedValue ? LOCAL_AVATAR_URI_PATTERN.test(normalizedValue) : false;
}

export function isManagedAvatarReference(value?: string | null) {
  const normalizedValue = normalizeAvatarValue(value);
  if (!normalizedValue) {
    return false;
  }

  // Une URL distante (peu importe sa whitelist Supabase) ou une URI locale
  // n'est pas une référence "managée" (= path interne au bucket Supabase
  // Storage). Cela empêche `isManagedAvatarReference('https://attacker.com')`
  // de retourner true depuis que la whitelist a refusé l'URL.
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalizedValue)) {
    return false;
  }

  return !isRemoteAvatarUrl(normalizedValue) && !isLocalAvatarUri(normalizedValue);
}

export function buildCanonicalAvatarPath(
  userId: string,
  extension: 'jpg' | 'png' | 'webp' = 'jpg',
) {
  return `${userId}/avatar.${extension}`;
}

export function clearAvatarUrlCache(avatarReference?: string | null) {
  const normalizedReference = normalizeAvatarValue(avatarReference);
  if (!normalizedReference) {
    avatarSignedUrlCache.clear();
    return;
  }

  avatarSignedUrlCache.delete(normalizedReference);
}

function buildAvatarManipulationActions(cropSelection?: AvatarCropSelection | null) {
  const actions: Parameters<typeof ImageManipulator.manipulateAsync>[1] = [];
  const normalizedCrop = normalizeAvatarCropSelection(cropSelection);

  if (normalizedCrop) {
    actions.push({
      crop: {
        originX: normalizedCrop.originX,
        originY: normalizedCrop.originY,
        width: normalizedCrop.width,
        height: normalizedCrop.height,
      },
    });
  }

  actions.push({
    resize: {
      width: AVATAR_OUTPUT_SIZE,
      height: AVATAR_OUTPUT_SIZE,
    },
  });

  return actions;
}

export async function createPreparedAvatarLocalUri(
  uri: string,
  cropSelection?: AvatarCropSelection | null,
) {
  const manipulatedImage = await ImageManipulator.manipulateAsync(
    uri,
    buildAvatarManipulationActions(cropSelection),
    {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  return manipulatedImage.uri;
}

export async function prepareAvatarForUpload(
  uri: string,
  cropSelection?: AvatarCropSelection | null,
) {
  const manipulatedImage = await ImageManipulator.manipulateAsync(
    uri,
    buildAvatarManipulationActions(cropSelection),
    {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  if (Platform.OS === 'web') {
    const response = await fetch(manipulatedImage.uri);
    const blob = await response.blob();

    if (blob.size > MAX_AVATAR_SIZE_BYTES) {
      throw new Error('Image too large. Maximum 5MB.');
    }

    return {
      uri: manipulatedImage.uri,
      arrayBuffer: await blob.arrayBuffer(),
    };
  }

  const fileInfo = await FileSystem.getInfoAsync(manipulatedImage.uri);

  if (!fileInfo.exists) {
    throw new Error('Unable to load avatar image.');
  }

  if (
    typeof fileInfo.size === 'number' &&
    fileInfo.size > MAX_AVATAR_SIZE_BYTES
  ) {
    throw new Error('Image too large. Maximum 5MB.');
  }

  const base64Payload = await FileSystem.readAsStringAsync(
    manipulatedImage.uri,
    {
      encoding: FileSystem.EncodingType.Base64,
    },
  );

  if (!base64Payload) {
    throw new Error('Unable to load avatar image.');
  }

  return {
    uri: manipulatedImage.uri,
    arrayBuffer: decodeBase64(base64Payload),
  };
}

export async function uploadAvatarFromLocalUri(
  userId: string,
  uri: string,
  cropSelection?: AvatarCropSelection | null,
) {
  const preparedAvatar = await prepareAvatarForUpload(uri, cropSelection);
  const filePath = buildCanonicalAvatarPath(userId, 'jpg');

  const { error: uploadError } = await uploadAuthenticatedStorageObject({
    bucket: AVATAR_BUCKET,
    path: filePath,
    fileBody: preparedAvatar.arrayBuffer,
    ownerUserId: userId,
    context: 'avatar upload',
    fileOptions: {
      contentType: 'image/jpeg',
      upsert: true,
    },
  });

  if (uploadError) {
    throw uploadError;
  }

  clearAvatarUrlCache(filePath);

  return {
    avatarReference: filePath,
    localUri: preparedAvatar.uri,
  };
}

export async function resolveAvatarUrl(avatarReference?: string | null) {
  const normalizedReference = normalizeAvatarValue(avatarReference);
  if (!normalizedReference) {
    return null;
  }

  if (isLocalAvatarUri(normalizedReference)) {
    return normalizedReference;
  }

  if (/^https?:\/\//i.test(normalizedReference)) {
    const trustedRemoteUrl = normalizeTrustedImageUri(normalizedReference);
    if (!trustedRemoteUrl) {
      logOperationalError(
        '[Avatar] Rejected untrusted remote avatar URL',
        null,
        { context: 'avatar_remote_whitelist' },
      );
      return null;
    }
    return trustedRemoteUrl;
  }

  if (/^(data|content|javascript|file):/i.test(normalizedReference)) {
    if (LOCAL_AVATAR_URI_PATTERN.test(normalizedReference)) {
      return normalizedReference;
    }
    logOperationalError(
      '[Avatar] Rejected unsafe avatar URI scheme',
      null,
      { context: 'avatar_unsafe_scheme' },
    );
    return null;
  }

  const cachedResult = avatarSignedUrlCache.get(normalizedReference);
  if (cachedResult && cachedResult.expiresAt > Date.now()) {
    return cachedResult.signedUrl;
  }

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(normalizedReference, AVATAR_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    logOperationalError('[Avatar] Failed to resolve avatar URL', error, {
      bucket: AVATAR_BUCKET,
      context: 'avatar_signed_url',
    });
    return null;
  }

  avatarSignedUrlCache.set(normalizedReference, {
    signedUrl: data.signedUrl,
    expiresAt: Date.now() + AVATAR_SIGNED_URL_CACHE_TTL_MS,
  });

  return data.signedUrl;
}
