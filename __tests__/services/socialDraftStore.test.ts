import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  SOCIAL_DRAFT_MAX_AGE_MS,
  cleanupStaleSocialComposerDrafts,
  getSocialComposerDraft,
  removeSocialComposerDraft,
  saveSocialComposerDraft,
  saveShareStorySocialComposerDraft,
} from '@/services/socialDraftStore';

describe('socialDraftStore', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('stores and retrieves a typed composer draft', async () => {
    const savedDraft = await saveSocialComposerDraft({
      source: 'share_story',
      scanId: 'scan-1',
      category: 'food',
      caption: 'Meal prep',
      asset: {
        kind: 'share_story',
        payload: {
          variant: 'nutrition',
          variantLabel: 'Nutrition',
          score: 80,
          scoreLabel: 'Score',
          heroImageUri: 'file:///meal.jpg',
          metrics: [],
          accentColor: '#FF9500',
          footerBrand: 'HEALTH SCAN',
          footerCta: '',
        },
      },
    });

    const loadedDraft = await getSocialComposerDraft(savedDraft.id);

    expect(loadedDraft).toEqual(
      expect.objectContaining({
        id: savedDraft.id,
        version: 1,
        source: 'share_story',
        category: 'food',
        caption: 'Meal prep',
      }),
    );
  });

  it('builds a first-class share-story draft with a derived social category', async () => {
    const savedDraft = await saveShareStorySocialComposerDraft({
      scanId: 'scan-typed-1',
      payload: {
        variant: 'nutrition',
        variantLabel: 'Nutrition',
        score: 80,
        scoreLabel: 'Score',
        heroImageUri: 'file:///meal.jpg',
        metrics: [],
        accentColor: '#FF9500',
        footerBrand: 'HEALTH SCAN',
        footerCta: '',
      },
    });

    const loadedDraft = await getSocialComposerDraft(savedDraft.id);

    expect(loadedDraft).toEqual(
      expect.objectContaining({
        source: 'share_story',
        scanId: 'scan-typed-1',
        category: 'food',
        asset: {
          kind: 'share_story',
          payload: expect.objectContaining({
            variant: 'nutrition',
            heroImageUri: 'file:///meal.jpg',
          }),
        },
      }),
    );
  });

  it('removes a draft cleanly after success', async () => {
    const savedDraft = await saveSocialComposerDraft({
      source: 'composer',
      scanId: null,
      category: 'physique',
      caption: '',
      asset: { kind: 'none' },
    });

    await removeSocialComposerDraft(savedDraft.id);

    await expect(getSocialComposerDraft(savedDraft.id)).resolves.toBeNull();
  });

  it('cleans up stale drafts and invalid versions', async () => {
    await AsyncStorage.setItem(
      'socialComposerDraft:stale-draft',
      JSON.stringify({
        version: 1,
        id: 'stale-draft',
        source: 'composer',
        scanId: null,
        category: 'physique',
        caption: '',
        asset: { kind: 'none' },
        createdAt: '2026-04-01T10:00:00.000Z',
        updatedAt: '2026-04-01T10:00:00.000Z',
      }),
    );
    await AsyncStorage.setItem(
      'socialComposerDraft:invalid-version',
      JSON.stringify({
        version: 99,
        id: 'invalid-version',
      }),
    );
    await AsyncStorage.setItem(
      'socialComposerDraft:index',
      JSON.stringify(['stale-draft', 'invalid-version']),
    );

    await cleanupStaleSocialComposerDrafts(
      Date.parse('2026-04-01T10:00:00.000Z') + SOCIAL_DRAFT_MAX_AGE_MS + 1000,
    );

    await expect(getSocialComposerDraft('stale-draft')).resolves.toBeNull();
    await expect(getSocialComposerDraft('invalid-version')).resolves.toBeNull();
  });

  it('rejects malformed share-story payloads before persisting a draft', async () => {
    await expect(
      saveSocialComposerDraft({
        source: 'share_story',
        scanId: 'scan-invalid',
        category: 'food',
        caption: '',
        asset: {
          kind: 'share_story',
          payload: {
            variant: 'nutrition',
          } as any,
        },
      }),
    ).rejects.toThrow('Invalid share story payload');
  });
});
