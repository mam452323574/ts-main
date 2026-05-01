import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Check, Crown, Lock } from 'lucide-react-native';

import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { CoachPersonaAvatar } from '@/components/coach/CoachPersonaAvatar';
import type { CoachPersonaVisual } from '@/shared/coachPersonaVisuals';

interface CoachPersonaCardProps {
  title: string;
  subtitle: string;
  avatarImageSource?: CoachPersonaVisual['imageSource'];
  avatarFallbackLabel: string;
  avatarHaloTint: string;
  variant?: 'default' | 'compact';
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
  const styles = createStyles(colors, isCompact);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={locked ? lockedHint : undefined}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isCompact && styles.cardCompact,
        active && styles.cardActive,
        locked && styles.cardLocked,
        disabled && styles.cardDisabled,
        pressed && !disabled && styles.cardPressed,
      ]}
      testID={testID}
    >
      <View style={styles.headerRow}>
        <CoachPersonaAvatar
          imageSource={avatarImageSource}
          fallbackLabel={avatarFallbackLabel}
          haloTint={avatarHaloTint}
          size={isCompact ? 60 : 68}
          dimmed={locked}
          emphasis={isCompact ? 'subtle' : active ? 'featured' : 'default'}
          testID={testID ? `${testID}-avatar` : undefined}
        />
        {active ? (
          <View style={styles.activeBadge}>
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
            style={styles.lockBadge}
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

const createStyles = (colors: any, isCompact: boolean) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      flexBasis: '48%',
      minHeight: 172,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: withAlpha(colors.cardBackground, 0.94),
      borderWidth: 1,
      borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.04),
      overflow: 'hidden',
      gap: SPACING.sm,
      ...SHADOWS.card,
    },
    cardCompact: {
      width: 172,
      flexBasis: 'auto',
      minHeight: 138,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      gap: SPACING.sm,
    },
    cardActive: {
      borderColor: withAlpha(colors.primary, 0.28),
      backgroundColor: colors.surfaceAccent ?? withAlpha(colors.primary, 0.08),
      shadowColor: colors.primary,
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
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
      minHeight: isCompact ? 68 : 84,
    },
    copy: {
      gap: isCompact ? 4 : 6,
    },
    title: {
      fontSize: isCompact ? SIZES.text16 : SIZES.text14,
      lineHeight: isCompact ? 20 : 18,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
    },
    titleActive: {
      color: colors.primary,
    },
    subtitle: {
      fontSize: SIZES.text12,
      lineHeight: isCompact ? 17 : 16,
      color: colors.textMuted ?? withAlpha(colors.gray, 0.98),
    },
    activeBadge: {
      width: isCompact ? 20 : 22,
      height: isCompact ? 20 : 22,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    lockOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-start',
      paddingHorizontal: isCompact ? SPACING.sm + 2 : SPACING.md,
      paddingVertical: isCompact ? SPACING.sm + 2 : SPACING.md,
    },
    lockBlur: {
      ...StyleSheet.absoluteFillObject,
    },
    lockScrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: withAlpha(colors.cardBackground, 0.34),
    },
    lockBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: withAlpha(colors.goldLight ?? '#FFF8E1', 0.92),
      borderWidth: 1,
      borderColor: withAlpha(colors.gold ?? '#FFD700', 0.32),
    },
    lockBadgeText: {
      fontSize: 10,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.gold ?? '#FFD700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
  });
