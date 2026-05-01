import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';
import { FONT_WEIGHTS, mixColors, withAlpha } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { ShareStoryMetric, ShareStoryPayload } from '@/types';
import { RESULT_TEXT_PROPS, getResultScaledRadius } from '@/utils/resultLayout';

interface ShareStoryCardProps {
  payload: ShareStoryPayload;
  onHeroImageLoadEnd?: () => void;
  testID?: string;
  cardWidth?: number;
}

interface CardPalette {
  backgroundTop: string;
  backgroundBottom: string;
  surface: string;
  imageSurface: string;
  imageBorder: string;
  ringTrack: string;
  divider: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  badgeBackground: string;
  badgeBorder: string;
  statusBackground: string;
  statusBorder: string;
}

const BASE_CARD_WIDTH = 360;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value);
}

function ScoreRing({
  score,
  accentColor,
  accentColorSecondary,
  trackColor,
}: {
  score: number;
  accentColor: string;
  accentColorSecondary?: string;
  trackColor: string;
}) {
  const size = 228;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, score / 100));
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <Svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%">
      <Defs>
        <SvgLinearGradient id="shareStoryRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={accentColor} />
          <Stop offset="100%" stopColor={accentColorSecondary ?? accentColor} />
        </SvgLinearGradient>
      </Defs>

      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="transparent"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="url(#shareStoryRingGradient)"
        strokeWidth={strokeWidth}
        fill="transparent"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

function buildPalette(
  variant: ShareStoryPayload['variant'],
  accentColor: string,
  accentColorSecondary: string | undefined,
  isDark: boolean,
  baseTextColor: string
): CardPalette {
  const lightBase = {
    backgroundTop: mixColors('#FFFFFF', accentColor, 0.08),
    backgroundBottom: mixColors('#F6F8FC', accentColorSecondary ?? accentColor, 0.04),
    surface: withAlpha('#FFFFFF', 0.72),
    imageSurface: mixColors('#FFFFFF', accentColor, 0.1),
    imageBorder: withAlpha(accentColor, 0.22),
    ringTrack: withAlpha(accentColor, 0.14),
    divider: withAlpha(baseTextColor, 0.08),
    border: withAlpha(baseTextColor, 0.06),
    textPrimary: '#111827',
    textSecondary: withAlpha('#111827', 0.64),
    badgeBackground: withAlpha(accentColor, 0.08),
    badgeBorder: withAlpha(accentColor, 0.16),
    statusBackground: withAlpha(accentColorSecondary ?? accentColor, 0.08),
    statusBorder: withAlpha(accentColorSecondary ?? accentColor, 0.18),
  };

  const darkBase = {
    backgroundTop: mixColors('#15171C', accentColor, variant === 'super' ? 0.22 : 0.14),
    backgroundBottom: mixColors('#0B0D12', accentColorSecondary ?? accentColor, 0.08),
    surface: withAlpha('#FFFFFF', 0.06),
    imageSurface: withAlpha('#FFFFFF', 0.05),
    imageBorder: withAlpha('#FFFFFF', 0.12),
    ringTrack: withAlpha('#FFFFFF', 0.12),
    divider: withAlpha('#FFFFFF', 0.09),
    border: withAlpha('#FFFFFF', 0.08),
    textPrimary: '#F8FAFC',
    textSecondary: withAlpha('#F8FAFC', 0.72),
    badgeBackground: withAlpha('#FFFFFF', 0.06),
    badgeBorder: withAlpha('#FFFFFF', 0.1),
    statusBackground: withAlpha(accentColorSecondary ?? accentColor, 0.12),
    statusBorder: withAlpha(accentColorSecondary ?? accentColor, 0.22),
  };

  return isDark ? darkBase : lightBase;
}

function getMetricTypography(valueVariant: ShareStoryMetric['valueVariant'], scale: number) {
  switch (valueVariant) {
    case 'fraction':
      return {
        fontSize: round(19 * scale),
        lineHeight: round(23 * scale),
        minimumFontScale: 0.82,
      };
    case 'text':
      return {
        fontSize: round(15 * scale),
        lineHeight: round(19 * scale),
        minimumFontScale: 0.74,
      };
    case 'numeric':
    default:
      return {
        fontSize: round(20 * scale),
        lineHeight: round(24 * scale),
        minimumFontScale: 0.86,
      };
  }
}

function createStyles(scale: number) {
  const heroRadius = getResultScaledRadius('hero', scale);
  const featureRadius = getResultScaledRadius('feature', scale);

  return StyleSheet.create({
    card: {
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      borderRadius: heroRadius,
      backgroundColor: '#FFFFFF',
    },
    cardInnerStroke: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: heroRadius,
      borderWidth: StyleSheet.hairlineWidth,
    },
    glowOrb: {
      position: 'absolute',
      borderRadius: 999,
      opacity: 0.64,
    },
    glowOrbTop: {
      width: '64%',
      aspectRatio: 1,
      top: '-12%',
      right: '-18%',
    },
    glowOrbBottom: {
      width: '58%',
      aspectRatio: 1,
      bottom: '-16%',
      left: '-16%',
    },
    content: {
      flex: 1,
      paddingHorizontal: '8.25%',
      paddingTop: '7.8%',
      paddingBottom: '5.8%',
    },
    body: {
      flex: 1,
      justifyContent: 'space-between',
    },
    headerRow: {
      minHeight: round(52 * scale),
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      columnGap: round(10 * scale),
      rowGap: round(10 * scale),
    },
    variantBadge: {
      minHeight: round(36 * scale),
      maxWidth: '100%',
      flexShrink: 1,
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 9999,
      paddingHorizontal: round(14 * scale),
      paddingVertical: round(8 * scale),
    },
    variantBadgeText: {
      fontSize: round(12 * scale),
      lineHeight: round(16 * scale),
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: 0.3 * scale,
      textAlign: 'center',
    },
    statusBadge: {
      minHeight: round(36 * scale),
      maxWidth: '100%',
      flexShrink: 1,
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 9999,
      paddingHorizontal: round(12 * scale),
      paddingVertical: round(8 * scale),
    },
    statusBadgeText: {
      fontSize: round(11 * scale),
      lineHeight: round(15 * scale),
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: 0.2 * scale,
      textAlign: 'center',
    },
    heroSection: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: round(4 * scale),
      paddingBottom: round(10 * scale),
    },
    ringContainer: {
      width: '86%',
      minWidth: round(210 * scale),
      maxWidth: round(312 * scale),
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroImageFrame: {
      position: 'absolute',
      width: '82%',
      minWidth: round(172 * scale),
      maxWidth: round(258 * scale),
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: Math.max(1, round(2 * scale)),
      borderRadius: 9999,
    },
    heroImage: {
      width: '100%',
      height: '100%',
    },
    heroPlaceholder: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: round(18 * scale),
    },
    heroPlaceholderBrand: {
      fontSize: round(15 * scale),
      lineHeight: round(20 * scale),
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 1.1 * scale,
      textAlign: 'center',
    },
    scoreLabel: {
      maxWidth: '100%',
      fontSize: round(12 * scale),
      lineHeight: round(16 * scale),
      fontWeight: FONT_WEIGHTS.medium,
      letterSpacing: 0.24 * scale,
      textAlign: 'center',
    },
    scoreLabelWrap: {
      width: '100%',
      minHeight: round(24 * scale),
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: round(12 * scale),
    },
    scoreRow: {
      marginTop: round(4 * scale),
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'center',
    },
    scoreValue: {
      fontSize: round(58 * scale),
      lineHeight: round(58 * scale),
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: -2 * scale,
      includeFontPadding: false,
    },
    scoreSuffix: {
      marginLeft: round(6 * scale),
      fontSize: round(18 * scale),
      lineHeight: round(18 * scale),
      fontWeight: FONT_WEIGHTS.medium,
      includeFontPadding: false,
    },
    metricsRow: {
      minHeight: round(112 * scale),
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: featureRadius,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
    },
    metricColumn: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingHorizontal: round(10 * scale),
      paddingVertical: round(14 * scale),
      rowGap: round(8 * scale),
    },
    metricColumnTextPriority: {
      flex: 1.18,
    },
    metricColumnCompactPriority: {
      flex: 0.91,
    },
    metricLabelWrap: {
      width: '100%',
      minWidth: 0,
      alignItems: 'stretch',
      justifyContent: 'center',
    },
    metricLabel: {
      textAlign: 'center',
      fontSize: round(10 * scale),
      lineHeight: round(14 * scale),
      fontWeight: FONT_WEIGHTS.medium,
      paddingHorizontal: round(2 * scale),
      flexShrink: 1,
      includeFontPadding: false,
    },
    metricValueWrap: {
      width: '100%',
      minWidth: 0,
      alignItems: 'stretch',
      justifyContent: 'center',
      flexGrow: 1,
    },
    metricValue: {
      textAlign: 'center',
      flexShrink: 1,
      includeFontPadding: false,
      paddingHorizontal: round(2 * scale),
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    metricValueNumeric: {
      letterSpacing: -0.3 * scale,
    },
    metricValueFraction: {
      letterSpacing: -0.4 * scale,
    },
    metricValueText: {
      alignSelf: 'stretch',
      paddingHorizontal: round(4 * scale),
      fontWeight: FONT_WEIGHTS.medium,
    },
    footerBlock: {
      alignItems: 'center',
      justifyContent: 'flex-end',
      width: '100%',
      paddingHorizontal: '4%',
      minHeight: round(54 * scale),
      paddingTop: round(10 * scale),
      paddingBottom: round(6 * scale),
    },
    footerBrand: {
      width: '100%',
      textAlign: 'center',
      fontSize: round(19 * scale),
      lineHeight: round(23 * scale),
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 1.5 * scale,
    },
  });
}

export function ShareStoryCard({
  payload,
  onHeroImageLoadEnd,
  testID,
  cardWidth,
}: ShareStoryCardProps) {
  const { colors, isDark } = useTheme();
  const scale = useMemo(
    () => clamp((cardWidth ?? BASE_CARD_WIDTH) / BASE_CARD_WIDTH, 0.78, 1.08),
    [cardWidth]
  );
  const styles = useMemo(() => createStyles(scale), [scale]);
  const labelLineHeight = round(15 * scale);
  const labelSlotLines = 2;

  const palette = useMemo(
    () =>
      buildPalette(
        payload.variant,
        payload.accentColor,
        payload.accentColorSecondary,
        isDark,
        colors.primaryText
      ),
    [colors.primaryText, isDark, payload.accentColor, payload.accentColorSecondary, payload.variant]
  );

  return (
    <View style={styles.card} testID={testID}>
      <LinearGradient
        colors={[palette.backgroundTop, palette.backgroundBottom]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={[styles.cardInnerStroke, { borderColor: palette.border }]} />

      <View
        pointerEvents="none"
        style={[
          styles.glowOrb,
          styles.glowOrbTop,
          { backgroundColor: withAlpha(payload.accentColor, isDark ? 0.2 : 0.12) },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.glowOrb,
          styles.glowOrbBottom,
          {
            backgroundColor: withAlpha(
              payload.accentColorSecondary ?? payload.accentColor,
              isDark ? 0.14 : 0.09
            ),
          },
        ]}
      />

      <View style={styles.content}>
        <View style={styles.body} testID="share-story-body">
          <View style={styles.headerRow} testID="share-story-header-row">
            <View
              style={[
                styles.variantBadge,
                {
                  backgroundColor: palette.badgeBackground,
                  borderColor: palette.badgeBorder,
                },
              ]}
              testID="share-story-variant-badge"
            >
              <Text
                adjustsFontSizeToFit
                {...RESULT_TEXT_PROPS}
                minimumFontScale={0.82}
                numberOfLines={2}
                style={[
                  styles.variantBadgeText,
                  { color: payload.accentColor },
                ]}
              >
                {payload.variantLabel}
              </Text>
            </View>

            {payload.statusBadgeLabel ? (
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: palette.statusBackground,
                    borderColor:
                      payload.statusTone === 'warning'
                        ? withAlpha(payload.accentColorSecondary ?? payload.accentColor, 0.28)
                        : palette.statusBorder,
                  },
                ]}
                testID="share-story-status-badge"
              >
                <Text
                  adjustsFontSizeToFit
                  {...RESULT_TEXT_PROPS}
                  minimumFontScale={0.82}
                  numberOfLines={2}
                  style={[
                    styles.statusBadgeText,
                    {
                      color:
                        payload.statusTone === 'warning'
                          ? payload.accentColorSecondary ?? payload.accentColor
                          : payload.accentColor,
                    },
                  ]}
                >
                  {payload.statusBadgeLabel}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.heroSection} testID="share-story-hero-section">
            <View style={styles.ringContainer} testID="share-story-ring-container">
              <ScoreRing
                score={payload.score}
                accentColor={payload.accentColor}
                accentColorSecondary={payload.accentColorSecondary}
                trackColor={palette.ringTrack}
              />

              <View
                style={[
                  styles.heroImageFrame,
                  {
                    backgroundColor: palette.imageSurface,
                    borderColor: palette.imageBorder,
                  },
                ]}
                testID="share-story-hero-image-frame"
              >
                {payload.heroImageUri ? (
                  <Image
                    source={{ uri: payload.heroImageUri }}
                    resizeMode="cover"
                    onLoadEnd={onHeroImageLoadEnd}
                    style={styles.heroImage}
                    testID="share-story-hero-image"
                  />
                ) : (
                  <View style={styles.heroPlaceholder}>
                    <Text
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      numberOfLines={2}
                      style={[styles.heroPlaceholderBrand, { color: payload.accentColor }]}
                    >
                      {payload.footerBrand}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.scoreLabelWrap}>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.84}
                numberOfLines={2}
                style={[styles.scoreLabel, { color: palette.textSecondary }]}
                testID="share-story-score-label"
              >
                {payload.scoreLabel}
              </Text>
            </View>

            <View style={styles.scoreRow} testID="share-story-score-row">
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.9}
                numberOfLines={1}
                style={[styles.scoreValue, { color: palette.textPrimary }]}
                testID="share-story-primary-score"
              >
                {payload.score}
              </Text>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.84}
                numberOfLines={1}
                style={[styles.scoreSuffix, { color: palette.textSecondary }]}
                testID="share-story-score-suffix"
              >
                /100
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.metricsRow,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
            testID="share-story-metrics-row"
          >
            {payload.metrics.map((metric, index) => {
              const metricTypography = getMetricTypography(metric.valueVariant, scale);
              const labelSlotHeight = Math.max(metric.labelMaxLines, labelSlotLines) * labelLineHeight;
              const valueSlotLines = Math.max(
                metric.valueMaxLines,
                metric.valueVariant === 'text' ? 2 : 1
              );

              return (
                <View
                  key={`${metric.label}-${index}`}
                  style={[
                    styles.metricColumn,
                    metric.valueVariant === 'text'
                      ? styles.metricColumnTextPriority
                      : styles.metricColumnCompactPriority,
                    index < payload.metrics.length - 1 && {
                      borderRightWidth: StyleSheet.hairlineWidth,
                      borderRightColor: palette.divider,
                    },
                  ]}
                  testID={`share-story-metric-${index}`}
                >
                  <View
                    style={[
                      styles.metricLabelWrap,
                      { minHeight: labelSlotHeight },
                    ]}
                    testID={`share-story-metric-label-wrap-${index}`}
                  >
                    <Text
                      {...RESULT_TEXT_PROPS}
                      ellipsizeMode="tail"
                      numberOfLines={Math.max(metric.labelMaxLines, labelSlotLines)}
                      style={[styles.metricLabel, { color: palette.textSecondary }]}
                      testID={`share-story-metric-label-${index}`}
                    >
                      {metric.label}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.metricValueWrap,
                      { minHeight: valueSlotLines * metricTypography.lineHeight },
                    ]}
                    testID={`share-story-metric-value-wrap-${index}`}
                  >
                    <Text
                      {...RESULT_TEXT_PROPS}
                      ellipsizeMode="tail"
                      {...(metric.valueVariant === 'text'
                        ? {}
                        : {
                            adjustsFontSizeToFit: true,
                            minimumFontScale: metricTypography.minimumFontScale,
                          })}
                      numberOfLines={metric.valueMaxLines}
                      style={[
                        styles.metricValue,
                        metric.valueVariant === 'text'
                          ? styles.metricValueText
                          : metric.valueVariant === 'fraction'
                            ? styles.metricValueFraction
                            : styles.metricValueNumeric,
                        {
                          color: palette.textPrimary,
                          fontSize: metricTypography.fontSize,
                          lineHeight: metricTypography.lineHeight,
                        },
                      ]}
                      testID={
                        payload.variant === 'super' && index === 0
                          ? 'share-story-super-risk-value'
                          : `share-story-metric-value-${index}`
                      }
                    >
                      {metric.value}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.footerBlock} testID="share-story-footer">
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.88}
            numberOfLines={1}
            style={[styles.footerBrand, { color: palette.textPrimary }]}
          >
            {payload.footerBrand}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default ShareStoryCard;
