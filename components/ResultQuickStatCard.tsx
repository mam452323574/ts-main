import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { FONT_WEIGHTS, SPACING, withAlpha } from '@/constants/theme';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultSurfaceChrome,
} from '@/utils/resultLayout';
import type { ResolvedResultItemTheme } from '@/utils/resultVisualTheme';

interface ResultQuickStatCardProps {
  icon?: React.ReactNode | string;
  label: string;
  value: string;
  valueVariant?: 'numeric' | 'fraction' | 'text';
  labelMaxLines?: number;
  valueMaxLines?: number;
  fullWidth?: boolean;
  theme?: ResolvedResultItemTheme;
}

export function ResultQuickStatCard({
  icon,
  label,
  value,
  valueVariant = 'text',
  labelMaxLines = 2,
  valueMaxLines = valueVariant === 'text' ? 3 : 1,
  fullWidth = false,
  theme,
}: ResultQuickStatCardProps) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const styles = useMemo(() => createStyles(layout), [layout]);

  const valueTextProps =
    valueVariant === 'text'
      ? {
          numberOfLines: valueMaxLines,
        }
      : {
          adjustsFontSizeToFit: true,
          minimumFontScale: valueVariant === 'fraction' ? 0.82 : 0.84,
          numberOfLines: 1 as const,
        };

  const renderIcon = () => {
    if (!icon) {
      return null;
    }

    const iconGlyphSize = fullWidth
      ? layout.quickStatIconGlyphSize + 2
      : layout.quickStatIconGlyphSize;

    if (typeof icon === 'string') {
      return (
        <Text
          style={[
            styles.iconText,
            fullWidth && styles.fullWidthIconText,
            theme?.iconColor ? { color: theme.iconColor } : null,
          ]}
        >
          {icon}
        </Text>
      );
    }

    if (React.isValidElement(icon) && typeof icon.type !== 'string') {
      return React.cloneElement(
        icon as React.ReactElement<{
          color?: string;
          size?: number;
          strokeWidth?: number;
        }>,
        {
          color: theme?.iconColor,
          size: iconGlyphSize,
          strokeWidth: layout.quickStatIconStrokeWidth,
        },
      );
    }

    return icon;
  };

  return (
    <View
      testID="result-quick-stat-card"
      style={[
        styles.card,
        fullWidth ? styles.fullWidthCard : styles.halfWidthCard,
        getResultSurfaceChrome({
          colors,
          isDark,
          kind: 'standard',
          accentColor: theme?.accentColor,
          surfaceVariant: theme?.surfaceVariant ?? 'neutral',
        }),
      ]}
    >
      <View
        testID="result-quick-stat-icon-wrap"
        style={[
          styles.iconWrap,
          fullWidth && styles.fullWidthIconWrap,
          {
            backgroundColor:
              theme?.iconSurfaceColor ??
              (isDark
                ? withAlpha(colors.white, 0.06)
                : withAlpha(colors.primary, 0.08)),
            borderColor: theme?.iconBorderColor ?? 'transparent',
            borderWidth: theme ? 1 : 0,
          },
        ]}
      >
        {renderIcon()}
      </View>

      <View testID="result-quick-stat-content" style={styles.content}>
        <Text
          {...RESULT_TEXT_PROPS}
          testID="result-quick-stat-label"
          numberOfLines={labelMaxLines}
          style={[styles.label, { color: colors.gray }]}
        >
          {label}
        </Text>
        <Text
          {...RESULT_TEXT_PROPS}
          {...valueTextProps}
          testID="result-quick-stat-value"
          style={[
            styles.value,
            valueVariant === 'text' ? styles.valueText : styles.valueCompact,
            { color: theme?.valueColor ?? colors.primaryText },
          ]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (layout: ReturnType<typeof getResultLayoutState>) =>
  StyleSheet.create({
    card: {
      minHeight: layout.quickStatMinHeight,
      borderRadius: layout.standardRadius,
      borderWidth: 1,
      paddingHorizontal: layout.quickStatPaddingHorizontal,
      paddingVertical: layout.quickStatPaddingVertical,
      flexDirection: 'row',
      alignItems: 'center',
      gap: layout.quickStatCardGap,
      justifyContent: 'flex-start',
    },
    halfWidthCard: {
      flexBasis: '47%',
      flexGrow: 1,
      minWidth: 0,
    },
    fullWidthCard: {
      width: '100%',
      minWidth: 0,
    },
    iconWrap: {
      width: layout.quickStatIconSize,
      height: layout.quickStatIconSize,
      borderRadius: layout.standardRadius,
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACING.xs,
      flexShrink: 0,
    },
    fullWidthIconWrap: {
      width: layout.quickStatIconSize + 2,
      height: layout.quickStatIconSize + 2,
    },
    iconText: {
      fontSize: layout.quickStatIconGlyphSize,
      lineHeight: layout.quickStatIconGlyphSize + 1,
      textAlign: 'center',
      includeFontPadding: false,
    },
    fullWidthIconText: {
      fontSize: layout.quickStatIconGlyphSize + 2,
      lineHeight: layout.quickStatIconGlyphSize + 3,
    },
    content: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
      justifyContent: 'center',
      gap: layout.quickStatTextGap,
    },
    label: {
      fontSize: layout.quickStatLabelFontSize,
      lineHeight: layout.quickStatLabelLineHeight,
      textTransform: 'uppercase',
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: layout.isCompact ? 0.3 : 0.4,
      flexShrink: 1,
      includeFontPadding: false,
    },
    value: {
      fontWeight: FONT_WEIGHTS.bold,
      flexShrink: 1,
      includeFontPadding: false,
    },
    valueCompact: {
      fontSize: layout.quickStatValueFontSize,
      lineHeight: layout.quickStatValueLineHeight,
    },
    valueText: {
      fontSize: layout.quickStatValueFontSize,
      lineHeight: layout.quickStatValueLineHeight,
      alignSelf: 'stretch',
    },
  });
