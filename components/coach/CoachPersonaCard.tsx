import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Crown, Lock } from 'lucide-react-native';

import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  getVisualMoodSurface,
  mixColors,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import type { CoachPersonaVisual } from '@/shared/coachPersonaVisuals';
import { Squircle } from '@/components/Squircle';

interface CoachPersonaCardProps {
  title: string;
  subtitle: string;
  avatarImageSource?: CoachPersonaVisual['imageSource'];
  avatarFallbackLabel: string;
  avatarHaloTint: string;
  variant?: 'default' | 'compact' | 'portrait';
  active?: boolean;
  locked?: boolean;
  disabled?: boolean;
  lockedBadgeLabel?: string;
  lockedHint?: string;
  onPress: () => void;
  testID?: string;
}

export function CoachPersonaCard({
  title,
  subtitle,
  avatarImageSource,
  avatarFallbackLabel,
  avatarHaloTint,
  variant = 'default',
  active = false,
  locked = false,
  disabled = false,
  lockedBadgeLabel,
  lockedHint,
  onPress,
  testID,
}: CoachPersonaCardProps) {
  const { colors, isDark = false } = useTheme();
  const isCompact = variant === 'compact';
  const isPortrait = variant === 'portrait';
  const [imageFailed, setImageFailed] = useState(false);
  const styles = createStyles(colors, isDark, isCompact, isPortrait);
  const cardSurface = getVisualMoodSurface(colors, isDark, {
    mood: 'obsidian',
    accentColor: avatarHaloTint,
    intensity: isPortrait ? (active ? 'card' : 'subtle') : active ? 'card' : 'subtle',
    shadow: !isPortrait || active,
  });

  useEffect(() => {
    setImageFailed(false);
  }, [avatarImageSource]);

  const shouldRenderPortraitImage =
    isPortrait && !!avatarImageSource && !imageFailed;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={locked ? lockedHint : undefined}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        cardSurface,
        isCompact && styles.cardCompact,
        isPortrait && styles.cardPortrait,
        active && styles.cardActive,
        locked && styles.cardLocked,
        disabled && styles.cardDisabled,
        pressed && !disabled && styles.cardPressed,
      ]}
      testID={testID}
    >
      {isPortrait ? (
        <>
          <Squircle
            style={[
              styles.portraitImageFrame,
              {
                backgroundColor: mixColors(
                  colors.cardBackground,
                  avatarHaloTint,
                  active ? 0.1 : 0.07,
                ),
                borderColor: withAlpha(avatarHaloTint, active ? 0.24 : 0.12),
              },
            ]}
            testID={testID ? `${testID}-portrait-frame` : undefined}
          >
            {shouldRenderPortraitImage ? (
              <Image
                source={avatarImageSource}
                contentFit="cover"
                style={[styles.portraitImage, locked && styles.portraitImageDimmed]}
                onError={() => setImageFailed(true)}
                testID={testID ? `${testID}-portrait-image` : undefined}
              />
            ) : (
              <View
                style={[
                  styles.portraitFallback,
                  {
                    backgroundColor: mixColors(
                      colors.cardBackground,
                      avatarHaloTint,
                      active ? 0.24 : 0.18,
                    ),
                  },
                ]}
                testID={testID ? `${testID}-portrait-fallback` : undefined}
              >
                <Text style={styles.portraitFallbackLabel}>
                  {avatarFallbackLabel}
                </Text>
              </View>
            )}
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']}
              pointerEvents="none"
              style={styles.portraitImageGradient}
              testID={testID ? `${testID}-portrait-gradient` : undefined}
            />
          </Squircle>

          {active ? (
            <View
              style={[
                styles.activeBadge,
                styles.activeBadgePortrait,
                { backgroundColor: avatarHaloTint },
              ]}
            >
              <Check color={colors.white} size={15} strokeWidth={3} />
            </View>
          ) : null}

          <View style={styles.copy}>
            <Text
              numberOfLines={2}
              style={[
                styles.title,
                styles.titlePortrait,
                active && styles.titleActive,
                active
                  ? {
                      color: mixColors(
                        isDark ? colors.white : colors.primaryText,
                        avatarHaloTint,
                        isDark ? 0.12 : 0.2,
                      ),
                    }
                  : null,
              ]}
            >
              {title}
            </Text>
            <Text numberOfLines={2} style={[styles.subtitle, styles.subtitlePortrait]}>
              {subtitle}
            </Text>
          </View>
        </>
      ) : (
        <>
          <View style={styles.headerRow}>
            <CoachPersonaAvatar
              imageSource={avatarImageSource}
              fallbackLabel={avatarFallbackLabel}
              haloTint={avatarHaloTint}
              size={isCompact ? 52 : 68}
              dimmed={locked}
              emphasis={isCompact ? 'subtle' : active ? 'featured' : 'default'}
              testID={testID ? `${testID}-avatar` : undefined}
            />
            {active ? (
              <View
                style={[styles.activeBadge, { backgroundColor: avatarHaloTint }]}
              >
                <Check color={colors.white} size={14} strokeWidth={3} />
              </View>
            ) : null}
          </View>

          <View style={styles.copy}>
            <Text numberOfLines={isCompact ? 1 : 2} style={[styles.title, active && styles.titleActive]}>
              {title}
            </Text>
            <Text numberOfLines={isCompact ? 1 : 2} style={styles.subtitle}>
              {subtitle}
            </Text>
          </View>
        </>
      )}

      {locked ? (
        <View
          pointerEvents="none"
          style={styles.lockOverlay}
          testID={testID ? `${testID}-lock-overlay` : undefined}
        >
          <BlurView
            intensity={5}
            tint={isDark ? 'dark' : 'light'}
            style={styles.lockBlur}
            testID={testID ? `${testID}-lock-blur` : undefined}
          />
          <View style={styles.lockScrim} />
          <View
            style={[styles.lockBadge, isPortrait && styles.lockBadgePortrait]}
            testID={testID ? `${testID}-lock-badge` : undefined}
          >
            <Crown
              color={colors.gold ?? '#FFD700'}
              fill={colors.gold ?? '#FFD700'}
              size={12}
              testID={testID ? `${testID}-lock-crown` : undefined}
            />
            <Lock
              color={colors.gold ?? '#FFD700'}
              size={12}
              testID={testID ? `${testID}-lock-icon` : undefined}
            />
            {lockedBadgeLabel ? (
              <Text style={styles.lockBadgeText}>{lockedBadgeLabel}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const createStyles = (
  colors: any,
  isDark: boolean,
  isCompact: boolean,
  isPortrait: boolean,
) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      flexBasis: '48%',
      minHeight: 172,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      overflow: 'hidden',
      gap: SPACING.sm, borderCurve: 'continuous',
    },
    cardCompact: {
      width: 146,
      flexBasis: 'auto',
      minHeight: 116,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.sm + 2,
      gap: SPACING.xs + 2,
    },
    cardPortrait: {
      width: 168,
      flexBasis: 'auto',
      minHeight: 258,
      paddingHorizontal: 0,
      paddingVertical: 0,
      gap: 0,
      borderRadius: BORDER_RADIUS.xl, borderCurve: 'continuous',
    },
    cardActive: {
      transform: [{ translateY: -1 }],
    },
    cardLocked: {
      borderColor: withAlpha(colors.gold ?? '#FFD700', 0.34),
    },
    cardDisabled: {
      opacity: 0.78,
    },
    cardPressed: {
      transform: [{ scale: 0.985 }],
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.xs,
      minHeight: isCompact ? 56 : 84,
    },
    copy: {
      gap: isPortrait ? 5 : isCompact ? 4 : 6,
      paddingHorizontal: isPortrait ? SPACING.md : 0,
      paddingTop: isPortrait ? SPACING.sm + 2 : 0,
      paddingBottom: isPortrait ? SPACING.md : 0,
    },
    title: {
      fontSize: isPortrait ? SIZES.text16 : SIZES.text14,
      lineHeight: isPortrait ? 20 : isCompact ? 19 : 18,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    titlePortrait: {
      color: isDark ? colors.white : colors.primaryText,
    },
    titleActive: {
      color: colors.primary,
    },
    subtitle: {
      fontSize: SIZES.text12,
      lineHeight: isPortrait ? 17 : isCompact ? 16 : 16,
      color: colors.textMuted ?? withAlpha(colors.gray, 0.98),
    },
    subtitlePortrait: {
      color: withAlpha(
        isDark ? colors.white : colors.primaryText,
        isDark ? 0.72 : 0.6,
      ),
    },
    activeBadge: {
      width: isCompact ? 20 : 22,
      height: isCompact ? 20 : 22,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary, borderCurve: 'continuous',
    },
    activeBadgePortrait: {
      position: 'absolute',
      top: SPACING.sm + 2,
      right: SPACING.sm + 2,
      width: 28,
      height: 28,
      borderWidth: 2,
      borderColor: withAlpha(colors.background, 0.78),
      zIndex: 2,
    },
    portraitImageFrame: {
      position: 'relative',
      height: 192,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden', borderCurve: 'continuous',
    },
    portraitImage: {
      width: '100%',
      height: '100%',
      transform: [{ scale: 1.08 }],
    },
    portraitImageDimmed: {
      opacity: 0.76,
    },
    portraitFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    portraitFallbackLabel: {
      fontSize: 28,
      lineHeight: 32,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      letterSpacing: 1,
    },
    portraitImageGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 88,
    },
    lockOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-start',
      paddingHorizontal: isPortrait ? SPACING.sm + 2 : isCompact ? SPACING.sm + 2 : SPACING.md,
      paddingVertical: isPortrait ? SPACING.sm + 2 : isCompact ? SPACING.sm + 2 : SPACING.md,
    },
    lockBlur: {
      ...StyleSheet.absoluteFillObject,
    },
    lockScrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: withAlpha(colors.background, isDark ? 0.5 : 0.22),
    },
    lockBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: mixColors(
        colors.goldLight ?? '#FFF8E1',
        colors.background,
        isDark ? 0.68 : 0.12,
      ),
      borderWidth: 1,
      borderColor: withAlpha(colors.gold ?? '#FFD700', 0.32), borderCurve: 'continuous',
    },
    lockBadgePortrait: {
      alignSelf: 'flex-end',
    },
    lockBadgeText: {
      fontSize: 10,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.gold ?? '#FFD700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
  });
