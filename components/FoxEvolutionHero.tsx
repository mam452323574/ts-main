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
import {
  BORDER_RADIUS,
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

  const styles = useMemo(
    () => createStyles(colors, isDark, windowWidth),
    [colors, isDark, windowWidth]
  );
  const backgroundGradientColors = useMemo(
    () =>
      [
        withAlpha(colors.primary, isDark ? 0.2 : 0.08),
        withAlpha(colors.gold, isDark ? 0.12 : 0.1),
        withAlpha(colors.cardBackground, 0),
      ] as const,
    [colors.cardBackground, colors.gold, colors.primary, isDark]
  );
  const mascotAssetSource = useMemo(
    () => getGamificationAssetSource(gamification.mascotFilename),
    [gamification.mascotFilename]
  );
  const progressWidth: `${number}%` = progress.isFinalStage
    ? '100%'
    : `${Number(progress.progressPercent.toFixed(2))}%`;
  const stageSpan = progress.isFinalStage
    ? 0
    : Math.max(
        (progress.nextStageMinScans ?? progress.currentStageMinScans) -
          progress.currentStageMinScans,
        0
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

      <View style={styles.textBlock}>
        <Text style={styles.stageLabel} testID="fox-evolution-stage-label">
          {t('home.fox_evolution.stage_label', {
            stage: progress.currentStage,
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

      <View style={styles.progressSection}>
        <View style={styles.progressTrack}>
          <LinearGradient
            colors={[colors.primary, mixColors(colors.primary, colors.gold, 0.45)]}
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

const createStyles = (colors: any, isDark: boolean, windowWidth: number) => {
  const isCompact = windowWidth < 390;
  const isTablet = windowWidth >= 768;
  const mascotShellSize = isTablet ? 304 : isCompact ? 232 : 264;
  const mascotImageSize = isTablet ? 280 : isCompact ? 210 : 240;
  const shellPaddingHorizontal = isTablet ? SPACING.xl : SPACING.lg;
  const shellPaddingVertical = isTablet ? SPACING.lg : SPACING.md;
  const surfaceBackground = isDark
    ? withAlpha(colors.cardBackground, 0.92)
    : colors.cardBackground;
  const borderColor = withAlpha(colors.primary, isDark ? 0.28 : 0.08);

  return StyleSheet.create({
    shell: {
      width: '100%',
      borderRadius: 28,
      paddingHorizontal: shellPaddingHorizontal,
      paddingVertical: shellPaddingVertical,
      backgroundColor: surfaceBackground,
      borderWidth: 1,
      borderColor,
      overflow: 'hidden',
      alignItems: 'center',
      position: 'relative',
      ...(Platform.OS === 'android'
        ? {
            elevation: 4,
          }
        : {
            ...SHADOWS.card,
            shadowColor: colors.primary,
            shadowOpacity: 0.1,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
          }),
    },
    backgroundGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    glow: {
      position: 'absolute',
      borderRadius: BORDER_RADIUS.full,
      opacity: isDark ? 0.22 : 0.3,
    },
    glowPrimary: {
      width: 180,
      height: 180,
      top: -56,
      left: -28,
      backgroundColor: withAlpha(colors.primary, isDark ? 0.3 : 0.12),
    },
    glowSecondary: {
      width: 156,
      height: 156,
      right: -36,
      bottom: 54,
      backgroundColor: withAlpha(colors.gold, isDark ? 0.18 : 0.12),
    },
    mascotShell: {
      width: mascotShellSize,
      height: mascotShellSize,
      borderRadius: BORDER_RADIUS.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.sm,
      position: 'relative',
    },
    mascotHalo: {
      position: 'absolute',
      width: mascotShellSize,
      height: mascotShellSize,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.primary, isDark ? 0.16 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, isDark ? 0.24 : 0.1),
      transform: [{ scale: 1.02 }],
    },
    mascotImage: {
      width: mascotImageSize,
      height: mascotImageSize,
    },
    textBlock: {
      alignItems: 'center',
      gap: SPACING.xs,
      marginBottom: SPACING.sm,
    },
    stageLabel: {
      fontSize: isTablet ? SIZES.xxl : 28,
      lineHeight: isTablet ? SIZES.xxl + 6 : 34,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'center',
    },
    supportingText: {
      fontSize: SIZES.text14,
      lineHeight: SIZES.text14 + 6,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.gray,
      textAlign: 'center',
    },
    progressSection: {
      width: '100%',
      gap: SPACING.xs,
    },
    progressTrack: {
      width: '100%',
      height: 8,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.primary, isDark ? 0.16 : 0.08),
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
    },
    progressValueText: {
      ...(isCompact
        ? {
            width: '100%',
          }
        : {}),
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: isCompact ? 'left' : 'right',
    },
  });
};

export default FoxEvolutionHero;
