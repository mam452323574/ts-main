import { ThemeColors, mixColors, softenAccentColor, withAlpha } from '@/constants/theme';

export interface PremiumHealthPalette {
  canvas: string;
  canvasElevated: string;
  surfaceBase: string;
  surfaceRaised: string;
  surfaceGlass: string;
  borderSubtle: string;
  borderStrong: string;
  trustAccent: string;
  trustAccentSoft: string;
  trustAccentMuted: string;
  premiumAccent: string;
  premiumAccentSoft: string;
  premiumAccentMuted: string;
  coralAccent: string;
  coralAccentSoft: string;
  heroGradient: [string, string, string];
  trustGradient: [string, string, string];
  premiumGradient: [string, string, string];
  moduleGradient: [string, string, string];
  chipBackground: string;
  chipBorder: string;
  chipText: string;
  secondaryChipBackground: string;
  secondaryChipBorder: string;
  secondaryChipText: string;
  primaryActionBackground: string;
  primaryActionBorder: string;
  primaryActionText: string;
  secondaryActionBackground: string;
  secondaryActionBorder: string;
  secondaryActionText: string;
  scrim: string;
  shadowColor: string;
  paywall: PremiumHealthPaywallPalette;
}

export type PremiumHealthModuleTone = 'trust' | 'premium';

export interface PremiumHealthPaywallPalette {
  screenGradient: [string, string, string];
  heroGradient: [string, string, string];
  heroBorder: string;
  heroIconBackground: string;
  heroIconBorder: string;
  heroBadgeBackground: string;
  heroBadgeBorder: string;
  proofTileBackground: string;
  proofTileBorder: string;
  proofTileIconBackground: string;
  proofTileIconBorder: string;
  benefitsBackground: string;
  benefitsBorder: string;
  benefitIconBackground: string;
  benefitIconBorder: string;
  planPanelBackground: string;
  planPanelBorder: string;
  planOptionBackground: string;
  planOptionBorder: string;
  planOptionSelectedBackground: string;
  planOptionSelectedBorder: string;
  planOptionMutedBackground: string;
  planBadgeBackground: string;
  planBadgeBorder: string;
  planBadgeText: string;
  selectionBackground: string;
  selectionBorder: string;
  selectionText: string;
  footerBackground: string;
  footerBorder: string;
  ctaBackground: string;
  ctaBorder: string;
  ctaText: string;
  ctaShadow: string;
  softText: string;
  shadowColor: string;
}

export interface PremiumHealthModulePalette {
  accent: string;
  surfaceBackground: string;
  surfaceBorder: string;
  backgroundGradient: [string, string, string];
  spotlightGradient: [string, string, string];
  bottomScrimGradient: [string, string, string];
  copyScrimGradient: [string, string, string];
  eyebrowBackground: string;
  eyebrowBorder: string;
  eyebrowText: string;
  title: string;
  body: string;
  metaPanelBackground: string;
  metaPanelBorder: string;
  metaIconTileBackground: string;
  metaIconTileBorder: string;
  metaPrimaryText: string;
  metaSecondaryText: string;
  ctaBackground: string;
  ctaBorder: string;
  ctaText: string;
  ctaIcon: string;
  ctaShadowColor: string;
  shellShadowColor: string;
  imageShadowColor: string;
  imageShadowOpacity: number;
  imageOpacity: number;
}

export interface PremiumHealthResponsiveCardMetrics {
  isCompact: boolean;
  isTablet: boolean;
  cardRadius: number;
  cardMinHeight: number;
  horizontalPadding: number;
  copyWidth: number;
  titleSize: number;
  titleLineHeight: number;
  bodySize: number;
  bodyLineHeight: number;
  metaPrimarySize: number;
  metaSecondarySize: number;
  ctaHeight: number;
}

export function buildPremiumHealthPalette(
  colors: ThemeColors,
  isDark: boolean,
): PremiumHealthPalette {
  const successAccent = softenAccentColor(
    colors,
    isDark,
    mixColors(colors.primary, colors.gray, isDark ? 0.26 : 0.32),
    'standard',
  );
  const trustAccent = isDark
    ? mixColors(successAccent, colors.white, 0.08)
    : mixColors(successAccent, colors.primary, 0.08);
  const premiumAccent = isDark
    ? softenAccentColor(colors, isDark, mixColors(colors.gold, colors.white, 0.02), 'selected')
    : softenAccentColor(colors, isDark, mixColors(colors.gold, colors.warning, 0.03), 'selected');
  const coralAccent = isDark
    ? softenAccentColor(colors, isDark, mixColors(colors.error, colors.warning, 0.1), 'standard')
    : softenAccentColor(colors, isDark, mixColors(colors.error, colors.warning, 0.12), 'standard');

  const canvas = isDark ? '#070E14' : '#F7F3ED';
  const canvasElevated = isDark ? '#0A131A' : '#FBF7F1';
  const surfaceBase = isDark ? '#0F1820' : '#FEFBF6';
  const surfaceRaised = isDark ? '#13202A' : '#FFFFFF';
  const surfaceGlass = isDark
    ? withAlpha('#101B24', 0.94)
    : withAlpha('#FFFCF8', 0.94);
  const paywallHeroStart = isDark
    ? mixColors(surfaceRaised, trustAccent, 0.1)
    : mixColors(surfaceRaised, trustAccent, 0.055);
  const paywallHeroMiddle = isDark
    ? mixColors(surfaceBase, premiumAccent, 0.08)
    : mixColors(surfaceRaised, premiumAccent, 0.07);
  const paywallHeroEnd = isDark
    ? mixColors(surfaceBase, colors.white, 0.025)
    : mixColors(surfaceRaised, colors.goldLight, 0.12);
  const paywallPlanBase = isDark
    ? mixColors(surfaceRaised, colors.white, 0.018)
    : mixColors(surfaceRaised, colors.background, 0.08);
  const paywallPlanSelected = isDark
    ? mixColors(surfaceRaised, premiumAccent, 0.095)
    : mixColors(surfaceRaised, premiumAccent, 0.065);
  const paywallTrustSurface = isDark
    ? mixColors(surfaceRaised, trustAccent, 0.055)
    : mixColors(surfaceRaised, trustAccent, 0.03);

  return {
    canvas,
    canvasElevated,
    surfaceBase,
    surfaceRaised,
    surfaceGlass,
    borderSubtle: isDark
      ? withAlpha(colors.white, 0.08)
      : withAlpha(colors.primaryText, 0.07),
    borderStrong: isDark
      ? withAlpha(trustAccent, 0.12)
      : withAlpha(trustAccent, 0.1),
    trustAccent,
    trustAccentSoft: withAlpha(trustAccent, isDark ? 0.09 : 0.06),
    trustAccentMuted: isDark
      ? mixColors(surfaceBase, trustAccent, 0.08)
      : mixColors(surfaceRaised, trustAccent, 0.035),
    premiumAccent,
    premiumAccentSoft: withAlpha(premiumAccent, isDark ? 0.09 : 0.06),
    premiumAccentMuted: isDark
      ? mixColors(surfaceBase, premiumAccent, 0.08)
      : mixColors(surfaceRaised, premiumAccent, 0.045),
    coralAccent,
    coralAccentSoft: withAlpha(coralAccent, isDark ? 0.1 : 0.075),
    heroGradient: isDark
      ? ['#14232C', '#0D171E', '#070E14']
      : [
          mixColors(colors.background, trustAccent, 0.025),
          mixColors(colors.background, colors.goldLight, 0.1),
          mixColors(colors.background, colors.white, 0.08),
        ],
    trustGradient: isDark
      ? ['#14212A', '#101820', '#0D141B']
      : [
          mixColors(colors.cardBackground, trustAccent, 0.04),
          mixColors(colors.cardBackground, colors.white, 0.04),
          mixColors(colors.surfaceMuted, trustAccent, 0.025),
        ],
    premiumGradient: isDark
      ? ['#1A1A14', '#11171B', '#0D1418']
      : [
          mixColors(colors.cardBackground, premiumAccent, 0.08),
          mixColors(colors.cardBackground, colors.warning, 0.055),
          mixColors(colors.white, premiumAccent, 0.025),
        ],
    moduleGradient: isDark
      ? ['#131F29', '#0F1720', '#0C131A']
      : [
          mixColors(colors.cardBackground, trustAccent, 0.035),
          mixColors(colors.cardBackground, premiumAccent, 0.03),
          mixColors(colors.cardBackground, colors.white, 0.05),
        ],
    chipBackground: isDark
      ? withAlpha(colors.white, 0.05)
      : withAlpha(colors.white, 0.8),
    chipBorder: isDark
      ? withAlpha(colors.white, 0.1)
      : withAlpha(colors.primaryText, 0.08),
    chipText: isDark ? colors.primaryText : colors.primaryText,
    secondaryChipBackground: isDark
      ? withAlpha(trustAccent, 0.065)
      : withAlpha(trustAccent, 0.04),
    secondaryChipBorder: isDark
      ? withAlpha(trustAccent, 0.12)
      : withAlpha(trustAccent, 0.09),
    secondaryChipText: isDark ? trustAccent : mixColors(trustAccent, colors.primaryText, 0.2),
    primaryActionBackground: isDark ? colors.primaryText : colors.primaryText,
    primaryActionBorder: isDark
      ? withAlpha(colors.white, 0.16)
      : withAlpha(colors.primaryText, 0.08),
    primaryActionText: colors.background,
    secondaryActionBackground: isDark
      ? withAlpha(colors.white, 0.04)
      : withAlpha(colors.white, 0.76),
    secondaryActionBorder: isDark
      ? withAlpha(colors.white, 0.08)
      : withAlpha(colors.primaryText, 0.08),
    secondaryActionText: isDark ? colors.primaryText : colors.primaryText,
    scrim: isDark ? 'rgba(3, 9, 14, 0.78)' : 'rgba(18, 24, 32, 0.34)',
    shadowColor: isDark
      ? '#02070C'
      : mixColors(colors.gray, trustAccent, 0.12),
    paywall: {
      screenGradient: isDark
        ? [
            mixColors(canvasElevated, trustAccent, 0.05),
            canvas,
            mixColors(canvas, premiumAccent, 0.035),
          ]
        : [
            mixColors(canvasElevated, colors.white, 0.24),
            canvas,
            mixColors(canvas, trustAccent, 0.018),
          ],
      heroGradient: [paywallHeroStart, paywallHeroMiddle, paywallHeroEnd],
      heroBorder: withAlpha(
        mixColors(trustAccent, premiumAccent, 0.24),
        isDark ? 0.22 : 0.14,
      ),
      heroIconBackground: isDark
        ? withAlpha(premiumAccent, 0.13)
        : mixColors(surfaceRaised, premiumAccent, 0.08),
      heroIconBorder: withAlpha(premiumAccent, isDark ? 0.26 : 0.2),
      heroBadgeBackground: isDark
        ? withAlpha(colors.white, 0.055)
        : withAlpha(colors.white, 0.76),
      heroBadgeBorder: isDark
        ? withAlpha(colors.white, 0.1)
        : withAlpha(colors.primaryText, 0.065),
      proofTileBackground: isDark
        ? withAlpha(colors.white, 0.045)
        : withAlpha(colors.white, 0.64),
      proofTileBorder: isDark
        ? withAlpha(colors.white, 0.09)
        : withAlpha(colors.primaryText, 0.06),
      proofTileIconBackground: withAlpha(trustAccent, isDark ? 0.12 : 0.075),
      proofTileIconBorder: withAlpha(trustAccent, isDark ? 0.18 : 0.12),
      benefitsBackground: paywallTrustSurface,
      benefitsBorder: withAlpha(trustAccent, isDark ? 0.14 : 0.095),
      benefitIconBackground: withAlpha(trustAccent, isDark ? 0.11 : 0.07),
      benefitIconBorder: withAlpha(trustAccent, isDark ? 0.16 : 0.11),
      planPanelBackground: isDark
        ? mixColors(surfaceRaised, colors.white, 0.018)
        : mixColors(surfaceRaised, colors.white, 0.12),
      planPanelBorder: isDark
        ? withAlpha(colors.white, 0.1)
        : withAlpha(colors.primaryText, 0.075),
      planOptionBackground: paywallPlanBase,
      planOptionBorder: isDark
        ? withAlpha(colors.white, 0.09)
        : withAlpha(colors.primaryText, 0.07),
      planOptionSelectedBackground: paywallPlanSelected,
      planOptionSelectedBorder: withAlpha(premiumAccent, isDark ? 0.34 : 0.24),
      planOptionMutedBackground: isDark
        ? withAlpha(colors.white, 0.03)
        : mixColors(surfaceBase, colors.primaryText, 0.018),
      planBadgeBackground: isDark
        ? withAlpha(premiumAccent, 0.13)
        : withAlpha(premiumAccent, 0.09),
      planBadgeBorder: withAlpha(premiumAccent, isDark ? 0.24 : 0.17),
      planBadgeText: isDark
        ? mixColors(colors.primaryText, premiumAccent, 0.18)
        : mixColors(colors.primaryText, premiumAccent, 0.28),
      selectionBackground: isDark ? colors.primaryText : colors.primaryText,
      selectionBorder: isDark
        ? withAlpha(colors.white, 0.16)
        : withAlpha(colors.primaryText, 0.08),
      selectionText: colors.background,
      footerBackground: isDark
        ? withAlpha(colors.white, 0.025)
        : withAlpha(colors.white, 0.42),
      footerBorder: isDark
        ? withAlpha(colors.white, 0.07)
        : withAlpha(colors.primaryText, 0.055),
      ctaBackground: isDark ? colors.primaryText : colors.primaryText,
      ctaBorder: isDark
        ? withAlpha(colors.white, 0.16)
        : withAlpha(colors.primaryText, 0.08),
      ctaText: colors.background,
      ctaShadow: isDark
        ? mixColors(premiumAccent, colors.background, 0.35)
        : mixColors(colors.gray, premiumAccent, 0.2),
      softText: isDark ? colors.secondaryText : withAlpha(colors.primaryText, 0.68),
      shadowColor: isDark
        ? mixColors(colors.background, premiumAccent, 0.12)
        : mixColors(colors.gray, trustAccent, 0.16),
    },
  };
}

export function buildPremiumHealthModulePalette(
  colors: ThemeColors,
  isDark: boolean,
  tone: PremiumHealthModuleTone,
): PremiumHealthModulePalette {
  const premiumHealth = buildPremiumHealthPalette(colors, isDark);
  const accent =
    tone === 'premium' ? premiumHealth.premiumAccent : premiumHealth.trustAccent;
  const tintStrength =
    tone === 'premium'
      ? isDark
        ? 0.05
        : 0.035
      : isDark
        ? 0.044
        : 0.03;
  const surfaceBackground = mixColors(
    premiumHealth.surfaceRaised,
    accent,
    tintStrength,
  );

  return {
    accent,
    surfaceBackground,
    surfaceBorder: withAlpha(
      accent,
      tone === 'premium'
        ? isDark
          ? 0.16
          : 0.12
        : isDark
          ? 0.12
          : 0.1,
    ),
    backgroundGradient:
      tone === 'premium'
        ? premiumHealth.premiumGradient
        : premiumHealth.trustGradient,
    spotlightGradient: [
      withAlpha(accent, isDark ? 0.09 : 0.06),
      withAlpha(accent, isDark ? 0.026 : 0.02),
      withAlpha(accent, 0),
    ],
    bottomScrimGradient: [
      withAlpha(premiumHealth.surfaceBase, 0),
      withAlpha(premiumHealth.surfaceBase, isDark ? 0.38 : 0.14),
      withAlpha(premiumHealth.surfaceBase, isDark ? 0.98 : 0.94),
    ],
    copyScrimGradient: [
      withAlpha(premiumHealth.surfaceGlass, isDark ? 0.98 : 0.94),
      withAlpha(premiumHealth.surfaceGlass, isDark ? 0.9 : 0.8),
      withAlpha(premiumHealth.surfaceGlass, 0),
    ],
    eyebrowBackground:
      tone === 'premium'
        ? premiumHealth.premiumAccentSoft
        : premiumHealth.secondaryChipBackground,
    eyebrowBorder:
      tone === 'premium'
        ? withAlpha(accent, isDark ? 0.2 : 0.16)
        : premiumHealth.secondaryChipBorder,
    eyebrowText:
      tone === 'premium'
        ? mixColors(colors.primaryText, accent, 0.24)
        : accent,
    title: colors.primaryText,
    body: isDark ? colors.secondaryText : withAlpha(colors.primaryText, 0.72),
    metaPanelBackground: mixColors(
      premiumHealth.surfaceGlass,
      accent,
      tone === 'premium'
        ? isDark
          ? 0.06
          : 0.035
        : isDark
          ? 0.036
          : 0.03,
    ),
    metaPanelBorder: withAlpha(accent, isDark ? 0.13 : 0.1),
    metaIconTileBackground: withAlpha(accent, isDark ? 0.1 : 0.07),
    metaIconTileBorder: withAlpha(accent, isDark ? 0.16 : 0.11),
    metaPrimaryText: colors.primaryText,
    metaSecondaryText: mixColors(colors.gray, accent, tone === 'premium' ? 0.16 : 0.08),
    ctaBackground: mixColors(
      premiumHealth.surfaceGlass,
      accent,
      tone === 'premium'
        ? isDark
          ? 0.085
          : 0.045
        : isDark
          ? 0.06
          : 0.035,
    ),
    ctaBorder: withAlpha(accent, isDark ? 0.14 : 0.1),
    ctaText: colors.primaryText,
    ctaIcon: colors.primaryText,
    ctaShadowColor: accent,
    shellShadowColor: premiumHealth.shadowColor,
    imageShadowColor: isDark ? '#000000' : mixColors(colors.gray, accent, 0.16),
    imageShadowOpacity: isDark ? 0.18 : 0.12,
    imageOpacity: isDark ? 0.96 : 0.93,
  };
}

export function getPremiumHealthResponsiveCardMetrics(
  windowWidth: number,
): PremiumHealthResponsiveCardMetrics {
  const isCompact = windowWidth < 370;
  const isTablet = windowWidth >= 768;

  return {
    isCompact,
    isTablet,
    cardRadius: 30,
    cardMinHeight: isTablet ? 484 : isCompact ? 408 : 436,
    horizontalPadding: isCompact ? 18 : 22,
    copyWidth: isCompact ? 186 : isTablet ? 320 : 220,
    titleSize: isTablet ? 38 : isCompact ? 28 : 32,
    titleLineHeight: isTablet ? 44 : isCompact ? 34 : 38,
    bodySize: isTablet ? 18 : isCompact ? 15 : 16,
    bodyLineHeight: isTablet ? 28 : isCompact ? 22 : 24,
    metaPrimarySize: isTablet ? 18 : 16,
    metaSecondarySize: isTablet ? 14 : 12,
    ctaHeight: isTablet ? 58 : 56,
  };
}
