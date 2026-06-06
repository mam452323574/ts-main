import { buildPremiumHealthPalette } from '@/constants/premiumHealth';
import { DARK_COLORS, LIGHT_COLORS, withAlpha } from '@/constants/theme';
import {
  resolveScanCaptureVisualTheme,
  resolveScanFlowAccentTheme,
} from '@/utils/scanFlowVisualTheme';

describe('scan flow accent themes', () => {
  it('keeps body, health, and nutrition distinct with softer light backgrounds', () => {
    const body = resolveScanFlowAccentTheme(LIGHT_COLORS, false, 'body');
    const health = resolveScanFlowAccentTheme(LIGHT_COLORS, false, 'health');
    const nutrition = resolveScanFlowAccentTheme(LIGHT_COLORS, false, 'nutrition');

    expect(body.accentColor).not.toBe(LIGHT_COLORS.accentGreen);
    expect(body.accentColor).not.toBe(health.accentColor);
    expect(nutrition.accentColor).not.toBe(health.accentColor);
    expect(body.accentSoftBackground).toBe(withAlpha(body.accentColor, 0.045));
    expect(health.accentSoftBackground).toBe(withAlpha(health.accentColor, 0.045));
    expect(nutrition.chipBorder).toBe(withAlpha(nutrition.accentStrongColor, 0.11));
  });

  it('keeps dark scanner accents visible through borders and glow, not large fills', () => {
    const scanner = resolveScanFlowAccentTheme(DARK_COLORS, true, 'health');

    expect(scanner.accentSoftBackground).toBe(withAlpha(scanner.accentColor, 0.075));
    expect(scanner.accentBadgeBackground).toBe(withAlpha(scanner.accentColor, 0.1));
    expect(scanner.vignetteFrameBorder).toBe(
      withAlpha(scanner.accentStrongColor, 0.24),
    );
    expect(scanner.completionGlowSoft).toBe(withAlpha(scanner.accentColor, 0.12));
  });

  it('keeps chip and category overlay tokens on their previous treatment', () => {
    const scanner = resolveScanFlowAccentTheme(LIGHT_COLORS, false, 'health');

    expect(scanner.chipText).toBe('#F6FBFF');
    expect(scanner.instructionText).toBe('#F6FBFF');
    expect(scanner.countdownText).toBe('#F6FBFF');
    expect(scanner.heroPreviewMetaBackground).toBe(withAlpha('#050B11', 0.82));
    expect(scanner.heroPreviewMetaText).toBe('#F6FBFF');
  });

  it('makes the side-button surface readable in light capture mode without changing shared chrome', () => {
    const capture = resolveScanCaptureVisualTheme(LIGHT_COLORS, false);
    const premium = buildPremiumHealthPalette(LIGHT_COLORS, true);

    expect(capture.secondaryButtonBackground).toBe(LIGHT_COLORS.white);
    expect(capture.secondaryButtonText).toBe(LIGHT_COLORS.primaryText);
    expect(capture.shutterInner).toBe('#F6FBFF');
    expect(capture.secondaryButtonBorder).toBe(withAlpha(LIGHT_COLORS.white, 0.08));
    expect(capture.shutterOuter).toBe(withAlpha(LIGHT_COLORS.white, 0.68));
    expect(capture.topScrimGradient).toEqual([
      withAlpha(premium.canvas, 0.42),
      withAlpha(premium.canvas, 0),
    ]);
    expect(capture.bottomScrimGradient).toEqual([
      withAlpha(premium.canvas, 0),
      withAlpha(premium.canvasElevated, 0.12),
      withAlpha(premium.canvas, 0.46),
    ]);
  });

  it('keeps dark capture controls and scrims on their previous tokens', () => {
    const capture = resolveScanCaptureVisualTheme(DARK_COLORS, true);
    const premium = buildPremiumHealthPalette(DARK_COLORS, true);

    expect(capture.secondaryButtonBackground).toBe(withAlpha(DARK_COLORS.white, 0.04));
    expect(capture.secondaryButtonText).toBe('#F6FBFF');
    expect(capture.shutterInner).toBe('#F6FBFF');
    expect(capture.secondaryButtonBorder).toBe(withAlpha(DARK_COLORS.white, 0.08));
    expect(capture.shutterOuter).toBe(withAlpha(DARK_COLORS.white, 0.68));
    expect(capture.topScrimGradient).toEqual([
      withAlpha(premium.canvas, 0.42),
      withAlpha(premium.canvas, 0),
    ]);
    expect(capture.bottomScrimGradient).toEqual([
      withAlpha(premium.canvas, 0),
      withAlpha(premium.canvasElevated, 0.12),
      withAlpha(premium.canvas, 0.46),
    ]);
  });

  it('keeps scanner capture chrome focused on live camera overlays without warm-up tokens', () => {
    const capture = resolveScanCaptureVisualTheme(LIGHT_COLORS, false);

    expect(capture.overlayTint).toBe('transparent');
    expect(capture.topScrimGradient).toHaveLength(2);
    expect(capture.bottomScrimGradient).toHaveLength(3);
    expect(capture).not.toHaveProperty('warmupGradient');
  });
});
