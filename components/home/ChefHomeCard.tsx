import { useMemo } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChefHat, ChevronRight, Crown } from 'lucide-react-native';

import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  ThemeColors,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

const CHEF_HOME_GROUP_IMAGE = require('../../assets/images/chef/chef-home-group.png');

type ChefHomeCardProps = {
  onPress: () => void;
};

type ChefCardPalette = {
  surfaceBackground: string;
  surfaceBorder: string;
  backgroundGradient: readonly [string, string, string];
  goldWashGradient: readonly [string, string, string];
  bottomScrimGradient: readonly [string, string, string];
  copyScrimGradient: readonly [string, string, string];
  chefGlowGradient: readonly [string, string, string];
  title: string;
  description: string;
  premiumBadgeBackground: string;
  premiumBadgeBorder: string;
  premiumText: string;
  premiumIcon: string;
  usagePanelBackground: string;
  usagePanelBorder: string;
  usageIconTileBackground: string;
  usageIconTileBorder: string;
  usageIcon: string;
  usageTextPrimary: string;
  usageTextSecondary: string;
  ctaBackground: string;
  ctaBorder: string;
  ctaText: string;
  ctaIcon: string;
  ctaShadowColor: string;
  shellShadowColor: string;
  imageShadowColor: string;
  imageShadowOpacity: number;
  imageOpacity: number;
};

function getChefPalette(colors: ThemeColors, isDark: boolean): ChefCardPalette {
  if (isDark) {
    return {
      surfaceBackground: '#10130D',
      surfaceBorder: 'rgba(231, 185, 72, 0.32)',
      backgroundGradient: ['#302A18', '#1D2116', '#090B09'] as const,
      goldWashGradient: [
        'rgba(245, 203, 92, 0.2)',
        'rgba(196, 154, 57, 0.08)',
        'rgba(9, 11, 9, 0)',
      ] as const,
      bottomScrimGradient: [
        'rgba(8, 10, 8, 0)',
        'rgba(8, 10, 8, 0.5)',
        'rgba(8, 10, 8, 0.94)',
      ] as const,
      copyScrimGradient: [
        'rgba(8, 10, 8, 0.97)',
        'rgba(8, 10, 8, 0.85)',
        'rgba(8, 10, 8, 0)',
      ] as const,
      chefGlowGradient: [
        'rgba(243, 203, 88, 0.12)',
        'rgba(243, 203, 88, 0.04)',
        'rgba(243, 203, 88, 0)',
      ] as const,
      title: colors.white,
      description: 'rgba(255, 255, 255, 0.84)',
      premiumBadgeBackground: 'rgba(243, 203, 88, 0.1)',
      premiumBadgeBorder: 'rgba(243, 203, 88, 0.58)',
      premiumText: '#F3D77A',
      premiumIcon: '#F3CB58',
      usagePanelBackground: 'rgba(12, 14, 10, 0.62)',
      usagePanelBorder: 'rgba(231, 185, 72, 0.42)',
      usageIconTileBackground: 'rgba(243, 203, 88, 0.16)',
      usageIconTileBorder: 'rgba(243, 203, 88, 0.36)',
      usageIcon: '#F5D67F',
      usageTextPrimary: colors.white,
      usageTextSecondary: '#F5D67F',
      ctaBackground: '#2F82EC',
      ctaBorder: withAlpha(colors.white, 0.2),
      ctaText: colors.white,
      ctaIcon: colors.white,
      ctaShadowColor: '#2F82EC',
      shellShadowColor: '#C9A442',
      imageShadowColor: '#000000',
      imageShadowOpacity: 0.22,
      imageOpacity: 1,
    };
  }

  const champagne = mixColors(colors.gold, colors.white, 0.58);
  const warmInk = mixColors(colors.primaryText, colors.warning, 0.12);
  const softInk = mixColors(colors.secondaryText, warmInk, 0.2);
  const oliveAccent = mixColors(colors.success, colors.warning, 0.12);
  const creamSurface = mixColors(colors.white, colors.goldLight, 0.32);

  return {
    surfaceBackground: mixColors(colors.cardBackground, colors.gold, 0.08),
    surfaceBorder: withAlpha(champagne, 0.22),
    backgroundGradient: [
      mixColors(colors.white, colors.gold, 0.08),
      mixColors(colors.cardBackground, colors.gold, 0.14),
      mixColors(colors.surfaceMuted, colors.warning, 0.08),
    ] as const,
    goldWashGradient: [
      withAlpha(champagne, 0.24),
      withAlpha(oliveAccent, 0.08),
      withAlpha(champagne, 0),
    ] as const,
    bottomScrimGradient: [
      withAlpha(creamSurface, 0),
      withAlpha(creamSurface, 0.18),
      withAlpha(creamSurface, 0.9),
    ] as const,
    copyScrimGradient: [
      withAlpha(mixColors(colors.white, colors.goldLight, 0.18), 0.96),
      withAlpha(mixColors(colors.white, colors.gold, 0.08), 0.82),
      withAlpha(champagne, 0),
    ] as const,
    chefGlowGradient: [
      withAlpha(champagne, 0.22),
      withAlpha(oliveAccent, 0.1),
      withAlpha(champagne, 0),
    ] as const,
    title: warmInk,
    description: softInk,
    premiumBadgeBackground: mixColors(colors.white, colors.gold, 0.18),
    premiumBadgeBorder: withAlpha(champagne, 0.28),
    premiumText: mixColors(warmInk, champagne, 0.18),
    premiumIcon: mixColors(champagne, colors.warning, 0.18),
    usagePanelBackground: withAlpha(colors.white, 0.76),
    usagePanelBorder: withAlpha(champagne, 0.22),
    usageIconTileBackground: mixColors(colors.white, champagne, 0.28),
    usageIconTileBorder: withAlpha(champagne, 0.24),
    usageIcon: mixColors(champagne, colors.warning, 0.12),
    usageTextPrimary: warmInk,
    usageTextSecondary: mixColors(oliveAccent, warmInk, 0.18),
    ctaBackground: mixColors(colors.warning, colors.white, 0.78),
    ctaBorder: withAlpha(champagne, 0.26),
    ctaText: warmInk,
    ctaIcon: warmInk,
    ctaShadowColor: mixColors(champagne, colors.warning, 0.22),
    shellShadowColor: mixColors(colors.gray, colors.gold, 0.18),
    imageShadowColor: mixColors(colors.gray, champagne, 0.12),
    imageShadowOpacity: 0.12,
    imageOpacity: 0.98,
  };
}

export function ChefHomeCard({ onPress }: ChefHomeCardProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { width: windowWidth } = useWindowDimensions();
  const isCompact = windowWidth < 370;
  const isTablet = windowWidth >= 768;
  const palette = useMemo(
    () => getChefPalette(colors, isDark),
    [colors, isDark],
  );
  const styles = useMemo(
    () =>
      createStyles(
        colors,
        isDark,
        windowWidth,
        isCompact,
        isTablet,
        palette,
      ),
    [colors, isCompact, isDark, isTablet, palette, windowWidth],
  );

  return (
    <TouchableOpacity
      accessibilityLabel={t('home.fridge_scan.cta')}
      accessibilityRole="button"
      activeOpacity={0.94}
      onPress={onPress}
      style={styles.shell}
      testID="home-fridge-scan-card"
    >
      <View style={styles.surface} testID="home-fridge-scan-surface">
        <LinearGradient
          colors={palette.backgroundGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.backgroundGradient}
        />
        <LinearGradient
          colors={palette.goldWashGradient}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.95, y: 0.88 }}
          style={styles.goldWash}
        />
        <LinearGradient
          colors={palette.bottomScrimGradient}
          start={{ x: 0.5, y: 0.46 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.bottomScrim}
        />
        <LinearGradient
          colors={palette.copyScrimGradient}
          start={{ x: 0, y: 0.45 }}
          end={{ x: 1, y: 0.45 }}
          style={styles.copyScrim}
        />

        <View
          pointerEvents="none"
          style={styles.chefStage}
          testID="home-chef-group"
        >
          <LinearGradient
            colors={palette.chefGlowGradient}
            start={{ x: 0.12, y: 0.08 }}
            end={{ x: 0.92, y: 0.92 }}
            style={styles.chefBackdropOrb}
          />
          <Image
            source={CHEF_HOME_GROUP_IMAGE}
            resizeMode="contain"
            style={styles.chefGroupImage}
            testID="home-chef-group-image"
          />
        </View>

        <View style={styles.content}>
          <View style={styles.copyColumn}>
            <View style={styles.premiumBadge}>
              <Crown
                color={palette.premiumIcon}
                fill={palette.premiumIcon}
                size={16}
                strokeWidth={2.2}
              />
              <Text style={styles.premiumText}>
                {t('home.fridge_scan.eyebrow')}
              </Text>
            </View>

            <Text style={styles.title}>{t('home.fridge_scan.title')}</Text>
            <Text style={styles.description}>{t('home.fridge_scan.body')}</Text>

            <View style={styles.usagePanel} testID="home-fridge-scan-quota">
              <View style={styles.usageIconTile}>
                <ChefHat
                  color={palette.usageIcon}
                  size={20}
                  strokeWidth={2.2}
                />
              </View>
              <View style={styles.usageTextColumn}>
                <Text style={styles.usageTextPrimary}>
                  {t('home.fridge_scan.limit_primary')}
                </Text>
                <Text style={styles.usageTextSecondary}>
                  {t('home.fridge_scan.limit_secondary')}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.cta} testID="home-fridge-scan-cta">
              <Text style={styles.ctaText}>{t('home.fridge_scan.cta')}</Text>
              <ChevronRight
                color={palette.ctaIcon}
                size={24}
                strokeWidth={2.7}
              />
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (
  colors: ThemeColors,
  isDark: boolean,
  windowWidth: number,
  isCompact: boolean,
  isTablet: boolean,
  palette: ChefCardPalette,
) => {
  const cardMinHeight = isTablet ? 520 : isCompact ? 430 : 462;
  const horizontalPadding = isCompact ? SPACING.lg : SPACING.xl;
  const cardWidth = Math.max(windowWidth - SPACING.page * 2, 0);
  const copyWidth = isCompact ? 176 : isTablet ? 320 : 224;
  const footerHeight = isCompact ? 58 : 66;
  const copyScrimTargetWidth =
    horizontalPadding + copyWidth + (isCompact ? 16 : 22);
  const copyScrimWidth = Math.min(
    cardWidth,
    copyScrimTargetWidth,
  );
  const chefStageTop = isTablet ? 50 : isCompact ? 82 : 82;
  const chefStageHeight = Math.max(
    240,
    cardMinHeight -
      chefStageTop -
      footerHeight -
      horizontalPadding -
      (isCompact ? 14 : 16),
  );
  const chefStageWidth = chefStageHeight * 0.875;
  const chefStageRight = isTablet ? 16 : isCompact ? -42 : -34;

  return StyleSheet.create({
    shell: {
      marginHorizontal: SPACING.page,
      marginBottom: SPACING.md,
      borderRadius: BORDER_RADIUS.hero,
      shadowColor: palette.shellShadowColor,
      shadowOpacity: isDark ? 0.22 : 0.1,
      shadowRadius: isDark ? 20 : 16,
      shadowOffset: { width: 0, height: isDark ? 12 : 10 },
      elevation: 6,
    },
    surface: {
      minHeight: cardMinHeight,
      borderRadius: BORDER_RADIUS.hero,
      padding: horizontalPadding,
      overflow: 'hidden',
      backgroundColor: palette.surfaceBackground,
      borderWidth: 1,
      borderColor: palette.surfaceBorder,
      position: 'relative',
    },
    backgroundGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    goldWash: {
      ...StyleSheet.absoluteFillObject,
    },
    bottomScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '48%',
      zIndex: 3,
    },
    copyScrim: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: copyScrimWidth,
      zIndex: 1,
    },
    chefStage: {
      position: 'absolute',
      width: chefStageWidth,
      height: chefStageHeight,
      right: chefStageRight,
      top: chefStageTop,
      zIndex: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chefBackdropOrb: {
      position: 'absolute',
      inset: isDark ? 18 : 10,
      borderRadius: 999,
      opacity: isDark ? 0.9 : 1,
    },
    chefGroupImage: {
      width: '100%',
      height: '100%',
      shadowColor: palette.imageShadowColor,
      shadowOpacity: palette.imageShadowOpacity,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      opacity: palette.imageOpacity,
    },
    content: {
      minHeight: cardMinHeight - horizontalPadding * 2,
      position: 'relative',
      zIndex: 4,
    },
    copyColumn: {
      width: copyWidth,
      alignItems: 'flex-start',
      zIndex: 4,
    },
    premiumBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: palette.premiumBadgeBackground,
      borderWidth: 1,
      borderColor: palette.premiumBadgeBorder,
    },
    premiumText: {
      color: palette.premiumText,
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0,
      textTransform: 'uppercase',
    },
    title: {
      marginTop: isCompact ? SPACING.xl : SPACING.xl,
      color: palette.title,
      fontSize: isTablet ? 64 : isCompact ? 49 : 52,
      lineHeight: isTablet ? 70 : isCompact ? 55 : 58,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0,
      textShadowColor: isDark ? 'rgba(0, 0, 0, 0.24)' : 'rgba(255, 255, 255, 0.24)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: isDark ? 8 : 4,
    },
    description: {
      marginTop: SPACING.lg,
      color: palette.description,
      fontSize: isTablet ? SIZES.text18 : isCompact ? SIZES.text14 : SIZES.text16,
      lineHeight: isTablet ? 28 : isCompact ? 22 : 24,
      fontWeight: FONT_WEIGHTS.medium,
    },
    usagePanel: {
      marginTop: SPACING.xl + SPACING.xs,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: palette.usagePanelBackground,
      borderWidth: 1,
      borderColor: palette.usagePanelBorder,
      maxWidth: copyWidth,
    },
    usageIconTile: {
      width: 36,
      height: 36,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: palette.usageIconTileBackground,
      borderWidth: 1,
      borderColor: palette.usageIconTileBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    usageTextColumn: {
      flexShrink: 1,
    },
    usageTextPrimary: {
      color: palette.usageTextPrimary,
      fontSize: isTablet ? SIZES.text18 : SIZES.text16,
      lineHeight: isTablet ? 22 : 20,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0,
    },
    usageTextSecondary: {
      marginTop: 2,
      color: palette.usageTextSecondary,
      fontSize: isTablet ? SIZES.text14 : SIZES.text12,
      lineHeight: isTablet ? 18 : 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: 0.2,
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      paddingTop: SPACING.xl,
      minHeight: footerHeight,
      zIndex: 5,
    },
    cta: {
      minHeight: footerHeight,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: palette.ctaBackground,
      borderWidth: 1,
      borderColor: palette.ctaBorder,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xl,
      gap: SPACING.md,
      ...SHADOWS.button,
      shadowColor: palette.ctaShadowColor,
      shadowOpacity: isDark ? 0.28 : 0.16,
      shadowRadius: isDark ? 14 : 10,
      shadowOffset: { width: 0, height: isDark ? 8 : 6 },
    },
    ctaText: {
      color: palette.ctaText,
      fontSize: isCompact ? SIZES.text20 : 24,
      lineHeight: isCompact ? 26 : 30,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0,
    },
  });
};
