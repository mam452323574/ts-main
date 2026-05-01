import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  ShareStoryPayload,
  SocialComposerDraft,
  SocialComposerDraftAsset,
  SocialCategory,
} from '@/types';
import {
  parseShareStoryPayload,
  resolveDefaultSocialCategoryForSharePayload,
} from '@/utils/shareStory';

const SOCIAL_DRAFT_STORAGE_PREFIX = 'socialComposerDraft:';
const SOCIAL_DRAFT_INDEX_KEY = 'socialComposerDraft:index';
const SOCIAL_COMPOSER_DRAFT_VERSION = 1 as const;
const SOCIAL_DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function buildDraftStorageKey(draftId: string) {
  return `${SOCIAL_DRAFT_STORAGE_PREFIX}${draftId}`;
}

function createDraftId() {
  return `draft_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSocialCategory(value: unknown): value is SocialCategory {
  return value === 'before_after' || value === 'food' || value === 'physique';
}

function isValidDraftAsset(value: unknown): value is SocialComposerDraftAsset {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return false;
  }

  if (value.kind === 'none') {
    return true;
  }

  if (value.kind === 'local_image') {
    return typeof value.imageUri === 'string' && value.imageUri.trim().length > 0;
  }

  if (value.kind === 'share_story') {
    return parseShareStoryPayload(value.payload) !== null;
  }

  return false;
}

function normalizeDraftAsset(asset: SocialComposerDraftAsset): SocialComposerDraftAsset {
  if (asset.kind !== 'share_story') {
    return asset;
  }

  const parsedPayload = parseShareStoryPayload(asset.payload);
  if (!parsedPayload) {
    throw new Error('Invalid share story payload');
  }

  return {
    kind: 'share_story',
    payload: parsedPayload,
  };
}

function parseSocialComposerDraft(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(value) as unknown;
    if (!isRecord(parsedValue)) {
      return null;
    }

    if (
      parsedValue.version !== SOCIAL_COMPOSER_DRAFT_VERSION ||
      typeof parsedValue.id !== 'string' ||
      typeof parsedValue.source !== 'string' ||
      !isSocialCategory(parsedValue.category) ||
      typeof parsedValue.caption !== 'string' ||
      typeof parsedValue.createdAt !== 'string' ||
      typeof parsedValue.updatedAt !== 'string' ||
      !isValidDraftAsset(parsedValue.asset)
    ) {
      return null;
    }

    const normalizedAsset =
      parsedValue.asset.kind === 'share_story'
        ? normalizeDraftAsset(parsedValue.asset)
        : parsedValue.asset;

    return {
      version: SOCIAL_COMPOSER_DRAFT_VERSION,
      id: parsedValue.id,
      source:
        parsedValue.source === 'share_story' ? 'share_story' : 'composer',
      scanId:
        typeof parsedValue.scanId === 'string' && parsedValue.scanId.trim().length > 0
          ? parsedValue.scanId
          : null,
      category: parsedValue.category,
      caption: parsedValue.caption,
      asset: normalizedAsset,
      createdAt: parsedValue.createdAt,
      updatedAt: parsedValue.updatedAt,
    } satisfies SocialComposerDraft;
  } catch {
    return null;
  }
}

async function readDraftIndex() {
  const serializedIndex = await AsyncStorage.getItem(SOCIAL_DRAFT_INDEX_KEY);
  if (!serializedIndex) {
    return [] as string[];
  }

  try {
    const parsedIndex = JSON.parse(serializedIndex);
    return Array.isArray(parsedIndex)
      ? parsedIndex.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        )
      : [];
  } catch {
    return [];
  }
}

async function writeDraftIndex(draftIds: string[]) {
  await AsyncStorage.setItem(
    SOCIAL_DRAFT_INDEX_KEY,
    JSON.stringify(Array.from(new Set(draftIds))),
  );
}

export async function cleanupStaleSocialComposerDrafts(now = Date.now()) {
  const draftIds = await readDraftIndex();
  const activeDraftIds: string[] = [];

  for (const draftId of draftIds) {
    const serializedDraft = await AsyncStorage.getItem(buildDraftStorageKey(draftId));
    const parsedDraft = parseSocialComposerDraft(serializedDraft);
    const updatedAtMs = parsedDraft ? Date.parse(parsedDraft.updatedAt) : Number.NaN;
    const isStale =
      !parsedDraft ||
      !Number.isFinite(updatedAtMs) ||
      now - updatedAtMs > SOCIAL_DRAFT_MAX_AGE_MS;

    if (isStale) {
      await AsyncStorage.removeItem(buildDraftStorageKey(draftId));
      continue;
    }

    activeDraftIds.push(draftId);
  }

  await writeDraftIndex(activeDraftIds);
}

export async function saveSocialComposerDraft(
  draft: Omit<SocialComposerDraft, 'id' | 'version' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<SocialComposerDraft, 'id' | 'createdAt'>>,
) {
  await cleanupStaleSocialComposerDrafts();

  const nowIso = new Date().toISOString();
  const draftId = draft.id ?? createDraftId();
  const normalizedDraft: SocialComposerDraft = {
    version: SOCIAL_COMPOSER_DRAFT_VERSION,
    id: draftId,
    source: draft.source,
    scanId: draft.scanId ?? null,
    category: draft.category,
    caption: draft.caption,
    asset: normalizeDraftAsset(draft.asset),
    createdAt: draft.createdAt ?? nowIso,
    updatedAt: nowIso,
  };

  await AsyncStorage.setItem(
    buildDraftStorageKey(draftId),
    JSON.stringify(normalizedDraft),
  );

  const nextDraftIndex = await readDraftIndex();
  await writeDraftIndex([...nextDraftIndex, draftId]);

  return normalizedDraft;
}

export async function getSocialComposerDraft(draftId?: string | null) {
  if (!draftId) {
    return null;
  }

  const serializedDraft = await AsyncStorage.getItem(buildDraftStorageKey(draftId));
  const parsedDraft = parseSocialComposerDraft(serializedDraft);
  if (!parsedDraft) {
    await removeSocialComposerDraft(draftId);
    return null;
  }

  const updatedAtMs = Date.parse(parsedDraft.updatedAt);
  if (
    !Number.isFinite(updatedAtMs) ||
    Date.now() - updatedAtMs > SOCIAL_DRAFT_MAX_AGE_MS
  ) {
    await removeSocialComposerDraft(draftId);
    return null;
  }

  return parsedDraft;
}

export async function removeSocialComposerDraft(draftId?: string | null) {
  if (!draftId) {
    return;
  }

  await AsyncStorage.removeItem(buildDraftStorageKey(draftId));
  const draftIds = await readDraftIndex();
  await writeDraftIndex(draftIds.filter((currentDraftId) => currentDraftId !== draftId));
}

export async function saveShareStorySocialComposerDraft(input: {
  payload: ShareStoryPayload;
  scanId?: string | null;
  caption?: string;
  category?: SocialCategory | null;
}) {
  const parsedPayload = parseShareStoryPayload(input.payload);
  if (!parsedPayload) {
    throw new Error('Invalid share story payload');
  }

  return saveSocialComposerDraft({
    source: 'share_story',
    scanId: input.scanId ?? null,
    category:
      input.category ?? resolveDefaultSocialCategoryForSharePayload(parsedPayload),
    caption: input.caption ?? '',
    asset: {
      kind: 'share_story',
      payload: parsedPayload,
    },
  });
}

export {
  SOCIAL_COMPOSER_DRAFT_VERSION,
  SOCIAL_DRAFT_MAX_AGE_MS,
};
