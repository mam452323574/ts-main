import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';

import { FONT_WEIGHTS, SIZES, SPACING, withAlpha } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { RESULT_TEXT_PROPS } from '@/utils/resultLayout';

interface ResultSheetTopChromeProps {
  title: string;
  testID?: string;
  titleTestID?: string;
  variant?: 'default' | 'result' | 'settings';
  onLeftAction?: () => void;
  leftActionAccessibilityLabel?: string;
  leftActionTestID?: string;
  surfaceColor?: string;
}

export function ResultSheetTopChrome({
  title,
  testID,
  titleTestID,
  variant = 'default',
  onLeftAction,
  leftActionAccessibilityLabel,
  leftActionTestID,
  surfaceColor,
}: ResultSheetTopChromeProps) {
  const { colors, isDark } = useTheme();
  const isResultVariant = variant === 'result';
  const isSettingsVariant = variant === 'settings';
  const isFlushVariant = isResultVariant || isSettingsVariant;
  const defaultContainerBackgroundColor = isResultVariant
    ? isDark
      ? colors.background
      : colors.cardBackground ?? colors.background
    : isSettingsVariant
      ? colors.background
      : isDark
        ? withAlpha(colors.surfaceElevated ?? colors.cardBackground, 0.96)
        : withAlpha(colors.cardBackground ?? colors.background, 0.985);
  const containerBackgroundColor = surfaceColor ?? defaultContainerBackgroundColor;
  const containerBorderBottomColor = isFlushVariant
    ? 'transparent'
    : withAlpha(colors.primaryText, isDark ? 0.08 : 0.06);
  const containerBorderBottomWidth = isFlushVariant ? 0 : StyleSheet.hairlineWidth;

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          paddingTop: SPACING.sm,
          backgroundColor: containerBackgroundColor,
          borderBottomColor: containerBorderBottomColor,
          borderBottomWidth: containerBorderBottomWidth,
        },
      ]}
    >
      {onLeftAction ? (
        <View style={styles.titleRow}>
          <View style={styles.sideSlot}>
            <TouchableOpacity
              accessibilityLabel={leftActionAccessibilityLabel ?? 'Back'}
              accessibilityRole="button"
              onPress={onLeftAction}
              style={[
                styles.iconButton,
                {
                  backgroundColor: withAlpha(colors.primaryText, isDark ? 0.06 : 0.04),
                  borderColor: withAlpha(colors.primaryText, isDark ? 0.1 : 0.08),
                },
              ]}
              testID={leftActionTestID ?? (testID ? `${testID}-left-action` : undefined)}
            >
              <ArrowLeft color={colors.primaryText} size={20} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <Text
            {...RESULT_TEXT_PROPS}
            numberOfLines={1}
            testID={titleTestID}
            style={[styles.title, styles.titleWithAction, { color: colors.primaryText }]}
          >
            {title}
          </Text>

          <View style={styles.sideSlot} />
        </View>
      ) : (
        <Text
          {...RESULT_TEXT_PROPS}
          numberOfLines={1}
          testID={titleTestID}
          style={[styles.title, { color: colors.primaryText }]}
        >
          {title}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.page,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideSlot: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderCurve: 'continuous',
  },
  title: {
    fontSize: SIZES.text20,
    lineHeight: 24,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    letterSpacing: 0,
    includeFontPadding: false,
  },
  titleWithAction: {
    flex: 1,
    paddingHorizontal: SPACING.md,
  },
});

export default ResultSheetTopChrome;
