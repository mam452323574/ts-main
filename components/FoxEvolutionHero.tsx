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
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

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
import { Squircle } from '@/components/Squircle';

interface FoxEvolutionHeroProps {
  gamification: GamificationData;
  progress: GamificationStageProgress;
}

interface MascotSizes {
  isCompact: boolean;
  isTablet: boolean;
  mascotImageSize: number;
  mascotShellSize: number;
  haloSize: number;
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

  const sizes = useMemo<MascotSizes>(() => {
    const isCompact = windowWidth < 390;
    const isTablet = windowWidth >= 768;
    const mascotImageSize = isTablet ? 320 : isCompact ? 240 : 280;
    const mascotShellSize = mascotImageSize + 16;
    const haloSize = Math.round(mascotImageSize * 1.5);
    return { isCompact, isTablet, mascotImageSize, mascotShellSize, haloSize };
  }, [windowWidth]);

  const styles = useMemo(
    () => createStyles(colors, isDark, premiumHealth, sizes),
    [colors, isDark, premiumHealth, sizes],
  );

  const haloColors = useMemo(
    () => ({
      inner: mixColors(
        premiumHealth.trustAccent,
        premiumHealth.premiumAccent,
        0.35,
      ),
      mid: premiumHealth.trustAccent,
      outer: premiumHealth.trustAccent,
    }),
    [premiumHealth],
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

  return (
    <Squircle style={styles.shell} testID="fox-evolution-hero">
      <LinearGradient
        colors={backgroundGradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backgroundGradient}
      />

      <View
        style={styles.companionPill}
        testID="fox-evolution-companion-pill"
      >
        <Text style={styles.companionPillText}>
          {t('home.companion_title')}
        </Text>
      </View>

      <View style={styles.heroBlock}>
        <View style={styles.mascotShell} testID="fox-evolution-mascot-shell">
          <Svg
            width={sizes.haloSize}
            height={sizes.haloSize}
            style={styles.mascotHaloSvg}
            pointerEvents="none"
          >
            <Defs>
              <RadialGradient id="foxHalo" cx="50%" cy="50%" r="50%">
                <Stop
                  offset="0%"
                  stopColor={haloColors.inner}
                  stopOpacity={isDark ? 0.55 : 0.42}
                />
                <Stop
                  offset="45%"
                  stopColor={haloColors.mid}
                  stopOpacity={isDark ? 0.22 : 0.18}
                />
                <Stop
                  offset="100%"
                  stopColor={haloColors.outer}
                  stopOpacity={0}
                />
              </RadialGradient>
            </Defs>
            <Circle
              cx={sizes.haloSize / 2}
              cy={sizes.haloSize / 2}
              r={sizes.haloSize / 2}
              fill="url(#foxHalo)"
            />
          </Svg>
          <ExpoImage
            source={mascotAssetSource}
            style={styles.mascotImage}
            contentFit="contain"
            testID="fox-evolution-mascot-image"
            accessibilityLabel={`Mascot stage ${progress.currentStage}`}
          />
        </View>

        <Text style={styles.stageLabel} testID="fox-evolution-stage-label">
          {t('home.fox_evolution.stage_label', {
            stage: progress.currentStage,
          })}
        </Text>
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressMeta}>
          <View
            style={[
              styles.evolutionStat,
              styles.evolutionStatAccent,
              styles.progressMetaBadge,
            ]}
            testID={
              progress.isFinalStage
                ? 'fox-evolution-final-stage'
                : 'fox-evolution-scans-remaining'
            }
          >
            <Text style={styles.evolutionStatValue}>
              {progress.isFinalStage
                ? t('home.fox_evolution.max_stage')
                : t('home.fox_evolution.scans_remaining_short', {
                    count: progress.scansRemaining,
                  })}
            </Text>
          </View>
          {!progress.isFinalStage ? (
            <Text style={styles.progressValueText}>
              {t('home.fox_evolution.progress_goal_label', {
                count: progress.nextStageMinScans,
              })}
            </Text>
          ) : (
            <Text style={styles.progressValueText}>
              {t('home.fox_evolution.stage_range_max', {
                start: progress.currentStageMinScans,
              })}
            </Text>
          )}
        </View>

        <View style={styles.progressTrack}>
          <LinearGradient
            colors={[premiumHealth.trustAccent, premiumHealth.premiumAccent]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.progressFill, { width: progressWidth }]}
            testID="fox-evolution-progress-fill"
          />
        </View>
      </View>
    </Squircle>
  );
}

const createStyles = (
  colors: any,
  isDark: boolean,
  premiumHealth: ReturnType<typeof buildPremiumHealthPalette>,
  sizes: MascotSizes,
) => {
  const { isCompact, isTablet, mascotImageSize, mascotShellSize, haloSize } =
    sizes;
  const shellPaddingHorizontal = isTablet ? SPACING.lg : SPACING.md;
  const shellPaddingVertical = isTablet ? SPACING.xl : SPACING.lg;

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
      borderCurve: 'continuous',
    },
    backgroundGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    heroBlock: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: SPACING.xxl,
      paddingBottom: SPACING.xs,
    },
    stageLabel: {
      fontSize: isTablet ? 24 : isCompact ? 18 : 20,
      lineHeight: isTablet ? 30 : isCompact ? 24 : 26,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'center',
      fontFamily: FONT_FAMILIES.display,
      marginTop: SPACING.md,
    },
    companionPill: {
      position: 'absolute',
      top: shellPaddingVertical,
      left: shellPaddingHorizontal,
      zIndex: 2,
      alignSelf: 'flex-start',
      maxWidth: '100%',
      justifyContent: 'center',
      borderRadius: BORDER_RADIUS.full,
      paddingHorizontal: SPACING.md,
      paddingVertical: isCompact ? 6 : SPACING.sm,
      backgroundColor: withAlpha(
        premiumHealth.trustAccent,
        isDark ? 0.11 : 0.07,
      ),
      borderWidth: 1,
      borderColor: withAlpha(
        premiumHealth.trustAccent,
        isDark ? 0.22 : 0.14,
      ),
      borderCurve: 'continuous',
    },
    companionPillText: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0.45,
      textTransform: 'uppercase',
      color: isDark
        ? mixColors(premiumHealth.trustAccent, colors.white, 0.12)
        : mixColors(premiumHealth.trustAccent, colors.primaryText, 0.12),
      fontFamily: FONT_FAMILIES.display,
    },
    evolutionStat: {
      minHeight: 32,
      justifyContent: 'center',
      borderRadius: BORDER_RADIUS.full,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 6,
      backgroundColor: withAlpha(colors.white, isDark ? 0.055 : 0.56),
      borderWidth: 1,
      borderColor: withAlpha(
        premiumHealth.trustAccent,
        isDark ? 0.14 : 0.09,
      ),
      maxWidth: '100%',
      borderCurve: 'continuous',
    },
    evolutionStatAccent: {
      backgroundColor: withAlpha(
        premiumHealth.premiumAccent,
        isDark ? 0.12 : 0.1,
      ),
      borderColor: withAlpha(
        premiumHealth.premiumAccent,
        isDark ? 0.2 : 0.16,
      ),
    },
    evolutionStatValue: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.bold,
      color: mixColors(colors.primaryText, premiumHealth.trustAccent, 0.12),
      fontFamily: FONT_FAMILIES.display,
      flexShrink: 1,
    },
    mascotShell: {
      width: mascotShellSize,
      height: mascotShellSize,
      borderRadius: BORDER_RADIUS.full,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
      flexShrink: 0,
      borderCurve: 'continuous',
    },
    mascotHaloSvg: {
      position: 'absolute',
      top: (mascotShellSize - haloSize) / 2,
      left: (mascotShellSize - haloSize) / 2,
      zIndex: 0,
    },
    mascotImage: {
      width: mascotImageSize,
      height: mascotImageSize,
      opacity: isDark ? 0.96 : 0.94,
      zIndex: 1,
    },
    progressSection: {
      width: '100%',
      gap: SPACING.sm,
      marginTop: SPACING.lg,
    },
    progressTrack: {
      width: '100%',
      height: 9,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(
        premiumHealth.trustAccent,
        isDark ? 0.08 : 0.05,
      ),
      borderWidth: 1,
      borderColor: withAlpha(
        premiumHealth.trustAccent,
        isDark ? 0.06 : 0.045,
      ),
      overflow: 'hidden',
      borderCurve: 'continuous',
    },
    progressFill: {
      height: '100%',
      borderRadius: BORDER_RADIUS.full,
      borderCurve: 'continuous',
    },
    progressMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: isCompact ? SPACING.xs : SPACING.sm,
    },
    progressMetaBadge: {
      flexShrink: 1,
    },
    progressValueText: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.bold,
      color: mixColors(colors.primaryText, premiumHealth.trustAccent, 0.12),
      textAlign: 'right',
      fontFamily: FONT_FAMILIES.accent,
      flexShrink: 0,
    },
  });
};

export default FoxEvolutionHero;
