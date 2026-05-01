import { useMemo } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, TrendingUp } from 'lucide-react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

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

const ANALYST_COACH_IMAGE = require('../../assets/images/coach/analytical_precise.png');

type AnalyticsHomeCardProps = {
  scanCount: number;
  onPress: () => void;
};

type AnalyticsCardPalette = {
  accentBlue: string;
  surfaceBackground: string;
  surfaceBorder: string;
  backgroundGradient: readonly [string, string, string];
  blueWashGradient: readonly [string, string, string];
  coachGlowGradient: readonly [string, string, string];
  eyebrowBackground: string;
  eyebrowBorder: string;
  eyebrowText: string;
  title: string;
  subtitle: string;
  scanCountLabel: string;
  curveBase: string;
  curveStrokeStart: string;
  curveStrokeMid: string;
  curveStrokeEnd: string;
  ctaBackground: string;
  ctaBorder: string;
  ctaText: string;
  ctaIcon: string;
  ctaShadowColor: string;
  shellShadowColor: string;
  coachImageOpacity: number;
};

function getAnalyticsPalette(
  colors: ThemeColors,
  isDark: boolean,
): AnalyticsCardPalette {
  if (isDark) {
    return {
      accentBlue: '#3F84FF',
      surfaceBackground: '#07152B',
      surfaceBorder: 'rgba(82, 132, 216, 0.28)',
      backgroundGradient: ['#102A55', '#071A35', '#061326'] as const,
      blueWashGradient: [
        'rgba(63, 132, 255, 0.18)',
        'rgba(63, 132, 255, 0.04)',
        'rgba(63, 132, 255, 0)',
      ] as const,
      coachGlowGradient: [
        'rgba(63, 132, 255, 0.2)',
        'rgba(63, 132, 255, 0.06)',
        'rgba(63, 132, 255, 0)',
      ] as const,
      eyebrowBackground: 'rgba(8, 28, 58, 0.72)',
      eyebrowBorder: 'rgba(116, 154, 219, 0.24)',
      eyebrowText: 'rgba(255, 255, 255, 0.9)',
      title: colors.white,
      subtitle: 'rgba(224, 232, 246, 0.72)',
      scanCountLabel: 'rgba(224, 232, 246, 0.72)',
      curveBase: 'rgba(57, 124, 255, 0.16)',
      curveStrokeStart: 'rgba(31, 99, 232, 0.05)',
      curveStrokeMid: 'rgba(47, 120, 255, 0.62)',
      curveStrokeEnd: 'rgba(77, 147, 255, 0.96)',
      ctaBackground: '#1766EE',
      ctaBorder: withAlpha(colors.white, 0.2),
      ctaText: colors.white,
      ctaIcon: '#FFFFFF',
      ctaShadowColor: '#1766EE',
      shellShadowColor: mixColors(colors.primary, colors.secondary, 0.18),
      coachImageOpacity: 1,
    };
  }

  const accentBlue = mixColors(colors.primaryDark, colors.white, 0.2);
  const textInk = mixColors(colors.primaryText, colors.primaryDark, 0.12);
  const secondaryInk = mixColors(colors.secondaryText, accentBlue, 0.16);

  return {
    accentBlue,
    surfaceBackground: mixColors(colors.cardBackground, colors.primary, 0.05),
    surfaceBorder: withAlpha(accentBlue, 0.18),
    backgroundGradient: [
      mixColors(colors.white, colors.primary, 0.1),
      mixColors(colors.cardBackground, colors.primary, 0.06),
      mixColors(colors.surfaceMuted, colors.primary, 0.03),
    ] as const,
    blueWashGradient: [
      withAlpha(accentBlue, 0.12),
      withAlpha(accentBlue, 0.04),
      withAlpha(accentBlue, 0),
    ] as const,
    coachGlowGradient: [
      withAlpha(accentBlue, 0.16),
      withAlpha(accentBlue, 0.05),
      withAlpha(accentBlue, 0),
    ] as const,
    eyebrowBackground: mixColors(colors.white, colors.primary, 0.12),
    eyebrowBorder: withAlpha(accentBlue, 0.14),
    eyebrowText: textInk,
    title: textInk,
    subtitle: secondaryInk,
    scanCountLabel: mixColors(colors.secondaryText, accentBlue, 0.22),
    curveBase: withAlpha(accentBlue, 0.12),
    curveStrokeStart: withAlpha(accentBlue, 0.08),
    curveStrokeMid: withAlpha(accentBlue, 0.44),
    curveStrokeEnd: withAlpha(accentBlue, 0.82),
    ctaBackground: mixColors(colors.white, colors.primary, 0.22),
    ctaBorder: withAlpha(accentBlue, 0.18),
    ctaText: textInk,
    ctaIcon: textInk,
    ctaShadowColor: accentBlue,
    shellShadowColor: mixColors(colors.gray, colors.primary, 0.16),
    coachImageOpacity: 0.96,
  };
}

export function AnalyticsHomeCard({
  scanCount,
  onPress,
}: AnalyticsHomeCardProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { width: windowWidth } = useWindowDimensions();
  const isCompact = windowWidth < 360;
  const isTablet = windowWidth >= 768;
  const palette = useMemo(
    () => getAnalyticsPalette(colors, isDark),
    [colors, isDark],
  );
  const styles = useMemo(
    () => createStyles(colors, isDark, isCompact, isTablet, palette),
    [colors, isCompact, isDark, isTablet, palette],
  );

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.94}
      onPress={onPress}
      style={styles.shell}
      testID="home-analytics-card"
    >
      <View style={styles.surface} testID="home-analytics-card-surface">
        <LinearGradient
          colors={palette.backgroundGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.backgroundGradient}
        />
        <LinearGradient
          colors={palette.blueWashGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.blueWash}
        />
        <LinearGradient
          colors={palette.coachGlowGradient}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.coachGlow}
        />

        <Image
          source={ANALYST_COACH_IMAGE}
          style={styles.coachImage}
          resizeMode="contain"
          testID="home-analytics-coach-image"
        />

        <View style={styles.content}>
          <View style={styles.copyColumn}>
            <View style={styles.eyebrowPill}>
              <TrendingUp
                color={palette.accentBlue}
                size={16}
                strokeWidth={2.5}
              />
              <Text style={styles.eyebrow}>
                {t('home.analytics_card_eyebrow')}
              </Text>
            </View>

            <Text style={styles.title}>{t('home.analytics_card_title')}</Text>
            <Text style={styles.subtitle}>
              {t('home.analytics_card_subtitle')}
            </Text>

            <View style={styles.scanCountBlock}>
              <Text
                style={styles.scanCountNumber}
                testID="home-analytics-scan-count"
              >
                {scanCount}
              </Text>
              <Text
                style={styles.scanCountLabel}
                testID="home-analytics-scan-label"
              >
                {t('home.analytics_card_scan_label')}
              </Text>
            </View>

            <View
              pointerEvents="none"
              style={styles.curveWrap}
              testID="home-analytics-curve"
            >
              <Svg width="100%" height="100%" viewBox="0 0 220 86">
                <Defs>
                  <SvgLinearGradient
                    id="analyticsCurveStroke"
                    x1="0"
                    y1="1"
                    x2="1"
                    y2="0"
                  >
                    <Stop
                      offset="0%"
                      stopColor={palette.curveStrokeStart}
                      stopOpacity={1}
                    />
                    <Stop
                      offset="42%"
                      stopColor={palette.curveStrokeMid}
                      stopOpacity={1}
                    />
                    <Stop
                      offset="100%"
                      stopColor={palette.curveStrokeEnd}
                      stopOpacity={1}
                    />
                  </SvgLinearGradient>
                </Defs>

                <Path
                  d="M 8 74 C 52 74 88 64 118 49 C 148 34 173 28 200 12.5"
                  stroke={palette.curveBase}
                  strokeWidth={5.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <Path
                  d="M 8 74 C 52 74 88 64 118 49 C 148 34 173 28 200 12.5"
                  stroke="url(#analyticsCurveStroke)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <Path
                  testID="home-analytics-arrow-head"
                  d="M 191 13.3 L 200 12.5 L 194.8 19.9"
                  stroke="url(#analyticsCurveStroke)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.cta} testID="home-analytics-cta">
              <Text style={styles.ctaLabel}>
                {t('home.analytics_card_cta')}
              </Text>
              <ChevronRight
                color={palette.ctaIcon}
                size={22}
                strokeWidth={2.8}
              />
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (
  colors: any,
  isDark: boolean,
  isCompact: boolean,
  isTablet: boolean,
  palette: AnalyticsCardPalette,
) => {
  const cardRadius = isTablet ? BORDER_RADIUS.hero + 4 : BORDER_RADIUS.hero;
  const coachWidth = isTablet ? 392 : isCompact ? 232 : 266;
  const coachHeight = isTablet ? 392 : isCompact ? 232 : 266;
  const copyMaxWidth = isTablet ? 380 : isCompact ? 188 : 232;
  const cardMinHeight = isTablet ? 520 : isCompact ? 430 : 462;

  return StyleSheet.create({
    shell: {
      marginHorizontal: SPACING.page,
      marginBottom: SPACING.md,
      borderRadius: cardRadius,
      ...(Platform.OS === 'android'
        ? {
            elevation: 6,
          }
        : {
            ...SHADOWS.cardHover,
            shadowColor: palette.shellShadowColor,
            shadowOpacity: isDark ? 0.22 : 0.1,
            shadowRadius: isDark ? 22 : 18,
            shadowOffset: { width: 0, height: isDark ? 12 : 10 },
          }),
    },
    surface: {
      minHeight: cardMinHeight,
      borderRadius: cardRadius,
      padding: isTablet ? SPACING.xl : isCompact ? SPACING.md + 2 : SPACING.lg + 2,
      backgroundColor: palette.surfaceBackground,
      borderWidth: 1,
      borderColor: palette.surfaceBorder,
      overflow: 'hidden',
    },
    backgroundGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    blueWash: {
      position: 'absolute',
      top: -24,
      left: -18,
      right: 0,
      height: '72%',
    },
    coachGlow: {
      position: 'absolute',
      right: isTablet ? 20 : isCompact ? -12 : -4,
      bottom: isTablet ? 116 : isCompact ? 112 : 116,
      width: isTablet ? 240 : isCompact ? 176 : 208,
      height: isTablet ? 240 : isCompact ? 176 : 208,
      borderRadius: 999,
      opacity: isDark ? 0.9 : 1,
    },
    coachImage: {
      position: 'absolute',
      right: isTablet ? -36 : isCompact ? -62 : -58,
      bottom: isTablet ? 76 : isCompact ? 76 : 74,
      width: coachWidth,
      height: coachHeight,
      zIndex: 1,
      opacity: palette.coachImageOpacity,
    },
    content: {
      flex: 1,
      justifyContent: 'space-between',
      zIndex: 2,
    },
    copyColumn: {
      maxWidth: copyMaxWidth,
      zIndex: 3,
    },
    eyebrowPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: isCompact ? SPACING.md : SPACING.lg,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.md + 6,
      backgroundColor: palette.eyebrowBackground,
      borderWidth: 1,
      borderColor: palette.eyebrowBorder,
      marginBottom: isCompact ? SPACING.xl : SPACING.xl + 2,
    },
    eyebrow: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.bold,
      color: palette.eyebrowText,
      textTransform: 'uppercase',
      letterSpacing: 0,
    },
    title: {
      fontSize: isTablet ? 42 : isCompact ? 30 : 34,
      lineHeight: isTablet ? 48 : isCompact ? 36 : 40,
      fontWeight: FONT_WEIGHTS.bold,
      color: palette.title,
      letterSpacing: 0,
    },
    subtitle: {
      marginTop: SPACING.md,
      fontSize: isTablet ? SIZES.text18 : SIZES.text16,
      lineHeight: isTablet ? 27 : 24,
      color: palette.subtitle,
    },
    scanCountBlock: {
      marginTop: isCompact ? SPACING.lg : SPACING.lg + 6,
    },
    scanCountNumber: {
      fontSize: isTablet ? 54 : isCompact ? 44 : 48,
      lineHeight: isTablet ? 60 : isCompact ? 50 : 54,
      fontWeight: FONT_WEIGHTS.bold,
      color: palette.accentBlue,
      letterSpacing: 0,
    },
    scanCountLabel: {
      marginTop: 2,
      fontSize: isTablet ? SIZES.text18 : SIZES.text16,
      lineHeight: isTablet ? 24 : 21,
      fontWeight: FONT_WEIGHTS.medium,
      color: palette.scanCountLabel,
    },
    curveWrap: {
      width: isTablet ? 264 : isCompact ? 166 : 204,
      height: isTablet ? 86 : isCompact ? 58 : 68,
      marginTop: isCompact ? SPACING.xs + 2 : SPACING.sm,
      marginLeft: -4,
      opacity: 0.94,
      zIndex: 2,
    },
    footer: {
      marginTop: isTablet ? SPACING.xl : isCompact ? SPACING.lg : SPACING.xl,
      zIndex: 4,
    },
    cta: {
      minHeight: isTablet ? 58 : 54,
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: SPACING.lg,
      borderWidth: 1,
      borderColor: palette.ctaBorder,
      backgroundColor: palette.ctaBackground,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.md,
      ...SHADOWS.button,
      shadowColor: palette.ctaShadowColor,
      shadowOpacity: isDark ? 0.26 : 0.14,
      shadowRadius: isDark ? 10 : 8,
      shadowOffset: { width: 0, height: isDark ? 6 : 4 },
    },
    ctaLabel: {
      fontSize: isTablet ? SIZES.text18 : SIZES.text16,
      lineHeight: isTablet ? 24 : 22,
      fontWeight: FONT_WEIGHTS.bold,
      color: palette.ctaText,
      letterSpacing: 0,
    },
  });
};
