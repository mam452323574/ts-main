import { useMemo } from 'react';
import {
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
  buildPremiumHealthModulePalette,
  getPremiumHealthResponsiveCardMetrics,
} from '@/constants/premiumHealth';
import { OptimizedImage } from '@/components/OptimizedImage';
import {
  BORDER_RADIUS,
  FONT_FAMILIES,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

const ANALYST_COACH_IMAGE = require('../../assets/images/coach/analytical_precise.webp');

type AnalyticsHomeCardProps = {
  scanCount: number;
  onPress: () => void;
};

function getAnalyticsPalette(colors: any, isDark: boolean) {
  const base = buildPremiumHealthModulePalette(colors, isDark, 'trust');

  return {
    ...base,
    curveBase: withAlpha(base.accent, isDark ? 0.1 : 0.07),
    curveStrokeStart: withAlpha(base.accent, 0.04),
    curveStrokeMid: withAlpha(base.accent, isDark ? 0.34 : 0.26),
    curveStrokeEnd: withAlpha(base.accent, isDark ? 0.72 : 0.56),
  };
}

export function AnalyticsHomeCard({
  scanCount,
  onPress,
}: AnalyticsHomeCardProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { width: windowWidth } = useWindowDimensions();
  const metrics = useMemo(
    () => getPremiumHealthResponsiveCardMetrics(windowWidth),
    [windowWidth],
  );
  const palette = useMemo(
    () => getAnalyticsPalette(colors, isDark),
    [colors, isDark],
  );
  const styles = useMemo(
    () => createStyles(colors, isDark, metrics, palette),
    [colors, isDark, metrics, palette],
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
          colors={palette.bottomScrimGradient}
          start={{ x: 0.5, y: 0.42 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.bottomScrim}
        />
        <LinearGradient
          colors={palette.copyScrimGradient}
          start={{ x: 0, y: 0.35 }}
          end={{ x: 1, y: 0.35 }}
          style={styles.copyScrim}
        />

        <View pointerEvents="none" style={styles.visualStage}>
          <LinearGradient
            colors={palette.spotlightGradient}
            start={{ x: 0.12, y: 0.1 }}
            end={{ x: 0.92, y: 0.92 }}
            style={styles.visualGlow}
          />
          <OptimizedImage
            source={ANALYST_COACH_IMAGE}
            style={styles.coachImage}
            contentFit="contain"
            showPlaceholder={false}
            testID="home-analytics-coach-image"
          />
        </View>

        <View style={styles.content}>
          <View style={styles.copyColumn}>
            <View style={styles.eyebrowPill}>
              <TrendingUp
                color={palette.eyebrowText}
                size={16}
                strokeWidth={2.4}
              />
              <Text style={styles.eyebrow}>
                {t('home.analytics_card_eyebrow')}
              </Text>
            </View>

            <Text style={styles.title}>{t('home.analytics_card_title')}</Text>
            <Text style={styles.subtitle}>
              {t('home.analytics_card_subtitle')}
            </Text>

            <View style={styles.metaPanel}>
              <View style={styles.metaIconTile}>
                <TrendingUp
                  color={palette.accent}
                  size={18}
                  strokeWidth={2.4}
                />
              </View>
              <View style={styles.metaTextColumn}>
                <Text
                  style={styles.metaPrimary}
                  testID="home-analytics-scan-count"
                >
                  {scanCount}
                </Text>
                <Text
                  style={styles.metaSecondary}
                  testID="home-analytics-scan-label"
                >
                  {t('home.analytics_card_scan_label')}
                </Text>
              </View>
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
  _colors: any,
  isDark: boolean,
  metrics: ReturnType<typeof getPremiumHealthResponsiveCardMetrics>,
  palette: ReturnType<typeof getAnalyticsPalette>,
) => {
  const coachWidth = metrics.isTablet ? 312 : metrics.isCompact ? 212 : 248;
  const coachHeight = metrics.isTablet ? 312 : metrics.isCompact ? 212 : 248;
  const visualStageHeight = metrics.isTablet ? 280 : metrics.isCompact ? 210 : 238;
  const visualStageWidth = metrics.isTablet ? 268 : metrics.isCompact ? 188 : 222;
  const footerHeight = metrics.ctaHeight + SPACING.md;

  return StyleSheet.create({
    shell: {
      borderRadius: metrics.cardRadius,
      ...(Platform.OS === 'android'
        ? {
            elevation: 6,
          }
        : {
            ...SHADOWS.cardHover,
            shadowColor: palette.shellShadowColor,
            shadowOpacity: isDark ? 0.16 : 0.08,
            shadowRadius: isDark ? 18 : 14,
            shadowOffset: { width: 0, height: isDark ? 11 : 9 },
          }),
    },
    surface: {
      minHeight: metrics.cardMinHeight,
      borderRadius: metrics.cardRadius,
      padding: metrics.horizontalPadding,
      backgroundColor: palette.surfaceBackground,
      borderWidth: 1,
      borderColor: palette.surfaceBorder,
      overflow: 'hidden',
      position: 'relative',
    },
    backgroundGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    bottomScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '44%',
      zIndex: 2,
    },
    copyScrim: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: Math.min(
        metrics.copyWidth + metrics.horizontalPadding * 2 + 12,
        360,
      ),
      zIndex: 1,
    },
    visualStage: {
      position: 'absolute',
      right: metrics.isTablet ? 16 : metrics.isCompact ? -18 : -8,
      top: metrics.isTablet ? 58 : metrics.isCompact ? 94 : 92,
      width: visualStageWidth,
      height: visualStageHeight,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    visualGlow: {
      position: 'absolute',
      inset: 18,
      borderRadius: 999,
      opacity: isDark ? 0.36 : 0.42,
    },
    coachImage: {
      width: coachWidth,
      height: coachHeight,
      opacity: palette.imageOpacity,
      shadowColor: palette.imageShadowColor,
      shadowOpacity: palette.imageShadowOpacity,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
    },
    content: {
      minHeight: metrics.cardMinHeight - metrics.horizontalPadding * 2,
      position: 'relative',
      zIndex: 3,
    },
    copyColumn: {
      width: metrics.copyWidth,
      alignItems: 'flex-start',
      zIndex: 4,
    },
    eyebrowPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: palette.eyebrowBackground,
      borderWidth: 1,
      borderColor: palette.eyebrowBorder,
    },
    eyebrow: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0.45,
      textTransform: 'uppercase',
      color: palette.eyebrowText,
      fontFamily: FONT_FAMILIES.display,
    },
    title: {
      marginTop: SPACING.lg,
      fontSize: metrics.titleSize,
      lineHeight: metrics.titleLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      color: palette.title,
      letterSpacing: 0,
      fontFamily: FONT_FAMILIES.display,
    },
    subtitle: {
      marginTop: SPACING.sm,
      fontSize: metrics.bodySize,
      lineHeight: metrics.bodyLineHeight,
      fontWeight: FONT_WEIGHTS.medium,
      color: palette.body,
    },
    metaPanel: {
      marginTop: SPACING.lg,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: palette.metaPanelBackground,
      borderWidth: 1,
      borderColor: palette.metaPanelBorder,
      maxWidth: metrics.copyWidth,
    },
    metaIconTile: {
      width: 36,
      height: 36,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: palette.metaIconTileBackground,
      borderWidth: 1,
      borderColor: palette.metaIconTileBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    metaTextColumn: {
      flexShrink: 1,
    },
    metaPrimary: {
      fontSize: metrics.isTablet ? 40 : metrics.isCompact ? 32 : 36,
      lineHeight: metrics.isTablet ? 44 : metrics.isCompact ? 36 : 40,
      fontWeight: FONT_WEIGHTS.bold,
      color: palette.accent,
      letterSpacing: 0,
      fontFamily: FONT_FAMILIES.accent,
    },
    metaSecondary: {
      marginTop: 2,
      fontSize: metrics.metaSecondarySize,
      lineHeight: metrics.metaSecondarySize + 4,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: palette.metaSecondaryText,
      letterSpacing: 0.2,
    },
    curveWrap: {
      width: metrics.isTablet ? 248 : metrics.isCompact ? 178 : 204,
      height: metrics.isTablet ? 76 : metrics.isCompact ? 58 : 68,
      marginTop: SPACING.sm,
      marginLeft: -4,
      opacity: 0.94,
      zIndex: 2,
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      paddingTop: SPACING.md,
      minHeight: footerHeight,
      zIndex: 5,
    },
    cta: {
      minHeight: metrics.ctaHeight,
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
      shadowOpacity: isDark ? 0.12 : 0.06,
      shadowRadius: isDark ? 10 : 8,
      shadowOffset: { width: 0, height: isDark ? 6 : 4 },
    },
    ctaLabel: {
      fontSize: metrics.isCompact ? SIZES.text16 : SIZES.text18,
      lineHeight: metrics.isCompact ? 22 : 24,
      fontWeight: FONT_WEIGHTS.bold,
      color: palette.ctaText,
      letterSpacing: 0,
      fontFamily: FONT_FAMILIES.display,
    },
  });
};
