import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
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
import { Squircle } from '@/components/Squircle';

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
  expanded?: boolean;
  containsSelectedQuestion?: boolean;
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
  expanded = false,
  containsSelectedQuestion = false,
  locked = false,
  lockedBadgeLabel,
  lockedHint,
  testID,
}: CoachPromptCardProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const {
    icon: PromptIcon,
    accentColor,
    artworkSource,
  } = getCoachPromptVisual(promptType);
  const promptPalette = useMemo(
    () => getCoachPromptPalette(promptType, colors, isDark),
    [colors, isDark, promptType],
  );
  // A locked card stays pressable so the parent can route to the paywall.
  const isDisabled = disabled || busy;
  const isCompact = variant === 'compact';
  const isSelector = mode === 'selector';
  const selectorContainsSelectedQuestion =
    isSelector && containsSelectedQuestion && !selected;
  const iconGlyphColor = isDark
    ? mixColors(colors.white, accentColor, 0.18)
    : mixColors(accentColor, colors.primaryText, 0.48);
  const goldColor = colors.gold ?? '#FFD700';
  const neutralSurface = colors.surfaceMuted ?? colors.cardBackground;
  const neutralBorder = colors.borderSubtle ?? colors.lightGray ?? '#E3E7EF';
  const selectorContainsBackgroundColor = mixColors(
    promptPalette.selectorBackgroundColor,
    promptPalette.selectorSelectedBackgroundColor,
    0.38,
  );
  const selectorContainsBorderColor = mixColors(
    promptPalette.selectorBorderColor,
    promptPalette.selectorSelectedBorderColor,
    0.55,
  );
  const selectorContainsIconBackgroundColor = mixColors(
    promptPalette.selectorIconBackgroundColor,
    promptPalette.selectorSelectedIconBackgroundColor,
    0.45,
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={locked ? lockedHint : undefined}
      accessibilityState={{ disabled: isDisabled, busy, selected, expanded }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isSelector
          ? [
              styles.cardSelector,
              isCompact ? styles.cardSelectorTile : styles.cardSelectorWide,
            ]
          : isCompact
            ? styles.cardCompact
            : styles.cardFeatured,
        {
          backgroundColor: isSelector
            ? pressed && !isDisabled
              ? promptPalette.selectorPressedBackgroundColor
              : selected
                ? promptPalette.selectorSelectedBackgroundColor
                : selectorContainsSelectedQuestion
                  ? selectorContainsBackgroundColor
                : expanded
                  ? promptPalette.selectorPressedBackgroundColor
                  : promptPalette.selectorBackgroundColor
            : mixColors(
                neutralSurface,
                accentColor,
                pressed && !isDisabled ? 0.1 : selected ? 0.085 : 0.045,
              ),
          borderColor: locked
            ? withAlpha(goldColor, 0.42)
            : isSelector
              ? pressed && !isDisabled
                ? promptPalette.selectorPressedBorderColor
                : selected
                  ? promptPalette.selectorSelectedBorderColor
                  : selectorContainsSelectedQuestion
                    ? selectorContainsBorderColor
                  : expanded
                    ? promptPalette.selectorPressedBorderColor
                    : promptPalette.selectorBorderColor
              : mixColors(
                  neutralBorder,
                  accentColor,
                  selected ? 0.22 : pressed && !isDisabled ? 0.16 : 0.12,
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
                busy ? 0.28 : selected ? 0.62 : 0.46,
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
                : selectorContainsSelectedQuestion
                  ? promptPalette.selectorBackdropColors
                : promptPalette.selectorBackdropColors
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
            style={styles.selectorBackdrop}
            testID={testID ? `${testID}-backdrop` : undefined}
          />

          {busy ? (
            <Squircle
              style={[
                styles.selectedFloatingBadge,
                styles.busyFloatingBadge,
                {
                  backgroundColor: promptPalette.selectorSelectedIconBackgroundColor,
                  borderColor: promptPalette.selectorSelectedBorderColor,
                },
              ]}
              testID={testID ? `${testID}-busy-badge` : undefined}
            >
              <ActivityIndicator
                color={promptPalette.selectorIconColor}
                size="small"
                testID={testID ? `${testID}-spinner` : undefined}
              />
            </Squircle>
          ) : selected ? (
            <Squircle
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
            </Squircle>
          ) : selectorContainsSelectedQuestion ? (
            <Squircle
              style={[
                styles.childSelectionIndicator,
                {
                  backgroundColor: selectorContainsIconBackgroundColor,
                  borderColor: selectorContainsBorderColor,
                },
              ]}
              testID={testID ? `${testID}-contains-selection-indicator` : undefined}
            >
              <View
                style={[
                  styles.childSelectionIndicatorDot,
                  {
                    backgroundColor: promptPalette.selectorIconColor,
                  },
                ]}
              />
            </Squircle>
          ) : null}

          <Squircle
            style={[
              styles.selectorArtworkFrame,
              isCompact
                ? styles.selectorArtworkFrameTile
                : styles.selectorArtworkFrameWide,
            ]}
            testID={testID ? `${testID}-artwork-frame` : undefined}
          >
            <Image
              source={artworkSource}
              contentFit="cover"
              style={styles.selectorArtwork}
              testID={testID ? `${testID}-artwork` : undefined}
            />
            <LinearGradient
              colors={[
                withAlpha(colors.background, 0),
                withAlpha(colors.background, isDark ? 0.84 : 0.46),
              ]}
              pointerEvents="none"
              style={styles.selectorArtworkGradient}
            />
          </Squircle>

          <Squircle
            style={[
              styles.selectorIconShell,
              isCompact
                ? styles.selectorIconShellTile
                : styles.selectorIconShellWide,
              {
                backgroundColor: selected
                  ? promptPalette.selectorSelectedIconBackgroundColor
                  : selectorContainsSelectedQuestion
                    ? selectorContainsIconBackgroundColor
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
          </Squircle>

          <View style={styles.copySelector}>
            <Text
              numberOfLines={2}
              style={[
                styles.title,
                styles.titleSelectorTile,
                !isCompact ? styles.titleSelectorWide : null,
              ]}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                numberOfLines={isCompact ? 3 : 2}
                style={styles.subtitleSelectorTile}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </>
      ) : (
        <>
          <View
            style={[
              styles.iconShell,
              isCompact ? styles.iconShellCompact : null,
              {
                backgroundColor: mixColors(neutralSurface, accentColor, 0.12),
                borderColor: withAlpha(accentColor, 0.14),
              },
            ]}
            testID={testID ? `${testID}-icon` : undefined}
          >
            <View
              style={[
                styles.iconInner,
                isCompact ? styles.iconInnerCompact : null,
                {
                  backgroundColor: withAlpha(accentColor, 0.065),
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
                backgroundColor: withAlpha(accentColor, 0.07),
                borderColor: withAlpha(accentColor, 0.12),
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
          <Squircle
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

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      borderRadius: BORDER_RADIUS.xl + 2,
      borderWidth: 1,
      ...SHADOWS.card, borderCurve: 'continuous',
    },
    cardSelector: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      gap: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm + 2,
      paddingBottom: SPACING.md + 2,
      overflow: 'hidden',
    },
    cardSelectorTile: {
      flexBasis: '100%',
      flexGrow: 1,
      minWidth: 0,
      minHeight: 226,
    },
    cardSelectorWide: {
      width: '100%',
      minHeight: 226,
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
      transform: [{ translateY: -2 }],
    },
    cardLocked: {
      // No global opacity here — a lockScrim atop the content does the dimming
      // so the gold lock badge above it stays fully readable.
    },
    lockScrim: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: BORDER_RADIUS.xl, borderCurve: 'continuous',
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
      zIndex: 3, borderCurve: 'continuous',
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
      borderRadius: BORDER_RADIUS.full, borderCurve: 'continuous',
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
      flexShrink: 0, borderCurve: 'continuous',
    },
    iconShellCompact: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.md, borderCurve: 'continuous',
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
      justifyContent: 'center', borderCurve: 'continuous',
    },
    iconInnerCompact: {
      width: 30,
      height: 30,
      borderRadius: BORDER_RADIUS.sm, borderCurve: 'continuous',
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
      gap: SPACING.xs + 1,
      paddingHorizontal: SPACING.xs,
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
      flexShrink: 0, borderCurve: 'continuous',
    },
    trailingCompact: {
      width: 30,
      height: 30,
      borderRadius: 15, borderCurve: 'continuous',
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
      flexShrink: 0, borderCurve: 'continuous',
    },
    selectedFloatingBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 4, borderCurve: 'continuous',
    },
    childSelectionIndicator: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 4, borderCurve: 'continuous',
    },
    childSelectionIndicatorDot: {
      width: 6,
      height: 6,
      borderRadius: 3, borderCurve: 'continuous',
    },
    busyFloatingBadge: {
      width: 30,
      height: 30,
      borderRadius: 15, borderCurve: 'continuous',
    },
    selectorIconShell: {
      width: 44,
      height: 44,
      borderRadius: BORDER_RADIUS.xl,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -34,
      marginLeft: SPACING.xs,
      borderWidth: 1,
      borderColor: withAlpha(colors.white, 0.12),
      zIndex: 2, borderCurve: 'continuous',
    },
    selectorIconShellTile: {
      width: 44,
      height: 44,
      borderRadius: BORDER_RADIUS.lg, borderCurve: 'continuous',
    },
    selectorIconShellWide: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.xl, borderCurve: 'continuous',
    },
    selectorBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    selectorArtworkFrame: {
      alignSelf: 'stretch',
      overflow: 'hidden',
      marginTop: -(SPACING.sm + 2),
      marginHorizontal: -SPACING.md,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      borderBottomLeftRadius: BORDER_RADIUS.lg,
      borderBottomRightRadius: BORDER_RADIUS.lg,
      borderWidth: 0, borderCurve: 'continuous',
    },
    selectorArtworkFrameTile: {
      height: 142,
    },
    selectorArtworkFrameWide: {
      height: 154,
    },
    selectorArtwork: {
      width: '100%',
      height: '100%',
      transform: [{ scale: 1.06 }],
    },
    selectorArtworkGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 72,
    },
    titleSelectorTile: {
      fontSize: SIZES.text14,
      lineHeight: 19,
      fontWeight: FONT_WEIGHTS.bold,
      color: isDark ? colors.white : colors.primaryText,
    },
    titleSelectorWide: {
      fontSize: SIZES.text16,
      lineHeight: 20,
    },
    subtitleSelectorTile: {
      fontSize: SIZES.text12,
      lineHeight: 16,
      color: withAlpha(
        isDark ? colors.white : colors.primaryText,
        isDark ? 0.72 : 0.58,
      ),
    },
  });
