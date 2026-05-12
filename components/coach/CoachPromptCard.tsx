import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronRight, Crown, Lock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/contexts/ThemeContext';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  mixColors,
  SHADOWS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import {
  getCoachPromptPalette,
  getCoachPromptVisual,
} from '@/shared/coachPromptVisuals';
import type { CoachPromptType } from '@/types';

interface CoachPromptCardProps {
  promptType: CoachPromptType;
  title: string;
  subtitle?: string;
  onPress: () => void;
  variant?: 'featured' | 'compact';
  mode?: 'action' | 'selector';
  busy?: boolean;
  disabled?: boolean;
  selected?: boolean;
  locked?: boolean;
  lockedBadgeLabel?: string;
  lockedHint?: string;
  testID?: string;
}

export function CoachPromptCard({
  promptType,
  title,
  subtitle,
  onPress,
  variant = 'featured',
  mode = 'action',
  busy = false,
  disabled = false,
  selected = false,
  locked = false,
  lockedBadgeLabel,
  lockedHint,
  testID,
}: CoachPromptCardProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { icon: PromptIcon, accentColor } = getCoachPromptVisual(promptType);
  const promptPalette = useMemo(
    () => getCoachPromptPalette(promptType, colors, isDark),
    [colors, isDark, promptType],
  );
  // A locked card stays pressable so the parent can route to the paywall.
  const isDisabled = disabled || busy;
  const isCompact = variant === 'compact';
  const isSelector = mode === 'selector';
  const iconGlyphColor = mixColors(colors.white, accentColor, 0.18);
  const goldColor = colors.gold ?? '#FFD700';
  const neutralSurface = colors.surfaceMuted ?? colors.cardBackground;
  const neutralBorder = colors.borderSubtle ?? colors.lightGray ?? '#E3E7EF';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={locked ? lockedHint : undefined}
      accessibilityState={{ disabled: isDisabled, busy, selected }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isCompact ? styles.cardCompact : styles.cardFeatured,
        isSelector ? styles.cardSelector : null,
        {
          backgroundColor: isSelector
            ? pressed && !isDisabled
              ? promptPalette.selectorPressedBackgroundColor
              : selected
                ? promptPalette.selectorSelectedBackgroundColor
                : promptPalette.selectorBackgroundColor
            : mixColors(
                neutralSurface,
                accentColor,
                pressed && !isDisabled ? 0.16 : selected ? 0.14 : 0.08,
              ),
          borderColor: locked
            ? withAlpha(goldColor, 0.42)
            : isSelector
              ? pressed && !isDisabled
                ? promptPalette.selectorPressedBorderColor
                : selected
                  ? promptPalette.selectorSelectedBorderColor
                  : promptPalette.selectorBorderColor
              : mixColors(
                  neutralBorder,
                  accentColor,
                  selected ? 0.34 : pressed && !isDisabled ? 0.22 : 0.18,
                ),
        },
        selected ? styles.cardSelected : null,
        isDisabled ? styles.cardDisabled : null,
        locked ? styles.cardLocked : null,
        pressed && !isDisabled ? styles.cardPressed : null,
      ]}
      testID={testID}
    >
      {!isSelector ? (
        <View
          pointerEvents="none"
          style={[
            styles.accentRail,
            isCompact ? styles.accentRailCompact : styles.accentRailFeatured,
            {
              backgroundColor: withAlpha(
                accentColor,
                busy ? 0.4 : selected ? 0.9 : 0.72,
              ),
            },
          ]}
          testID={testID ? `${testID}-accent` : undefined}
        />
      ) : null}

      {isSelector ? (
        <>
          <LinearGradient
            colors={
              selected
                ? promptPalette.selectorSelectedBackdropColors
                : promptPalette.selectorBackdropColors
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
            style={styles.selectorBackdrop}
            testID={testID ? `${testID}-backdrop` : undefined}
          />

          {selected ? (
            <View
              style={[
                styles.selectedFloatingBadge,
                {
                  backgroundColor: promptPalette.selectorSelectedBadgeColor,
                  borderColor: promptPalette.selectorSelectedBadgeBorderColor,
                },
              ]}
              testID={testID ? `${testID}-selected-badge` : undefined}
            >
              <Check
                color={colors.white}
                size={12}
                strokeWidth={3}
                testID={testID ? `${testID}-selected-icon` : undefined}
              />
            </View>
          ) : null}

          <View
            style={[
              styles.selectorIconShell,
              {
                backgroundColor: selected
                  ? promptPalette.selectorSelectedIconBackgroundColor
                  : promptPalette.selectorIconBackgroundColor,
              },
            ]}
            testID={testID ? `${testID}-icon` : undefined}
          >
            <PromptIcon
              color={promptPalette.selectorIconColor}
              size={24}
              strokeWidth={2.2}
              testID={testID ? `${testID}-icon-glyph` : undefined}
            />
          </View>

          <Text
            numberOfLines={2}
            style={[styles.title, styles.titleSelectorTile]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={3} style={styles.subtitleSelectorTile}>
              {subtitle}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <View
            style={[
              styles.iconShell,
              isCompact ? styles.iconShellCompact : null,
              {
                backgroundColor: mixColors(neutralSurface, accentColor, 0.2),
                borderColor: withAlpha(accentColor, 0.22),
              },
            ]}
            testID={testID ? `${testID}-icon` : undefined}
          >
            <View
              style={[
                styles.iconInner,
                isCompact ? styles.iconInnerCompact : null,
                {
                  backgroundColor: withAlpha(accentColor, 0.1),
                },
              ]}
            >
              <PromptIcon
                color={iconGlyphColor}
                size={isCompact ? 18 : 20}
                strokeWidth={2.15}
                testID={testID ? `${testID}-icon-glyph` : undefined}
              />
            </View>
          </View>

          <View style={styles.copy}>
            <Text
              numberOfLines={isCompact ? 2 : 1}
              style={[styles.title, isCompact ? styles.titleCompact : null]}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                numberOfLines={isCompact ? 2 : 2}
                style={[styles.subtitle, isCompact ? styles.subtitleCompact : null]}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View
            style={[
              styles.trailing,
              isCompact ? styles.trailingCompact : null,
              {
                backgroundColor: withAlpha(accentColor, 0.12),
                borderColor: withAlpha(accentColor, 0.18),
              },
            ]}
            testID={testID ? `${testID}-trailing` : undefined}
          >
            {busy ? (
              <ActivityIndicator
                color={accentColor}
                size="small"
                testID={testID ? `${testID}-spinner` : undefined}
              />
            ) : (
              <ChevronRight
                color={accentColor}
                size={isCompact ? 16 : 18}
                strokeWidth={2.2}
                testID={testID ? `${testID}-chevron` : undefined}
              />
            )}
          </View>
        </>
      )}

      {locked ? (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.lockScrim,
              {
                backgroundColor: withAlpha(colors.cardBackground, 0.45),
              },
            ]}
            testID={testID ? `${testID}-lock-scrim` : undefined}
          />
          <View
            pointerEvents="none"
            style={[
              styles.lockBadge,
              {
                backgroundColor: withAlpha(colors.goldLight ?? '#4D3F00', 0.92),
                borderColor: withAlpha(goldColor, 0.36),
              },
            ]}
            testID={testID ? `${testID}-lock-badge` : undefined}
          >
            <Crown
              color={goldColor}
              fill={goldColor}
              size={11}
              testID={testID ? `${testID}-lock-crown` : undefined}
            />
            <Lock
              color={goldColor}
              size={11}
              testID={testID ? `${testID}-lock-icon` : undefined}
            />
            {lockedBadgeLabel ? (
              <Text style={styles.lockBadgeText}>{lockedBadgeLabel}</Text>
            ) : null}
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      ...SHADOWS.card,
    },
    cardSelector: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      gap: SPACING.sm,
      paddingLeft: SPACING.md,
      paddingRight: SPACING.md,
      paddingVertical: SPACING.md,
      minHeight: 164,
      overflow: 'hidden',
    },
    cardFeatured: {
      paddingLeft: SPACING.lg + 2,
      paddingRight: SPACING.md,
      paddingVertical: SPACING.md,
      minHeight: 92,
    },
    cardCompact: {
      paddingLeft: SPACING.md + 6,
      paddingRight: SPACING.sm + 2,
      paddingVertical: SPACING.sm + 2,
      minHeight: 78,
    },
    cardSelected: {
      transform: [{ translateY: -1 }],
    },
    cardLocked: {
      // No global opacity here — a lockScrim atop the content does the dimming
      // so the gold lock badge above it stays fully readable.
    },
    lockScrim: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: BORDER_RADIUS.xl,
    },
    lockBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      zIndex: 3,
    },
    lockBadgeText: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.gold ?? '#FFD700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    accentRail: {
      position: 'absolute',
      left: SPACING.sm,
      width: 4,
      borderRadius: BORDER_RADIUS.full,
    },
    accentRailSelector: {
      left: SPACING.sm + 2,
      width: 5,
    },
    accentRailFeatured: {
      top: SPACING.md,
      bottom: SPACING.md,
    },
    accentRailCompact: {
      top: SPACING.sm + 2,
      bottom: SPACING.sm + 2,
    },
    cardPressed: {
      transform: [{ scale: 0.985 }],
    },
    cardDisabled: {
      opacity: 0.66,
    },
    iconShell: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      flexShrink: 0,
    },
    iconShellCompact: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.md,
    },
    iconShellSelector: {
      width: 42,
      height: 42,
    },
    iconInner: {
      width: 36,
      height: 36,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconInnerCompact: {
      width: 30,
      height: 30,
      borderRadius: BORDER_RADIUS.sm,
    },
    iconInnerSelector: {
      width: 30,
      height: 30,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      flexShrink: 1,
      gap: 4,
    },
    copySelector: {
      width: '100%',
      gap: 2,
    },
    title: {
      fontSize: SIZES.text16,
      lineHeight: 20,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    titleCompact: {
      fontSize: SIZES.text14,
      lineHeight: 18,
    },
    titleSelector: {
      lineHeight: 19,
    },
    subtitle: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      color: colors.textMuted ?? withAlpha(colors.gray, 0.95),
    },
    subtitleCompact: {
      lineHeight: 16,
    },
    trailing: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      flexShrink: 0,
    },
    trailingCompact: {
      width: 30,
      height: 30,
      borderRadius: 15,
    },
    selectorHeader: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    selectedBadge: {
      width: 24,
      height: 24,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    selectedFloatingBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    selectorIconShell: {
      width: 52,
      height: 52,
      borderRadius: BORDER_RADIUS.xl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectorBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 110,
    },
    titleSelectorTile: {
      fontSize: SIZES.text14,
      lineHeight: 19,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    subtitleSelectorTile: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      color: colors.textMuted ?? withAlpha(colors.gray, 0.95),
    },
  });
