import {
  PHASE2_SOCIAL_BUCKET,
  buildNormalizedPayloadHash,
  buildPublicStorageUrl,
  normalizeSocialText,
  stableStringify,
  validatePhase2SocialCategory,
  validateStableSocialAssetPath,
} from '@/supabase/functions/_shared/phase2Utils';

describe('phase2 utils', () => {
  it('builds a stable public social asset URL that does not depend on signed scan URLs', () => {
    expect(
      buildPublicStorageUrl(
        'https://test.supabase.co',
        PHASE2_SOCIAL_BUCKET,
        'test-user/cards/share-card.png'
      )
    ).toBe(
      'https://test.supabase.co/storage/v1/object/public/social-posts/test-user/cards/share-card.png'
    );
  });

  it('normalizes and validates stable social asset paths', () => {
    expect(
      validateStableSocialAssetPath('test-user/cards/share-card.png')
    ).toBe('test-user/cards/share-card.png');
  });

  it('rejects scan storage paths for social assets', () => {
    expect(() =>
      validateStableSocialAssetPath('scan-images/test-user/temp.png')
    ).toThrow('Asset path must target a stable social asset');
  });

  it('normalizes social text before storage and moderation checks', () => {
    expect(normalizeSocialText('  Progress   update \n today  ')).toBe(
      'Progress update today',
    );
  });

  it('validates the supported social categories', () => {
    expect(validatePhase2SocialCategory('food')).toBe('food');
    expect(() => validatePhase2SocialCategory('other')).toThrow(
      'category must be one of before_after, food, or physique',
    );
  });

  it('stableStringify sorts object keys consistently', () => {
    expect(
      stableStringify({
        b: 2,
        a: 1,
        nested: {
          z: 3,
          y: 2,
        },
      })
    ).toBe('{"a":1,"b":2,"nested":{"y":2,"z":3}}');
  });

  it('reuses the same legacy coach payload hash for equivalent payloads with different key order', async () => {
    const hashA = await buildNormalizedPayloadHash({
      payload: {
        score: 90,
        scan_type: 'body',
      },
      persona_key: 'gentle_supportive',
    });
    const hashB = await buildNormalizedPayloadHash({
      persona_key: 'gentle_supportive',
      payload: {
        scan_type: 'body',
        score: 90,
      },
    });

    expect(hashA).toBe(hashB);
  });

  it('builds distinct coach payload hashes when locale changes', async () => {
    const hashFr = await buildNormalizedPayloadHash({
      payload: {
        scan_type: 'body',
        score: 90,
      },
      persona_key: 'gentle_supportive',
      locale: 'fr',
    });
    const hashEn = await buildNormalizedPayloadHash({
      payload: {
        scan_type: 'body',
        score: 90,
      },
      persona_key: 'gentle_supportive',
      locale: 'en',
    });

    expect(hashFr).not.toBe(hashEn);
  });
});
