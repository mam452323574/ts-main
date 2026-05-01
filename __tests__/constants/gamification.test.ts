import {
  getGamificationStageProgress,
  getGamificationStageDefinition,
  normalizeGamificationScanCount,
  resolveGamification,
} from '@/constants/gamification';

describe('gamification helpers', () => {
  it.each([
    [0, 0, 'stade_0.png'],
    [1, 1, 'stade_1.png'],
    [2, 1, 'stade_1.png'],
    [3, 2, 'stade_2.png'],
    [5, 3, 'stade_3.png'],
    [10, 4, 'stade_4.png'],
    [20, 5, 'stade_5.png'],
    [30, 6, 'stade_6.png'],
    [50, 7, 'stade_7.png'],
    [100, 8, 'stade_8.png'],
    [150, 9, 'stade_9.png'],
    [200, 10, 'stade_10.png'],
  ])(
    'maps %i scans to stage %i and filename %s',
    (scanCount, expectedStage, expectedFilename) => {
      const result = resolveGamification(scanCount);

      expect(result).toEqual({
        scanCount,
        mascotStage: expectedStage,
        mascotFilename: expectedFilename,
        mascotImageUrl: '',
      });
      expect(getGamificationStageDefinition(scanCount)).toEqual(
        expect.objectContaining({
          stage: expectedStage,
          filename: expectedFilename,
        })
      );
    }
  );

  it('normalizes invalid scan counts to zero', () => {
    expect(normalizeGamificationScanCount(-4)).toBe(0);
    expect(normalizeGamificationScanCount('not-a-number')).toBe(0);
    expect(normalizeGamificationScanCount(null)).toBe(0);
  });

  it('preserves optional backend overrides when provided', () => {
    expect(
      resolveGamification(30, {
        mascotStage: 6,
        mascotFilename: 'stade_6.png',
        mascotImageUrl: 'https://example.com/stade_6.png',
      })
    ).toEqual({
      scanCount: 30,
      mascotStage: 6,
      mascotFilename: 'stade_6.png',
      mascotImageUrl: 'https://example.com/stade_6.png',
    });
  });

  it('canonicalizes the legacy empty mascot filename to stage 0', () => {
    expect(
      resolveGamification(0, {
        mascotStage: 0,
        mascotFilename: 'image_vide.png',
        mascotImageUrl: 'https://example.com/image_vide.png',
      })
    ).toEqual({
      scanCount: 0,
      mascotStage: 0,
      mascotFilename: 'stade_0.png',
      mascotImageUrl: 'https://example.com/image_vide.png',
    });
  });

  it('computes progress inside the active stage', () => {
    const result = getGamificationStageProgress(103);

    expect(result.scanCount).toBe(103);
    expect(result.currentStage).toBe(8);
    expect(result.currentStageMinScans).toBe(100);
    expect(result.nextStageMinScans).toBe(150);
    expect(result.scansIntoStage).toBe(3);
    expect(result.scansRemaining).toBe(47);
    expect(result.isFinalStage).toBe(false);
    expect(result.progressInStage).toBeCloseTo(0.06);
    expect(result.progressPercent).toBeCloseTo(6);
  });

  it('returns a full bar for the final stage', () => {
    const result = getGamificationStageProgress(240);

    expect(result.scanCount).toBe(240);
    expect(result.currentStage).toBe(10);
    expect(result.currentStageMinScans).toBe(200);
    expect(result.nextStageMinScans).toBeNull();
    expect(result.scansIntoStage).toBe(40);
    expect(result.scansRemaining).toBe(0);
    expect(result.isFinalStage).toBe(true);
    expect(result.progressInStage).toBe(1);
    expect(result.progressPercent).toBe(100);
  });
});
