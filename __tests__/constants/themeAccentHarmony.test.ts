import {
  DARK_COLORS,
  LIGHT_COLORS,
  getMainPageChrome,
  mixColors,
  softenAccentColor,
  withAlpha,
} from '@/constants/theme';

describe('global accent harmony', () => {
  it('keeps analytics chrome blue-gray instead of the old nutrition green', () => {
    const chrome = getMainPageChrome(LIGHT_COLORS, false, 'analytics');
    const expectedAnalyticAccent = softenAccentColor(
      LIGHT_COLORS,
      false,
      mixColors(LIGHT_COLORS.gray, LIGHT_COLORS.primary, 0.26),
      'standard',
    );

    expect(chrome.accentColor).toBe(expectedAnalyticAccent);
    expect(chrome.accentColor).not.toBe(LIGHT_COLORS.accentGreen);
    expect(chrome.accentColor).not.toBe(LIGHT_COLORS.success);
    expect(chrome.chipActive.backgroundColor).toBe(
      mixColors(LIGHT_COLORS.cardBackground, chrome.accentColor, 0.045),
    );
    expect(chrome.chipActive.borderColor).toBe(withAlpha(chrome.accentColor, 0.12));
    expect(chrome.chart.fill).toBe(withAlpha(chrome.accentColor, 0.07));
  });

  it('keeps dark analytics fills secondary to the navy/black base', () => {
    const chrome = getMainPageChrome(DARK_COLORS, true, 'analytics');

    expect(chrome.canvas).toBe(mixColors('#000000', chrome.accentColor, 0.016));
    expect(chrome.canvasElevated).toBe(
      mixColors('#08080C', chrome.accentColor, 0.035),
    );
    expect(chrome.chipActive.backgroundColor).toBe(withAlpha(chrome.accentColor, 0.11));
    expect(chrome.chart.fill).toBe(withAlpha(chrome.accentColor, 0.12));
  });
});
