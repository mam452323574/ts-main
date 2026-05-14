import {
  resolveScanPreviewLoadingContent,
  resolveScanPreviewLoadingPhase,
} from '@/utils/scanPreviewLoadingConfig';

describe('scanPreviewLoadingConfig', () => {
  it('maps progress ranges to the expected loading phases', () => {
    expect(resolveScanPreviewLoadingPhase(0).key).toBe('verification');
    expect(resolveScanPreviewLoadingPhase(18).key).toBe('verification');
    expect(resolveScanPreviewLoadingPhase(19).key).toBe('upload');
    expect(resolveScanPreviewLoadingPhase(42).key).toBe('upload');
    expect(resolveScanPreviewLoadingPhase(43).key).toBe('analysis');
    expect(resolveScanPreviewLoadingPhase(82).key).toBe('analysis');
    expect(resolveScanPreviewLoadingPhase(83).key).toBe('preparing');
    expect(resolveScanPreviewLoadingPhase(100).key).toBe('preparing');
  });

  it('returns scan-type specific eyebrow and insight chips', () => {
    const healthContent = resolveScanPreviewLoadingContent('health', 32);
    const nutritionContent = resolveScanPreviewLoadingContent('nutrition', 88);
    const superContent = resolveScanPreviewLoadingContent('super', 100);

    expect(healthContent).toEqual(
      expect.objectContaining({
        phaseKey: 'upload',
        phaseEyebrowKey: 'scan_preview.loading.scan.health.eyebrow',
        insightChipKeys: [
          'scan_preview.loading.scan.health.insights.hydration',
          'scan_preview.loading.scan.health.insights.symmetry',
          'scan_preview.loading.scan.health.insights.glow',
        ],
      }),
    );

    expect(nutritionContent).toEqual(
      expect.objectContaining({
        phaseKey: 'preparing',
        phaseEyebrowKey: 'scan_preview.loading.scan.nutrition.eyebrow',
        insightChipKeys: [
          'scan_preview.loading.scan.nutrition.insights.calories',
          'scan_preview.loading.scan.nutrition.insights.macros',
          'scan_preview.loading.scan.nutrition.insights.quality',
        ],
      }),
    );

    expect(superContent).toEqual(
      expect.objectContaining({
        phaseKey: 'preparing',
        phaseEyebrowKey: 'scan_preview.loading.scan.super.eyebrow',
        insightChipKeys: [
          'scan_preview.loading.scan.super.insights.synthesis',
          'scan_preview.loading.scan.super.insights.zones',
          'scan_preview.loading.scan.super.insights.score',
        ],
      }),
    );
  });
});
