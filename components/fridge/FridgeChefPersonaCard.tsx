import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { ChefModeIcon } from '@/components/fridge/ChefModeIcon';
import { OptimizedImage } from '@/components/OptimizedImage';
import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { FridgeChefPersona } from '@/shared/fridgeChefPersonas';
import { resolveChefSurfaceColors } from '@/utils/scanFlowVisualTheme';

interface FridgeChefPersonaCardProps {
  persona: FridgeChefPersona;
  title: string;
  label: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  compact?: boolean;
  onPress: () => void;
  testID?: string;
}

export function FridgeChefPersonaCard({
  persona,
  title,
  label,
  description,
  selected,
  disabled = false,
  compact = false,
  onPress,
  testID,
}: FridgeChefPersonaCardProps) {
  const { colors: themeColors, isDark } = useTheme();
  const colors = useMemo(
    () => resolveChefSurfaceColors(themeColors, isDark),
    [isDark, themeColors],
  );
  const styles = useMemo(
    () => createStyles(colors, compact, isDark),
    [colors, compact, isDark],
  );
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [persona.imageSource]);

  const accentColor = persona.accentColor;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: selected
            ? withAlpha(accentColor, 0.64)
            : withAlpha(accentColor, isDark ? 0.26 : 0.2),
          backgroundColor: selected
            ? mixColors(colors.cardBackground, accentColor, isDark ? 0.2 : 0.1)
            : isDark
              ? withAlpha(colors.white, 0.075)
              : mixColors(colors.cardBackground, accentColor, 0.04),
          shadowColor: selected ? accentColor : '#000000',
        },
        selected ? styles.cardSelected : null,
        pressed && !disabled ? styles.cardPressed : null,
        disabled ? styles.cardDisabled : null,
      ]}
      testID={testID}
    >
      <View
        pointerEvents="none"
        style={[
          styles.accentWash,
          { backgroundColor: withAlpha(accentColor, selected ? 0.3 : 0.16) },
        ]}
      />

      <View style={styles.avatarShell}>
        <View
          style={[
            styles.avatarHalo,
            { backgroundColor: withAlpha(accentColor, selected ? 0.4 : 0.22) },
          ]}
        />
        <View
          style={[
            styles.avatarRing,
            {
              borderColor: selected
                ? withAlpha(isDark ? colors.white : colors.cardBackground, 0.34)
                : withAlpha(accentColor, isDark ? 0.34 : 0.24),
              backgroundColor: withAlpha(accentColor, selected ? 0.2 : 0.13),
            },
          ]}
        >
          {imageFailed ? (
            <View
              style={[
                styles.avatarFallback,
                { backgroundColor: withAlpha(accentColor, 0.24) },
              ]}
              testID={testID ? `${testID}-fallback` : undefined}
            >
              <Text style={styles.avatarFallbackText}>{persona.fallbackLabel}</Text>
            </View>
          ) : (
            <OptimizedImage
              source={persona.imageSource}
              contentFit="cover"
              showPlaceholder={false}
              onError={() => setImageFailed(true)}
              style={styles.avatarImage}
              testID={testID ? `${testID}-image` : undefined}
            />
          )}
        </View>
      </View>

      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        </View>
        <Text numberOfLines={compact ? 2 : 1} style={styles.description}>
          {description}
        </Text>
        <View
          style={[
            styles.labelPill,
            { backgroundColor: withAlpha(accentColor, selected ? 0.3 : 0.17) },
          ]}
        >
          <Text numberOfLines={1} style={styles.labelText}>
            {label}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.statusBadge,
          {
            backgroundColor: selected
              ? accentColor
              : withAlpha(accentColor, 0.14),
            borderColor: selected
              ? withAlpha(colors.white, 0.22)
              : withAlpha(accentColor, 0.2),
          },
        ]}
      >
        {selected ? (
          <Check color="#FFFFFF" size={compact ? 17 : 15} strokeWidth={3} />
        ) : (
          <ChefModeIcon
            mode={persona.mode}
            color={mixColors(colors.primaryText, accentColor, isDark ? 0.22 : 0.56)}
            size={compact ? 18 : 16}
            strokeWidth={2.5}
          />
        )}
      </View>
    </Pressable>
  );
}

const createStyles = (colors: any, compact: boolean, isDark: boolean) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      minHeight: compact ? 98 : 78,
      width: '100%',
      borderRadius: 18,
      borderWidth: 1,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      gap: compact ? SPACING.md : SPACING.sm,
      paddingVertical: compact ? SPACING.sm + 2 : SPACING.sm,
      paddingLeft: compact ? SPACING.md : SPACING.sm + 2,
      paddingRight: compact ? SPACING.sm + 2 : SPACING.sm,
      ...SHADOWS.card,
    },
    cardSelected: {
      shadowOpacity: 0.3,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5,
    },
    cardPressed: {
      transform: [{ scale: 0.985 }],
    },
    cardDisabled: {
      opacity: 0.66,
    },
    accentWash: {
      position: 'absolute',
      top: compact ? -36 : -26,
      right: compact ? -22 : -18,
      width: compact ? 152 : 116,
      height: compact ? 152 : 116,
      borderRadius: compact ? 76 : 58,
    },
    avatarShell: {
      width: compact ? 72 : 58,
      height: compact ? 72 : 58,
      borderRadius: compact ? 36 : 29,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarHalo: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: compact ? 36 : 29,
      transform: [{ scale: compact ? 1.08 : 1.06 }],
    },
    avatarRing: {
      width: compact ? 66 : 52,
      height: compact ? 66 : 52,
      borderRadius: compact ? 33 : 26,
      borderWidth: 1,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarImage: {
      width: compact ? 64 : 50,
      height: compact ? 64 : 50,
      borderRadius: compact ? 32 : 25,
      backgroundColor: colors.surfaceMuted,
    },
    avatarFallback: {
      width: compact ? 64 : 50,
      height: compact ? 64 : 50,
      borderRadius: compact ? 32 : 25,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarFallbackText: {
      color: colors.white,
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0.8,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: compact ? 5 : 4,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
    },
    title: {
      flexShrink: 1,
      color: colors.primaryText,
      fontSize: compact ? SIZES.text16 + 1 : SIZES.text14 + 1,
      lineHeight: compact ? 21 : 19,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
    },
    labelPill: {
      alignSelf: 'flex-start',
      maxWidth: compact ? 134 : 104,
      paddingHorizontal: compact ? SPACING.sm : SPACING.xs + 2,
      paddingVertical: compact ? 3 : 2,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(colors.primaryText, isDark ? 0.14 : 0.08),
    },
    labelText: {
      color: colors.primaryText,
      fontSize: SIZES.text10,
      lineHeight: 12,
      fontWeight: FONT_WEIGHTS.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      includeFontPadding: false,
    },
    description: {
      color: colors.secondaryText,
      fontSize: compact ? SIZES.text12 + 1 : SIZES.text12,
      lineHeight: compact ? 17 : 15,
      includeFontPadding: false,
    },
    statusBadge: {
      width: compact ? 34 : 28,
      height: compact ? 34 : 28,
      borderRadius: compact ? 17 : 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
  });
