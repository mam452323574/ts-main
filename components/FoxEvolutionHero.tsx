import { useMemo } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getGamificationAssetSource } from '@/constants/gamificationAssets';
import { type GamificationStageProgress } from '@/constants/gamification';
import { buildPremiumHealthPalette } from '@/constants/premiumHealth';
import {
  BORDER_RADIUS,
  FONT_FAMILIES,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import type { GamificationData } from '@/types';

interface FoxEvolutionHeroProps {
  gamification: GamificationData;
  progress: GamificationStageProgress;
}

export function FoxEvolutionHero({
  gamification,
  progress,
}: FoxEvolutionHeroProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const { width: windowWidth } = useWindowDimensions();
  const premiumHealth = useMemo(
    () => buildPremiumHealthPalette(colors, isDark),
    [colors, isDark],
  );

  const styles = useMemo(
    () => createStyles(colors, isDark, premiumHealth, windowWidth),
    [colors, isDark, premiumHealth, windowWidth],
  );
  const backgroundGradientColors = useMemo(
    () => premiumHealth.moduleGradient,
    [premiumHealth],
  );
  const mascotAssetSource = useMemo(
    () => getGamificationAssetSource(gamification.mascotFilename),
    [gamification.mascotFilename],
  );
  const progressWidth: `${number}%` = progress.isFinalStage
    ? '100%'
    : `${Number(progress.progressPercent.toFixed(2))}%`;
  const stageSpan = progress.isFinalStage
    ? 0
    : Math.max(
        (progress.nextStageMinScans ?? progress.currentStageMinScans) -
          progress.currentStageMinScans,
        0,
      );

  return (
    <View style={styles.shell} testID="fox-evolution-hero">
      <LinearGradient
        colors={backgroundGradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backgroundGradient}
      />
      <View style={[styles.glow, styles.glowPrimary]} />
      <View style={[styles.glow, styles.glowSecondary]} />

      <View style={styles.headerRow}>
        <View style={styles.copyColumn}>
          <Text style={styles.eyebrow}>{t('home.fox_evolution.eyebrow')}</Text>
          <Text style={styles.stageLabel} testID="fox-evolution-stage-label">
            {t('home.fox_evolution.stage_label', {
              stage: progress.currentStage,
            })}
          </Text>
          <Text style={styles.scanTotal}>
            {t('home.fox_evolution.scan_total', {
              count: gamification.scanCount,
            })}
          </Text>
          {progress.isFinalStage ? (
            <Text
              style={styles.supportingText}
              testID="fox-evolution-supporting-text"
            >
              {t('home.fox_evolution.max_stage')}
            </Text>
          ) : null}
        </View>

        <View style={styles.mascotShell} testID="fox-evolution-mascot-shell">
          <View style={styles.mascotHalo} />
          <ExpoImage
            source={mascotAssetSource}
            style={styles.mascotImage}
            contentFit="contain"
            testID="fox-evolution-mascot-image"
            accessibilityLabel={`Mascot stage ${progress.currentStage}`}
          />
        </View>
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressTrack}>
          <LinearGradient
            colors={[premiumHealth.trustAccent, premiumHealth.premiumAccent]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.progressFill, { width: progressWidth }]}
            testID="fox-evolution-progress-fill"
          />
        </View>

        <View style={styles.progressMeta}>
          <Text
            style={styles.progressRangeText}
            testID="fox-evolution-progress-range"
          >
            {progress.isFinalStage
              ? t('home.fox_evolution.stage_range_max', {
                  start: progress.currentStageMinScans,
                })
              : t('home.fox_evolution.stage_range', {
                  start: progress.currentStageMinScans,
                  end: progress.nextStageMinScans,
                })}
          </Text>
          {!progress.isFinalStage ? (
            <Text
              style={styles.progressValueText}
              testID="fox-evolution-stage-progress"
            >
              {t('home.fox_evolution.stage_progress', {
                current: progress.scansIntoStage,
                total: stageSpan,
              })}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const createStyles = (
  colors: any,
  isDark: boolean,
  premiumHealth: ReturnType<typeof buildPremiumHealthPalette>,
  windowWidth: number,
) => {
  const isCompact = windowWidth < 390;
  const isTablet = windowWidth >= 768;
  const mascotShellSize = isTablet ? 236 : isCompact ? 182 : 208;
  const mascotImageSize = isTablet ? 220 : isCompact ? 164 : 190;
  const shellPaddingHorizontal = isTablet ? SPACING.lg : SPACING.md;
  const shellPaddingVertical = isTablet ? SPACING.lg : SPACING.md;

  return StyleSheet.create({
    shell: {
      width: '100%',
      borderRadius: 30,
      paddingHorizontal: shellPaddingHorizontal,
      paddingVertical: shellPaddingVertical,
      backgroundColor: premiumHealth.surfaceRaised,
      borderWidth: 1,
      borderColor: premiumHealth.borderStrong,
      overflow: 'hidden',
      position: 'relative',
      ...(Platform.OS === 'android'
        ? {
            elevation: 3,
          }
        : {
            ...SHADOWS.card,
            shadowColor: premiumHealth.shadowColor,
            shadowOpacity: isDark ? 0.12 : 0.07,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
          }),
    },
    backgroundGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    glow: {
      position: 'absolute',
      borderRadius: BORDER_RADIUS.full,
      opacity: isDark ? 0.075 : 0.1,
    },
    glowPrimary: {
      width: 124,
      height: 124,
      top: -30,
      left: -16,
      backgroundColor: withAlpha(premiumHealth.trustAccent, isDark ? 0.1 : 0.055),
    },
    glowSecondary: {
      width: 116,
      height: 116,
      right: -16,
      bottom: 18,
      backgroundColor: withAlpha(premiumHealth.premiumAccent, isDark ? 0.09 : 0.055),
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    copyColumn: {
      flex: 1,
      minWidth: 0,
      gap: SPACING.xs,
    },
    eyebrow: {
      fontSize: SIZES.text10,
      lineHeight: 14,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 1.2,
      color: premiumHealth.trustAccent,
      textTransform: 'uppercase',
      fontFamily: FONT_FAMILIES.display,
    },
    stageLabel: {
      fontSize: isTablet ? 30 : isCompact ? 22 : 26,
      lineHeight: isTablet ? 36 : isCompact ? 28 : 32,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'left',
      fontFamily: FONT_FAMILIES.display,
    },
    scanTotal: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.gray,
      fontFamily: FONT_FAMILIES.display,
    },
    supportingText: {
      marginTop: 2,
      fontSize: SIZES.text12,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.gray,
      fontFamily: FONT_FAMILIES.display,
    },
    mascotShell: {
      width: mascotShellSize,
      height: mascotShellSize,
      borderRadius: BORDER_RADIUS.full,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
      flexShrink: 0,
    },
    mascotHalo: {
      position: 'absolute',
      width: mascotShellSize,
      height: mascotShellSize,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(premiumHealth.trustAccent, isDark ? 0.07 : 0.04),
      borderWidth: 1,
      borderColor: withAlpha(premiumHealth.trustAccent, isDark ? 0.1 : 0.06),
      transform: [{ scale: 1.02 }],
    },
    mascotImage: {
      width: mascotImageSize,
      height: mascotImageSize,
      opacity: isDark ? 0.96 : 0.94,
    },
    progressSection: {
      width: '100%',
      gap: SPACING.xs,
      marginTop: SPACING.md,
    },
    progressTrack: {
      width: '100%',
      height: 9,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(premiumHealth.trustAccent, isDark ? 0.08 : 0.05),
      borderWidth: 1,
      borderColor: withAlpha(premiumHealth.trustAccent, isDark ? 0.06 : 0.045),
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: BORDER_RADIUS.full,
    },
    progressMeta: {
      flexDirection: isCompact ? 'column' : 'row',
      alignItems: isCompact ? 'flex-start' : 'center',
      justifyContent: isCompact ? 'flex-start' : 'space-between',
      gap: isCompact ? SPACING.xs : SPACING.sm,
    },
    progressRangeText: {
      ...(isCompact
        ? {
            width: '100%',
          }
        : {
            flex: 1,
          }),
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.gray,
      fontFamily: FONT_FAMILIES.display,
    },
    progressValueText: {
      ...(isCompact
        ? {
            width: '100%',
          }
        : {}),
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.bold,
      color: mixColors(colors.primaryText, premiumHealth.trustAccent, 0.12),
      textAlign: isCompact ? 'left' : 'right',
      fontFamily: FONT_FAMILIES.accent,
    },
  });
};

export default FoxEvolutionHero;
