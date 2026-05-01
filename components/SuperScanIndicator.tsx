import { useMemo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Crown, Zap, Lock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { SuperScanFeatureIcon } from '@/components/FeatureIcons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  SIZES,
  SPACING,
  FONT_WEIGHTS,
  BORDER_RADIUS,
  SHADOWS,
  getAndroidLightSurface,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { NextScanTimer } from '@/components/NextScanTimer';
import { ScanEligibilityResponse } from '@/types';

interface SuperScanIndicatorProps {
  isPremium: boolean;
  eligibility?: ScanEligibilityResponse;
  onLockedPress?: () => void;
}

function parseTimestampMs(value: number | string | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function SuperScanIndicator({ isPremium, eligibility, onLockedPress }: SuperScanIndicatorProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const isAvailable = isPremium && eligibility?.allowed === true;
  const resolvedLimit = Math.max(eligibility?.limit ?? 1, 1);
  const resolvedRemaining = Math.max(
    0,
    eligibility?.remaining ?? (resolvedLimit - (eligibility?.current_count ?? 0))
  );
  const nextRechargeAt =
    parseTimestampMs(eligibility?.next_recharge_at) ??
    parseTimestampMs(eligibility?.nextRechargeAt) ??
    parseTimestampMs(eligibility?.next_available_date);
  const progressRatio = isPremium ? Math.min(100, (resolvedRemaining / resolvedLimit) * 100) : 0;
  const gradientColors = isPremium
    ? [
        mixColors(colors.gold, colors.white, 0.18),
        mixColors(colors.gold, colors.warning, 0.22),
        mixColors(colors.warning, colors.gold, 0.68),
      ] as const
    : isDark
      ? [
          mixColors(colors.grayLight, colors.darkGray, 0.32),
          mixColors(colors.lightGray, colors.darkGray, 0.18),
          mixColors(colors.grayLight, colors.darkGray, 0.32),
        ] as const
      : [
          mixColors(colors.lightGray, colors.cardBackground, 0.08),
          mixColors(colors.lightGray, colors.gray, 0.14),
          mixColors(colors.lightGray, colors.cardBackground, 0.08),
        ] as const;

  const progressGradientColors = isAvailable
    ? [mixColors(colors.gold, colors.white, 0.12), mixColors(colors.warning, colors.gold, 0.72)] as const
    : isDark
      ? [mixColors(colors.grayLight, colors.darkGray, 0.28), mixColors(colors.lightGray, colors.darkGray, 0.16)] as const
      : [mixColors(colors.lightGray, colors.cardBackground, 0.2), mixColors(colors.lightGray, colors.gray, 0.14)] as const;

  const Container = !isPremium && onLockedPress ? TouchableOpacity : View;
  const containerProps = !isPremium && onLockedPress
    ? ({ onPress: onLockedPress, activeOpacity: 0.7 } as const)
    : {};

  return (
    <Container
      {...containerProps}
      style={[styles.shell, isPremium ? styles.shellPremium : styles.shellLocked]}
      testID="super-scan-shell"
    >
      <View
        style={[styles.surface, isPremium ? styles.surfacePremium : styles.surfaceLocked]}
        testID="super-scan-surface"
      >
        <View style={[styles.backgroundGlow, isPremium ? styles.backgroundGlowPremium : styles.backgroundGlowLocked]} />

        <View style={styles.content}>
          <View style={[styles.iconWrapper, !isPremium && styles.iconWrapperLocked]}>
            <LinearGradient
              colors={gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.iconGradient, isPremium ? styles.iconGradientPremium : styles.iconGradientLocked]}
            >
              <SuperScanFeatureIcon
                color={isPremium ? '#FFFFFF' : colors.gray}
                size={22}
                strokeWidth={2.5}
              />
            </LinearGradient>
            {isAvailable && <View style={[styles.availableDot, styles.availableDotPremium]} />}
          </View>

          <View style={styles.textContainer}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, !isPremium && styles.titleLocked]} numberOfLines={1}>
                {t('components.super_scan.title')}
              </Text>
              {!isPremium && (
                <View style={styles.premiumBadge}>
                  <Crown color={colors.gold} size={10} fill={colors.gold} />
                  <Text style={styles.premiumBadgeText}>{t('components.feature_list.premium')}</Text>
                </View>
              )}
            </View>
            <Text style={styles.subtitle} numberOfLines={2}>
              {!isPremium
                ? t('components.super_scan.subtitle_locked')
                : !isAvailable
                  ? t('components.super_scan.subtitle_used')
                  : t('components.super_scan.subtitle_available')}
            </Text>
          </View>

          <View style={styles.statusContainer}>
            {!isPremium ? (
              <View style={styles.lockedBadge}>
                <Lock color={colors.gray} size={14} />
              </View>
            ) : isAvailable ? (
              <View style={styles.availableBadge}>
                <Zap color={colors.gold} size={14} fill={colors.gold} />
                <Text style={styles.availableText}>{`${resolvedRemaining}/${resolvedLimit}`}</Text>
              </View>
            ) : (
              <View style={styles.usedBadge}>
                <Text style={styles.usedText}>{`${resolvedRemaining}/${resolvedLimit}`}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, !isPremium && styles.progressBarLocked]}>
            <LinearGradient
              colors={progressGradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.progressFill,
                { width: `${progressRatio}%` },
              ]}
            />
          </View>
          <Text style={[styles.progressLabel, !isPremium && styles.progressLabelLocked]} numberOfLines={1}>
            {!isPremium
              ? t('components.super_scan.status_locked')
              : !isAvailable
                ? t('components.super_scan.status_used')
                : t('components.super_scan.status_available')}
          </Text>

          {isPremium && nextRechargeAt && (
            <View style={styles.timerContainer}>
              <NextScanTimer
                nextAvailableDate={nextRechargeAt}
                scanLabel={t('scan_limit.recharge')}
                textColor={colors.gray}
                iconColor={colors.gray}
              />
            </View>
          )}
        </View>
      </View>
    </Container>
  );
}

const createStyles = (colors: any, isDark: boolean) => {
  const isAndroidLight = Platform.OS === 'android' && !isDark;
  const premiumSurface = isAndroidLight
    ? getAndroidLightSurface(colors, {
        accentColor: colors.gold,
        shadowColor: colors.gold,
        backgroundAlpha: 0.08,
        borderAlpha: 0.16,
        overlayAlpha: 0.16,
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffsetY: 8,
        elevation: 4,
      })
    : {
        backgroundColor: isDark ? colors.cardBackground : mixColors(colors.cardBackground, colors.gold, 0.08),
        borderColor: isDark ? withAlpha(colors.gold, 0.3) : withAlpha(colors.gold, 0.28),
        overlayColor: isDark ? withAlpha(colors.gold, 0.1) : withAlpha(colors.gold, 0.14),
        shadowStyle: SHADOWS.card,
      };
  const lockedSurface = isAndroidLight
    ? getAndroidLightSurface(colors, {
        accentColor: colors.gray,
        shadowColor: colors.gray,
        backgroundAlpha: 0.05,
        borderAlpha: 0.12,
        overlayAlpha: 0.08,
        shadowOpacity: 0.06,
        shadowRadius: 14,
        shadowOffsetY: 6,
        elevation: 2,
      })
    : {
        backgroundColor: isDark ? colors.grayLight : mixColors(colors.cardBackground, colors.gray, 0.05),
        borderColor: isDark ? colors.lightGray : mixColors(colors.lightGray, colors.gray, 0.18),
        overlayColor: isDark ? withAlpha(colors.white, 0.05) : withAlpha(colors.gray, 0.06),
        shadowStyle: SHADOWS.card,
      };
  const premiumIconShadow = isAndroidLight
    ? {
        shadowColor: colors.gold,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 2,
      }
    : SHADOWS.card;
  const lockedIconShadow = isAndroidLight
    ? {
        shadowColor: colors.gray,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 1,
      }
    : SHADOWS.none;

  return StyleSheet.create({
    shell: {
      borderRadius: BORDER_RADIUS.xl,
      minWidth: 0,
    },
    shellPremium: {
      ...premiumSurface.shadowStyle,
    },
    shellLocked: {
      ...lockedSurface.shadowStyle,
    },
    surface: {
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.lg,
      overflow: 'hidden',
      minWidth: 0,
      borderWidth: 1,
    },
    surfacePremium: {
      backgroundColor: premiumSurface.backgroundColor,
      borderColor: premiumSurface.borderColor,
    },
    surfaceLocked: {
      backgroundColor: lockedSurface.backgroundColor,
      borderColor: lockedSurface.borderColor,
    },
    backgroundGlow: {
      position: 'absolute',
      top: isAndroidLight ? -34 : -50,
      right: isAndroidLight ? -24 : -50,
      width: isAndroidLight ? 96 : 120,
      height: isAndroidLight ? 96 : 120,
      borderRadius: isAndroidLight ? 48 : 60,
    },
    backgroundGlowPremium: {
      backgroundColor: premiumSurface.overlayColor,
    },
    backgroundGlowLocked: {
      backgroundColor: lockedSurface.overlayColor,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
    },
    iconWrapper: {
      position: 'relative',
    },
    iconWrapperLocked: {
      opacity: 0.6,
    },
    iconGradient: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconGradientPremium: {
      ...premiumIconShadow,
    },
    iconGradientLocked: {
      ...lockedIconShadow,
    },
    availableDot: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.success,
      borderWidth: 2,
    },
    availableDotPremium: {
      borderColor: premiumSurface.backgroundColor,
    },
    textContainer: {
      flex: 1,
      marginLeft: SPACING.md,
      minWidth: 0,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      minWidth: 0,
    },
    title: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      flexShrink: 1,
    },
    titleLocked: {
      color: colors.gray,
    },
    subtitle: {
      fontSize: SIZES.text12,
      color: colors.gray,
      marginTop: 2,
      minWidth: 0,
    },
    premiumBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: withAlpha(colors.gold, isDark ? 0.2 : 0.14),
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      gap: 3,
    },
    premiumBadgeText: {
      fontSize: SIZES.text10,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.gold,
    },
    statusContainer: {
      marginLeft: SPACING.sm,
      flexShrink: 0,
    },
    lockedBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: withAlpha(colors.gray, isDark ? 0.16 : 0.12),
      justifyContent: 'center',
      alignItems: 'center',
    },
    availableBadge: {
      minWidth: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: withAlpha(colors.gold, isDark ? 0.25 : 0.18),
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'row',
      paddingHorizontal: 6,
      gap: 3,
    },
    availableText: {
      fontSize: SIZES.text10,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.gold,
    },
    usedBadge: {
      minWidth: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: withAlpha(colors.gray, isDark ? 0.16 : 0.12),
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6,
    },
    usedText: {
      fontSize: SIZES.text10,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.gray,
    },
    progressContainer: {
      marginTop: SPACING.md,
      minWidth: 0,
    },
    progressBar: {
      height: 6,
      backgroundColor: withAlpha(colors.gold, isDark ? 0.15 : 0.18),
      borderRadius: 3,
      overflow: 'hidden',
    },
    progressBarLocked: {
      backgroundColor: withAlpha(colors.gray, isDark ? 0.18 : 0.14),
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
    },
    progressLabel: {
      fontSize: SIZES.text10,
      color: colors.gold,
      marginTop: SPACING.xs,
      textAlign: 'center',
      fontWeight: FONT_WEIGHTS.medium,
      flexShrink: 1,
    },
    progressLabelLocked: {
      color: colors.gray,
    },
    timerContainer: {
      marginTop: 2,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      minWidth: 0,
    },
  });
};
