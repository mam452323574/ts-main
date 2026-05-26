import React, { useMemo, type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  getThemeTokens,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  premium?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  scrollTestID?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  scrollable = false,
  style,
  testID,
  scrollTestID,
}: SegmentedControlProps<T>) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(isDark), [isDark]);
  const tokens = getThemeTokens(isDark);
  const containerBackground = isDark
    ? withAlpha(colors.white ?? colors.primaryText, 0.05)
    : withAlpha(colors.white ?? colors.cardBackground, 0.72);
  const containerBorder = isDark
    ? withAlpha(colors.white ?? colors.primaryText, 0.07)
    : withAlpha(colors.primaryText, 0.055);

  const content = (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          backgroundColor: containerBackground,
          borderColor: containerBorder,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const compactLabel = !scrollable && option.label.trim().length >= 12;
        const foreground = selected ? tokens.cta.foreground : colors.textMuted ?? colors.gray;
        const selectedBackground = tokens.cta.background;

        return (
          <TouchableOpacity
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityHint={option.accessibilityHint}
            accessibilityState={{ selected, disabled: option.disabled }}
            activeOpacity={0.82}
            disabled={option.disabled}
            onPress={() => onChange(option.value)}
            testID={option.testID}
            style={[
              styles.option,
              scrollable ? styles.optionScrollable : styles.optionFluid,
              selected
                ? [
                    styles.optionSelected,
                    {
                      backgroundColor: selectedBackground,
                      borderColor: tokens.cta.border,
                    },
                  ]
                : { borderColor: 'transparent' },
              option.disabled ? styles.optionDisabled : null,
            ]}
          >
            {option.icon ? (
              <View style={styles.optionIcon}>
                {React.isValidElement(option.icon) && typeof option.icon.type !== 'string'
                  ? React.cloneElement(
                      option.icon as React.ReactElement<{ color?: string; size?: number }>,
                      {
                        // Pour les options premium NON sélectionnées (typiquement la
                        // couronne or des tabs Analytics "3 Mois" / "1 An"), on
                        // préserve la couleur originale fournie par le parent.
                        // Sinon, le cloneElement appliquait `color: foreground`
                        // (gris) au-dessus d'un `fill: gold` déjà présent → ça
                        // produisait un contour gris autour d'un intérieur or,
                        // perçu comme une "aura" non maîtrisée.
                        ...(option.premium && !selected ? {} : { color: foreground }),
                        size: 13,
                      },
                    )
                  : option.icon}
              </View>
            ) : null}
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.84}
              numberOfLines={1}
              style={[
                styles.label,
                {
                  color: option.premium && !selected ? tokens.premium.accent : foreground,
                },
                compactLabel ? styles.labelCompact : null,
                selected ? styles.labelSelected : null,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (!scrollable) {
    return content;
  }

  return (
    <ScrollView
      horizontal
      testID={scrollTestID}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {content}
    </ScrollView>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    scrollContent: {
      paddingRight: SPACING.xs,
    },
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: BORDER_RADIUS.full,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 4,
      gap: 4, borderCurve: 'continuous',
    },
    option: {
      height: 34,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 0,
      paddingHorizontal: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1, borderCurve: 'continuous',
    },
    optionFluid: {
      flex: 1,
      minWidth: 0,
    },
    optionScrollable: {
      minWidth: 84,
    },
    optionSelected: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.16 : 0.06,
      shadowRadius: 10,
      elevation: 1,
    },
    optionDisabled: {
      opacity: 0.54,
    },
    optionIcon: {
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    label: {
      minWidth: 0,
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.medium,
      textAlign: 'center',
      textAlignVertical: 'center',
      includeFontPadding: false,
    },
    labelCompact: {
      fontSize: 11,
      lineHeight: 15,
    },
    labelSelected: {
      fontWeight: FONT_WEIGHTS.bold,
    },
  });
