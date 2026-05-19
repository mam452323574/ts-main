import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, X } from 'lucide-react-native';

import {
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  getThemeTokens,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  variant?: 'bar' | 'inline';
  borderless?: boolean;
  onBack?: () => void;
  onClose?: () => void;
  left?: ReactNode;
  right?: ReactNode;
  topInset?: boolean;
  centered?: boolean;
  backTestID?: string;
  closeTestID?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ScreenHeader({
  title,
  subtitle,
  variant = 'bar',
  borderless = false,
  onBack,
  onClose,
  left,
  right,
  topInset = true,
  centered = false,
  backTestID,
  closeTestID,
  style,
  testID,
}: ScreenHeaderProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const tokens = getThemeTokens(isDark);
  const isInline = variant === 'inline';
  const useTransparentChrome = isInline || borderless;
  const resolvedLeft =
    left ??
    (onBack ? (
      <HeaderIconButton
        accessibilityLabel="Back"
        icon={<ChevronLeft color={colors.primaryText} size={20} />}
        onPress={onBack}
        testID={backTestID}
      />
    ) : null);
  const resolvedRight =
    right ??
    (onClose ? (
      <HeaderIconButton
        accessibilityLabel="Close"
        icon={<X color={colors.primaryText} size={20} />}
        onPress={onClose}
        testID={closeTestID}
      />
    ) : null);

  return (
    <View
      testID={testID}
      style={[
        styles.header,
        isInline ? styles.headerInline : styles.headerBar,
        borderless ? styles.headerBorderless : null,
        {
          paddingTop: topInset
            ? insets.top + (isInline ? SPACING.lg : SPACING.sm)
            : (isInline ? SPACING.md : SPACING.sm),
          paddingLeft: Math.max(insets.left, SPACING.page),
          paddingRight: Math.max(insets.right, SPACING.page),
          backgroundColor: useTransparentChrome
            ? 'transparent'
            : withAlpha(tokens.screen.background, isDark ? 0.96 : 1),
          borderBottomColor: useTransparentChrome ? 'transparent' : tokens.border.subtle,
        },
        style,
      ]}
    >
      {resolvedLeft || !isInline ? (
        <View style={styles.sideSlot}>{resolvedLeft}</View>
      ) : null}
      <View style={[styles.copy, centered ? styles.copyCentered : null]}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            isInline ? styles.titleInline : null,
            centered ? styles.titleCentered : null,
            { color: colors.primaryText },
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={2}
            style={[
              styles.subtitle,
              centered ? styles.titleCentered : null,
              { color: colors.textMuted ?? colors.gray },
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {resolvedRight || !isInline ? (
        <View style={styles.sideSlot}>{resolvedRight}</View>
      ) : null}
    </View>
  );
}

interface HeaderIconButtonProps {
  accessibilityLabel: string;
  icon: ReactNode;
  onPress: () => void;
  testID?: string;
}

export function HeaderIconButton({ accessibilityLabel, icon, onPress, testID }: HeaderIconButtonProps) {
  const { colors, isDark } = useTheme();

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      style={[
        styles.iconButton,
        {
          backgroundColor: isDark
            ? withAlpha(colors.white ?? colors.primaryText, 0.055)
            : withAlpha(colors.white ?? colors.cardBackground, 0.78),
          borderColor: isDark
            ? withAlpha(colors.white ?? colors.primaryText, 0.08)
            : withAlpha(colors.primaryText, 0.065),
        },
      ]}
      hitSlop={8}
    >
      {icon}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  headerBar: {
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
  },
  headerInline: {
    paddingBottom: SPACING.sm,
    borderBottomWidth: 0,
  },
  headerBorderless: {
    borderBottomWidth: 0,
  },
  sideSlot: {
    width: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  copyCentered: {
    alignItems: 'center',
  },
  title: {
    fontSize: SIZES.text18,
    lineHeight: 23,
    fontWeight: FONT_WEIGHTS.bold,
  },
  titleInline: {
    fontSize: SIZES.xl,
    lineHeight: 30,
  },
  titleCentered: {
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 2,
    fontSize: SIZES.text12,
    lineHeight: 17,
    fontWeight: FONT_WEIGHTS.medium,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1, borderCurve: 'continuous',
  },
});
