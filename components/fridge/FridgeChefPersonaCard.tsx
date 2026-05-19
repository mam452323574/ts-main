import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { OptimizedImage } from '@/components/OptimizedImage';
import {
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { FridgeChefPersona } from '@/shared/fridgeChefPersonas';
import { Squircle } from '@/components/Squircle';

interface FridgeChefPersonaCardProps {
  persona: FridgeChefPersona;
  title: string;
  label: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
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
  onPress,
  testID,
}: FridgeChefPersonaCardProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
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
        selected ? styles.cardSelected : null,
        pressed && !disabled ? styles.cardPressed : null,
        disabled ? styles.cardDisabled : null,
      ]}
      testID={testID}
    >
      <Squircle style={styles.avatarShell}>
        <Squircle style={styles.avatarHalo} />
        <Squircle style={styles.avatarRing}>
          {imageFailed ? (
            <Squircle
              style={styles.avatarFallback}
              testID={testID ? `${testID}-fallback` : undefined}
            >
              <Text style={styles.avatarFallbackText}>{persona.fallbackLabel}</Text>
            </Squircle>
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
        </Squircle>
      </Squircle>

      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <Text numberOfLines={2} style={styles.description}>
          {description}
        </Text>
        <View
          style={[
            styles.labelPill,
            { backgroundColor: withAlpha(accentColor, isDark ? 0.16 : 0.12) },
          ]}
        >
          <Squircle
            style={[styles.labelDot, { backgroundColor: accentColor }]}
          />
          <Text numberOfLines={1} style={styles.labelText}>
            {label}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.radio,
          selected ? styles.radioSelected : null,
        ]}
      >
        {selected ? (
          <Check color="#FFFFFF" size={15} strokeWidth={3} />
        ) : null}
      </View>
    </Pressable>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    card: {
      width: '100%',
      minHeight: 104,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark
        ? withAlpha(colors.white, 0.08)
        : withAlpha(colors.primaryText, 0.08),
      backgroundColor: isDark
        ? withAlpha(colors.white, 0.05)
        : colors.cardBackground,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md + 2,
      paddingVertical: 14,
      paddingHorizontal: 14,
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: isDark ? 0 : 1, borderCurve: 'continuous',
    },
    cardSelected: {
      borderColor: withAlpha(colors.primary, isDark ? 0.6 : 0.55),
      backgroundColor: isDark
        ? withAlpha(colors.primary, 0.08)
        : withAlpha(colors.primary, 0.05),
      shadowColor: colors.primary,
      shadowOpacity: isDark ? 0.28 : 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    cardPressed: {
      transform: [{ scale: 0.985 }],
    },
    cardDisabled: {
      opacity: 0.5,
    },
    avatarShell: {
      width: 76,
      height: 76,
      borderRadius: 38,
      alignItems: 'center',
      justifyContent: 'center', borderCurve: 'continuous',
    },
    avatarHalo: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 38,
      backgroundColor: isDark
        ? withAlpha(colors.white, 0.06)
        : withAlpha(colors.primaryText, 0.04),
      transform: [{ scale: 1.06 }], borderCurve: 'continuous',
    },
    avatarRing: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 1,
      borderColor: isDark
        ? withAlpha(colors.white, 0.1)
        : withAlpha(colors.primaryText, 0.06),
      backgroundColor: isDark
        ? withAlpha(colors.white, 0.04)
        : withAlpha(colors.primaryText, 0.02),
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center', borderCurve: 'continuous',
    },
    avatarImage: {
      width: 70,
      height: 70,
      borderRadius: 35, borderCurve: 'continuous',
    },
    avatarFallback: {
      width: 70,
      height: 70,
      borderRadius: 35,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark
        ? withAlpha(colors.white, 0.1)
        : withAlpha(colors.primaryText, 0.08), borderCurve: 'continuous',
    },
    avatarFallbackText: {
      color: colors.primaryText,
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: 0.8,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    title: {
      color: colors.primaryText,
      fontSize: 17,
      lineHeight: 21,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: -0.2,
      includeFontPadding: false,
    },
    description: {
      color: colors.secondaryText,
      fontSize: SIZES.text12 + 1,
      lineHeight: 17,
      includeFontPadding: false,
    },
    labelPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      paddingHorizontal: 9,
      paddingVertical: 4,
      marginTop: 2,
      borderRadius: 9999, borderCurve: 'continuous',
    },
    labelDot: {
      width: 6,
      height: 6,
      borderRadius: 3, borderCurve: 'continuous',
    },
    labelText: {
      color: colors.primaryText,
      fontSize: SIZES.text10,
      lineHeight: 12,
      fontWeight: FONT_WEIGHTS.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      includeFontPadding: false,
    },
    radio: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1.5,
      borderColor: isDark
        ? withAlpha(colors.white, 0.22)
        : withAlpha(colors.primaryText, 0.18),
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center', borderCurve: 'continuous',
    },
    radioSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
  });
