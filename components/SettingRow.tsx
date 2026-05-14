import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  getThemeTokens,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

interface SettingRowProps {
  title: string;
  description?: string | null;
  icon?: ReactNode;
  value?: string | number | null;
  right?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function SettingRow({
  title,
  description,
  icon,
  value,
  right,
  onPress,
  disabled = false,
  destructive = false,
  style,
  testID,
  accessibilityLabel,
}: SettingRowProps) {
  const { colors, isDark } = useTheme();
  const tokens = getThemeTokens(isDark);
  const interactive = Boolean(onPress);
  const foreground = destructive ? colors.error : colors.primaryText;
  const resolvedRight =
    right ??
    (interactive ? (
      <ChevronRight color={colors.textMuted ?? colors.gray} size={18} strokeWidth={2.2} />
    ) : null);

  return (
    <Pressable
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      disabled={!interactive || disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? tokens.surfaceMuted.pressed : 'transparent',
          opacity: disabled ? 0.55 : 1,
        },
        style,
      ]}
    >
      {icon ? (
        <View
          style={[
            styles.iconShell,
            {
              backgroundColor: destructive
                ? withAlpha(colors.error, 0.12)
                : tokens.surfaceMuted.base,
              borderColor: destructive
                ? withAlpha(colors.error, 0.22)
                : tokens.border.subtle,
            },
          ]}
        >
          {icon}
        </View>
      ) : null}

      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.title, { color: foreground }]}>
          {title}
        </Text>
        {description ? (
          <Text
            numberOfLines={2}
            style={[styles.description, { color: colors.textMuted ?? colors.gray }]}
          >
            {description}
          </Text>
        ) : null}
      </View>

      {value !== null && value !== undefined ? (
        <Text numberOfLines={1} style={[styles.value, { color: colors.textMuted ?? colors.gray }]}>
          {value}
        </Text>
      ) : null}
      {resolvedRight ? <View style={styles.right}>{resolvedRight}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  iconShell: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: SIZES.text14,
    lineHeight: 20,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  description: {
    fontSize: SIZES.text12,
    lineHeight: 17,
    fontWeight: FONT_WEIGHTS.medium,
  },
  value: {
    maxWidth: 120,
    fontSize: SIZES.text12,
    lineHeight: 17,
    fontWeight: FONT_WEIGHTS.medium,
    textAlign: 'right',
  },
  right: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
