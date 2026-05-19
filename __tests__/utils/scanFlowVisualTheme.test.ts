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

  it('keeps scanner capture chrome focused on live camera overlays without warm-up tokens', () => {
    const capture = resolveScanCaptureVisualTheme(LIGHT_COLORS, false);

    expect(capture.overlayTint).toBe('transparent');
    expect(capture.topScrimGradient).toHaveLength(2);
    expect(capture.bottomScrimGradient).toHaveLength(3);
    expect(capture).not.toHaveProperty('warmupGradient');
  });
});
