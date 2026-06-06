// Shared chrome (background / foreground / border) for Coach action buttons
// tinted with a persona's accent colour. Extracted from CoachActionComposer
// so other persona-coloured CTAs (e.g. the "Nouvelle conv" pill in the
// conversations inbox) stay visually consistent with the canonical composer
// button: theme-aware background, WCAG-readable foreground, soft accent
// border.

import {
  mixColors,
  softenAccentColor,
  withAlpha,
} from '@/constants/theme';

function normalizeHexColor(color: string | null | undefined) {
  if (!color || !color.startsWith('#')) {
    return null;
  }

  const hex = color.slice(1);
  if (hex.length === 3) {
    return hex
      .split('')
      .map((char) => char + char)
      .join('');
  }

  return hex.length === 6 ? hex : null;
}

function getRelativeLuminance(color: string | null | undefined) {
  const normalized = normalizeHexColor(color);
  if (!normalized) {
    return null;
  }

  const channelToLinear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [0, 2, 4].map((offset) =>
    channelToLinear(Number.parseInt(normalized.slice(offset, offset + 2), 16)),
  );

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(colorA: string, colorB: string) {
  const luminanceA = getRelativeLuminance(colorA);
  const luminanceB = getRelativeLuminance(colorB);
  if (luminanceA === null || luminanceB === null) {
    return null;
  }

  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function resolveReadableButtonForeground(
  backgroundColor: string,
  colors: any,
) {
  const lightForeground = colors.white ?? '#FFFFFF';
  const darkForeground = colors.primaryText ?? '#1C1C1E';
  const backgroundLuminance = getRelativeLuminance(backgroundColor);
  const lightContrast = getContrastRatio(lightForeground, backgroundColor) ?? 0;
  const darkContrast = getContrastRatio(darkForeground, backgroundColor) ?? 0;

  if (
    backgroundLuminance !== null &&
    backgroundLuminance > 0.72 &&
    darkContrast >= 4.5
  ) {
    return darkForeground;
  }

  if (lightContrast >= 4.5 || lightContrast >= darkContrast) {
    return lightForeground;
  }

  return darkForeground;
}

export interface CoachActionButtonChrome {
  backgroundColor: string;
  foregroundColor: string;
  accentColor: string;
  borderColor: string;
}

export function getCoachActionButtonChrome(
  colors: any,
  isDark: boolean,
  accentColor: string,
): CoachActionButtonChrome {
  const buttonAccent = softenAccentColor(colors, isDark, accentColor, 'selected');
  const backgroundColor = isDark
    ? mixColors(colors.surfaceElevated ?? colors.cardBackground, buttonAccent, 0.26)
    : mixColors(colors.primaryText, buttonAccent, 0.08);

  return {
    backgroundColor,
    foregroundColor: resolveReadableButtonForeground(backgroundColor, colors),
    accentColor: buttonAccent,
    borderColor: withAlpha(buttonAccent, isDark ? 0.28 : 0.18),
  };
}

/**
 * Persona-coloured chrome with a much stronger accent presence than
 * `getCoachActionButtonChrome`. Used by inbox-style CTAs where each persona
 * needs to be visually identifiable at a glance — the canonical composer
 * chrome is intentionally muted so the dock surface dominates, which made
 * Mira / Noah / Axel look almost identical when blown up into a header pill.
 */
export function getCoachConversationCtaChrome(
  colors: any,
  isDark: boolean,
  accentColor: string,
): CoachActionButtonChrome {
  const buttonAccent = softenAccentColor(colors, isDark, accentColor, 'standard');
  const backgroundColor = isDark
    ? mixColors(colors.surfaceElevated ?? colors.cardBackground, buttonAccent, 0.5)
    : mixColors(colors.cardBackground, buttonAccent, 0.45);

  return {
    backgroundColor,
    foregroundColor: resolveReadableButtonForeground(backgroundColor, colors),
    accentColor: buttonAccent,
    borderColor: withAlpha(buttonAccent, isDark ? 0.45 : 0.32),
  };
}
