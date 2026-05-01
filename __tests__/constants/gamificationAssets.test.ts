import { getGamificationAssetSource } from '@/constants/gamificationAssets';

describe('gamification asset helpers', () => {
  it('maps the legacy empty filename to the stage 0 asset', () => {
    expect(getGamificationAssetSource('image_vide.png')).toBe(
      getGamificationAssetSource('stade_0.png')
    );
  });

  it('maps legacy gif filenames to the new png assets', () => {
    expect(getGamificationAssetSource('stade_6.gif')).toBe(
      getGamificationAssetSource('stade_6.png')
    );
  });
});
